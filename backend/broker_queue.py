"""Optional RabbitMQ job broker (soft dependency) for multi-worker fan-out.

When ``JOB_BROKER_URL`` is set (e.g. ``amqp://guest:guest@localhost:5672/``),
completed claim/publish flows can notify workers via AMQP. Mongo remains the
**source of truth** for job state (claim via find_one_and_update).

Soft-dep: ``pip install pika`` (sync publish) — never required for core install.

Env
---
- ``JOB_BROKER_URL`` — AMQP URL; empty = disabled
- ``JOB_BROKER_QUEUE`` — queue name (default ``actira.jobs``)
- ``JOB_BROKER_ENABLED`` — force 0/1 (default: on when URL set)
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

_STATUS: Dict[str, Any] = {
    "enabled": False,
    "url_set": False,
    "queue": "actira.jobs",
    "library": None,
    "last_error": None,
    "published": 0,
}


def broker_url() -> str:
    return (os.environ.get("JOB_BROKER_URL") or "").strip()


def queue_name() -> str:
    return (os.environ.get("JOB_BROKER_QUEUE") or "actira.jobs").strip() or "actira.jobs"


def enabled() -> bool:
    raw = (os.environ.get("JOB_BROKER_ENABLED") or "").strip().lower()
    if raw in ("0", "false", "no", "off"):
        return False
    if raw in ("1", "true", "yes", "on"):
        return bool(broker_url())
    return bool(broker_url())


def broker_status() -> Dict[str, Any]:
    st = dict(_STATUS)
    st["enabled"] = enabled()
    st["url_set"] = bool(broker_url())
    st["queue"] = queue_name()
    st["mode"] = (
        "amqp_notify_mongo_claim"
        if enabled()
        else "mongo_only"
    )
    st["honesty"] = (
        "Broker publishes wake-up messages; workers still claim jobs atomically in Mongo. "
        "Not a full Celery/Kafka replacement."
    )
    return st


def publish_job_available(job_id: str, *, meta: Optional[dict] = None) -> bool:
    """Notify workers that a job is queued. Best-effort; never raises."""
    if not enabled() or not job_id:
        return False
    body = {
        "type": "job.queued",
        "job_id": job_id,
        "meta": meta or {},
    }
    try:
        import pika  # type: ignore

        _STATUS["library"] = "pika"
        params = pika.URLParameters(broker_url())
        conn = pika.BlockingConnection(params)
        ch = conn.channel()
        ch.queue_declare(queue=queue_name(), durable=True)
        ch.basic_publish(
            exchange="",
            routing_key=queue_name(),
            body=json.dumps(body, default=str).encode("utf-8"),
            properties=pika.BasicProperties(
                delivery_mode=2,
                content_type="application/json",
            ),
        )
        conn.close()
        _STATUS["published"] = int(_STATUS.get("published") or 0) + 1
        _STATUS["last_error"] = None
        _STATUS["enabled"] = True
        return True
    except ImportError:
        _STATUS["last_error"] = "pika_not_installed"
        _STATUS["library"] = None
        logger.debug("JOB_BROKER_URL set but pika not installed — skip publish")
        return False
    except Exception as e:
        _STATUS["last_error"] = f"{type(e).__name__}: {e}"[:200]
        logger.warning("broker publish failed: %s", e)
        return False


def try_consume_one(callback) -> bool:
    """Optional blocking consume of one message (worker helper / tests).

    ``callback(job_id: str, payload: dict) -> None``
    """
    if not enabled():
        return False
    try:
        import pika  # type: ignore

        params = pika.URLParameters(broker_url())
        conn = pika.BlockingConnection(params)
        ch = conn.channel()
        ch.queue_declare(queue=queue_name(), durable=True)
        method, _props, body = ch.basic_get(queue=queue_name(), auto_ack=False)
        if not method:
            conn.close()
            return False
        data = json.loads(body.decode("utf-8"))
        jid = data.get("job_id")
        if jid:
            callback(jid, data)
        ch.basic_ack(method.delivery_tag)
        conn.close()
        return True
    except Exception as e:
        logger.warning("broker consume failed: %s", e)
        return False
