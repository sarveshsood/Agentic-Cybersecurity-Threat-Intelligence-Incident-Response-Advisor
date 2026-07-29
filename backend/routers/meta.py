"""Meta routes — thin adapters over bootstrap health helpers + feature flags."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from backend.feature_flags import collab_features
from backend.security import require_roles
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


@router.get(
    "/meta/features",
    summary="Product feature flags snapshot",
    response_description="Booleans for H-07/H-08 collab & productivity surfaces (default all false)",
)
async def features_api():
    """Public snapshot of env-gated product flags (KD-9 / H-07 PR-1).

    SPA loads once at login / Layout mount. When a flag is false, collab routes
    must return 404 via ``require_feature`` — UI hide alone is not enough.
    """
    out = dict(collab_features())
    try:
        from backend import tenancy

        out["multi_tenant"] = tenancy.status_public()
    except Exception:
        out["multi_tenant"] = {"feature_enabled": False, "mode": "single_tenant"}
    try:
        from backend.playbook_judge import llm_judge_enabled

        out["playbook_judge_llm"] = llm_judge_enabled()
    except Exception:
        out["playbook_judge_llm"] = False
    try:
        from backend.embeddings import _env_backend

        out["embedding_backend"] = _env_backend()
    except Exception:
        out["embedding_backend"] = "hash"
    return out


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
