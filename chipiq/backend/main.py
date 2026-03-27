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
from pathlib import Path
from io import BytesIO

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
    """Load monthly bug counts as (labels, values) from uploaded or default data."""
    try:
        # Try uploaded data first
        labels, values = data_store.extract_numeric_series('bug_trend_monthly')
        if len(values) >= 2:
            return labels, values
    except:
        pass
    
    # Fallback to integrated files
    rows = read_integrated_json("bug_trend_monthly", [])
    if not isinstance(rows, list) or len(rows) < 2:
        raise HTTPException(status_code=400, detail="Insufficient bug trend history for forecasting")

    labels = []
    values = []
    for row in rows:
        month = str(row.get("month", "")).strip()
        if not month:
            continue
        labels.append(month)
        values.append(float(row.get("bugs", 0)))

    if len(values) < 2:
        raise HTTPException(status_code=400, detail="Insufficient valid monthly data points for forecasting")
    return labels, np.array(values, dtype=float)


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

class TimescaleSyncRequest(BaseModel):
    selected_tables: list[str] | None = None
    source: str = "etl"  # etl | uploaded

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
        "datasetSummary": read_integrated_json("dataset_summary", {}),
        "moduleSummary": read_integrated_json("module_summary", []),
        "bugTrendMonthly": read_integrated_json("bug_trend_monthly", []),
        "regressionResults": read_integrated_json("regression_results", []),
        "rtlCommits": read_integrated_json("rtl_commits", []),
        "coverageData": read_integrated_json("coverage_data", []),
        "bugReportsInferred": read_integrated_json("bug_reports_inferred", []),
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
    return read_integrated_json(payload_name, default_value)


# ─── Dynamic Upload API ────────────────────────────────────────────────────

@app.post("/api/upload")
async def upload_data_file(file: UploadFile = File(...)):
    """Upload CSV or JSON file for dynamic data ingestion."""
    try:
        contents = await file.read()
        result = data_store.upload_file(file.filename, contents)

        if result.get("success"):
            event_bus.publish(
                topic=os.getenv("KAFKA_TOPIC_INGESTION", "chipiq.ingestion.raw"),
                key="file_upload",
                payload={
                    "eventType": "file_upload",
                    "filename": file.filename,
                    "tableName": result.get("table_name"),
                    "rows": result.get("file_info", {}).get("rows"),
                    "columns": result.get("file_info", {}).get("columns"),
                },
            )

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


    # Optional auto-sync curated tables into TimescaleDB.
    if str(os.getenv("TIMESCALE_AUTO_SYNC", "false")).strip().lower() in {"1", "true", "yes", "on"}:
        for curated_name in result.get("curatedTables", []):
            df = etl_pipeline.get_table(curated_name)
            if df is None:
                continue
            timescale_store.sync_rows(curated_name, df.to_dict(orient="records"))

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
            topic=os.getenv("KAFKA_TOPIC_INGESTION", "chipiq.ingestion.raw"),
            key=f"connector:{connector_type}",
            payload={
                "eventType": "connector_ingest",
                "connectorType": connector_type,
                "tableName": table_name,
                "rowsIngested": len(df),
                "columns": list(df.columns),
            },
        )
        
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
    }
