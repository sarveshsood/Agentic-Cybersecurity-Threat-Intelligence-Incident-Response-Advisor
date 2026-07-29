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
    try:
        from backend.tenancy import stamp_org

        doc = stamp_org(doc)
    except Exception:
        pass
    await users_repo.insert(doc)
    session_hours = await svc.session_hours()
    token = create_access_token(user.id, user.email, user.role, expire_hours=session_hours)
    return _token_response(token, doc, session_hours)


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

    # Optional TOTP second factor (FEATURE_MFA=1 + pyotp)
    try:
        from backend import mfa as mfa_mod

        if mfa_mod.available() and doc.get("mfa_enabled") and doc.get("mfa_secret"):
            code = (getattr(body, "mfa_code", None) or "").strip()
            if not code:
                mfa_token = mfa_mod.create_pending_challenge(
                    doc["id"],
                    doc.get("email") or email_key,
                    doc.get("role") or "analyst",
                    name=doc.get("name") or "",
                )
                return JSONResponse(
                    content={
                        "access_token": "",
                        "token_type": "bearer",
                        "user": None,
                        "mfa_required": True,
                        "mfa_token": mfa_token,
                    }
                )
            if not mfa_mod.verify_code(str(doc.get("mfa_secret")), code):
                limit = await svc.lockout_limit()
                lock_msg = await record_login_failure(db, email_key, limit)
                if lock_msg:
                    raise HTTPException(429, lock_msg)
                raise HTTPException(401, "Invalid MFA code")
    except HTTPException:
        raise
    except Exception:
        pass

    session_hours = await svc.session_hours()
    token = create_access_token(doc["id"], doc["email"], doc["role"], expire_hours=session_hours)
    try:
        await svc.audit(
            {"sub": doc["id"], "email": doc.get("email"), "role": doc.get("role")},
            "auth.login",
            "user",
            doc["id"],
            {"email": doc.get("email"), "role": doc.get("role")},
        )
    except Exception:
        pass
    return _token_response(token, doc, session_hours)


async def mfa_setup(user: dict) -> Dict[str, Any]:
    from backend import mfa as mfa_mod

    if not mfa_mod.mfa_feature_enabled():
        raise HTTPException(404, "MFA feature disabled (set FEATURE_MFA=1)")
    if not mfa_mod.available():
        raise HTTPException(503, "pyotp not installed — pip install pyotp")
    secret = mfa_mod.generate_secret()
    email = user.get("email") or user.get("sub") or "user"
    return {
        "secret": secret,
        "otpauth_uri": mfa_mod.provisioning_uri(secret, str(email)),
        "note": "Confirm with POST /auth/mfa/enable {secret, code} then store authenticator app",
    }


async def mfa_enable(user: dict, secret: str, code: str) -> Dict[str, Any]:
    from backend import mfa as mfa_mod

    if not mfa_mod.available():
        raise HTTPException(503, "MFA unavailable")
    if not mfa_mod.verify_code(secret, code):
        raise HTTPException(400, "Invalid code — check authenticator clock")
    await users_repo.update_fields(
        user["sub"],
        {"mfa_enabled": True, "mfa_secret": secret},
    )
    return {"ok": True, "mfa_enabled": True}


async def mfa_disable(user: dict, code: str) -> Dict[str, Any]:
    from backend import mfa as mfa_mod
    from backend.core.database import db

    doc = await db.users.find_one({"id": user["sub"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "User not found")
    if doc.get("mfa_enabled") and doc.get("mfa_secret"):
        if not mfa_mod.verify_code(str(doc["mfa_secret"]), code):
            raise HTTPException(400, "Invalid MFA code")
    await db.users.update_one(
        {"id": user["sub"]},
        {"$set": {"mfa_enabled": False}, "$unset": {"mfa_secret": ""}},
    )
    return {"ok": True, "mfa_enabled": False}


async def mfa_verify(mfa_token: str, code: str) -> JSONResponse:
    from backend import mfa as mfa_mod
    from backend.core.database import db

    if not mfa_mod.available():
        raise HTTPException(503, "MFA unavailable")
    pending = mfa_mod.consume_pending(mfa_token)
    if not pending:
        raise HTTPException(401, "MFA challenge expired — login again")
    doc = await db.users.find_one({"id": pending["user_id"]}, {"_id": 0})
    if not doc or not doc.get("mfa_secret"):
        raise HTTPException(401, "MFA not configured")
    if not mfa_mod.verify_code(str(doc["mfa_secret"]), code):
        raise HTTPException(401, "Invalid MFA code")
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
