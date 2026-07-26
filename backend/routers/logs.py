"""Log upload / ingest API — thin adapters over logs_service."""
from __future__ import annotations

from typing import List, Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Header,
    Query,
    Request,
    UploadFile,
)

from backend.security import get_current_user
from backend.services import logs_service
from backend.services.logs_service import StreamIngestBody

router = APIRouter(tags=["logs"])


@router.post("/logs/upload")
async def upload_log(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user=Depends(get_current_user),
):
    return await logs_service.upload_single(file, user)


@router.post("/logs/upload-batch")
async def upload_batch(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    user=Depends(get_current_user),
):
    return await logs_service.upload_batch(files, user)


@router.get("/logs/jobs")
async def list_jobs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    user=Depends(get_current_user),
):
    return await logs_service.list_jobs(skip=skip, limit=limit)


@router.get("/logs/jobs/{job_id}")
async def get_job(job_id: str, user=Depends(get_current_user)):
    return await logs_service.get_job(job_id)


@router.post("/logs/jobs/{job_id}/resume")
async def resume_job(job_id: str, user=Depends(get_current_user)):
    return await logs_service.resume_job(job_id, user)


@router.post("/logs/ingest")
async def ingest_stream_json(
    body: StreamIngestBody,
    background_tasks: BackgroundTasks,
    request: Request,
    x_ingest_key: Optional[str] = Header(default=None, alias="X-Ingest-Key"),
    authorization: Optional[str] = Header(default=None),
):
    actor = await logs_service.resolve_ingest_actor(request, x_ingest_key, authorization)
    return await logs_service.ingest_json(body, actor)


@router.post("/logs/ingest/raw")
async def ingest_stream_raw(
    background_tasks: BackgroundTasks,
    request: Request,
    x_ingest_key: Optional[str] = Header(default=None, alias="X-Ingest-Key"),
    authorization: Optional[str] = Header(default=None),
    x_log_source: Optional[str] = Header(default=None, alias="X-Log-Source"),
    x_log_filename: Optional[str] = Header(default=None, alias="X-Log-Filename"),
):
    actor = await logs_service.resolve_ingest_actor(request, x_ingest_key, authorization)
    raw = await request.body()
    return await logs_service.ingest_raw(
        raw,
        actor,
        source=x_log_source or "raw-webhook",
        filename=x_log_filename,
    )
