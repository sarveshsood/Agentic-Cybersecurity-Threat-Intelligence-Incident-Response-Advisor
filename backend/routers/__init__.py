"""Domain API routers — included by server.py under /api and /api/v1."""
from __future__ import annotations

from fastapi import APIRouter, FastAPI

# Relative sibling imports are required inside this package __init__
# (absolute `from backend.routers import X` would re-enter this module).
from . import analytics
from . import audit
from . import auth
from . import compliance
from . import eval_routes
from . import incidents
from . import investigate
from . import kb
from . import logs
from . import meta
from . import review
from . import roadmap
from . import settings
from . import workspace
from . import hunt
from . import collab
from . import productivity

# Public registry for include_all_routers / tests
ALL_DOMAIN_ROUTERS = (
    logs,
    incidents,
    workspace,
    hunt,
    review,
    analytics,
    audit,
    compliance,
    settings,
    roadmap,
    investigate,
    kb,
    eval_routes,
    meta,
    collab,
    productivity,
)


def build_api_router() -> APIRouter:
    """Compose the full /api tree (same paths as pre-modular server)."""
    api = APIRouter()
    # Auth is mounted at /api/auth via its own prefix when included on app
    for mod in ALL_DOMAIN_ROUTERS:
        api.include_router(mod.router)
    return api


def include_all_routers(app: FastAPI) -> None:
    """Mount legacy /api and versioned /api/v1 (identical route trees).

    Builds two independent API router trees so mounts do not share route state.
    """
    for prefix in ("/api", "/api/v1"):
        app.include_router(build_api_router(), prefix=prefix)
        app.include_router(auth.router, prefix=prefix)
