"""Security layer — authn/authz, password policy, JWT helpers.

P1 facade over ``backend.auth`` / ``backend.auth_throttle`` so routers and
services can depend on a stable package boundary while modules migrate.
"""
from __future__ import annotations

from backend.auth import (
    JWT_ALGO,
    JWT_EXPIRE_HOURS,
    JWT_SECRET,
    PRIVILEGED_ROLES,
    create_access_token,
    get_current_user,
    hash_password,
    jwt_secret_is_weak,
    require_roles,
    set_user_loader,
    validate_password_strength,
    verify_password,
)

__all__ = [
    "JWT_ALGO",
    "JWT_EXPIRE_HOURS",
    "JWT_SECRET",
    "PRIVILEGED_ROLES",
    "create_access_token",
    "get_current_user",
    "hash_password",
    "jwt_secret_is_weak",
    "require_roles",
    "set_user_loader",
    "validate_password_strength",
    "verify_password",
]
