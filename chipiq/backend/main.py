"""
ChipIQ backend
- Face authentication APIs
- Dynamic data upload & ingestion
- Multi-source data connectors (Git, Jira, Coverage, Logs, Regression)
- Integrated dataset APIs (with fallback)
- Real forecasting APIs (ARIMA, LSTM, Prophet)
"""

import base64
import json
import os
import smtplib
from pathlib import Path
from io import BytesIO
from datetime import datetime, timezone
from email.message import EmailMessage

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from datastore import DynamicDataStore, SchemaDetector
from connectors import ConnectorFactory
from event_bus import event_bus
from spark_etl import SparkEtlPipeline
from timescale_store import timescale_store

# ─── Config ────────────────────────────────────────────────────────────────
FACE_DATA_DIR = Path(__file__).parent / "face_data"
FACE_DATA_DIR.mkdir(exist_ok=True)

APP_ROOT = Path(__file__).resolve().parent.parent
INTEGRATED_DATA_DIR = APP_ROOT / "public" / "integrated-data"


def _load_simple_env_file(path: Path):
    """Load KEY=VALUE pairs from a local env file if present."""
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            os.environ.setdefault(key, value)


# Allow local env-based Jira config without requiring shell-level exports.
_load_simple_env_file(APP_ROOT / ".env.local")
_load_simple_env_file(Path(__file__).parent / ".env")

app = FastAPI(title="ChipIQ Face Auth API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATASET_FILES = {
    "dataset_summary": "dataset_summary.json",
    "module_summary": "module_summary.json",
    "bug_trend_monthly": "bug_trend_monthly.json",
    "regression_results": "regression_results.json",
    "rtl_commits": "rtl_commits.json",
    "coverage_data": "coverage_data.json",
    "bug_reports_inferred": "bug_reports_inferred.json",
}

SUPPORTED_MODELS = {"ARIMA", "LSTM", "PROPHET"}

# ─── Dynamic Data Store ────────────────────────────────────────────────────
data_store = DynamicDataStore(INTEGRATED_DATA_DIR)
etl_pipeline = SparkEtlPipeline(INTEGRATED_DATA_DIR)

# ─── Connector state ────────────────────────────────────────────────────────
active_connector = None
alert_cache = []


def _normalize_table_kind(table_name: str, connector_type: str | None = None):
    t = str(table_name or "").lower()
    c = str(connector_type or "").lower()

    if c == "logs" or "log" in t:
        return "logs"
    if c == "coverage" or "coverage" in t:
        return "coverage"
    if c == "regression" or "regression" in t or "test" in t:
        return "regression"
    if c == "jira" or "bug" in t or "issue" in t:
        return "bugs"
    return "generic"


def _topic_for_raw(table_name: str, connector_type: str | None = None):
    kind = _normalize_table_kind(table_name=table_name, connector_type=connector_type)
    if kind == "logs":
        return os.getenv("KAFKA_TOPIC_LOGS_RAW", "logs.raw")
    if kind == "bugs":
        return os.getenv("KAFKA_TOPIC_BUGS_RAW", "bugs.raw")
    if kind == "coverage":
        return os.getenv("KAFKA_TOPIC_COVERAGE_RAW", "coverage.raw")
    if kind == "regression":
        return os.getenv("KAFKA_TOPIC_REGRESSION_RAW", "regression.raw")
    return os.getenv("KAFKA_TOPIC_INGESTION", "chipiq.ingestion.raw")


def _publish_raw_rows(table_name: str, rows: list[dict], connector_type: str | None = None):
    if not rows:
        return

    topic = _topic_for_raw(table_name=table_name, connector_type=connector_type)
    max_rows = 500

    for row in rows[:max_rows]:
        event_bus.publish(
            topic=topic,
            key=f"{connector_type or 'upload'}:{table_name}",
            payload={
                "eventType": "raw_row",
                "connectorType": connector_type or "upload",
                "tableName": table_name,
                "payload": row,
            },
        )


def _timescale_rows_or_none(source_table: str, limit: int = 500):
    result = timescale_store.fetch_recent(source_table, limit=limit)
    if not result.get("success"):
        return None
    rows = result.get("rows", [])
    if not isinstance(rows, list) or not rows:
        return None
    rows = list(reversed(rows))
    for row in rows:
        if isinstance(row, dict):
            row.pop("event_time", None)
    return rows


def _load_payload_with_timescale_fallback(payload_name: str, default_value):
    timescale_mapping = {
        "bug_trend_monthly": ["curated_bug_trend_monthly", "bug_trend_monthly"],
        "regression_results": ["curated_regression_results", "regression_results"],
        "coverage_data": ["curated_coverage_data", "coverage_data"],
        "bug_reports_inferred": ["curated_bug_reports_inferred", "bug_reports_inferred"],
        "rtl_commits": ["curated_rtl_commits", "rtl_commits"],
        "module_summary": ["curated_module_summary", "module_summary"],
        "dataset_summary": ["curated_dataset_summary", "dataset_summary"],
    }

    candidates = timescale_mapping.get(payload_name, [])
    for source_table in candidates:
        rows = _timescale_rows_or_none(source_table)
        if rows is not None:
            if payload_name == "dataset_summary":
                return rows[-1] if rows else default_value
            return rows

    uploaded_df = data_store.get_data_table(payload_name)
    if uploaded_df is not None and not uploaded_df.empty:
        records = uploaded_df.to_dict(orient="records")
        if payload_name == "dataset_summary":
            return records[0] if records else default_value
        return records

    return read_integrated_json(payload_name, default_value)


def _read_alert_threshold(name: str, default: float):
    try:
        return float(str(os.getenv(name, str(default))).strip())
    except Exception:
        return float(default)


def _humanize_seconds(delta_seconds: float):
    if delta_seconds < 60:
        return "just now"
    if delta_seconds < 3600:
        return f"{int(delta_seconds // 60)}m ago"
    if delta_seconds < 86400:
        return f"{int(delta_seconds // 3600)}h ago"
    return f"{int(delta_seconds // 86400)}d ago"


