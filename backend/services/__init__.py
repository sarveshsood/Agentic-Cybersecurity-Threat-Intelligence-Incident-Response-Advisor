"""Application services — business logic used by routers and lifespan.

P1: domain services live here; ``backend.core.services`` remains a compatibility
shim for existing imports.
"""
from __future__ import annotations

from backend.services import auth_service as auth_service
from backend.services import bootstrap as bootstrap
from backend.services import incident_service as incident_service
from backend.services import review_service as review_service
from backend.services import settings_service as settings_service

__all__ = [
    "auth_service",
    "bootstrap",
    "incident_service",
    "review_service",
    "settings_service",
]
