"""Compliance API — thin adapter over compliance_service."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.security import require_roles
from backend.services import compliance_service

router = APIRouter(prefix="/compliance", tags=["Compliance"])


@router.get("/status")
async def get_compliance_status(
    user=Depends(require_roles("analyst", "senior_reviewer", "admin")),
):
    return compliance_service.status()
