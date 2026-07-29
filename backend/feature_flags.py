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
from typing import Any, Callable, Dict, List

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

# UI catalog — titles/descriptions for Settings → Feature flags (read-only)
FEATURE_CATALOG: List[Dict[str, Any]] = [
    {
        "key": "qa_health_center",
        "env": "FEATURE_QA_HEALTH_CENTER",
        "title": "QA Health Center",
        "description": "Testing Health Center — coverage, suites, release readiness, use cases.",
        "ui": ["Admin → QA Health", "/qa"],
        "default": False,
        "restart": True,
    },
    {
        "key": "collab_assign",
        "env": "FEATURE_COLLAB_ASSIGN",
        "title": "Incident assignment",
        "description": "Primary assignee, my-queue filters, assignment API.",
        "ui": ["Incidents list", "Incident case tab"],
        "default": False,
        "restart": True,
    },
    {
        "key": "collab_comments",
        "env": "FEATURE_COLLAB_COMMENTS",
        "title": "Incident comments",
        "description": "Threaded comments on incidents (separate from workspace notes).",
        "ui": ["Incident detail → comments"],
        "default": False,
        "restart": True,
    },
    {
        "key": "notification_center",
        "env": "FEATURE_NOTIFICATION_CENTER",
        "title": "Notification center",
        "description": "In-app notification bell and inbox.",
        "ui": ["Top bar bell"],
        "default": False,
        "restart": True,
    },
    {
        "key": "saved_filters",
        "env": "FEATURE_SAVED_FILTERS",
        "title": "Saved filters",
        "description": "Named, reusable incident list filter sets.",
        "ui": ["Incidents → saved filters"],
        "default": False,
        "restart": True,
    },
    {
        "key": "pins",
        "env": "FEATURE_PINS",
        "title": "Pins / favorites",
        "description": "User favorites for incidents and related targets.",
        "ui": ["Incidents", "Incident detail"],
        "default": False,
        "restart": True,
    },
]


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


def features_public() -> Dict[str, Any]:
    """Full features payload for SPA: flat booleans + catalog + related env status.

    Flat boolean keys remain stable for ``loadFeatures()`` / ``isFeatureEnabled``.
    """
    flags = collab_features()
    catalog = []
    for row in FEATURE_CATALOG:
        key = row["key"]
        catalog.append(
            {
                **row,
                "enabled": bool(flags.get(key, False)),
            }
        )

    related: List[Dict[str, Any]] = []
    # Related env knobs (not always in FEATURE_ENV_MAP / not SPA-gated the same way)
    related.append(
        {
            "key": "realtime_ops",
            "env": "FEATURE_REALTIME_OPS",
            "title": "Realtime ops channels",
            "description": "SSE/WebSocket ops bus (default on unless set to 0).",
            "enabled": env_bool("FEATURE_REALTIME_OPS", True),
            "default": True,
            "ui": ["Dashboard realtime strip"],
        }
    )
    related.append(
        {
            "key": "mfa",
            "env": "FEATURE_MFA",
            "title": "Local TOTP MFA",
            "description": "Password login second factor (requires pyotp). Prefer IdP MFA for enterprise.",
            "enabled": env_bool("FEATURE_MFA", False),
            "default": False,
            "ui": ["Login MFA step"],
        }
    )
    related.append(
        {
            "key": "multi_tenant",
            "env": "FEATURE_MULTI_TENANT",
            "title": "Multi-tenant scaffold",
            "description": "org_id stamp/filter on primary incident/user paths — not full SaaS.",
            "enabled": env_bool("FEATURE_MULTI_TENANT", False),
            "default": False,
            "ui": ["(API/data only — no org admin UI)"],
        }
    )
    judge_raw = (os.environ.get("ACTIRA_PLAYBOOK_JUDGE_LLM") or "0").strip().lower()
    related.append(
        {
            "key": "playbook_judge_llm",
            "env": "ACTIRA_PLAYBOOK_JUDGE_LLM",
            "title": "Playbook LLM judge",
            "description": "Optional LLM second pass; rules always run. Values: 0|1|auto.",
            "enabled": judge_raw in ("1", "true", "yes", "on")
            or (
                judge_raw == "auto"
                and (os.environ.get("ENV") or "").strip().lower()
                in ("production", "prod", "staging")
            ),
            "value": judge_raw or "0",
            "default": False,
            "ui": ["Pipeline playbook quality"],
        }
    )
    emb_profile = (os.environ.get("ACTIRA_EMBEDDING_PROFILE") or "auto").strip() or "auto"
    emb_backend = (os.environ.get("ACTIRA_EMBEDDING_BACKEND") or "").strip()
    related.append(
        {
            "key": "embedding_profile",
            "env": "ACTIRA_EMBEDDING_PROFILE / ACTIRA_EMBEDDING_BACKEND",
            "title": "Embedding profile",
            "description": "auto → sbert in production/staging; hash in lab/CI. Install sentence-transformers for sbert.",
            "enabled": True,
            "value": emb_backend or emb_profile,
            "default": True,
            "ui": ["RAG / KB retrieval"],
        }
    )

    enabled_n = sum(1 for v in flags.values() if v)
    return {
        **flags,
        "catalog": catalog,
        "related": related,
        "summary": {
            "product_flags_on": enabled_n,
            "product_flags_total": len(flags),
            "note": (
                "Flags are env-only (backend/.env). Restart API after change. "
                "This panel is read-only — not a runtime toggle."
            ),
        },
    }