def _status_from_severity(severity: str):
    s = str(severity or "").lower()
    if s == "critical":
        return "red"
    if s == "high":
        return "orange"
    return "orange"


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _notify_slack(alert):
    if str(os.getenv("ALERT_SLACK_ENABLED", "false")).strip().lower() not in {"1", "true", "yes", "on"}:
        return {"sent": False, "reason": "slack_disabled"}

    webhook = str(os.getenv("SLACK_WEBHOOK_URL", "")).strip()
    if not webhook:
        return {"sent": False, "reason": "missing_webhook"}

    try:
        import requests

        resp = requests.post(
            webhook,
            json={"text": f"[{alert.get('severity')}] {alert.get('text')} ({alert.get('module')})"},
            timeout=8,
        )
        return {"sent": resp.status_code in {200, 201, 202}, "status": resp.status_code}
    except Exception as exc:
        return {"sent": False, "reason": str(exc)}


def _notify_email(alert):
    if str(os.getenv("ALERT_EMAIL_ENABLED", "false")).strip().lower() not in {"1", "true", "yes", "on"}:
        return {"sent": False, "reason": "email_disabled"}

    host = str(os.getenv("SMTP_HOST", "")).strip()
    username = str(os.getenv("SMTP_USERNAME", "")).strip()
    password = str(os.getenv("SMTP_PASSWORD", "")).strip()
    sender = str(os.getenv("ALERT_EMAIL_FROM", username)).strip()
    target = str(os.getenv("ALERT_EMAIL_TO", "")).strip()
    port = int(str(os.getenv("SMTP_PORT", "587")).strip() or "587")

    if not host or not sender or not target:
        return {"sent": False, "reason": "smtp_config_incomplete"}

    msg = EmailMessage()
    msg["Subject"] = f"ChipIQ Alert: {alert.get('severity')} - {alert.get('module')}"
    msg["From"] = sender
    msg["To"] = target
    msg.set_content(f"{alert.get('text')}\nTime: {alert.get('time')}\nSource: {alert.get('source')}")

    try:
        with smtplib.SMTP(host, port, timeout=10) as smtp:
            smtp.starttls()
            if username and password:
                smtp.login(username, password)
            smtp.send_message(msg)
        return {"sent": True}
    except Exception as exc:
        return {"sent": False, "reason": str(exc)}


def _create_jira_from_alert(alert):
    if str(os.getenv("ALERT_AUTO_TICKET", "false")).strip().lower() not in {"1", "true", "yes", "on"}:
        return {"created": False, "reason": "auto_ticket_disabled"}

    base_url = str(os.getenv("JIRA_BASE_URL", "")).strip().rstrip("/")
    username = str(os.getenv("JIRA_USERNAME", "")).strip()
    api_token = str(os.getenv("JIRA_API_TOKEN", "")).strip()
    project_key = str(os.getenv("JIRA_PROJECT_KEY", "")).strip()
    if not base_url or not username or not api_token or not project_key:
        return {"created": False, "reason": "jira_config_missing"}

    try:
        import requests

        issue_payload = {
            "fields": {
                "project": {"key": project_key},
                "summary": f"[Auto Alert] {alert.get('text')}",
                "description": {
                    "type": "doc",
                    "version": 1,
                    "content": [{"type": "paragraph", "content": [{"type": "text", "text": f"Module: {alert.get('module')}\\nSeverity: {alert.get('severity')}"}]}],
                },
                "issuetype": {"name": "Bug"},
                "priority": {"name": "Highest" if str(alert.get('severity')).lower() == "critical" else "High"},
                "labels": ["chipiq", "auto-alert"],
            }
        }

        resp = requests.post(
            f"{base_url}/rest/api/3/issue",
            auth=(username, api_token),
            headers={"Accept": "application/json", "Content-Type": "application/json"},
            json=issue_payload,
            timeout=12,
        )

        if resp.status_code not in {200, 201}:
            return {"created": False, "reason": f"jira_http_{resp.status_code}"}

        body = resp.json()
        key = body.get("key")
        return {"created": True, "issueKey": key, "ticketUrl": f"{base_url}/browse/{key}" if key else None}
    except Exception as exc:
        return {"created": False, "reason": str(exc)}


def _evaluate_alerts():
    rows_bug = _load_payload_with_timescale_fallback("bug_reports_inferred", [])
    rows_cov = _load_payload_with_timescale_fallback("coverage_data", [])
    rows_reg = _load_payload_with_timescale_fallback("regression_results", [])
    rows_trend = _load_payload_with_timescale_fallback("bug_trend_monthly", [])

    coverage_min = _read_alert_threshold("ALERT_COVERAGE_MIN", 80)
    regression_min = _read_alert_threshold("ALERT_REGRESSION_PASS_MIN", 85)
    critical_max = _read_alert_threshold("ALERT_CRITICAL_BUGS_MAX", 5)
    trend_spike_pct = _read_alert_threshold("ALERT_TREND_SPIKE_PCT", 15)

    alerts = []
    now = datetime.now(timezone.utc)

    critical_bugs = 0
    for bug in rows_bug if isinstance(rows_bug, list) else []:
        p = str(bug.get("priority") or bug.get("severity") or "").lower()
        if p in {"critical", "highest", "p0", "p1", "high"}:
            critical_bugs += 1

    if critical_bugs > critical_max:
        alerts.append({
            "id": f"critical-bugs-{int(now.timestamp())}",
            "date": "TODAY",
            "text": f"Critical bug count is {critical_bugs}, above threshold {int(critical_max)}",
            "module": "BUG_TRACKER",
            "time": _humanize_seconds(120),
            "status": "red",
            "severity": "Critical",
            "source": "curated_metrics",
            "createdAt": _now_iso(),
        })

    coverage_values = []
    for row in rows_cov if isinstance(rows_cov, list) else []:
        cov = row.get("average_coverage")
        if cov is None:
            cov = row.get("line_coverage")
        if cov is None:
            cov = row.get("coverage")
        try:
            coverage_values.append(float(cov))
        except Exception:
            pass

    if coverage_values:
        avg_cov = float(sum(coverage_values) / len(coverage_values))
        if avg_cov < coverage_min:
            alerts.append({
                "id": f"coverage-{int(now.timestamp())}",
                "date": "TODAY",
                "text": f"Average coverage {avg_cov:.1f}% is below threshold {coverage_min:.1f}%",
                "module": "COVERAGE",
                "time": _humanize_seconds(300),
                "status": "orange",
                "severity": "High",
                "source": "curated_metrics",
                "createdAt": _now_iso(),
            })

    total_tests = 0
    passed_tests = 0
    for row in rows_reg if isinstance(rows_reg, list) else []:
        status = str(row.get("status") or "").lower()
        if status in {"passed", "failed"}:
            total_tests += 1
            if status == "passed":
                passed_tests += 1

    if total_tests > 0:
        pass_rate = 100.0 * (passed_tests / total_tests)
        if pass_rate < regression_min:
            alerts.append({
                "id": f"regression-{int(now.timestamp())}",
                "date": "TODAY",
                "text": f"Regression pass rate {pass_rate:.1f}% is below threshold {regression_min:.1f}%",
                "module": "REGRESSION",
                "time": _humanize_seconds(420),
                "status": "orange",
                "severity": "High",
                "source": "curated_metrics",
                "createdAt": _now_iso(),
            })

    labels, values = _extract_numeric_series_from_rows(rows_trend if isinstance(rows_trend, list) else [])
    if len(values) >= 2 and values[-2] > 0:
        pct = ((values[-1] - values[-2]) / values[-2]) * 100.0
        if pct >= trend_spike_pct:
            alerts.append({
                "id": f"trend-{int(now.timestamp())}",
                "date": "TODAY",
                "text": f"Bug trend spiked by {pct:.1f}% ({labels[-2]} -> {labels[-1]})",
                "module": "FORECAST",
                "time": _humanize_seconds(540),
                "status": "orange",
                "severity": "Medium",
                "source": "curated_metrics",
                "createdAt": _now_iso(),
            })

    return alerts


