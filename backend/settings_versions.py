"""Append-only settings configuration versioning (enterprise P2-11).

Each successful settings update appends a document to ``settings_versions``:

  {
    "id": "...",
    "version": N,           # monotonic
    "ts": ISO-8601,
    "actor_id": "...",
    "actor_email": "...",
    "action": "settings.update|...",
    "changed_fields": [...],
    "snapshot": { ... public/non-secret ops fields ... },
  }

Secrets are **never** stored in snapshots (keys redacted). Rollback reconstructs
ops fields only; secrets remain as currently stored.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.models import new_id

logger = logging.getLogger(__name__)

COLLECTION = "settings_versions"

# Fields safe to version (no secret material)
_SAFE_SNAPSHOT_KEYS = frozenset({
    "llm_provider",
    "llm_model",
    "llm_temperature",
    "llm_token_budget_monthly",
    "llm_fallback_enabled",
    "llm_fallback_provider",
    "llm_fallback_model",
    "llm_manual_route",
    "grounding_threshold",
    "hitl_severity_min",
    "auto_approve_grounding_min",
    "correlation_window_minutes",
    "session_timeout_hours",
    "failed_login_lockout",
    "incident_retention_days",
    "enrichment_cache_ttl_hours",
    "max_enrich_iocs",
    "enrich_concurrency",
    "parse_concurrency",
    "ti_http_timeout",
    "ti_http_retries",
    "ti_http_backoff_base",
    "ti_circuit_failures",
    "ti_circuit_cooldown_seconds",
    "log_format",
    "log_file_format",
    "log_level",
    "log_to_file",
    "log_archive_enabled",
    "log_archive_retain_days",
    "job_artifacts_enabled",
    "job_payload_retain",
    "job_artifacts_retain_hours",
    "audit_worm_enabled",
    "job_broker_enabled",
    "job_broker_queue",
    "email_alerts_enabled",
    "slack_alerts_enabled",
    "force_mock_ti",
    "cohere_rerank_enabled",
    "llm_technique_refine",
    "llm_redact_iocs",
})


def public_snapshot(doc: dict) -> Dict[str, Any]:
    out = {}
    for k in _SAFE_SNAPSHOT_KEYS:
        if k in (doc or {}):
            out[k] = doc[k]
    return out


async def ensure_indexes(db) -> None:
    try:
        col = db[COLLECTION]
        await col.create_index([("version", -1)])
        await col.create_index([("ts", -1)])
    except Exception as e:
        logger.warning("settings_versions indexes: %s", e)


async def next_version(db) -> int:
    col = db[COLLECTION]
    try:
        last = await col.find_one({}, sort=[("version", -1)], projection={"version": 1})
        return int((last or {}).get("version") or 0) + 1
    except Exception:
        return 1


async def append_version(
    db,
    *,
    doc: dict,
    user: dict,
    action: str,
    changed_fields: Optional[List[str]] = None,
) -> Optional[Dict[str, Any]]:
    """Append a version row. Best-effort — never raises into settings path."""
    try:
        ver = await next_version(db)
        entry = {
            "id": new_id(),
            "version": ver,
            "ts": datetime.now(timezone.utc).isoformat(),
            "actor_id": (user or {}).get("sub"),
            "actor_email": (user or {}).get("email"),
            "action": action,
            "changed_fields": list(changed_fields or []),
            "snapshot": public_snapshot(doc),
        }
        await db[COLLECTION].insert_one(entry)
        entry.pop("_id", None)
        return entry
    except Exception as e:
        logger.warning("settings version append failed: %s", e)
        return None


async def list_versions(db, *, limit: int = 50) -> List[Dict[str, Any]]:
    limit = max(1, min(200, int(limit or 50)))
    cursor = (
        db[COLLECTION]
        .find({}, {"_id": 0})
        .sort("version", -1)
        .limit(limit)
    )
    return await cursor.to_list(limit)


async def get_version(db, version: int) -> Optional[Dict[str, Any]]:
    return await db[COLLECTION].find_one({"version": int(version)}, {"_id": 0})
