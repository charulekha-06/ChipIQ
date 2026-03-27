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
            return {
                "success": True,
                "rows": inserted,
                "source_table": source_table,
                "target": self.qualified_table,
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
            "last_error": self._last_error,
        }

    @staticmethod
    def _to_json(row: Dict[str, Any]) -> str:
        import json

        return json.dumps(row, default=str)


timescale_store = TimescaleStore()
