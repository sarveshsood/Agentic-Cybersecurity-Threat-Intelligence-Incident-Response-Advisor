"""Meta routes — API root and health under /api prefix."""
from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from backend.core import services as svc

router = APIRouter(tags=["meta"])


# ---------- Health / readiness / version ----------
@router.get("/health")
async def health_api():
    """Health under the API prefix."""
    return await svc.health_check()


@router.get("/ready")
async def ready_api():
    """Readiness under the API prefix — 200 only when Mongo is up."""
    body = await svc.health_check()
    if body.get("mongo") != "up":
        return JSONResponse(status_code=503, content=body)
    return body


@router.get("/version")
async def version_api():
    return {
        "service": "ACTIRA API",
        "full_name": "Agentic Cybersecurity Threat Intelligence & Incident Response Advisor",
        "api": "v1",
        "package": "backend",
        "entry": "backend.server:app",
    }


@router.get("/")
async def root():
    return {
        "service": "ACTIRA API",
        "full_name": "Agentic Cybersecurity Threat Intelligence & Incident Response Advisor",
        "status": "ok",
    }
