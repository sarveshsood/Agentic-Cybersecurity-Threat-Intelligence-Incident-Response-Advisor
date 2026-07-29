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
        # Cascade H-07 comments + inbox for incidents about to be purged
        try:
            old_docs = await db.incidents.find(
                {"created_at": {"$lt": cutoff}},
                {"_id": 0, "id": 1},
            ).to_list(50_000)
            old_ids = [d["id"] for d in old_docs if d.get("id")]
            if old_ids:
                from backend.repositories.comments import comments_repo
                from backend.repositories.app_notifications import app_notifications_repo

                await comments_repo.delete_for_incidents(old_ids)
                await app_notifications_repo.delete_for_incidents(old_ids)
        except Exception as ce:
            logger.warning("collab cascade before purge failed: %s", ce)

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


async def purge_old_qa_artifacts(db, retention_days: int = 90) -> dict[str, int]:
    """Purge QA Health Center suite runs / coverage / release docs older than N days.

    Defaults to 90 days (design KD-11). ``retention_days <= 0`` skips purge.
    """
    try:
        days = int(retention_days)
    except (TypeError, ValueError):
        days = 90
    if days <= 0:
        logger.info("qa artifact retention disabled (days=%s)", retention_days)
        return {"suite_runs": 0, "case_results": 0, "coverage": 0, "release": 0}

    cutoff = retention_cutoff_iso(days)
    try:
        from backend.repositories.qa_repo import QaRepository

        repo = QaRepository(db)
        out = await repo.purge_older_than(cutoff_iso=cutoff)
        if any(out.values()):
            logger.info("purged qa artifacts older than %s days: %s", days, out)
        return out
    except Exception as e:
        logger.warning("qa artifact retention purge failed: %s", e)
        return {"suite_runs": 0, "case_results": 0, "coverage": 0, "release": 0}


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
    qa_days = 90
    if settings:
        try:
            qa_days = int(settings.get("qa_artifact_retention_days") or 90)
        except (TypeError, ValueError):
            qa_days = 90
    qa_purge = await purge_old_qa_artifacts(db, qa_days)
    return {
        "incident_retention_days": days,
        "incidents_deleted": n,
        "log_archival": archival,
        "qa_artifact_retention_days": qa_days,
        "qa_artifacts_purged": qa_purge,
    }
