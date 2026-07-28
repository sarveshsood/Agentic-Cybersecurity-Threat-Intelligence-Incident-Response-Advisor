"""Data retention helpers (A-M1: incident_retention_days)."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)


def retention_cutoff_iso(days: int) -> str:
    d = max(1, int(days or 90))
    return (datetime.now(timezone.utc) - timedelta(days=d)).isoformat()


async def purge_old_incidents(db, retention_days: int) -> int:
    """Delete incidents older than retention_days (ISO ``created_at`` strings).

    Returns number of documents deleted. ``retention_days <= 0`` skips purge
    (treat as keep-forever for safety).
    """
    try:
        days = int(retention_days)
    except (TypeError, ValueError):
        days = 90
    if days <= 0:
        logger.info("incident retention disabled (days=%s)", retention_days)
        return 0

    cutoff = retention_cutoff_iso(days)
    try:
        result = await db.incidents.delete_many({"created_at": {"$lt": cutoff}})
        n = int(getattr(result, "deleted_count", 0) or 0)
        if n:
            logger.info(
                "purged %s incidents older than %s days (created_at < %s)",
                n, days, cutoff[:19],
            )
        return n
    except Exception as e:
        logger.warning("incident retention purge failed: %s", e)
        return 0


async def purge_from_settings(db, settings: Optional[dict] = None) -> dict[str, Any]:
    """Run incident purge + log archival lifecycle using settings or defaults."""
    days = 90
    if settings:
        try:
            days = int(settings.get("incident_retention_days") or 90)
        except (TypeError, ValueError):
            days = 90
    n = await purge_old_incidents(db, days)
    archival: dict[str, Any] = {}
    try:
        from backend.log_archival import run_archival

        archival = run_archival()
    except Exception as e:
        archival = {"error": str(e)[:200]}
    return {
        "incident_retention_days": days,
        "incidents_deleted": n,
        "log_archival": archival,
    }