def _dispatch_alert_notifications(alerts: list[dict]):
    outcomes = []
    for alert in alerts:
        slack_result = _notify_slack(alert)
        email_result = _notify_email(alert)
        jira_result = {"created": False, "reason": "not_critical"}
        if str(alert.get("severity", "")).lower() == "critical":
            jira_result = _create_jira_from_alert(alert)

        event_bus.publish(
            topic=os.getenv("KAFKA_TOPIC_ALERTS", "chipiq.alerts.events"),
            key="alert_event",
            payload={
                "eventType": "alert_generated",
                "alert": alert,
                "notifications": {
                    "slack": slack_result,
                    "email": email_result,
                    "jira": jira_result,
                },
            },
        )

        outcomes.append({
            "alertId": alert.get("id"),
            "slack": slack_result,
            "email": email_result,
            "jira": jira_result,
        })
    return outcomes

# ─── Demo users matching frontend ──────────────────────────────────────────
DEMO_USERS = {
    "engineer@chipiq.io": {"role": "engineer", "name": "R. Sharma"},
    "lead@chipiq.io":     {"role": "lead",     "name": "J. Chen"},
    "manager@chipiq.io":  {"role": "manager",  "name": "S. Patel"},
    "admin@chipiq.io":    {"role": "admin",    "name": "A. Kumar"},
}

# ─── Helper: decode base64 image ───────────────────────────────────────────
def decode_base64_image(data_url: str) -> np.ndarray:
    """Convert base64 data URL to numpy BGR image."""
    if "," in data_url:
        data_url = data_url.split(",", 1)[1]
    img_bytes = base64.b64decode(data_url)
    img_array = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image")
    return img

def get_user_face_path(email: str) -> Path:
    safe_name = email.replace("@", "_at_").replace(".", "_")
    return FACE_DATA_DIR / f"{safe_name}.npy"


