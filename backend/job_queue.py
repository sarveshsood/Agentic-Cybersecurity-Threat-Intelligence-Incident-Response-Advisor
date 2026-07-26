"""Minimal durable pipeline job queue (A-S7).

Uploads persist payloads and mark ``queue_state=queued`` on the log_jobs
document. A background worker claims jobs via find_one_and_update so work
survives process restart (re-queued if left ``running`` past a stale timeout).

Payload backends (``ACTIRA_JOB_PAYLOAD_BACKEND``):
  - ``disk``  — local ``data/job_payloads/{job_id}/`` (single-node / tests)
  - ``mongo`` — shared Mongo collection + GridFS (multi-node safe default)
  - ``dual``  — write both; load prefers mongo then disk

This is not Celery/RQ — asyncio worker(s), Mongo as the queue + optional shared payload store.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

PAYLOAD_ROOT = Path(
    os.environ.get("ACTIRA_JOB_PAYLOAD_DIR")
    or (Path(__file__).resolve().parent / "data" / "job_payloads")
)

# multi-node: default mongo so any worker can claim payloads without shared disk
PAYLOAD_BACKEND = (os.environ.get("ACTIRA_JOB_PAYLOAD_BACKEND") or "mongo").strip().lower()
if PAYLOAD_BACKEND not in ("disk", "mongo", "dual"):
    PAYLOAD_BACKEND = "mongo"

PAYLOAD_META_COLLECTION = "job_payload_meta"
PAYLOAD_GRIDFS_BUCKET = "job_payloads"

STALE_RUNNING_MINUTES = int(os.environ.get("JOB_STALE_MINUTES", "30") or "30")
WORKER_POLL_SECONDS = float(os.environ.get("JOB_WORKER_POLL_SECONDS", "1.5") or "1.5")

_worker_task: Optional[asyncio.Task] = None
_stop = asyncio.Event()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def payload_backend() -> str:
    return PAYLOAD_BACKEND


def payload_dir(job_id: str) -> Path:
    return PAYLOAD_ROOT / job_id


def scrub_settings_for_disk(settings: Optional[dict]) -> dict:
    """A-N2/payload-redact: strip secret fields before writing job meta to disk.

    Secrets are re-hydrated from live Mongo settings at claim time.
    """
    if not settings:
        return {}
    try:
        from backend.models import SECRET_SETTINGS_FIELDS
        secret_keys = set(SECRET_SETTINGS_FIELDS)
    except Exception:
        secret_keys = {
            "anthropic_api_key",
            "openai_api_key",
            "gemini_api_key",
            "groq_api_key",
            "abuseipdb_key",
            "virustotal_key",
            "greynoise_key",
            "threatfox_key",
            "otx_api_key",
            "shodan_api_key",
            "cohere_api_key",
            "slack_webhook_url",
        }
    out: Dict[str, Any] = {}
    for k, v in dict(settings).items():
        if k in secret_keys:
            continue
        # Defense-in-depth: drop anything that looks like a key field
        lk = str(k).lower()
        if lk.endswith("_api_key") or lk.endswith("_key") or "webhook" in lk or "secret" in lk:
            if k in secret_keys or lk.endswith(("_api_key", "_key")) or "webhook" in lk:
                continue
        out[k] = v
    return out


def merge_settings_with_live(
        payload_settings: Optional[dict],
        live_settings: Optional[dict],
) -> dict:
    """Merge non-secret payload settings with live secrets from Mongo/settings."""
    base = dict(payload_settings or {})
    live = dict(live_settings or {})
    try:
        from backend.models import SECRET_SETTINGS_FIELDS
        secret_keys = set(SECRET_SETTINGS_FIELDS)
    except Exception:
        secret_keys = set()
    # Live secrets always win; non-secrets prefer payload snapshot (job-time knobs)
    for k, v in live.items():
        if k in secret_keys or k not in base:
            if v is not None:
                base[k] = v
    return base


def save_payload(
        job_id: str,
        files: List[Tuple[str, bytes]],
        user_id: str,
        settings: dict,
        *,
        kind: str = "batch",
) -> str:
    """Write job files + meta to disk. Returns payload path string.

    Settings secrets are scrubbed (not written to meta.json).
    """
    d = payload_dir(job_id)
    d.mkdir(parents=True, exist_ok=True)
    meta = {
        "job_id": job_id,
        "user_id": user_id,
        "kind": kind,
        "files": [],
        "settings": scrub_settings_for_disk(settings),
        "settings_secrets_redacted": True,
        "created_at": _utc_now(),
    }
    for i, (name, data) in enumerate(files):
        safe = f"{i:03d}.bin"
        (d / safe).write_bytes(data)
        meta["files"].append({"name": name, "path": safe, "size": len(data)})
    (d / "meta.json").write_text(json.dumps(meta, default=str), encoding="utf-8")
    return str(d)


def load_payload(job_id: str) -> Optional[Dict[str, Any]]:
    d = payload_dir(job_id)
    meta_path = d / "meta.json"
    if not meta_path.exists():
        return None
    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        files: List[Tuple[str, bytes]] = []
        for f in meta.get("files") or []:
            p = d / f["path"]
            if p.exists():
                files.append((f.get("name") or f["path"], p.read_bytes()))
        meta["_files"] = files
        return meta
    except Exception as e:
        logger.exception("load_payload failed for %s: %s", job_id, e)
        return None


def clear_payload(job_id: str) -> None:
    """Clear disk payload only (sync). Prefer :func:`clear_payload_async` in workers."""
    d = payload_dir(job_id)
    try:
        if d.exists():
            for p in d.iterdir():
                try:
                    p.unlink()
                except OSError:
                    pass
            d.rmdir()
    except Exception as e:
        logger.warning("clear_payload %s: %s", job_id, e)


async def save_payload_mongo(
        db,
        job_id: str,
        files: List[Tuple[str, bytes]],
        user_id: str,
        settings: dict,
        *,
        kind: str = "batch",
) -> str:
    """Store payload meta + GridFS file bytes in Mongo (multi-node safe)."""
    # Clear previous blob(s) for this job_id if re-enqueue
    await clear_payload_mongo(db, job_id)

    file_rows: List[Dict[str, Any]] = []
    try:
        from motor.motor_asyncio import AsyncIOMotorGridFSBucket

        bucket = AsyncIOMotorGridFSBucket(db, bucket_name=PAYLOAD_GRIDFS_BUCKET)
        for i, (name, data) in enumerate(files):
            safe = f"{i:03d}.bin"
            grid_id = await bucket.upload_from_stream(
                f"{job_id}/{safe}",
                data,
                metadata={"job_id": job_id, "name": name, "index": i},
            )
            file_rows.append({
                "name": name,
                "path": safe,
                "size": len(data),
                "gridfs_id": str(grid_id),
            })
    except Exception as e:
        # Fallback: store small files inline (tests / GridFS unavailable)
        logger.warning("GridFS upload failed (%s); using inline bytes for %s", type(e).__name__, job_id)
        file_rows = []
        for i, (name, data) in enumerate(files):
            safe = f"{i:03d}.bin"
            file_rows.append({
                "name": name,
                "path": safe,
                "size": len(data),
                "inline_b64": __import__("base64").b64encode(data).decode("ascii"),
            })

    meta = {
        "job_id": job_id,
        "user_id": user_id,
        "kind": kind,
        "files": file_rows,
        "settings": scrub_settings_for_disk(settings),
        "settings_secrets_redacted": True,
        "created_at": _utc_now(),
        "backend": "mongo",
    }
    await db[PAYLOAD_META_COLLECTION].update_one(
        {"job_id": job_id},
        {"$set": meta},
        upsert=True,
    )
    return f"mongo://{PAYLOAD_META_COLLECTION}/{job_id}"


async def load_payload_mongo(db, job_id: str) -> Optional[Dict[str, Any]]:
    doc = await db[PAYLOAD_META_COLLECTION].find_one({"job_id": job_id}, {"_id": 0})
    if not doc:
        return None
    from bson import ObjectId

    files: List[Tuple[str, bytes]] = []
    try:
        from motor.motor_asyncio import AsyncIOMotorGridFSBucket

        bucket = AsyncIOMotorGridFSBucket(db, bucket_name=PAYLOAD_GRIDFS_BUCKET)
    except Exception:
        bucket = None

    for f in doc.get("files") or []:
        name = f.get("name") or f.get("path") or "file.bin"
        data: Optional[bytes] = None
        if f.get("inline_b64"):
            import base64
            data = base64.b64decode(f["inline_b64"])
        elif f.get("gridfs_id") and bucket is not None:
            try:
                stream = await bucket.open_download_stream(ObjectId(f["gridfs_id"]))
                chunks = []
                while True:
                    chunk = await stream.readchunk()
                    if not chunk:
                        break
                    chunks.append(chunk)
                data = b"".join(chunks)
            except Exception as e:
                logger.warning("GridFS download %s/%s: %s", job_id, f.get("gridfs_id"), e)
        if data is not None:
            files.append((name, data))
    if not files:
        return None
    doc = dict(doc)
    doc["_files"] = files
    return doc


async def clear_payload_mongo(db, job_id: str) -> None:
    try:
        doc = await db[PAYLOAD_META_COLLECTION].find_one({"job_id": job_id})
        if doc:
            try:
                from motor.motor_asyncio import AsyncIOMotorGridFSBucket
                from bson import ObjectId

                bucket = AsyncIOMotorGridFSBucket(db, bucket_name=PAYLOAD_GRIDFS_BUCKET)
                for f in doc.get("files") or []:
                    gid = f.get("gridfs_id")
                    if gid:
                        try:
                            await bucket.delete(ObjectId(gid))
                        except Exception:
                            pass
            except Exception:
                pass
        await db[PAYLOAD_META_COLLECTION].delete_one({"job_id": job_id})
    except Exception as e:
        logger.warning("clear_payload_mongo %s: %s", job_id, e)


async def save_payload_async(
        db,
        job_id: str,
        files: List[Tuple[str, bytes]],
        user_id: str,
        settings: dict,
        *,
        kind: str = "batch",
) -> str:
    """Persist payload using configured backend(s). Returns primary location URI."""
    backend = payload_backend()
    path = ""
    if backend in ("mongo", "dual"):
        path = await save_payload_mongo(db, job_id, files, user_id, settings, kind=kind)
    if backend in ("disk", "dual"):
        disk_path = await asyncio.to_thread(
            save_payload, job_id, files, user_id, settings, kind=kind
        )
        if not path:
            path = disk_path
    if not path:
        # Safety: always write disk if backend misconfigured
        path = await asyncio.to_thread(save_payload, job_id, files, user_id, settings, kind=kind)
    return path


async def load_payload_async(db, job_id: str) -> Optional[Dict[str, Any]]:
    """Load payload: mongo first (multi-node), then disk fallback."""
    backend = payload_backend()
    if backend in ("mongo", "dual"):
        meta = await load_payload_mongo(db, job_id)
        if meta and meta.get("_files"):
            return meta
    if backend in ("disk", "dual", "mongo"):
        # disk fallback even for mongo (migration / dual)
        meta = await asyncio.to_thread(load_payload, job_id)
        if meta and meta.get("_files"):
            return meta
    return None


async def clear_payload_async(db, job_id: str) -> None:
    backend = payload_backend()
    if backend in ("mongo", "dual"):
        await clear_payload_mongo(db, job_id)
    if backend in ("disk", "dual", "mongo"):
        await asyncio.to_thread(clear_payload, job_id)


async def enqueue(
        db,
        job_id: str,
        files: List[Tuple[str, bytes]],
        user_id: str,
        settings: dict,
        *,
        kind: str = "batch",
) -> None:
    path = await save_payload_async(db, job_id, files, user_id, settings, kind=kind)
    await db.log_jobs.update_one(
        {"id": job_id},
        {
            "$set": {
                "queue_state": "queued",
                "payload_path": path,
                "payload_backend": payload_backend(),
                "queued_at": _utc_now(),
                "status": "queued",
                "progress": 0,
            }
        },
    )


async def claim_next(db) -> Optional[dict]:
    """Atomically claim the oldest queued job."""
    try:
        from pymongo import ReturnDocument

        doc = await db.log_jobs.find_one_and_update(
            {"queue_state": "queued"},
            {
                "$set": {
                    "queue_state": "running",
                    "claimed_at": _utc_now(),
                }
            },
            sort=[("queued_at", 1)],
            return_document=ReturnDocument.AFTER,
        )
        return doc
    except Exception as e:
        logger.warning("claim_next failed: %s", e)
        return None


async def requeue_stale(db) -> int:
    """Move long-running claims back to queued (process died mid-job or hung).

    Also reclaims jobs stuck in ``running`` with missing ``claimed_at`` (legacy rows).
    """
    try:
        cutoff = (
                datetime.now(timezone.utc) - timedelta(minutes=max(5, STALE_RUNNING_MINUTES))
        ).isoformat()
        result = await db.log_jobs.update_many(
            {
                "queue_state": "running",
                "status": {"$nin": ["done", "failed"]},
                "$or": [
                    {"claimed_at": {"$lt": cutoff}},
                    {"claimed_at": {"$exists": False}},
                    {"claimed_at": None},
                    {"claimed_at": ""},
                ],
            },
            {
                "$set": {
                    "queue_state": "queued",
                    "requeued_at": _utc_now(),
                    "status": "queued",
                    "progress": 0,
                    "error": "requeued after stale claim (worker restart)",
                }
            },
        )
        n = int(getattr(result, "modified_count", 0) or 0)
        if n:
            logger.warning("Re-queued %s stale pipeline job(s)", n)
        return n
    except Exception as e:
        logger.warning("requeue_stale failed: %s", e)
        return 0


async def requeue_on_startup(db) -> int:
    """Immediately reclaim every non-terminal running job after process restart.

    Does **not** wait for ``JOB_STALE_MINUTES`` — a dead worker cannot still be
    executing those claims, so waiting only leaves the pipeline "hung".
    """
    try:
        result = await db.log_jobs.update_many(
            {
                "status": {"$nin": ["done", "failed"]},
                "$or": [
                    {"queue_state": "running"},
                    # Pre-queue_state rows left mid-pipeline after hard kill
                    {
                        "queue_state": {"$in": [None, ""]},
                        "status": {
                            "$in": [
                                "queued",
                                "parsing",
                                "extracting",
                                "enriching",
                                "correlating",
                                "generating",
                            ]
                        },
                    },
                ],
            },
            {
                "$set": {
                    "queue_state": "queued",
                    "requeued_at": _utc_now(),
                    "status": "queued",
                    "progress": 0,
                    "error": "requeued on worker startup (resume hung job)",
                },
                "$unset": {"claimed_at": ""},
            },
        )
        n = int(getattr(result, "modified_count", 0) or 0)
        if n:
            logger.warning("Startup re-queued %s in-flight pipeline job(s)", n)
        return n
    except Exception as e:
        logger.warning("requeue_on_startup failed: %s", e)
        return 0


async def force_requeue(db, job_id: str) -> Dict[str, Any]:
    """Manually re-queue a failed/stuck job when durable payload still exists.

    Returns a small status dict for the API. Raises ValueError with a user-facing
    message when the job cannot be resumed.
    """
    if not job_id:
        raise ValueError("job_id required")
    doc = await db.log_jobs.find_one({"id": job_id})
    if not doc:
        raise ValueError("Job not found")
    status = (doc.get("status") or "").lower()
    if status == "done":
        raise ValueError("Job already completed — nothing to resume")
    # Allow resume for failed, queued, mid-pipeline, or running (user force)
    meta = await load_payload_async(db, job_id)
    if not meta or not meta.get("_files"):
        raise ValueError(
            "No durable payload (mongo/disk) — cannot resume this job. Re-upload the logs."
        )
    now = _utc_now()
    await db.log_jobs.update_one(
        {"id": job_id},
        {
            "$set": {
                "queue_state": "queued",
                "status": "queued",
                "progress": 0,
                "error": None,
                "requeued_at": now,
                "resume_requested_at": now,
            },
            "$unset": {"claimed_at": ""},
        },
    )
    return {
        "ok": True,
        "job_id": job_id,
        "status": "queued",
        "queue_state": "queued",
        "files": len(meta.get("_files") or []),
        "message": "Job re-queued; worker will resume when free",
    }


async def mark_queue_done(db, job_id: str, *, failed: bool = False) -> None:
    await db.log_jobs.update_one(
        {"id": job_id},
        {
            "$set": {
                "queue_state": "failed" if failed else "done",
                "finished_at": _utc_now(),
            }
        },
    )
    # Best-effort cleanup of payload bytes (mongo + disk)
    try:
        await clear_payload_async(db, job_id)
    except Exception:
        pass


async def _load_live_settings(db) -> dict:
    """Best-effort load of global settings (with secrets) for job rehydration."""
    try:
        doc = await db.settings.find_one({"id": "global"}, {"_id": 0})
        if doc:
            return dict(doc)
    except Exception as e:
        logger.warning("live settings load for job failed: %s", e)
    return {}


async def run_claimed_job(db, job_doc: dict) -> None:
    from backend.pipeline import run_batch_pipeline, run_pipeline

    job_id = job_doc.get("id")
    if not job_id:
        return
    meta = await load_payload_async(db, job_id)
    if not meta or not meta.get("_files"):
        await db.log_jobs.update_one(
            {"id": job_id},
            {
                "$set": {
                    "status": "failed",
                    "queue_state": "failed",
                    "error": "missing durable payload (cannot resume job)",
                    "progress": 0,
                }
            },
        )
        return
    user_id = meta.get("user_id") or job_doc.get("created_by") or "system"
    live = await _load_live_settings(db)
    # Decrypt vault-encrypted secrets if live settings still have wire values
    try:
        from backend.secret_vault import decrypt_settings_doc
        live = decrypt_settings_doc(live)
    except Exception:
        pass
    settings = merge_settings_with_live(meta.get("settings") or {}, live)
    files = meta["_files"]
    kind = meta.get("kind") or "batch"
    try:
        if kind == "single" and len(files) == 1:
            name, data = files[0]
            text = data.decode("utf-8", errors="ignore")
            await run_pipeline(db, job_id, text, user_id, settings, filename=name)
        else:
            await run_batch_pipeline(db, job_id, files, user_id, settings)
        # pipeline sets status done/failed; sync queue_state
        cur = await db.log_jobs.find_one({"id": job_id}, {"status": 1})
        failed = (cur or {}).get("status") == "failed"
        await mark_queue_done(db, job_id, failed=failed)
    except Exception as e:
        logger.exception("durable job %s crashed: %s", job_id, e)
        await db.log_jobs.update_one(
            {"id": job_id},
            {"$set": {"status": "failed", "error": str(e)[:2000], "progress": 0}},
        )
        await mark_queue_done(db, job_id, failed=True)


async def worker_loop(db) -> None:
    logger.info(
        "Pipeline job worker started (poll=%.1fs, stale=%sm)",
        WORKER_POLL_SECONDS,
        STALE_RUNNING_MINUTES,
    )
    # Resume hung jobs immediately after restart (do not wait for stale timeout)
    await requeue_on_startup(db)
    await requeue_stale(db)
    while not _stop.is_set():
        try:
            await requeue_stale(db)
            job = await claim_next(db)
            if job:
                await run_claimed_job(db, job)
            else:
                try:
                    await asyncio.wait_for(_stop.wait(), timeout=WORKER_POLL_SECONDS)
                except asyncio.TimeoutError:
                    pass
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.exception("job worker loop error: %s", e)
            await asyncio.sleep(WORKER_POLL_SECONDS)
    logger.info("Pipeline job worker stopped")


def start_worker(db) -> None:
    """Start in-process worker unless ACTIRA_JOB_WORKER=0 (A-D3 multi-worker)."""
    global _worker_task
    flag = (os.environ.get("ACTIRA_JOB_WORKER") or "1").strip().lower()
    if flag in ("0", "false", "off", "no"):
        logger.info("Pipeline job worker disabled (ACTIRA_JOB_WORKER=%s)", flag)
        return
    _stop.clear()
    if _worker_task and not _worker_task.done():
        return
    _worker_task = asyncio.create_task(worker_loop(db), name="actira-job-worker")


async def stop_worker() -> None:
    global _worker_task
    _stop.set()
    t = _worker_task
    _worker_task = None
    if t:
        t.cancel()
        try:
            await t
        except (asyncio.CancelledError, Exception):
            pass
