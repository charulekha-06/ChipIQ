"""Step-2 ETL scaffold for ChipIQ.

Design goals:
- Optional Spark support (disabled by default)
- Safe fallback transforms without Spark runtime
- No breaking changes to existing APIs
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, Optional

import pandas as pd


class SparkEtlPipeline:
    def __init__(self, output_dir: Path):
        self.enabled = str(os.getenv("SPARK_ENABLED", "false")).strip().lower() in {"1", "true", "yes", "on"}
        self.master = str(os.getenv("SPARK_MASTER", "local[*]")).strip()
        self.app_name = str(os.getenv("SPARK_APP_NAME", "chipiq-etl")).strip()
        self.output_dir = output_dir
        self.curated_tables: Dict[str, pd.DataFrame] = {}
        self.last_run: Optional[str] = None
        self.last_error: Optional[str] = None
        self._spark = None

    @staticmethod
    def _pick_source_table(row: Dict) -> str:
        table = str(row.get("tableName") or row.get("source_table") or row.get("table") or "raw_events").strip()
        return table or "raw_events"

    @staticmethod
    def _extract_payload_row(event_row: Dict) -> Dict:
        payload = event_row.get("payload")
        if isinstance(payload, dict):
            inner = payload.get("payload")
            if isinstance(inner, dict):
                return dict(inner)
            return dict(payload)
        return dict(event_row)

    def _get_spark(self):
        if not self.enabled:
            return None
        if self._spark is not None:
            return self._spark

        try:
            from pyspark.sql import SparkSession

            self._spark = (
                SparkSession.builder
                .appName(self.app_name)
                .master(self.master)
                .getOrCreate()
            )
            self.last_error = None
        except Exception as exc:  # pragma: no cover
            self._spark = None
            self.last_error = f"Spark unavailable: {exc}"

        return self._spark

    @staticmethod
    def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
        normalized = df.copy()
        normalized.columns = [str(c).strip().lower().replace(" ", "_") for c in normalized.columns]
        return normalized

    @staticmethod
    def _transform_table(df: pd.DataFrame, table_name: str) -> pd.DataFrame:
        x = SparkEtlPipeline._normalize_columns(df)
        x = x.drop_duplicates().reset_index(drop=True)
        x["etl_processed_at"] = datetime.now(timezone.utc).isoformat()
        x["etl_source_table"] = table_name

        if table_name == "simulation_logs" and "severity" in x.columns:
            x["severity"] = x["severity"].astype(str).str.lower()
            x["is_error"] = x["severity"].eq("error")
            x["is_warning"] = x["severity"].eq("warning")

        if table_name in {"bug_reports", "bug_reports_inferred"} and "priority" in x.columns:
            rank = {
                "critical": 4,
                "highest": 4,
                "high": 3,
                "medium": 2,
                "low": 1,
                "lowest": 1,
            }
            x["priority_rank"] = x["priority"].astype(str).str.lower().map(rank).fillna(0).astype(int)

        if table_name == "bug_trend_monthly" and "bugs" in x.columns:
            x["bugs"] = pd.to_numeric(x["bugs"], errors="coerce").fillna(0)
            x["bugs_delta"] = x["bugs"].diff().fillna(0)

        if table_name == "coverage_data":
            coverage_col = None
            for cand in ("average_coverage", "line_coverage", "coverage"):
                if cand in x.columns:
                    coverage_col = cand
                    break
            if coverage_col:
                x["coverage_gap_to_95"] = (95 - pd.to_numeric(x[coverage_col], errors="coerce").fillna(0)).clip(lower=0)

        if table_name == "regression_results" and "status" in x.columns:
            status = x["status"].astype(str).str.lower()
            x["is_pass"] = status.eq("passed")
            x["is_fail"] = status.eq("failed")

        return x

    def run_from_kafka_raw(self, max_messages: int = 500):
        """Consume raw Kafka events and run ETL over grouped source tables."""
        enabled = str(os.getenv("SPARK_KAFKA_ENABLED", "false")).strip().lower() in {"1", "true", "yes", "on"}
        if not enabled:
            return {
                "success": False,
                "message": "Kafka ETL is disabled (SPARK_KAFKA_ENABLED=false)",
                "tablesProcessed": 0,
                "curatedTables": [],
                "sparkUsed": False,
            }

        try:
            from kafka import KafkaConsumer
        except Exception as exc:  # pragma: no cover
            return {
                "success": False,
                "message": f"kafka-python unavailable: {exc}",
                "tablesProcessed": 0,
                "curatedTables": [],
                "sparkUsed": False,
            }

        topic_list = [
            str(os.getenv("KAFKA_TOPIC_LOGS_RAW", "logs.raw")).strip(),
            str(os.getenv("KAFKA_TOPIC_BUGS_RAW", "bugs.raw")).strip(),
            str(os.getenv("KAFKA_TOPIC_COVERAGE_RAW", "coverage.raw")).strip(),
            str(os.getenv("KAFKA_TOPIC_REGRESSION_RAW", "regression.raw")).strip(),
        ]
        topics = [t for t in topic_list if t]
        if not topics:
            return {
                "success": False,
                "message": "No Kafka topics configured",
                "tablesProcessed": 0,
                "curatedTables": [],
                "sparkUsed": False,
            }

        brokers = str(os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")).strip()
        group_id = str(os.getenv("SPARK_KAFKA_GROUP_ID", "chipiq-etl-group")).strip()

        grouped_rows: Dict[str, list] = {}
        consumed = 0

        consumer = None
        try:
            consumer = KafkaConsumer(
                *topics,
                bootstrap_servers=[s.strip() for s in brokers.split(",") if s.strip()],
                group_id=group_id,
                enable_auto_commit=True,
                auto_offset_reset="latest",
                value_deserializer=lambda v: __import__("json").loads(v.decode("utf-8")),
                consumer_timeout_ms=2500,
            )

            for msg in consumer:
                value = msg.value if isinstance(msg.value, dict) else {}
                payload_row = self._extract_payload_row(value)
                source_table = self._pick_source_table(payload_row)
                grouped_rows.setdefault(source_table, []).append(payload_row)
                consumed += 1
                if consumed >= max(1, int(max_messages)):
                    break
        except Exception as exc:  # pragma: no cover
            return {
                "success": False,
                "message": f"Kafka consume failed: {exc}",
                "tablesProcessed": 0,
                "curatedTables": [],
                "sparkUsed": False,
            }
        finally:
            if consumer is not None:
                try:
                    consumer.close()
                except Exception:
                    pass

        if not grouped_rows:
            return {
                "success": False,
                "message": "No raw Kafka events consumed",
                "tablesProcessed": 0,
                "curatedTables": [],
                "sparkUsed": False,
            }

        source_tables = {k: pd.DataFrame(v) for k, v in grouped_rows.items() if v}
        result = self.run(source_tables=source_tables, selected_tables=None, persist=True)
        result["kafkaMessagesConsumed"] = consumed
        result["sourceTables"] = sorted(list(source_tables.keys()))
        return result

    def run(self, source_tables: Dict[str, pd.DataFrame], selected_tables: Optional[Iterable[str]] = None, persist: bool = True):
        selected = set(selected_tables) if selected_tables else set(source_tables.keys())
        selected = {t for t in selected if t in source_tables}

        if not selected:
            return {
                "success": False,
                "message": "No source tables available for ETL",
                "tablesProcessed": 0,
                "curatedTables": [],
                "sparkUsed": False,
            }

        spark = self._get_spark()
        spark_used = spark is not None
        self.curated_tables.clear()

        output_curated = self.output_dir / "curated"
        if persist:
            output_curated.mkdir(parents=True, exist_ok=True)

        processed = []
        for table_name in sorted(selected):
            df = source_tables[table_name]
            transformed = self._transform_table(df, table_name)

            # Optional Spark touchpoint so the same path can evolve into full Spark ETL.
            if spark is not None:
                try:
                    sdf = spark.createDataFrame(transformed)
                    transformed = sdf.toPandas()
                except Exception as exc:  # pragma: no cover
                    self.last_error = f"Spark transform fallback for {table_name}: {exc}"

            curated_name = f"curated_{table_name}"
            self.curated_tables[curated_name] = transformed
            processed.append(curated_name)

            if persist:
                transformed.to_json(output_curated / f"{curated_name}.json", orient="records", force_ascii=False)

        self.last_run = datetime.now(timezone.utc).isoformat()
        return {
            "success": True,
            "message": f"ETL completed for {len(processed)} table(s)",
            "tablesProcessed": len(processed),
            "curatedTables": processed,
            "sparkUsed": spark_used,
        }

    def get_table(self, table_name: str) -> Optional[pd.DataFrame]:
        return self.curated_tables.get(table_name)

    def status(self):
        return {
            "enabled": self.enabled,
            "master": self.master,
            "spark_ready": self._spark is not None,
            "output_dir": str(self.output_dir),
            "curated_tables": sorted(list(self.curated_tables.keys())),
            "last_run": self.last_run,
            "last_error": self.last_error,
        }