def read_integrated_json(key: str, fallback):
    file_name = DATASET_FILES[key]
    file_path = INTEGRATED_DATA_DIR / file_name
    if not file_path.exists():
        return fallback
    try:
        return json.loads(file_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Invalid JSON in {file_name}: {exc}")


def _extract_numeric_series_from_rows(rows):
    """Extract month labels and bug-count values from heterogeneous row payloads."""
    labels = []
    values = []

    for row in rows or []:
        if not isinstance(row, dict):
            continue

        month = str(
            row.get("month")
            or row.get("date")
            or row.get("period")
            or row.get("bucket")
            or ""
        ).strip()
        if not month:
            continue

        # Normalize to YYYY-MM when full dates/timestamps are present.
        if len(month) >= 10 and month[4] == "-" and month[7] == "-":
            month = month[:7]

        bug_value = (
            row.get("bugs")
            if row.get("bugs") is not None
            else row.get("bug_count")
            if row.get("bug_count") is not None
            else row.get("count")
            if row.get("count") is not None
            else row.get("total")
        )

        try:
            bug_value = float(bug_value)
        except Exception:
            continue

        labels.append(month)
        values.append(bug_value)

    if len(values) < 2:
        return [], np.array([], dtype=float)

    dedup = {}
    for month, value in zip(labels, values):
        dedup[month] = value

    ordered_months = sorted(dedup.keys())
    ordered_values = np.array([float(dedup[m]) for m in ordered_months], dtype=float)
    return ordered_months, ordered_values


def _extract_log_lines_from_dataframe(df):
    """Normalize a dataframe into root-cause log lines."""
    if df is None or df.empty:
        return []

    records = df.to_dict(orient="records")
    lines = []

    for idx, row in enumerate(records):
        text = None
        for key in ("message", "text", "log", "line"):
            if key in row and row[key] is not None and str(row[key]).strip():
                text = str(row[key]).strip()
                break

        if not text:
            for value in row.values():
                if value is not None and str(value).strip():
                    text = str(value).strip()
                    break

        if not text:
            continue

        line_no = row.get("line_number")
        try:
            line_no = int(line_no)
        except Exception:
            line_no = idx + 1

        severity = str(row.get("severity", "")).lower().strip()
        if severity not in {"error", "warning", "normal", "info"}:
            severity = "normal"

        lines.append({
            "line": line_no,
            "text": text,
            "severity": severity,
        })

    return lines


def _load_bug_series_from_trend():
    """Load monthly bug counts with Timescale/ETL preference and safe fallbacks."""
    preferred = str(os.getenv("FORECAST_SOURCE", "auto")).strip().lower() or "auto"

    def _load_from_timescale():
        if not timescale_store.status().get("enabled"):
            return None

        for source_name in ("curated_bug_trend_monthly", "bug_trend_monthly"):
            result = timescale_store.fetch_recent(source_name, limit=500)
            if not result.get("success"):
                continue
            labels, values = _extract_numeric_series_from_rows(result.get("rows", []))
            if len(values) >= 2:
                return labels, values
        return None

    def _load_from_etl():
        etl_df = etl_pipeline.get_table("curated_bug_trend_monthly")
        if etl_df is None or etl_df.empty:
            return None
        labels, values = _extract_numeric_series_from_rows(etl_df.to_dict(orient="records"))
        if len(values) >= 2:
            return labels, values
        return None

    def _load_from_uploaded():
        for table_name in ("bug_trend_monthly", "curated_bug_trend_monthly"):
            try:
                labels, values = data_store.extract_numeric_series(table_name)
                if len(values) >= 2:
                    return labels, values
            except Exception:
                continue
        return None

    def _load_from_integrated():
        rows = read_integrated_json("bug_trend_monthly", [])
        if not isinstance(rows, list):
            return None
        labels, values = _extract_numeric_series_from_rows(rows)
        if len(values) >= 2:
            return labels, values
        return None

    loaders = {
        "timescale": _load_from_timescale,
        "etl": _load_from_etl,
        "uploaded": _load_from_uploaded,
        "integrated": _load_from_integrated,
    }

    if preferred in loaders:
        loaded = loaders[preferred]()
        if loaded is not None:
            return loaded
        raise HTTPException(status_code=400, detail=f"Requested forecast source unavailable: {preferred}")

    # auto: prefer curated sources first, then existing legacy paths.
    for source_name in ("timescale", "etl", "uploaded", "integrated"):
        loaded = loaders[source_name]()
        if loaded is not None:
            return loaded

    raise HTTPException(status_code=400, detail="Insufficient bug trend history for forecasting")


def _next_month_labels(last_label: str, steps: int):
    import pandas as pd

    last = pd.to_datetime(f"{last_label}-01")
    next_idx = pd.date_range(last + pd.offsets.MonthBegin(1), periods=steps, freq="MS")
    return [d.strftime("%Y-%m") for d in next_idx]


def _expand_series_for_training(labels, y: np.ndarray, min_points: int = 8):
    """Expand sparse history to a minimum length so statistical/ML models can run."""
    if y.size >= min_points:
        return labels, y

    import pandas as pd

    last = pd.to_datetime(f"{labels[-1]}-01")
    expanded_index = pd.date_range(end=last, periods=min_points, freq="MS")
    expanded_labels = [d.strftime("%Y-%m") for d in expanded_index]

    x_old = np.linspace(0, 1, y.size)
    x_new = np.linspace(0, 1, min_points)
    expanded_y = np.interp(x_new, x_old, y)
    return expanded_labels, expanded_y


def _trend_label(last_actual: float, first_pred: float):
    if first_pred >= last_actual * 1.12:
        return "Rising Fast"
    if first_pred > last_actual * 1.01:
        return "Rising"
    if first_pred < last_actual * 0.95:
        return "Declining"
    return "Stable"


def _confidence_from_rmse(y: np.ndarray, rmse: float):
    baseline = max(1.0, float(np.mean(np.abs(y))))
    raw = 100.0 - (rmse / baseline) * 100.0
    return int(max(55.0, min(99.0, raw)))


def _format_series(history_labels, history_values, future_labels, pred, lower, upper):
    series = [
        {
            "date": str(lbl),
            "historical": float(val),
            "predicted": None,
            "upper": None,
            "lower": None,
        }
        for lbl, val in zip(history_labels, history_values)
    ]
    for lbl, p, lo, hi in zip(future_labels, pred, lower, upper):
        series.append(
            {
                "date": str(lbl),
                "historical": None,
                "predicted": float(max(0.0, p)),
                "upper": float(max(0.0, hi)),
                "lower": float(max(0.0, lo)),
            }
        )
    return series


def _forecast_arima(y: np.ndarray, steps: int):
    from statsmodels.tsa.arima.model import ARIMA

    model = ARIMA(y, order=(1, 1, 1))
    fit = model.fit()
    fc = fit.get_forecast(steps=steps)
    pred = np.array(fc.predicted_mean, dtype=float)
    ci = np.array(fc.conf_int(alpha=0.2), dtype=float)
    lower = ci[:, 0]
    upper = ci[:, 1]

    resid = np.array(fit.resid, dtype=float)
    rmse = float(np.sqrt(np.mean(np.square(resid)))) if resid.size else 0.0
    return pred, lower, upper, rmse


def _forecast_prophet(history_labels, y: np.ndarray, steps: int):
    import pandas as pd
    from prophet import Prophet

    ds = pd.to_datetime([f"{m}-01" for m in history_labels])
    df = pd.DataFrame({"ds": ds, "y": y})

    model = Prophet(interval_width=0.8, yearly_seasonality=False, weekly_seasonality=False, daily_seasonality=False)
    model.fit(df)
    future = model.make_future_dataframe(periods=steps, freq="MS")
    pred_df = model.predict(future)

    future_slice = pred_df.tail(steps)
    pred = future_slice["yhat"].to_numpy(dtype=float)
    lower = future_slice["yhat_lower"].to_numpy(dtype=float)
    upper = future_slice["yhat_upper"].to_numpy(dtype=float)

    in_sample = pred_df.iloc[: len(df)]["yhat"].to_numpy(dtype=float)
    rmse = float(np.sqrt(np.mean(np.square(df["y"].to_numpy(dtype=float) - in_sample))))
    return pred, lower, upper, rmse


def _forecast_lstm(y: np.ndarray, steps: int):
    from sklearn.preprocessing import MinMaxScaler

    try:
        import tensorflow as tf
        from tensorflow.keras.layers import LSTM, Dense
        from tensorflow.keras.models import Sequential
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"TensorFlow unavailable for LSTM model: {exc}")

    np.random.seed(7)
    tf.random.set_seed(7)

    if y.size < 6:
        raise HTTPException(status_code=400, detail="LSTM requires at least 6 monthly points")

    scaler = MinMaxScaler(feature_range=(0, 1))
    ys = scaler.fit_transform(y.reshape(-1, 1)).flatten()

    window = 2
    X, target = [], []
    for i in range(window, len(ys)):
        X.append(ys[i - window : i])
        target.append(ys[i])
    X = np.array(X).reshape(-1, window, 1)
    target = np.array(target)

    model = Sequential([
        LSTM(32, input_shape=(window, 1)),
        Dense(1),
    ])
    model.compile(optimizer="adam", loss="mse")
    model.fit(X, target, epochs=140, batch_size=1, verbose=0)

    train_pred_scaled = model.predict(X, verbose=0).flatten()
    train_pred = scaler.inverse_transform(train_pred_scaled.reshape(-1, 1)).flatten()
    y_train = y[window:]
    rmse = float(np.sqrt(np.mean(np.square(y_train - train_pred)))) if y_train.size else 0.0

    rolling = ys[-window:].tolist()
    future_scaled = []
    for _ in range(steps):
        x_in = np.array(rolling[-window:]).reshape(1, window, 1)
        nxt = float(model.predict(x_in, verbose=0).flatten()[0])
        future_scaled.append(nxt)
        rolling.append(nxt)

    pred = scaler.inverse_transform(np.array(future_scaled).reshape(-1, 1)).flatten()
    band = max(1.0, rmse)
    lower = pred - 1.96 * band
    upper = pred + 1.96 * band
    return pred, lower, upper, rmse

