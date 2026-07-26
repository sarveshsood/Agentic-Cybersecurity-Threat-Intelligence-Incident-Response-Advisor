"""ACTIRA API routes — auto-split from server.py (v1.1 modularization)."""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

from fastapi import (
    APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, Request, Header, Query,
)
from pydantic import BaseModel, Field

from backend.auth import (
    get_current_user,
)
from backend.core import services as svc
from backend.core.database import db
from backend.models import (
    LogJob,
)
from backend.secrets_util import (
    clean_secret, is_real_secret,
)

logger = logging.getLogger("actira")

router = APIRouter(tags=['logs'])


# ---------- Log Upload + Pipeline ----------
@router.post("/logs/upload")
async def upload_log(
        background_tasks: BackgroundTasks,
        file: UploadFile = File(...),
        user=Depends(get_current_user),
):
    """Single-file upload — durable queue (A-S7) with BackgroundTasks fallback kick."""
    from backend.job_queue import enqueue

    content = await file.read()
    job = LogJob(filename=file.filename or "upload.log", size=len(content), created_by=user["sub"])
    from backend.mongo_util import to_mongo_doc

    await db.log_jobs.insert_one(to_mongo_doc(job))
    settings = await svc.get_settings()
    await enqueue(
        db, job.id, [(file.filename or "upload.log", content)], user["sub"], settings, kind="single",
    )
    # Worker polls; BackgroundTasks is a no-op nudge if worker already running
    await svc.audit(user, "log.upload", "log_job", job.id, {"filename": file.filename, "size": len(content)})
    return {"job_id": job.id, "status": "queued"}


MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB per file guard


@router.post("/logs/upload-batch")
async def upload_batch(
        background_tasks: BackgroundTasks,
        files: List[UploadFile] = File(...),
        user=Depends(get_current_user),
):
    """Multi-file / ZIP incident-package upload (durable queue A-S7).

    - Accepts up to 20 files (or a single .zip containing many)
    - Auto-detects each file's format (Apache / Syslog / JSON / CSV / CEF / LEEF / plain)
    - Correlates events across all files into a single incident
    """
    from backend.job_queue import enqueue

    if not files:
        raise HTTPException(400, "No files provided")
    if len(files) > 20:
        raise HTTPException(413, "Too many files (max 20)")

    payloads: List[tuple] = []
    total = 0
    for f in files:
        data = await f.read()
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, f"{f.filename} exceeds {MAX_UPLOAD_BYTES} bytes")
        total += len(data)
        payloads.append((f.filename, data))
    if total > MAX_UPLOAD_BYTES * 2:
        raise HTTPException(413, "Total upload exceeds size limit")

    is_zip = len(payloads) == 1 and (payloads[0][0].lower().endswith(".zip") or payloads[0][1][:2] == b"PK")
    mode = "zip" if is_zip else ("batch" if len(payloads) > 1 else "single")

    job = LogJob(
        filename=payloads[0][0] if len(payloads) == 1 else f"batch-{len(payloads)}-files",
        size=total,
        mode=mode,
        files=[n for n, _ in payloads],
        created_by=user["sub"],
    )
    from backend.mongo_util import to_mongo_doc

    await db.log_jobs.insert_one(to_mongo_doc(job))
    settings = await svc.get_settings()
    kind = "single" if mode == "single" else "batch"
    await enqueue(db, job.id, payloads, user["sub"], settings, kind=kind)
    await svc.audit(user, "log.upload_batch", "log_job", job.id,
                    {"file_count": len(payloads), "mode": mode, "total_size": total})
    return {"job_id": job.id, "status": "queued", "mode": mode, "file_count": len(payloads)}


