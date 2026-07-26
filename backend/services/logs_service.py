"""Log upload / job queue / stream ingest business logic."""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional, Tuple

from fastapi import BackgroundTasks, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

from backend.core import services as svc
from backend.database import db
from backend.models import LogJob
from backend.secrets_util import clean_secret, is_real_secret

logger = logging.getLogger("actira")

MAX_UPLOAD_BYTES = 25 * 1024 * 1024


class StreamIngestBody(BaseModel):
    text: Optional[str] = None
    lines: Optional[List[str]] = None
    source: str = "webhook"
    filename: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


def _ingest_keys_match(expected: str, provided: str) -> bool:
    import secrets as _secrets

    if not expected or not provided:
        return False
    exp_b = expected.encode("utf-8")
    got_b = provided.encode("utf-8")
    if len(exp_b) != len(got_b):
        _secrets.compare_digest(exp_b, exp_b)
        return False
    return _secrets.compare_digest(exp_b, got_b)


async def resolve_ingest_actor(
    request: Request,
    x_ingest_key: Optional[str] = None,
    authorization: Optional[str] = None,
) -> dict:
    expected = clean_secret(os.environ.get("INGEST_API_KEY", ""))
    provided = clean_secret(x_ingest_key or request.headers.get("X-Ingest-Key", ""))
    if is_real_secret(expected) and _ingest_keys_match(expected, provided):
        return {
            "sub": "ingest-webhook",
            "email": "ingest@system.local",
            "role": "analyst",
        }
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


async def upload_single(file: UploadFile, user: dict) -> Dict[str, Any]:
    from backend.job_queue import enqueue
    from backend.mongo_util import to_mongo_doc

    content = await file.read()
    job = LogJob(
        filename=file.filename or "upload.log",
        size=len(content),
        created_by=user["sub"],
    )
    await db.log_jobs.insert_one(to_mongo_doc(job))
    settings = await svc.get_settings()
    await enqueue(
        db,
        job.id,
        [(file.filename or "upload.log", content)],
        user["sub"],
        settings,
        kind="single",
    )
    await svc.audit(
        user,
        "log.upload",
        "log_job",
        job.id,
        {"filename": file.filename, "size": len(content)},
    )
    return {"job_id": job.id, "status": "queued"}


async def upload_batch(files: List[UploadFile], user: dict) -> Dict[str, Any]:
    from backend.job_queue import enqueue
    from backend.mongo_util import to_mongo_doc

    if not files:
        raise HTTPException(400, "No files provided")
    if len(files) > 20:
        raise HTTPException(413, "Too many files (max 20)")

    payloads: List[Tuple[str, bytes]] = []
    total = 0
    for f in files:
        data = await f.read()
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, f"{f.filename} exceeds {MAX_UPLOAD_BYTES} bytes")
        total += len(data)
        payloads.append((f.filename, data))
    if total > MAX_UPLOAD_BYTES * 2:
        raise HTTPException(413, "Total upload exceeds size limit")

    is_zip = len(payloads) == 1 and (
        payloads[0][0].lower().endswith(".zip") or payloads[0][1][:2] == b"PK"
    )
    mode = "zip" if is_zip else ("batch" if len(payloads) > 1 else "single")

    job = LogJob(
        filename=payloads[0][0] if len(payloads) == 1 else f"batch-{len(payloads)}-files",
        size=total,
        mode=mode,
        files=[n for n, _ in payloads],
        created_by=user["sub"],
    )
    await db.log_jobs.insert_one(to_mongo_doc(job))
    settings = await svc.get_settings()
    kind = "single" if mode == "single" else "batch"
    await enqueue(db, job.id, payloads, user["sub"], settings, kind=kind)
    await svc.audit(
        user,
        "log.upload_batch",
        "log_job",
        job.id,
        {"file_count": len(payloads), "mode": mode, "total_size": total},
    )
    return {
        "job_id": job.id,
        "status": "queued",
        "mode": mode,
        "file_count": len(payloads),
    }


async def list_jobs(*, skip: int = 0, limit: int = 50) -> List[Dict[str, Any]]:
    from backend.job_status import merge_job_with_sidecar

    cursor = db.log_jobs.find({}, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
    docs = await cursor.to_list(limit)
    return [merge_job_with_sidecar(d) for d in docs]


async def get_job(job_id: str) -> Dict[str, Any]:
    from backend.job_status import merge_job_with_sidecar, read_failure_sidecar

    doc = await db.log_jobs.find_one({"id": job_id}, {"_id": 0})
    if not doc:
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


async def resume_job(job_id: str, user: dict) -> Dict[str, Any]:
    from backend.job_queue import force_requeue, load_payload_async

    try:
        result = await force_requeue(db, job_id)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:
        logger.exception("resume job %s failed: %s", job_id, e)
        raise HTTPException(500, f"Could not resume job: {e}") from e
    meta = await load_payload_async(db, job_id)
    result["payload_present"] = bool(meta and meta.get("_files"))
    await svc.audit(user, "log.job_resume", "log_job", job_id, {"status": "queued"})
    return result


async def enqueue_text_ingest(
    text: str,
    filename: str,
    actor: dict,
    source: str = "webhook",
) -> dict:
    from backend.job_queue import enqueue
    from backend.mongo_util import to_mongo_doc

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
    return {
        "job_id": job.id,
        "status": "queued",
        "mode": "stream",
        "source": source,
    }


async def ingest_json(
    body: StreamIngestBody,
    actor: dict,
) -> dict:
    if body.text and body.text.strip():
        text = body.text
    elif body.lines:
        text = "\n".join(body.lines)
    else:
        raise HTTPException(400, "Provide text or lines")
    fname = body.filename or f"{body.source or 'webhook'}.log"
    return await enqueue_text_ingest(text, fname, actor, source=body.source or "webhook")


async def ingest_raw(
    raw: bytes,
    actor: dict,
    *,
    source: str = "raw-webhook",
    filename: Optional[str] = None,
) -> dict:
    if not raw:
        raise HTTPException(400, "Empty body")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"Payload exceeds {MAX_UPLOAD_BYTES} bytes")
    text = raw.decode("utf-8", errors="ignore")
    src = (source or "raw-webhook").strip() or "raw-webhook"
    fname = (filename or f"{src}.log").strip()
    return await enqueue_text_ingest(text, fname, actor, source=src)
