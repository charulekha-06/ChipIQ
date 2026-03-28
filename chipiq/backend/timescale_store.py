"""Step-3 optional TimescaleDB store scaffold for ChipIQ.

Behavior:
- Disabled by default via TIMESCALE_ENABLED=false
- If disabled or dependency unavailable, calls return safe status
- Stores curated data as JSONB events with best-effort event_time extraction
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional


class TimescaleStore:
    def __init__(self) -> None:
        self.enabled = str(os.getenv("TIMESCALE_ENABLED", "false")).strip().lower() in {"1", "true", "yes", "on"}
        self.dsn = str(os.getenv("TIMESCALE_DSN", "")).strip()
        self.schema = str(os.getenv("TIMESCALE_SCHEMA", "public")).strip() or "public"
        self.table = str(os.getenv("TIMESCALE_EVENTS_TABLE", "chipiq_events")).strip() or "chipiq_events"
        self.bug_table = str(os.getenv("TIMESCALE_BUG_TREND_TABLE", "chipiq_bug_trends")).strip() or "chipiq_bug_trends"
        self.regression_table = str(os.getenv("TIMESCALE_REGRESSION_TABLE", "chipiq_regression_timeline")).strip() or "chipiq_regression_timeline"
        self.coverage_table = str(os.getenv("TIMESCALE_COVERAGE_TABLE", "chipiq_coverage_timeline")).strip() or "chipiq_coverage_timeline"
        self.embedding_table = str(os.getenv("TIMESCALE_RCA_EMBEDDINGS_TABLE", "chipiq_rca_embeddings")).strip() or "chipiq_rca_embeddings"
        self._last_error: Optional[str] = None

    @property
    def qualified_table(self) -> str:
        return f"{self.schema}.{self.table}"

    def _connect(self):
        if not self.enabled:
            return None
        if not self.dsn:
            self._last_error = "TIMESCALE_DSN is not configured"
            return None

        try:
            import psycopg
            conn = psycopg.connect(self.dsn)
            conn.autocommit = True
            self._last_error = None
            return conn
        except Exception as exc:  # pragma: no cover
            self._last_error = f"connect failed: {exc}"
            return None

    def _ensure_table(self, conn) -> None:
        with conn.cursor() as cur:
            cur.execute(f"CREATE SCHEMA IF NOT EXISTS {self.schema};")
            cur.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {self.qualified_table} (
                  id BIGSERIAL PRIMARY KEY,
                  source_table TEXT NOT NULL,
                  event_time TIMESTAMPTZ NOT NULL,
                  payload JSONB NOT NULL,
                  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            # Best-effort Timescale optimization if extension exists.
            cur.execute(
                """
                DO $$
                BEGIN
                  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
                    PERFORM create_hypertable(%s, 'event_time', if_not_exists => TRUE);
                  END IF;
                EXCEPTION WHEN OTHERS THEN
                  -- Ignore if running on plain PostgreSQL.
                  NULL;
                END $$;
                """,
                (self.qualified_table,),
            )
            cur.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{self.table}_source_time ON {self.qualified_table}(source_table, event_time DESC);"
            )
            self._ensure_specialized_tables(cur)

    def _ensure_specialized_tables(self, cur) -> None:
        bug_q = f"{self.schema}.{self.bug_table}"
        reg_q = f"{self.schema}.{self.regression_table}"
        cov_q = f"{self.schema}.{self.coverage_table}"
        emb_q = f"{self.schema}.{self.embedding_table}"

        cur.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {bug_q} (
              id BIGSERIAL PRIMARY KEY,
              event_time TIMESTAMPTZ NOT NULL,
              month_label TEXT,
              bugs_total DOUBLE PRECISION,
              payload JSONB NOT NULL,
              ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        cur.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {reg_q} (
              id BIGSERIAL PRIMARY KEY,
              event_time TIMESTAMPTZ NOT NULL,
              suite_name TEXT,
              pass_ratio DOUBLE PRECISION,
              payload JSONB NOT NULL,
              ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        cur.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {cov_q} (
              id BIGSERIAL PRIMARY KEY,
              event_time TIMESTAMPTZ NOT NULL,
              module_name TEXT,
              avg_coverage DOUBLE PRECISION,
              payload JSONB NOT NULL,
              ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        cur.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {emb_q} (
              id BIGSERIAL PRIMARY KEY,
              source_table TEXT NOT NULL,
              event_time TIMESTAMPTZ NOT NULL,
              chunk_text TEXT,
              embedding_json JSONB,
              embedding_dim INTEGER,
              metadata JSONB,
              ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )

        for table_name in (bug_q, reg_q, cov_q):
            cur.execute(
                """
                DO $$
                BEGIN
                  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
                    PERFORM create_hypertable(%s, 'event_time', if_not_exists => TRUE);
                  END IF;
                EXCEPTION WHEN OTHERS THEN
                  NULL;
                END $$;
                """,
                (table_name,),
            )

        cur.execute(f"CREATE INDEX IF NOT EXISTS idx_{self.bug_table}_time ON {bug_q}(event_time DESC);")
        cur.execute(f"CREATE INDEX IF NOT EXISTS idx_{self.regression_table}_time ON {reg_q}(event_time DESC);")
        cur.execute(f"CREATE INDEX IF NOT EXISTS idx_{self.coverage_table}_time ON {cov_q}(event_time DESC);")
        cur.execute(f"CREATE INDEX IF NOT EXISTS idx_{self.embedding_table}_time ON {emb_q}(event_time DESC);")

    @staticmethod
    def _to_float(value: Any) -> Optional[float]:
        try:
            return float(value)
        except Exception:
            return None

    @staticmethod
    def _parse_embedding(row: Dict[str, Any]):
        emb = row.get("embedding")
        if emb is None:
            emb = row.get("embedding_vector")
        if emb is None:
            emb = row.get("embedding_json")

        if emb is None:
            return None, None

        if isinstance(emb, str):
            text = emb.strip()
            if text.startswith("[") and text.endswith("]"):
                try:
                    import json

                    emb = json.loads(text)
                except Exception:
                    emb = None

        if isinstance(emb, list):
            cleaned = []
            for x in emb:
                fx = TimescaleStore._to_float(x)
                if fx is None:
                    return None, None
                cleaned.append(fx)
            return cleaned, len(cleaned)

        return None, None

    def _sync_specialized(self, cur, source_table: str, rows: List[Dict[str, Any]]) -> Dict[str, int]:
        bug_count = 0
        reg_count = 0
        cov_count = 0
        emb_count = 0

        bug_q = f"{self.schema}.{self.bug_table}"
        reg_q = f"{self.schema}.{self.regression_table}"
        cov_q = f"{self.schema}.{self.coverage_table}"
        emb_q = f"{self.schema}.{self.embedding_table}"

        for row in rows:
            event_time = self._coerce_event_time(row)
            src = source_table.lower()

            if "bug_trend" in src:
                month_label = str(row.get("month") or row.get("date") or "").strip() or None
                bugs_total = self._to_float(row.get("bugs") if row.get("bugs") is not None else row.get("bug_count"))
                cur.execute(
                    f"INSERT INTO {bug_q}(event_time, month_label, bugs_total, payload) VALUES (%s, %s, %s, %s::jsonb)",
                    (event_time, month_label, bugs_total, self._to_json(row)),
                )
                bug_count += 1

            if "regression" in src:
                suite_name = str(row.get("suite") or row.get("class") or "").strip() or None
                status = str(row.get("status") or "").lower().strip()
                pass_ratio = 1.0 if status == "passed" else 0.0 if status == "failed" else None
                cur.execute(
                    f"INSERT INTO {reg_q}(event_time, suite_name, pass_ratio, payload) VALUES (%s, %s, %s, %s::jsonb)",
                    (event_time, suite_name, pass_ratio, self._to_json(row)),
                )
                reg_count += 1

            if "coverage" in src:
                module_name = str(row.get("module") or row.get("class") or "").strip() or None
                avg_coverage = self._to_float(
                    row.get("average_coverage")
                    if row.get("average_coverage") is not None
                    else row.get("coverage")
                    if row.get("coverage") is not None
                    else row.get("line_coverage")
                )
                cur.execute(
                    f"INSERT INTO {cov_q}(event_time, module_name, avg_coverage, payload) VALUES (%s, %s, %s, %s::jsonb)",
                    (event_time, module_name, avg_coverage, self._to_json(row)),
                )
                cov_count += 1

            embedding_json, embedding_dim = self._parse_embedding(row)
            if embedding_json is not None:
                chunk_text = str(row.get("message") or row.get("text") or row.get("chunk") or "").strip() or None
                metadata = {
                    "severity": row.get("severity"),
                    "line_number": row.get("line_number"),
                    "source": source_table,
                }
                cur.execute(
                    f"INSERT INTO {emb_q}(source_table, event_time, chunk_text, embedding_json, embedding_dim, metadata) VALUES (%s, %s, %s, %s::jsonb, %s, %s::jsonb)",
                    (source_table, event_time, chunk_text, self._to_json(embedding_json), embedding_dim, self._to_json(metadata)),
                )
                emb_count += 1

        return {
            "bug_trends": bug_count,
            "regression": reg_count,
            "coverage": cov_count,
            "rca_embeddings": emb_count,
        }

    @staticmethod
    def _coerce_event_time(row: Dict[str, Any]) -> datetime:
        candidates = [
            row.get("event_time"), row.get("timestamp"), row.get("date"), row.get("created"), row.get("updated"), row.get("month")
        ]

        for value in candidates:
            if value is None:
                continue
            text = str(value).strip()
            if not text:
                continue

            # Handle YYYY-MM style monthly buckets.
            if len(text) == 7 and text[4] == "-":
                text = text + "-01"

            try:
                dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt
            except Exception:
                continue

        return datetime.now(timezone.utc)

    def sync_rows(self, source_table: str, rows: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
        rows = list(rows)
        if not self.enabled:
            return {"success": False, "reason": "timescale_disabled", "rows": 0}
        conn = self._connect()
        if conn is None:
            return {"success": False, "reason": "connection_failed", "rows": 0, "error": self._last_error}

        inserted = 0
        specialized = {
            "bug_trends": 0,
            "regression": 0,
            "coverage": 0,
            "rca_embeddings": 0,
        }
        try:
            self._ensure_table(conn)
            with conn.cursor() as cur:
                for row in rows:
                    event_time = self._coerce_event_time(row)
                    cur.execute(
                        f"INSERT INTO {self.qualified_table}(source_table, event_time, payload) VALUES (%s, %s, %s::jsonb)",
                        (source_table, event_time, self._to_json(row)),
                    )
                    inserted += 1

                specialized = self._sync_specialized(cur, source_table, rows)
            return {
                "success": True,
                "rows": inserted,
                "source_table": source_table,
                "target": self.qualified_table,
                "specialized": specialized,
            }
        except Exception as exc:  # pragma: no cover
            self._last_error = str(exc)
            return {
                "success": False,
                "reason": "insert_failed",
                "rows": inserted,
                "error": self._last_error,
            }
        finally:
            try:
                conn.close()
            except Exception:
                pass

    def fetch_recent(self, source_table: str, limit: int = 200) -> Dict[str, Any]:
        if limit < 1:
            limit = 1
        if limit > 2000:
            limit = 2000

        if not self.enabled:
            return {"success": False, "reason": "timescale_disabled", "rows": []}

        conn = self._connect()
        if conn is None:
            return {"success": False, "reason": "connection_failed", "rows": [], "error": self._last_error}

        try:
            self._ensure_table(conn)
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT event_time, payload FROM {self.qualified_table} WHERE source_table = %s ORDER BY event_time DESC LIMIT %s",
                    (source_table, limit),
                )
                out = []
                for event_time, payload in cur.fetchall():
                    row = dict(payload or {})
                    row["event_time"] = event_time.isoformat() if hasattr(event_time, "isoformat") else str(event_time)
                    out.append(row)

            return {
                "success": True,
                "source_table": source_table,
                "rows": out,
                "count": len(out),
            }
        except Exception as exc:  # pragma: no cover
            self._last_error = str(exc)
            return {"success": False, "reason": "query_failed", "rows": [], "error": self._last_error}
        finally:
            try:
                conn.close()
            except Exception:
                pass

    def status(self) -> Dict[str, Any]:
        return {
            "enabled": self.enabled,
            "configured": bool(self.dsn),
            "schema": self.schema,
            "table": self.table,
            "specialized": {
                "bug_trends": self.bug_table,
                "regression": self.regression_table,
                "coverage": self.coverage_table,
                "rca_embeddings": self.embedding_table,
            },
            "last_error": self._last_error,
        }

    @staticmethod
    def _to_json(row: Dict[str, Any]) -> str:
        import json

        return json.dumps(row, default=str)


timescale_store = TimescaleStore()
