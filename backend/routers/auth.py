"""ACTIRA API routes — auto-split from server.py (v1.1 modularization)."""
from __future__ import annotations

import os
import re

from fastapi import (
    APIRouter, Depends, HTTPException, Request,
)
from fastapi.responses import JSONResponse

from backend.auth import (
    hash_password, verify_password, create_access_token, get_current_user, validate_password_strength,
)
from backend.core import services as svc
from backend.core.database import db
from backend.models import (
    User, UserCreatePublic, UserInDB, LoginRequest, TokenResponse,
)

router = APIRouter(prefix='/auth', tags=['auth'])


# ---------- Auth ----------
@router.post("/register", response_model=TokenResponse)
async def register(body: UserCreatePublic, request: Request = None):
    """Public self-registration (A-M3: no role field). Always creates analyst."""
    validate_password_strength(body.password)
    email_norm = (body.email or "").strip().lower()
    existing = await db.users.find_one({"email": email_norm})
    if existing:
        raise HTTPException(400, "Email already registered")
    user = UserInDB(
        email=email_norm,
        name=body.name,
        role="analyst",
        password_hash=hash_password(body.password),
    )
    doc = user.model_dump(mode="json")
    await db.users.insert_one(doc)
    session_hours = await svc.session_hours()
    token = create_access_token(user.id, user.email, user.role, expire_hours=session_hours)
    # A-F1: httpOnly cookie is primary for SPA; body token kept for API clients/tests.
    user_out = User(**user.model_dump()).model_dump(mode="json")
    include_body_token = (os.environ.get("AUTH_RETURN_TOKEN_IN_BODY") or "1").strip().lower() not in (
        "0", "false", "no", "off",
    )
    payload = TokenResponse(
        access_token=token if include_body_token else "",
        user=User(**user_out),
    ).model_dump(mode="json")
    response = JSONResponse(content=payload)
    response.set_cookie(
        key="actira_access_token",
        value=token,
        **svc.auth_cookie_kwargs(session_hours * 3600),
    )
    return response


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request = None):
    from backend.auth_throttle import (
        clear_login_failures,
        get_login_lockout_status,
        record_login_failure,
    )

    email_key = (body.email or "").strip().lower()
    locked, mins = await get_login_lockout_status(db, email_key)
    if locked:
        raise HTTPException(
            429,
            f"Account temporarily locked after failed logins. Try again in ~{mins or 1} min.",
        )

    # A-S8: case-insensitive email match
    doc = await db.users.find_one({"email": email_key}, {"_id": 0})
    if not doc:
        # legacy mixed-case rows
        doc = await db.users.find_one(
            {"email": {"$regex": f"^{re.escape(email_key)}$", "$options": "i"}},
            {"_id": 0},
        )
    if not doc or not verify_password(body.password, doc["password_hash"]):
        limit = await svc.lockout_limit()
        lock_msg = await record_login_failure(db, email_key, limit)
        if lock_msg:
            raise HTTPException(429, lock_msg)
        raise HTTPException(401, "Invalid credentials")

    await clear_login_failures(db, email_key)
    session_hours = await svc.session_hours()
    token = create_access_token(doc["id"], doc["email"], doc["role"], expire_hours=session_hours)
    # A-F1: cookie primary; body token for scripts/tests (SPA does not store it)
    user_out = User(**doc).model_dump(mode="json")
    include_body_token = (os.environ.get("AUTH_RETURN_TOKEN_IN_BODY") or "1").strip().lower() not in (
        "0", "false", "no", "off",
    )
    payload = TokenResponse(
        access_token=token if include_body_token else "",
        user=User(**user_out),
    ).model_dump(mode="json")
    response = JSONResponse(content=payload)
    response.set_cookie(
        key="actira_access_token",
        value=token,
        **svc.auth_cookie_kwargs(session_hours * 3600),
    )
    return response


@router.post("/logout")
async def logout(user=Depends(get_current_user)):
    """Clear httpOnly session cookie (A-S11 / A-F1)."""
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


@router.get("/me", response_model=User)
async def me(user=Depends(get_current_user)):
    doc = await db.users.find_one({"id": user["sub"]}, {"_id": 0, "password_hash": 0})
    if not doc:
        raise HTTPException(404, "User not found")
    return User(**doc)
