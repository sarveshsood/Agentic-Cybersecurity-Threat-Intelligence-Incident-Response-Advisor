"""Meta routes — thin adapters over bootstrap health helpers."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from backend.security import get_current_user, require_roles
from backend.services import bootstrap
from backend.services import ops_service

router = APIRouter(tags=["meta"])


@router.get("/health")
async def health_api():
    return await bootstrap.health_check()


@router.get("/ready")
async def ready_api():
    body = await bootstrap.health_check()
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


@router.get("/ops/status")
async def ops_status_api(user=Depends(require_roles("admin"))):
    """Admin Ops/Health panel — multi-replica flags, queue, timings, LLM budget."""
    return await ops_service.ops_status()


@router.get("/")
async def root():
    return {
        "service": "ACTIRA API",
        "full_name": "Agentic Cybersecurity Threat Intelligence & Incident Response Advisor",
        "status": "ok",
    }
