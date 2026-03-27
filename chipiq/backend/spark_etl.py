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

        return x

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