# ─── Models ────────────────────────────────────────────────────────────────
class EnrollRequest(BaseModel):
    email: str
    image_base64: str  # data URL from webcam

class VerifyRequest(BaseModel):
    image_base64: str  # data URL from webcam

class ConnectorConfigRequest(BaseModel):
    connector_type: str
    config: dict


class JiraTicketRequest(BaseModel):
    summary: str
    description: str
    issue_type: str = "Bug"
    priority: str | None = None
    labels: list[str] | None = None
    project_key: str | None = None
    base_url: str | None = None
    username: str | None = None
    api_token: str | None = None


class EtlRunRequest(BaseModel):
    selected_tables: list[str] | None = None
    persist: bool = True


class EtlKafkaRunRequest(BaseModel):
    max_messages: int = 500

class TimescaleSyncRequest(BaseModel):
    selected_tables: list[str] | None = None
    source: str = "etl"  # etl | uploaded


class AlertEvaluateRequest(BaseModel):
    notify: bool = True
    overwrite_cache: bool = True

# ─── Routes ────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "status": "ChipIQ API running",
        "version": "1.2.0",
        "capabilities": ["face-auth", "integrated-data", "multi-source-connectors"],
    }


@app.get("/api/data/all")
def get_all_integrated_data():
    """Return all integrated payloads (uploaded or default)."""
    result = {
        "datasetSummary": _load_payload_with_timescale_fallback("dataset_summary", {}),
        "moduleSummary": _load_payload_with_timescale_fallback("module_summary", []),
        "bugTrendMonthly": _load_payload_with_timescale_fallback("bug_trend_monthly", []),
        "regressionResults": _load_payload_with_timescale_fallback("regression_results", []),
        "rtlCommits": _load_payload_with_timescale_fallback("rtl_commits", []),
        "coverageData": _load_payload_with_timescale_fallback("coverage_data", []),
        "bugReportsInferred": _load_payload_with_timescale_fallback("bug_reports_inferred", []),
    }
    
    # Add upload status
    result["uploadStatus"] = data_store.get_status()
    
    return result


@app.get("/api/data/{payload_name}")
def get_integrated_payload(payload_name: str):
    """Return a single integrated payload by logical name."""
    if payload_name not in DATASET_FILES:
        raise HTTPException(status_code=404, detail=f"Unknown payload: {payload_name}")
    default_value = {} if payload_name == "dataset_summary" else []
    return _load_payload_with_timescale_fallback(payload_name, default_value)


# ─── Dynamic Upload API ────────────────────────────────────────────────────

@app.post("/api/upload")
async def upload_data_file(file: UploadFile = File(...)):
    """Upload CSV or JSON file for dynamic data ingestion."""
    try:
        contents = await file.read()
        result = data_store.upload_file(file.filename, contents)

        if result.get("success"):
            table_name = result.get("table_name")
            df = data_store.get_data_table(table_name)
            rows = df.to_dict(orient="records") if df is not None else []

            event_bus.publish(
                topic=_topic_for_raw(table_name=table_name, connector_type="upload"),
                key="file_upload",
                payload={
                    "eventType": "file_upload",
                    "filename": file.filename,
                    "tableName": table_name,
                    "rows": result.get("file_info", {}).get("rows"),
                    "columns": result.get("file_info", {}).get("columns"),
                },
            )

            _publish_raw_rows(table_name=table_name, rows=rows, connector_type="upload")

        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Upload failed: {str(e)}")


@app.get("/api/upload-status")
def get_upload_status():
    """Get information about uploaded data."""
    return data_store.get_status()


@app.get("/api/etl/status")
def get_etl_status():
    """Return ETL pipeline capability/status."""
    return etl_pipeline.status()


@app.post("/api/etl/run")
def run_etl(request: EtlRunRequest):
    """Run ETL against currently available source tables."""
    source_tables = {}

    # Uploaded/connector-ingested tables first.
    for table_name, df in data_store.uploaded_data.items():
        if df is not None and not df.empty:
            source_tables[table_name] = df.copy()

    # Include default integrated tables if not already present.
    for table_name in DATASET_FILES.keys():
        if table_name in source_tables:
            continue
        df = data_store.get_data_table(table_name)
        if df is not None and not df.empty:
            source_tables[table_name] = df

    result = etl_pipeline.run(
        source_tables=source_tables,
        selected_tables=request.selected_tables,
        persist=request.persist,
    )

    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message", "ETL failed"))

    # Expose curated tables through existing in-memory data API surface.
    for curated_name in result.get("curatedTables", []):
        df = etl_pipeline.get_table(curated_name)
        if df is None:
            continue
        data_store.uploaded_data[curated_name] = df
        data_store.uploaded_files[curated_name] = {
            "filename": f"{curated_name}.json",
            "rows": len(df),
            "columns": len(df.columns),
            "timestamp": __import__('datetime').datetime.now().isoformat(),
            "source": "spark_etl",
        }

    event_bus.publish(
        topic=os.getenv("KAFKA_TOPIC_ETL", "chipiq.etl.events"),
        key="etl_run",
        payload={
            "eventType": "etl_run_completed",
            "tablesProcessed": result.get("tablesProcessed", 0),
            "curatedTables": result.get("curatedTables", []),
            "sparkUsed": result.get("sparkUsed", False),
        },
    )

    if str(os.getenv("TIMESCALE_AUTO_SYNC", "false")).strip().lower() in {"1", "true", "yes", "on"}:
        for curated_name in result.get("curatedTables", []):
            df = etl_pipeline.get_table(curated_name)
            if df is None:
                continue
            timescale_store.sync_rows(curated_name, df.to_dict(orient="records"))

    return result


