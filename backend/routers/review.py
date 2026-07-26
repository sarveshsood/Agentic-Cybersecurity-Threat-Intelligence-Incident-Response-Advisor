"""HiTL review API routes — thin HTTP adapters over review_service."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from backend.security import require_roles
from backend.services import review_service
from backend.schemas import ReviewAction

router = APIRouter(tags=["review"])


@router.get("/review/queue")
async def review_queue(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    user=Depends(require_roles("senior_reviewer")),
):
    return await review_service.list_queue(skip=skip, limit=limit)


@router.post("/review/{incident_id}")
async def review_incident(
    incident_id: str,
    action: ReviewAction,
    user=Depends(require_roles("senior_reviewer")),
):
    return await review_service.apply_review(incident_id, action, user)
