"""Optional Kafka event bus for ChipIQ pipeline scaffolding.

This module is intentionally fail-safe:
- If Kafka is disabled or unavailable, all publish calls no-op safely.
- Existing API flows continue to function without Kafka.
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional


class EventBus:
    def __init__(self) -> None:
        self.enabled = str(os.getenv("KAFKA_ENABLED", "false")).strip().lower() in {"1", "true", "yes", "on"}
        self.brokers = str(os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")).strip()
        self.default_topic = str(os.getenv("KAFKA_TOPIC_INGESTION", "chipiq.ingestion.raw")).strip()
        self.client_id = str(os.getenv("KAFKA_CLIENT_ID", "chipiq-backend")).strip()
        self._producer = None
        self._last_error: Optional[str] = None

    def _ensure_producer(self):
        if not self.enabled:
            return None
        if self._producer is not None:
            return self._producer

        try:
            from kafka import KafkaProducer
        except Exception as exc:  # pragma: no cover
            self._last_error = f"kafka-python import failed: {exc}"
            return None

        try:
            self._producer = KafkaProducer(
                bootstrap_servers=[s.strip() for s in self.brokers.split(",") if s.strip()],
                value_serializer=lambda v: json.dumps(v, default=str).encode("utf-8"),
                key_serializer=lambda v: v.encode("utf-8") if isinstance(v, str) else v,
                client_id=self.client_id,
                acks="1",
                retries=2,
            )
            self._last_error = None
        except Exception as exc:  # pragma: no cover
            self._producer = None
            self._last_error = f"producer init failed: {exc}"

        return self._producer

    def publish(self, topic: Optional[str], payload: Dict[str, Any], key: Optional[str] = None) -> Dict[str, Any]:
        topic_name = (topic or self.default_topic).strip()
        producer = self._ensure_producer()

        if not self.enabled:
            return {"published": False, "reason": "kafka_disabled", "topic": topic_name}
        if producer is None:
            return {"published": False, "reason": "producer_unavailable", "topic": topic_name, "error": self._last_error}

        event = {
            "eventId": str(uuid.uuid4()),
            "publishedAt": datetime.now(timezone.utc).isoformat(),
            "payload": payload,
        }

        try:
            future = producer.send(topic_name, key=key, value=event)
            metadata = future.get(timeout=3)
            return {
                "published": True,
                "topic": metadata.topic,
                "partition": metadata.partition,
                "offset": metadata.offset,
            }
        except Exception as exc:  # pragma: no cover
            self._last_error = str(exc)
            return {
                "published": False,
                "reason": "publish_failed",
                "topic": topic_name,
                "error": self._last_error,
            }

    def health(self) -> Dict[str, Any]:
        return {
            "enabled": self.enabled,
            "brokers": self.brokers,
            "default_topic": self.default_topic,
            "producer_ready": self._producer is not None,
            "last_error": self._last_error,
        }


event_bus = EventBus()
