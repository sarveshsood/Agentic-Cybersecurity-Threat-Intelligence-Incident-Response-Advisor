"""API / domain schemas (Pydantic).

P1: re-export from ``backend.models`` so new code can import from
``backend.schemas`` while the monolithic models module is split later.
"""
from __future__ import annotations

from backend.models import (  # noqa: F401
    ATTACKTechnique,
    IoC,
    LoginRequest,
    ReviewAction,
    SECRET_SETTINGS_FIELDS,
    SETTINGS_CLEAR_SENTINEL,
    Settings,
    TokenResponse,
    UserInDB,
    new_id,
)

__all__ = [
    "ATTACKTechnique",
    "IoC",
    "LoginRequest",
    "ReviewAction",
    "SECRET_SETTINGS_FIELDS",
    "SETTINGS_CLEAR_SENTINEL",
    "Settings",
    "TokenResponse",
    "UserInDB",
    "new_id",
]