@router.get("/logs/jobs")
async def list_jobs(
        skip: int = Query(0, ge=0),
        limit: int = Query(50, ge=1, le=200),
        user=Depends(get_current_user),
):
    from backend.job_status import merge_job_with_sidecar

    cursor = db.log_jobs.find({}, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
    docs = await cursor.to_list(limit)
    return [merge_job_with_sidecar(d) for d in docs]


@router.get("/logs/jobs/{job_id}")
async def get_job(job_id: str, user=Depends(get_current_user)):
    from backend.job_status import merge_job_with_sidecar, read_failure_sidecar

    doc = await db.log_jobs.find_one({"id": job_id}, {"_id": 0})
    if not doc:
        # Background task may have only left a filesystem sidecar if Mongo was down
        side = read_failure_sidecar(job_id)
        if side:
            return {
                "id": job_id,
                "status": "failed",
                "error": side.get("error") or "pipeline failed",
                "progress": 0,
                "error_source": "sidecar",
                "filename": side.get("filename") or "unknown",
            }
        raise HTTPException(404, "Job not found")
    return merge_job_with_sidecar(doc)


@router.post("/logs/jobs/{job_id}/resume")
async def resume_job(job_id: str, user=Depends(get_current_user)):
    """Re-queue a failed or hung pipeline job when the durable payload still exists.

    Worker picks it up on the next poll (same process or after restart). Use when
    upload shows stuck mid-phase or failed with a recoverable error.
    """
    from backend.job_queue import force_requeue, load_payload_async

    try:
        result = await force_requeue(db, job_id)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:
        logger.exception("resume job %s failed: %s", job_id, e)
        raise HTTPException(500, f"Could not resume job: {e}") from e
    # Surface whether payload is still present (helps operators)
    meta = await load_payload_async(db, job_id)
    result["payload_present"] = bool(meta and meta.get("_files"))
    await svc.audit(user, "log.job_resume", "log_job", job_id, {"status": "queued"})
    return result


# ---------- Realtime / webhook ingest ----------
class StreamIngestBody(BaseModel):
    """Push logs from a SIEM/forwarder without multipart file upload."""
    text: Optional[str] = None
    lines: Optional[List[str]] = None
    source: str = "webhook"
    filename: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


def _ingest_keys_match(expected: str, provided: str) -> bool:
    """Constant-time compare for ingest API keys (unequal lengths → False)."""
    import secrets as _secrets
    if not expected or not provided:
        return False
    exp_b = expected.encode("utf-8")
    got_b = provided.encode("utf-8")
    if len(exp_b) != len(got_b):
        # Still touch compare_digest on equal-length dummy to reduce length oracle noise
        _secrets.compare_digest(exp_b, exp_b)
        return False
    return _secrets.compare_digest(exp_b, got_b)


async def _resolve_ingest_actor(
        request: Request,
        x_ingest_key: Optional[str] = None,
        authorization: Optional[str] = None,
) -> dict:
    """Auth for stream ingest: X-Ingest-Key (INGEST_API_KEY) or Bearer JWT.

    When INGEST_API_KEY is configured, either a matching X-Ingest-Key or a
    valid JWT is accepted. Keys are compared with secrets.compare_digest.
    """
    expected = clean_secret(os.environ.get("INGEST_API_KEY", ""))
    provided = clean_secret(x_ingest_key or request.headers.get("X-Ingest-Key", ""))
    if is_real_secret(expected) and _ingest_keys_match(expected, provided):
        return {
            "sub": "ingest-webhook",
            "email": "ingest@system.local",
            "role": "analyst",
        }
    # Fall back to JWT bearer (human operators / automation with user tokens)
    auth_header = authorization or request.headers.get("Authorization") or ""
    if auth_header.lower().startswith("bearer "):
        from backend.auth import decode_token
        token = auth_header.split(" ", 1)[1].strip()
        if token:
            return decode_token(token)
    if is_real_secret(expected):
        raise HTTPException(401, "Invalid or missing X-Ingest-Key (or Bearer token)")
    raise HTTPException(
        401,
        "Set INGEST_API_KEY in backend/.env and send X-Ingest-Key, or use a Bearer JWT",
    )


async def _enqueue_text_ingest(
        background_tasks: BackgroundTasks,
        text: str,
        filename: str,
        actor: dict,
        source: str = "webhook",
) -> dict:
    from backend.job_queue import enqueue

    if not (text or "").strip():
        raise HTTPException(400, "Empty log payload")
    raw = text.encode("utf-8", errors="ignore")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"Payload exceeds {MAX_UPLOAD_BYTES} bytes")
    fname = filename or f"{source}.log"
    job = LogJob(
        filename=fname,
        size=len(raw),
        mode="single",
        files=[fname],
        created_by=actor.get("sub", "ingest-webhook"),
    )
    from backend.mongo_util import to_mongo_doc

    await db.log_jobs.insert_one(to_mongo_doc(job))
    settings = await svc.get_settings()
    await enqueue(
        db,
        job.id,
        [(fname, raw)],
        actor.get("sub", "ingest-webhook"),
        settings,
        kind="single",
    )
    await svc.audit(
        actor,
        "log.ingest_stream",
        "log_job",
        job.id,
        {"filename": job.filename, "size": job.size, "source": source},
    )
    return {"job_id": job.id, "status": "queued", "mode": "stream", "source": source}


@router.post("/logs/ingest")
async def ingest_stream_json(
        body: StreamIngestBody,
        background_tasks: BackgroundTasks,
        request: Request,
        x_ingest_key: Optional[str] = Header(default=None, alias="X-Ingest-Key"),
        authorization: Optional[str] = Header(default=None),
):
    """Realtime JSON ingest for SIEM / rsyslog / custom forwarders.

    Auth: header `X-Ingest-Key: <INGEST_API_KEY>` or `Authorization: Bearer <jwt>`.

    Body examples:
      {"text": "raw log lines...\\n", "source": "rsyslog"}
      {"lines": ["line1", "line2"], "filename": "firewall.log"}
    """
    actor = await _resolve_ingest_actor(request, x_ingest_key, authorization)
    if body.text and body.text.strip():
        text = body.text
    elif body.lines:
        text = "\n".join(body.lines)
    else:
        raise HTTPException(400, "Provide text or lines")
    fname = body.filename or f"{body.source or 'webhook'}.log"
    return await _enqueue_text_ingest(background_tasks, text, fname, actor, source=body.source or "webhook")


@router.post("/logs/ingest/raw")
async def ingest_stream_raw(
        background_tasks: BackgroundTasks,
        request: Request,
        x_ingest_key: Optional[str] = Header(default=None, alias="X-Ingest-Key"),
        authorization: Optional[str] = Header(default=None),
        x_log_source: Optional[str] = Header(default=None, alias="X-Log-Source"),
        x_log_filename: Optional[str] = Header(default=None, alias="X-Log-Filename"),
):
    """Realtime raw-body ingest (text/plain or application/octet-stream).

    Useful for syslog-ng / fluent-bit HTTP output plugins.
    """
    actor = await _resolve_ingest_actor(request, x_ingest_key, authorization)
    raw = await request.body()
    if not raw:
        raise HTTPException(400, "Empty body")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"Payload exceeds {MAX_UPLOAD_BYTES} bytes")
    text = raw.decode("utf-8", errors="ignore")
    source = (x_log_source or "raw-webhook").strip() or "raw-webhook"
    fname = (x_log_filename or f"{source}.log").strip()
    return await _enqueue_text_ingest(background_tasks, text, fname, actor, source=source)