@app.post("/api/etl/run-from-kafka")
def run_etl_from_kafka(request: EtlKafkaRunRequest):
    """Consume raw Kafka topics and build curated ETL tables."""
    max_messages = max(1, min(5000, int(request.max_messages)))
    result = etl_pipeline.run_from_kafka_raw(max_messages=max_messages)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message", "Kafka ETL failed"))

    event_bus.publish(
        topic=os.getenv("KAFKA_TOPIC_ETL", "chipiq.etl.events"),
        key="etl_run_kafka",
        payload={
            "eventType": "etl_kafka_run_completed",
            "tablesProcessed": result.get("tablesProcessed", 0),
            "curatedTables": result.get("curatedTables", []),
            "kafkaMessagesConsumed": result.get("kafkaMessagesConsumed", 0),
        },
    )
    return result


@app.get("/api/etl/table/{table_name}")
def get_etl_table(table_name: str, limit: int = 200):
    """Preview a curated ETL table."""
    df = etl_pipeline.get_table(table_name)
    if df is None:
        raise HTTPException(status_code=404, detail=f"Curated table not found: {table_name}")
    if limit < 1:
        limit = 1
    if limit > 2000:
        limit = 2000
    preview = df.head(limit).to_dict(orient="records")
    return {
        "table": table_name,
        "rows": len(df),
        "columns": list(df.columns),
        "preview": preview,
    }

@app.get("/api/timescale/status")
def get_timescale_status():
    """Return TimescaleDB integration status."""
    return timescale_store.status()

@app.post("/api/timescale/sync")
def sync_timescale(request: TimescaleSyncRequest):
    """Sync ETL or uploaded tables into TimescaleDB JSONB events table."""
    source = (request.source or "etl").strip().lower()

    if source not in {"etl", "uploaded"}:
        raise HTTPException(status_code=400, detail="source must be one of: etl, uploaded")

    tables = {}
    if source == "etl":
        for table_name, df in etl_pipeline.curated_tables.items():
            tables[table_name] = df
    else:
        for table_name, df in data_store.uploaded_data.items():
            tables[table_name] = df

    if request.selected_tables:
        allowed = set(request.selected_tables)
        tables = {k: v for k, v in tables.items() if k in allowed}

    if not tables:
        raise HTTPException(status_code=400, detail="No tables available to sync")

    synced = []
    failures = []
    for table_name, df in tables.items():
        rows = df.to_dict(orient="records") if df is not None else []
        result = timescale_store.sync_rows(table_name, rows)
        if result.get("success"):
            synced.append({"table": table_name, "rows": result.get("rows", 0)})
        else:
            failures.append({"table": table_name, "error": result.get("error") or result.get("reason")})

    event_bus.publish(
        topic=os.getenv("KAFKA_TOPIC_TIMESCALE", "chipiq.timescale.events"),
        key="timescale_sync",
        payload={
            "eventType": "timescale_sync_completed",
            "source": source,
            "syncedTables": synced,
            "failedTables": failures,
        },
    )

    return {
        "success": len(synced) > 0,
        "source": source,
        "synced": synced,
        "failed": failures,
        "timescale": timescale_store.status(),
    }


@app.get("/api/timescale/table/{table_name}")
def get_timescale_table(table_name: str, limit: int = 200):
    """Read recent rows for a source table from TimescaleDB."""
    result = timescale_store.fetch_recent(table_name, limit=limit)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error") or result.get("reason") or "Timescale read failed")
    return result


@app.get("/api/alerts")
def get_alerts(refresh: bool = True):
    """Return alert feed used by dashboard/alerts pages."""
    global alert_cache

    if refresh or not alert_cache:
        generated = _evaluate_alerts()
        alert_cache = generated
    return {
        "success": True,
        "count": len(alert_cache),
        "alerts": alert_cache,
    }


@app.post("/api/alerts/evaluate")
def evaluate_alerts(request: AlertEvaluateRequest):
    """Evaluate threshold rules and optionally dispatch notifications."""
    global alert_cache

    generated = _evaluate_alerts()
    if request.overwrite_cache:
        alert_cache = generated

    notifications = []
    if request.notify:
        notifications = _dispatch_alert_notifications(generated)

    return {
        "success": True,
        "alerts": generated,
        "count": len(generated),
        "notifications": notifications,
    }

@app.get("/api/rca/latest-log")
def get_latest_log_for_rca():
    """Return the latest available centralized log lines for root cause analysis."""
    # Priority 1: connector-ingested log table
    table_candidates = ["simulation_logs"]

    # Priority 2: any uploaded table that looks like a log source
    for table_name in data_store.uploaded_data.keys():
        t = str(table_name).lower()
        if "log" in t and table_name not in table_candidates:
            table_candidates.append(table_name)

    best_table = None
    best_ts = ""
    for name in table_candidates:
        info = data_store.uploaded_files.get(name, {})
        ts = str(info.get("timestamp", ""))
        if best_table is None:
            best_table = name
            best_ts = ts
        elif ts and ts > best_ts:
            best_table = name
            best_ts = ts

    if best_table:
        df = data_store.get_data_table(best_table)
        lines = _extract_log_lines_from_dataframe(df)
        if lines:
            file_info = data_store.uploaded_files.get(best_table, {})
            return {
                "success": True,
                "source": "data_store",
                "table": best_table,
                "fileName": file_info.get("filename", f"{best_table}.log"),
                "lineCount": len(lines),
                "lines": lines[:1200],
            }

    raise HTTPException(status_code=404, detail="No centralized simulation log data available")


@app.post("/api/upload-reset")
def reset_uploaded_data():
    """Clear all uploaded data and revert to default integrated files."""
    data_store.reset()
    return {"success": True, "message": "Uploaded data cleared. Using defaults."}


