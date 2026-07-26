"""JWT auth utilities."""
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Awaitable, Callable, Optional

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# Ensure backend/.env is loaded when auth is imported before server.py
load_dotenv(Path(__file__).resolve().parent / ".env")

logger = logging.getLogger(__name__)

_WEAK_JWT_SECRETS = frozenset({
    "",
    "dev-secret",
    "secret",
    "changeme",
    "change-me",
    "jwt-secret",
    "your-secret-here",
})

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret")
JWT_ALGO = "HS256"
# Fallback when Settings.session_timeout_hours is unavailable (e.g. early boot)
try:
    JWT_EXPIRE_HOURS = int(os.environ.get("SESSION_TIMEOUT_HOURS", "24") or "24")
    if JWT_EXPIRE_HOURS <= 0:
        JWT_EXPIRE_HOURS = 24
except (TypeError, ValueError):
    JWT_EXPIRE_HOURS = 24


def _app_env() -> str:
    return (os.environ.get("ENV") or "dev").strip().lower()


def jwt_secret_is_weak(secret: Optional[str] = None) -> bool:
    s = secret if secret is not None else JWT_SECRET
    return (not s) or s in _WEAK_JWT_SECRETS or len(s) < 16


# A-S2 / A-A1: refuse weak secrets outside dev/test
if jwt_secret_is_weak():
    if _app_env() in ("dev", "test", "local", ""):
        logger.warning(
            "JWT_SECRET is weak or missing (len=%s). Set a strong random JWT_SECRET "
            "in backend/.env for production.",
            len(JWT_SECRET or ""),
        )
    else:
        raise RuntimeError(
            "JWT_SECRET is weak or missing. Set a strong random JWT_SECRET "
            f"(≥16 chars, not a default) when ENV={_app_env()!r}."
        )

bearer_scheme = HTTPBearer(auto_error=False)

# Privileged roles that must never be self-assigned via public registration
PRIVILEGED_ROLES = frozenset({"admin", "senior_reviewer"})

# Optional async loader: (jwt_payload) -> user dict with live role from DB
_UserLoader = Callable[[dict], Awaitable[dict]]
_user_loader: Optional[_UserLoader] = None


def set_user_loader(loader: Optional[_UserLoader]) -> None:
    """Wire DB role re-bind (called from server after Mongo is ready)."""
    global _user_loader
    _user_loader = loader


def validate_password_strength(pw: str) -> None:
    """Raise HTTPException 400 if password fails policy (A-A2)."""
    if not pw or len(pw) < 12:
        raise HTTPException(400, "Password must be at least 12 characters")
    if not re.search(r"[A-Za-z]", pw) or not re.search(r"\d", pw):
        raise HTTPException(400, "Password must include at least one letter and one number")
    if pw.lower() in ("password", "password123", "admin123!", "changeme123"):
        raise HTTPException(400, "Password is too common")


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, pw_hash: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), pw_hash.encode())
    except Exception:
        return False


def create_access_token(
        user_id: str,
        email: str,
        role: str,
        expire_hours: Optional[int] = None,
) -> str:
    hours = expire_hours if expire_hours and expire_hours > 0 else JWT_EXPIRE_HOURS
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=hours),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.PyJWTError:
        # Do not leak library error text (alg confusion attempts, malformed claims, etc.)
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_token(
        creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> str:
    if creds:
        return creds.credentials
    raise HTTPException(status_code=401, detail="Missing bearer token or cookie")


async def get_current_user(token: str = Depends(get_token)) -> dict:
    """Decode JWT; re-bind role/email from DB when a user loader is configured (A-S6)."""
    payload = decode_token(token)
    if _user_loader is not None:
        try:
            return await _user_loader(payload)
        except HTTPException:
            raise
        except Exception as e:
            logger.warning("user loader failed, using token claims: %s", e)
    return payload


def require_roles(*roles: str):
    """Require one of the listed roles. Admin always passes (superuser)."""
    allowed = frozenset(roles)

    async def checker(user: dict = Depends(get_current_user)) -> dict:
        role = user.get("role")
        if role == "admin" or role in allowed:
            return user
        raise HTTPException(status_code=403, detail="Insufficient role")

    return checker
