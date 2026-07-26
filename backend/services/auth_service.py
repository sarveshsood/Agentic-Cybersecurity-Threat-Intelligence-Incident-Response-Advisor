"""Authentication business logic (register / login / session cookie / me)."""
from __future__ import annotations

import os
from typing import Any, Dict

from fastapi import HTTPException
from fastapi.responses import JSONResponse

from backend.core import services as svc
from backend.models import LoginRequest, TokenResponse, User, UserCreatePublic, UserInDB
from backend.repositories.users import users_repo
from backend.security import (
    create_access_token,
    hash_password,
    validate_password_strength,
    verify_password,
)


def _env_flag(name: str) -> str | None:
    raw = (os.environ.get(name) or "").strip().lower()
    return raw or None


def public_register_allowed() -> bool:
    """Whether POST /auth/register is open.

    Policy (first match wins for explicit override):
      - ``ALLOW_PUBLIC_REGISTER=true|false`` forces the value
      - If OIDC SSO is enabled → disabled (enterprise identity path)
      - If ``ENV`` is production/staging → disabled
      - Otherwise → allowed (lab / local demos)
    """
    explicit = _env_flag("ALLOW_PUBLIC_REGISTER")
    if explicit is not None:
        return explicit in ("1", "true", "yes", "on")

    try:
        from backend.services.oidc_service import oidc_enabled

        if oidc_enabled():
            return False
    except Exception:
        pass

    env = (os.environ.get("ENV") or "dev").strip().lower()
    if env in ("production", "prod", "staging"):
        return False
    return True


def auth_public_config() -> Dict[str, Any]:
    """Unauthenticated SPA bootstrap: SSO flag + register policy (no secrets)."""
    from backend.services import oidc_service

    cfg = oidc_service.oidc_config_public()
    cfg["public_register"] = public_register_allowed()
    return cfg


def _include_body_token() -> bool:
    return (os.environ.get("AUTH_RETURN_TOKEN_IN_BODY") or "1").strip().lower() not in (
        "0",
        "false",
        "no",
        "off",
    )


def _token_response(token: str, user_doc: dict, session_hours: int) -> JSONResponse:
    user_out = User(**user_doc).model_dump(mode="json")
    payload = TokenResponse(
        access_token=token if _include_body_token() else "",
        user=User(**user_out),
    ).model_dump(mode="json")
    response = JSONResponse(content=payload)
    response.set_cookie(
        key="actira_access_token",
        value=token,
        **svc.auth_cookie_kwargs(session_hours * 3600),
    )
    return response


async def register(body: UserCreatePublic) -> JSONResponse:
    """Public self-registration — always creates analyst (no role field)."""
    if not public_register_allowed():
        raise HTTPException(
            403,
            "Public registration is disabled. Use SSO or ask an administrator.",
        )
    validate_password_strength(body.password)
    email_norm = (body.email or "").strip().lower()
    existing = await users_repo.find_by_email(email_norm)
    if existing:
        raise HTTPException(400, "Email already registered")
    user = UserInDB(
        email=email_norm,
        name=body.name,
        role="analyst",
        password_hash=hash_password(body.password),
    )
    doc = user.model_dump(mode="json")
    await users_repo.insert(doc)
    session_hours = await svc.session_hours()
    token = create_access_token(user.id, user.email, user.role, expire_hours=session_hours)
    return _token_response(token, user.model_dump(), session_hours)


async def login(body: LoginRequest) -> JSONResponse:
    from backend.auth_throttle import (
        clear_login_failures,
        get_login_lockout_status,
        record_login_failure,
    )
    from backend.database import db

    email_key = (body.email or "").strip().lower()
    locked, mins = await get_login_lockout_status(db, email_key)
    if locked:
        raise HTTPException(
            429,
            f"Account temporarily locked after failed logins. Try again in ~{mins or 1} min.",
        )

    doc = await users_repo.find_by_email_ci(email_key)
    if not doc or not verify_password(body.password, doc["password_hash"]):
        limit = await svc.lockout_limit()
        lock_msg = await record_login_failure(db, email_key, limit)
        if lock_msg:
            raise HTTPException(429, lock_msg)
        raise HTTPException(401, "Invalid credentials")

    await clear_login_failures(db, email_key)
    session_hours = await svc.session_hours()
    token = create_access_token(doc["id"], doc["email"], doc["role"], expire_hours=session_hours)
    return _token_response(token, doc, session_hours)


def logout_response() -> JSONResponse:
    """Clear httpOnly session cookie."""
    response = JSONResponse(content={"ok": True})
    ck = svc.auth_cookie_kwargs(0)
    response.delete_cookie(
        "actira_access_token",
        path=ck.get("path", "/"),
        secure=ck.get("secure", False),
        httponly=True,
        samesite=ck.get("samesite", "lax"),
    )
    return response


async def get_me(user: dict) -> User:
    doc = await users_repo.find_by_id_public(user["sub"])
    if not doc:
        raise HTTPException(404, "User not found")
    return User(**doc)