@app.post("/api/upload/map-column")
async def map_column(table_name: str, actual_col: str, standard_name: str):
    """Map a user's column to standard field name."""
    try:
        data_store.map_column(table_name, actual_col, standard_name)
        return {"success": True, "message": f"Mapped {actual_col} → {standard_name}"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── Multi-Source Connector API ────────────────────────────────────────────

@app.get("/api/connectors")
def list_connectors():
    """List available data source connectors"""
    return {
        "available": ConnectorFactory.list_connectors(),
        "message": "Use POST /api/connect/{connector_type} to establish connection"
    }


@app.post("/api/connect/{connector_type}")
async def connect_to_source(connector_type: str, request: ConnectorConfigRequest):
    """
    Connect to a data source (Git, Jira, Coverage, Logs, Regression)
    
    Examples:
    - Git: {"config": {"repo_path": "/path/to/repo"}}
    - Jira: {"config": {"base_url": "https://jira.com", "username": "...", "api_token": "...", "project_key": "SOC"}}
    - Coverage: {"config": {"file_path": "/path/to/coverage.xml"}}
    - Logs: {"config": {"file_path": "/path/to/simulation.log"}}
    - Regression: {"config": {"file_path": "/path/to/results.xml"}}
    """
    global active_connector
    
    try:
        connector = ConnectorFactory.create(connector_type)
        if not connector:
            raise HTTPException(status_code=404, detail=f"Unknown connector: {connector_type}")
        
        # Connect with provided config
        success = connector.connect(**request.config)
        if not success:
            raise HTTPException(status_code=400, detail=f"Failed to connect to {connector_type}")
        
        active_connector = connector
        return {
            "success": True,
            "connector": connector_type,
            "message": f"Connected to {connector_type}",
            "config_template": connector.get_config_template()
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Connection error: {str(e)}")


@app.post("/api/ingest/{connector_type}")
async def ingest_from_source(connector_type: str):
    """
    Fetch and ingest data from connected source
    """
    global active_connector
    
    try:
        if not active_connector:
            connector = ConnectorFactory.create(connector_type)
            if not connector:
                raise HTTPException(status_code=404, detail=f"Unknown connector: {connector_type}")
        else:
            connector = active_connector
        
        # Fetch data from source
        result = connector.fetch_data()
        
        if not result['success']:
            return result
        
        # Store in data_store
        table_name = result['table_name']
        data = result['data']
        
        # Convert to dataframe and store
        import pandas as pd
        df = pd.DataFrame(data)
        data_store.uploaded_data[table_name] = df
        data_store.uploaded_files[table_name] = {
            'filename': f'{table_name}_from_{connector_type}',
            'rows': len(df),
            'columns': len(df.columns),
            'timestamp': __import__('datetime').datetime.now().isoformat(),
            'source': connector_type
        }

        event_bus.publish(
            topic=_topic_for_raw(table_name=table_name, connector_type=connector_type),
            key=f"connector:{connector_type}",
            payload={
                "eventType": "connector_ingest",
                "connectorType": connector_type,
                "tableName": table_name,
                "rowsIngested": len(df),
                "columns": list(df.columns),
            },
        )

        _publish_raw_rows(table_name=table_name, rows=data if isinstance(data, list) else [], connector_type=connector_type)
        
        return {
            "success": True,
            "table_name": table_name,
            "rows_ingested": len(df),
            "columns": list(df.columns),
            "message": result['message'],
            "source": connector_type
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion error: {str(e)}")


@app.post("/api/jira/tickets")
async def create_jira_ticket(request: JiraTicketRequest):
    """Create a Jira issue from AI diagnosis details."""
    try:
        import requests

        base_url = (request.base_url or os.getenv("JIRA_BASE_URL", "")).strip().rstrip("/")
        username = (request.username or os.getenv("JIRA_USERNAME", "")).strip()
        api_token = (request.api_token or os.getenv("JIRA_API_TOKEN", "")).strip()
        project_key = (request.project_key or os.getenv("JIRA_PROJECT_KEY", "")).strip()

        if not base_url or not username or not api_token or not project_key:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Jira configuration missing. Set JIRA_BASE_URL, JIRA_USERNAME, "
                    "JIRA_API_TOKEN, JIRA_PROJECT_KEY in backend environment."
                ),
            )

        issue_payload = {
            "fields": {
                "project": {"key": project_key},
                "summary": request.summary,
                "description": {
                    "type": "doc",
                    "version": 1,
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [{"type": "text", "text": request.description}],
                        }
                    ],
                },
                "issuetype": {"name": request.issue_type or "Bug"},
            }
        }

        if request.priority:
            issue_payload["fields"]["priority"] = {"name": request.priority}
        if request.labels:
            issue_payload["fields"]["labels"] = request.labels

        resp = requests.post(
            f"{base_url}/rest/api/3/issue",
            auth=(username, api_token),
            headers={"Accept": "application/json", "Content-Type": "application/json"},
            json=issue_payload,
            timeout=15,
        )

        if resp.status_code not in (200, 201):
            try:
                err_body = resp.json()
            except Exception:
                err_body = {"raw": resp.text}
            raise HTTPException(status_code=resp.status_code, detail=f"Jira issue creation failed: {err_body}")

        body = resp.json()
        key = body.get("key")
        ticket_url = f"{base_url}/browse/{key}" if key else None
        event_bus.publish(
            topic=os.getenv("KAFKA_TOPIC_JIRA", "chipiq.jira.events"),
            key="jira_ticket",
            payload={
                "eventType": "jira_ticket_created",
                "issueKey": key,
                "project": project_key,
                "summary": request.summary,
                "issueType": request.issue_type,
            },
        )

        return {
            "success": True,
            "issueKey": key,
            "issueId": body.get("id"),
            "ticketUrl": ticket_url,
            "project": project_key,
            "message": f"Jira ticket created: {key}" if key else "Jira ticket created",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Jira ticket creation error: {str(e)}")


# ─── Forecasting API ──────────────────────────────────────────────────────

@app.get("/api/forecast/{model_name}")
def get_model_forecast(model_name: str, horizon: int = 2):
    """Run real model inference over integrated monthly bug trend data."""
    model_key = str(model_name or "").upper()
    if model_key not in SUPPORTED_MODELS:
        raise HTTPException(status_code=404, detail=f"Unsupported model: {model_name}")
    if horizon < 1 or horizon > 12:
        raise HTTPException(status_code=400, detail="horizon must be between 1 and 12")

    history_labels, y = _load_bug_series_from_trend()
    train_labels, train_y = _expand_series_for_training(history_labels, y, min_points=8)
    future_labels = _next_month_labels(history_labels[-1], horizon)

    try:
        if model_key == "ARIMA":
            pred, lower, upper, rmse = _forecast_arima(train_y, horizon)
        elif model_key == "PROPHET":
            pred, lower, upper, rmse = _forecast_prophet(train_labels, train_y, horizon)
        else:
            pred, lower, upper, rmse = _forecast_lstm(train_y, horizon)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"{model_key} forecast failed: {exc}")

    series = _format_series(history_labels, y, future_labels, pred, lower, upper)
    confidence = _confidence_from_rmse(train_y, rmse)
    trend_label = _trend_label(float(y[-1]), float(pred[0]))

    return {
        "model": model_key,
        "horizon": horizon,
        "trainingPoints": int(train_y.size),
        "sourcePoints": int(y.size),
        "rmse": round(float(rmse), 3),
        "confidence": confidence,
        "trendLabel": trend_label,
        "series": series,
        "predictedTotal": round(float(np.sum(pred)), 2),
    }


