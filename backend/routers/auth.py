"""Auth API routes — thin HTTP adapters over auth_service."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Request

from backend.models import (
    LoginRequest,
    MfaEnableRequest,
    MfaVerifyRequest,
    TokenResponse,
    User,
    UserCreatePublic,
)
from backend.security import get_current_user
from backend.services import auth_service
from backend.services import oidc_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
async def register(body: UserCreatePublic, request: Request = None):
    """Public self-registration (A-M3: no role field). Always creates analyst."""
    return await auth_service.register(body)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request = None):
    return await auth_service.login(body)


@router.post("/logout")
async def logout(user=Depends(get_current_user)):
    """Clear httpOnly session cookie (A-S11 / A-F1)."""
    return auth_service.logout_response()


@router.get("/me", response_model=User)
async def me(user=Depends(get_current_user)):
    return await auth_service.get_me(user)


@router.get("/oidc/config")
async def oidc_config():
    """Public: SSO flag + public_register policy (no secrets)."""
    cfg = auth_service.auth_public_config()
    try:
        from backend import mfa as mfa_mod

        cfg["mfa"] = mfa_mod.status_public()
    except Exception:
        cfg["mfa"] = {"feature_enabled": False, "available": False}
    return cfg


@router.get("/mfa/status")
async def mfa_status(user=Depends(get_current_user)):
    from backend import mfa as mfa_mod
    from backend.core.database import db

    st = mfa_mod.status_public()
    doc = await db.users.find_one({"id": user["sub"]}, {"_id": 0, "mfa_enabled": 1})
    st["user_enrolled"] = bool((doc or {}).get("mfa_enabled"))
    return st


@router.post("/mfa/setup")
async def mfa_setup(user=Depends(get_current_user)):
    return await auth_service.mfa_setup(user)


@router.post("/mfa/enable")
async def mfa_enable(body: MfaEnableRequest, user=Depends(get_current_user)):
    return await auth_service.mfa_enable(user, body.secret, body.code)


@router.post("/mfa/disable")
async def mfa_disable(body: MfaEnableRequest, user=Depends(get_current_user)):
    return await auth_service.mfa_disable(user, body.code)


@router.post("/mfa/verify")
async def mfa_verify(body: MfaVerifyRequest):
    return await auth_service.mfa_verify(body.mfa_token, body.code)


@router.get("/oidc/login")
async def oidc_login():
    """Start OIDC authorization-code + PKCE flow (redirect)."""
    return oidc_service.begin_login()


@router.get("/oidc/callback")
async def oidc_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
):
    """OIDC callback — mints ACTIRA session cookie (same as password login)."""
    if error:
        from fastapi import HTTPException

        raise HTTPException(400, f"OIDC error: {error}")
    return await oidc_service.finish_callback(code or "", state or "")
