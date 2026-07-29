"""Meta routes — thin adapters over bootstrap health helpers + feature flags."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from backend.feature_flags import collab_features, features_public
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
    response_description=(
        "Flat booleans for SPA gates plus catalog/related metadata for Settings UI"
    ),
)
async def features_api():
    """Env-gated product flags (read-only snapshot).

    - **Flat booleans** (``qa_health_center``, collab keys, …) — used by SPA
      ``loadFeatures()`` / ``isFeatureEnabled``.
    - **``catalog``** — titles, env var names, UI surfaces, enabled state.
    - **``related``** — adjacent knobs (MFA, multi-tenant, embeddings, …).
    - **``summary``** — counts + honesty note (not runtime toggles).

    When a product flag is false, gated routes return **404** via
    ``require_feature`` — UI hide alone is not enough.
    """
    try:
        return features_public()
    except Exception:
        # Never break SPA boot — fall back to bare booleans
        return collab_features()


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
