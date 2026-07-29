"""Optional TOTP MFA for password login (FEATURE_MFA=1).

Soft dependency: ``pyotp`` (+ optional ``qrcode`` for setup URI only).
When feature is off, all helpers are no-ops / disabled.

Flow:
  1. Authenticated user POST /auth/mfa/setup → secret + otpauth URI
  2. POST /auth/mfa/enable {code} → stores encrypted-ish secret on user
  3. Login with password → if mfa_enabled, returns mfa_required + mfa_token
  4. POST /auth/mfa/verify {mfa_token, code} → full session cookie
"""
from __future__ import annotations

import logging
import os
import secrets
import time
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# Short-lived pending MFA challenges (process-local; multi-replica needs shared store)
_pending: Dict[str, Dict[str, Any]] = {}
_MFA_TTL_SEC = 300


def mfa_feature_enabled() -> bool:
    raw = (os.environ.get("FEATURE_MFA") or "0").strip().lower()
    return raw in ("1", "true", "yes", "on")


def _pyotp():
    try:
        import pyotp  # type: ignore

        return pyotp
    except ImportError:
        return None


def available() -> bool:
    return mfa_feature_enabled() and _pyotp() is not None


def generate_secret() -> str:
    pyotp = _pyotp()
    if not pyotp:
        raise RuntimeError("pyotp not installed — pip install pyotp")
    return pyotp.random_base32()


def provisioning_uri(secret: str, email: str, issuer: str = "ACTIRA") -> str:
    pyotp = _pyotp()
    if not pyotp:
        return ""
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=email, issuer_name=issuer)


def verify_code(secret: str, code: str, *, window: int = 1) -> bool:
    pyotp = _pyotp()
    if not pyotp or not secret or not code:
        return False
    totp = pyotp.TOTP(secret)
    try:
        return bool(totp.verify(str(code).strip().replace(" ", ""), valid_window=window))
    except Exception:
        return False


def create_pending_challenge(user_id: str, email: str, role: str, name: str = "") -> str:
    token = secrets.token_urlsafe(24)
    _pending[token] = {
        "user_id": user_id,
        "email": email,
        "role": role,
        "name": name,
        "exp": time.time() + _MFA_TTL_SEC,
    }
    # prune
    now = time.time()
    dead = [k for k, v in _pending.items() if v.get("exp", 0) < now]
    for k in dead:
        _pending.pop(k, None)
    return token


def consume_pending(token: str) -> Optional[Dict[str, Any]]:
    row = _pending.pop(token or "", None)
    if not row:
        return None
    if row.get("exp", 0) < time.time():
        return None
    return row


def status_public() -> Dict[str, Any]:
    return {
        "feature_enabled": mfa_feature_enabled(),
        "library_available": _pyotp() is not None,
        "available": available(),
    }
