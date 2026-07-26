"""Meta routes — API root and health under /api prefix."""
from __future__ import annotations

from fastapi import APIRouter

from backend.core import services as svc

router = APIRouter(tags=["meta"])


# ---------- Health ----------
@router.get("/health")
async def health_api():
    """Health under the API prefix."""
    return await svc.health_check()


@router.get("/")
async def root():
    return {
        "service": "ACTIRA API",
        "full_name": "Agentic Cybersecurity Threat Intelligence & Incident Response Advisor",
        "status": "ok",
    }
