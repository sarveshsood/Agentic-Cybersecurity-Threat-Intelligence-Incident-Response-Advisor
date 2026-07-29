"""Product feature flags (env-gated, default **off**).

SPA reads the snapshot via ``GET /api/meta/features``. Disabled features use
``require_feature("…")`` so routes return **404** (not 403).

Includes H-07/H-08 collab & productivity plus QA Health Center
(``qa_health_center`` / ``FEATURE_QA_HEALTH_CENTER``). Function name
``collab_features()`` is retained for stable call sites (do not rename).

See ``docs/product/COLLABORATION_AND_SAVED_FILTERS_DESIGN.md`` KD-9 / PR-1 and
``docs/product/TESTING_HEALTH_CENTER_DESIGN.md`` KD-4 / PR-1.
"""
from __future__ import annotations

import os
from typing import Callable, Dict

from fastapi import HTTPException


# Public JSON keys → process environment variable names
FEATURE_ENV_MAP: Dict[str, str] = {
    "collab_assign": "FEATURE_COLLAB_ASSIGN",
    "collab_comments": "FEATURE_COLLAB_COMMENTS",
    "notification_center": "FEATURE_NOTIFICATION_CENTER",
    "saved_filters": "FEATURE_SAVED_FILTERS",
    "pins": "FEATURE_PINS",
    "qa_health_center": "FEATURE_QA_HEALTH_CENTER",
}

# Stable order for API responses / tests
FEATURE_KEYS = tuple(FEATURE_ENV_MAP.keys())


def env_bool(name: str, default: bool = False) -> bool:
    """Parse common truthy/falsey env strings; empty → default (False for collab flags)."""
    raw = (os.environ.get(name) or "").strip().lower()
    if not raw:
        return default
    if raw in ("1", "true", "yes", "on"):
        return True
    if raw in ("0", "false", "no", "off"):
        return False
    return default


def collab_features() -> Dict[str, bool]:
    """Snapshot of product feature flags (all default off).

    Name retained for stable imports; includes collab, productivity, and QA flags.
    """
    return {key: env_bool(env_name, False) for key, env_name in FEATURE_ENV_MAP.items()}


def is_feature_enabled(key: str) -> bool:
    """True if the named feature flag is enabled. Unknown keys → False."""
    env_name = FEATURE_ENV_MAP.get(key)
    if not env_name:
        return False
    return env_bool(env_name, False)


def require_feature(key: str) -> Callable:
    """FastAPI dependency: 404 when flag is off (feature absent — not 403).

    Usage::

        @router.post("/…", dependencies=[Depends(require_feature("collab_assign"))])
        async def …():
            …
    """

    async def _dep() -> bool:
        if not is_feature_enabled(key):
            raise HTTPException(
                status_code=404,
                detail=f"Feature not available: {key}",
            )
        return True

    # Helpful for OpenAPI / debugging
    _dep.__name__ = f"require_feature_{key}"
    return _dep
