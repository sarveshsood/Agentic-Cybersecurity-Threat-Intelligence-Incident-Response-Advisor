"""Job status helpers: durable fail marking for background pipelines.

When Mongo is flaky, failures are also written under backend/data/job_failures/
so operators can still inspect them; list APIs can merge these sidecars.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

FAILURE_DIR = Path(
    os.environ.get("ACTIRA_JOB_FAILURE_DIR")
    or (Path(__file__).resolve().parent / "data" / "job_failures")
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def write_failure_sidecar(job_id: str, error: str, **extra: Any) -> Optional[Path]:
    """Write a local JSON record when Mongo status update may have failed."""
    try:
        FAILURE_DIR.mkdir(parents=True, exist_ok=True)
        path = FAILURE_DIR / f"{job_id}.json"
        payload = {
            "id": job_id,
            "status": "failed",
            "error": (error or "unknown error")[:2000],
            "ts": _utc_now(),
            **extra,
        }
        path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
        return path
    except Exception as e:
        logger.exception("job failure sidecar write failed for %s: %s", job_id, e)
        return None


def read_failure_sidecar(job_id: str) -> Optional[Dict[str, Any]]:
    path = FAILURE_DIR / f"{job_id}.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def list_failure_sidecars(limit: int = 50) -> List[Dict[str, Any]]:
    if not FAILURE_DIR.exists():
        return []
    files = sorted(FAILURE_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    out: List[Dict[str, Any]] = []
    for f in files[: max(1, min(limit, 200))]:
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                out.append(data)
        except Exception:
            continue
    return out


def clear_failure_sidecar(job_id: str) -> None:
    path = FAILURE_DIR / f"{job_id}.json"
    try:
        if path.exists():
            path.unlink()
    except Exception as e:
        logger.warning("could not remove failure sidecar %s: %s", job_id, e)


def purge_old_sidecars(max_age_days: int = 7) -> int:
    """A-P4: delete failure sidecar JSON older than max_age_days. Returns count removed."""
    if not FAILURE_DIR.exists():
        return 0
    import time
    cutoff = time.time() - max(1, int(max_age_days)) * 86400
    removed = 0
    for p in FAILURE_DIR.glob("*.json"):
        try:
            if p.stat().st_mtime < cutoff:
                p.unlink()
                removed += 1
        except OSError as e:
            logger.warning("purge sidecar %s: %s", p, e)
    return removed


async def mark_job_failed(db, job_id: str, error: str, **extra: Any) -> bool:
    """Best-effort: Mongo first (with retry), then filesystem sidecar.

    Returns True if Mongo update succeeded.
    """
    err = (error or "pipeline failed")[:2000]
    payload = {"status": "failed", "error": err, "progress": 0, **extra}
    mongo_ok = False

    matched = False
    for attempt in range(3):
        try:
            result = await db.log_jobs.update_one({"id": job_id}, {"$set": payload})
            mongo_ok = True
            matched = bool(getattr(result, "matched_count", 0))
            break
        except Exception as e:
            logger.warning(
                "mark_job_failed mongo attempt %s for %s: %s",
                attempt + 1, job_id, e,
            )
            if attempt < 2:
                try:
                    import asyncio
                    await asyncio.sleep(0.2 * (attempt + 1))
                except Exception:
                    pass

    if not mongo_ok or not matched:
        # Mongo unreachable, or job row missing — keep a local record for operators/UI
        write_failure_sidecar(job_id, err, **extra)
        if not mongo_ok:
            logger.error(
                "job %s failed and Mongo status update did not succeed — wrote sidecar",
                job_id,
            )
        else:
            logger.warning(
                "mark_job_failed: no log_jobs row for %s — wrote sidecar",
                job_id,
            )
    else:
        clear_failure_sidecar(job_id)

    return mongo_ok and matched


def merge_job_with_sidecar(job: Dict[str, Any]) -> Dict[str, Any]:
    """If job is not failed but a sidecar says failed, surface the error."""
    if not job or not isinstance(job, dict):
        return job
    jid = job.get("id")
    if not jid or job.get("status") == "failed":
        return job
    side = read_failure_sidecar(str(jid))
    if not side:
        return job
    # Job stuck in non-terminal state but pipeline wrote a sidecar
    if job.get("status") not in ("done", "failed"):
        merged = dict(job)
        merged["status"] = "failed"
        merged["error"] = side.get("error") or merged.get("error") or "pipeline failed (sidecar)"
        merged["error_source"] = "sidecar"
        return merged
    return job
