"""Pipeline replay helpers — artifacts + optional payload re-queue.

Replay modes
------------
1. **resume** — durable upload payload still present → re-queue job (existing path)
2. **artifact** — list/load stage snapshots under job_artifacts
3. **enrich_only** — re-run enrichment on an incident's IoCs and patch threat scores
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from backend.job_artifacts import list_artifacts, load_artifact, save_artifact
from backend.models import IoC

logger = logging.getLogger(__name__)


async def list_job_artifacts(job_id: str) -> Dict[str, Any]:
    names = list_artifacts(job_id)
    return {
        "job_id": job_id,
        "artifacts": names,
        "count": len(names),
        "hint": "Enable JOB_ARTIFACTS_ENABLED=1 before pipeline runs to capture stages.",
    }


async def get_job_artifact(job_id: str, name: str) -> Dict[str, Any]:
    data = load_artifact(job_id, name)
    if data is None:
        raise HTTPException(404, f"Artifact not found: {name}")
    return {"job_id": job_id, "name": name, "data": data}


async def replay_job(db, job_id: str, user: dict) -> Dict[str, Any]:
    """Re-queue job when payload exists; otherwise report artifact-only replay options."""
    from backend.job_queue import force_requeue, load_payload_async

    doc = await db.log_jobs.find_one({"id": job_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Job not found")

    meta = await load_payload_async(db, job_id)
    has_payload = bool(meta and meta.get("_files"))
    arts = list_artifacts(job_id)

    if has_payload:
        try:
            out = await force_requeue(db, job_id, allow_done=True)
        except ValueError as e:
            raise HTTPException(400, str(e)) from e
        try:
            from backend.core import services as svc

            await svc.audit(
                user,
                "pipeline.replay",
                "log_job",
                job_id,
                {"mode": "requeue", "files": out.get("files")},
            )
        except Exception:
            pass
        return {**out, "mode": "requeue", "artifacts": arts}

    if arts:
        return {
            "ok": False,
            "mode": "artifact_only",
            "job_id": job_id,
            "message": (
                "Upload payload was cleared after success. "
                "Use GET .../artifacts or POST /incidents/{id}/replay-enrich for partial replay."
            ),
            "artifacts": arts,
            "incident_ids": doc.get("incident_ids") or [],
        }

    raise HTTPException(
        400,
        "Nothing to replay — no durable payload and no artifacts. Re-upload logs.",
    )


async def replay_enrich_incident(
    db,
    incident_id: str,
    user: dict,
    *,
    force_mock: bool = False,
) -> Dict[str, Any]:
    """Re-run threat-intel enrichment on stored IoCs and update the incident."""
    from backend.core import services as svc
    from backend.enrichment import enrich_ioc
    from backend.pipeline import _enrich_all

    doc = await db.incidents.find_one({"id": incident_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Incident not found")

    raw_iocs = doc.get("iocs") or []
    if not raw_iocs:
        raise HTTPException(400, "Incident has no IoCs to re-enrich")

    iocs: List[IoC] = []
    for row in raw_iocs:
        if not isinstance(row, dict):
            continue
        try:
            iocs.append(IoC.model_validate(row))
        except Exception:
            continue
    if not iocs:
        raise HTTPException(400, "Could not parse stored IoCs")

    settings = await svc.get_settings()
    if force_mock:
        enriched = [enrich_ioc(i, settings, force_mock=True) for i in iocs]
    else:
        enriched = await _enrich_all(iocs, settings, db=db)

    scores = [float(getattr(x, "threat_score", 0) or 0) for x in enriched]
    avg = round(sum(scores) / len(scores), 1) if scores else 0.0
    payload = [x.model_dump(mode="json") for x in enriched]
    now = datetime.now(timezone.utc).isoformat()

    await db.incidents.update_one(
        {"id": incident_id},
        {
            "$set": {
                "iocs": payload,
                "threat_score": avg,
                "enrichment_replayed_at": now,
            }
        },
    )

    job_id = doc.get("source_log_id") or incident_id
    try:
        save_artifact(
            job_id,
            "enrich_replay",
            {
                "incident_id": incident_id,
                "ioc_count": len(payload),
                "avg_threat_score": avg,
                "ts": now,
                "force_mock": force_mock,
            },
        )
    except Exception:
        pass

    try:
        await svc.audit(
            user,
            "pipeline.replay_enrich",
            "incident",
            incident_id,
            {
                "ioc_count": len(payload),
                "threat_score": avg,
                "force_mock": force_mock,
            },
        )
    except Exception:
        pass

    return {
        "ok": True,
        "mode": "enrich_only",
        "incident_id": incident_id,
        "ioc_count": len(payload),
        "threat_score": avg,
        "enrichment_replayed_at": now,
    }
