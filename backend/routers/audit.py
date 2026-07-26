"""Audit log API — thin adapter over audit_service."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from backend.security import require_roles
from backend.services import audit_service

router = APIRouter(tags=["audit"])


@router.get("/audit")
async def audit_log(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    user=Depends(require_roles("admin", "senior_reviewer")),
):
    return await audit_service.list_audit(skip=skip, limit=limit)
