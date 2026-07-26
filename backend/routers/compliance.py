"""Compliance API — score, gaps, evidence pack."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.security import require_roles
from backend.services import compliance_service

router = APIRouter(prefix="/compliance", tags=["Compliance"])

_ROLES = ("analyst", "senior_reviewer", "admin")


async def _settings():
    try:
        from backend.core import services as svc

        return await svc.get_settings() or {}
    except Exception:
        return {}


@router.get("/status")
async def get_compliance_status(
    user=Depends(require_roles(*_ROLES)),
):
    """Overall score, frameworks, domains, gap preview."""
    return compliance_service.status(await _settings())


@router.get("/gaps")
async def get_compliance_gaps(
    user=Depends(require_roles(*_ROLES)),
):
    """Failed controls with remediation priority."""
    return compliance_service.gaps(await _settings())


@router.get("/evidence-pack")
async def get_evidence_pack(
    user=Depends(require_roles(*_ROLES)),
):
    """JSON evidence pack for auditors / GRC export."""
    return compliance_service.evidence_pack(await _settings())


@router.get("/score")
async def get_compliance_score(
    user=Depends(require_roles(*_ROLES)),
):
    """Compact scorecard (overall + domain + framework maps)."""
    return compliance_service.score_only(await _settings())