# ─── Face Auth API ────────────────────────────────────────────────────────

@app.get("/api/enrolled")
def list_enrolled():
    """List all enrolled users."""
    return {"enrolled": [f.stem for f in FACE_DATA_DIR.glob("*.npy")]}


@app.post("/api/enroll")
async def enroll_face(request: EnrollRequest):
    """Enroll a user's face embedding."""
    try:
        from deepface import DeepFace

        if request.email not in DEMO_USERS:
            raise HTTPException(status_code=400, detail="Unknown email address")

        img = decode_base64_image(request.image_base64)

        result = DeepFace.represent(
            img_path=img,
            model_name="Facenet512",
            enforce_detection=True,
            detector_backend="opencv"
        )

        if not result:
            raise HTTPException(status_code=400, detail="No face detected in image")

        embedding = np.array(result[0]["embedding"])
        face_path = get_user_face_path(request.email)
        np.save(str(face_path), embedding)

        user = DEMO_USERS[request.email]
        return {
            "success": True,
            "message": f"Face enrolled for {user['name']} ({user['role']})",
            "email": request.email,
            "role": user["role"]
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Enrollment failed: {str(e)}")


@app.post("/api/verify")
async def verify_face(request: VerifyRequest):
    """Verify a face against all enrolled users."""
    try:
        from deepface import DeepFace

        img = decode_base64_image(request.image_base64)

        result = DeepFace.represent(
            img_path=img,
            model_name="Facenet512",
            enforce_detection=True,
            detector_backend="opencv"
        )

        if not result:
            raise HTTPException(status_code=400, detail="No face detected in image")

        query_embedding = np.array(result[0]["embedding"])

        enrolled_files = list(FACE_DATA_DIR.glob("*.npy"))
        if not enrolled_files:
            raise HTTPException(status_code=404, detail="No faces enrolled yet. Please enroll first.")

        best_match = None
        best_distance = float("inf")
        THRESHOLD = 0.40  # Facenet512 cosine threshold

        for face_file in enrolled_files:
            stored_embedding = np.load(str(face_file))

            dot = np.dot(query_embedding, stored_embedding)
            norm_q = np.linalg.norm(query_embedding)
            norm_s = np.linalg.norm(stored_embedding)
            cosine_sim = dot / (norm_q * norm_s + 1e-10)
            distance = 1 - cosine_sim

            if distance < best_distance:
                best_distance = distance
                best_match = face_file.stem

        if best_distance > THRESHOLD or best_match is None:
            raise HTTPException(
                status_code=401,
                detail=f"Face not recognized (distance: {best_distance:.3f}). Please try again."
            )

        matched_email = None
        for known_email in DEMO_USERS:
            safe = known_email.replace("@", "_at_").replace(".", "_")
            if safe == best_match:
                matched_email = known_email
                break

        if not matched_email:
            raise HTTPException(status_code=401, detail="Face matched but user record not found")

        user = DEMO_USERS[matched_email]
        return {
            "success": True,
            "email": matched_email,
            "name": user["name"],
            "role": user["role"],
            "confidence": round((1 - best_distance) * 100, 1),
            "message": f"Welcome, {user['name']}!"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Verification failed: {str(e)}")


@app.delete("/api/enroll/{email}")
async def delete_enrollment(email: str):
    """Delete a user's face enrollment."""
    face_path = get_user_face_path(email)
    if not face_path.exists():
        raise HTTPException(status_code=404, detail="Enrollment not found")
    face_path.unlink()
    return {"success": True, "message": f"Enrollment deleted for {email}"}


@app.get("/api/health")
def health():
    enrolled_count = len(list(FACE_DATA_DIR.glob("*.npy")))
    available_payloads = sum(1 for file_name in DATASET_FILES.values() if (INTEGRATED_DATA_DIR / file_name).exists())
    jira_configured = all([
        bool(os.getenv("JIRA_BASE_URL", "").strip()),
        bool(os.getenv("JIRA_USERNAME", "").strip()),
        bool(os.getenv("JIRA_API_TOKEN", "").strip()),
        bool(os.getenv("JIRA_PROJECT_KEY", "").strip()),
    ])
    return {
        "status": "healthy",
        "supported_models": sorted(list(SUPPORTED_MODELS)),
        "available_connectors": list(ConnectorFactory.list_connectors().keys()),
        "enrolled_users": enrolled_count,
        "face_data_dir": str(FACE_DATA_DIR),
        "integrated_data_dir": str(INTEGRATED_DATA_DIR),
        "integrated_payloads_available": available_payloads,
        "jira_configured": jira_configured,
        "event_bus": event_bus.health(),
        "etl": etl_pipeline.status(),
        "timescale": timescale_store.status(),
        "alerts": {
            "cached": len(alert_cache),
            "slackEnabled": str(os.getenv("ALERT_SLACK_ENABLED", "false")).strip().lower() in {"1", "true", "yes", "on"},
            "emailEnabled": str(os.getenv("ALERT_EMAIL_ENABLED", "false")).strip().lower() in {"1", "true", "yes", "on"},
        },
    }
