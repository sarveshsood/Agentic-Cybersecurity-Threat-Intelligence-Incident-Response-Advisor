"""Meta routes — thin adapters over bootstrap health helpers."""
from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from backend.services import bootstrap

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


@router.get("/")
async def root():
    return {
        "service": "ACTIRA API",
        "full_name": "Agentic Cybersecurity Threat Intelligence & Incident Response Advisor",
        "status": "ok",
    }
