"""OIDC authorization-code scaffold (optional).

When ``OIDC_ISSUER`` + ``OIDC_CLIENT_ID`` are unset, SSO is disabled and
password login remains the only path (lab demos unchanged).

Env:
  OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_REDIRECT_URI
  OIDC_SCOPES (default openid email profile)
  OIDC_ROLE_CLAIM (optional claim name for role)
  OIDC_GROUP_ROLE_MAP (optional JSON e.g. {"soc-admins":"admin"})
  OIDC_REQUIRE_MFA (1 = reject tokens without MFA evidence in amr/acr)
  OIDC_MFA_ACR_VALUES (comma list of accepted acr values; optional)
"""
from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import secrets
import time
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlencode

import requests
from fastapi import HTTPException
from fastapi.responses import JSONResponse, RedirectResponse

from backend.core import services as svc
from backend.models import UserInDB
from backend.repositories.users import users_repo
from backend.security import create_access_token, hash_password
from backend.services.auth_service import _token_response

logger = logging.getLogger("actira.oidc")

# short-lived state store (single-process; fine for scaffold)
_pending: Dict[str, Dict[str, Any]] = {}


def oidc_enabled() -> bool:
    return bool(
        (os.environ.get("OIDC_ISSUER") or "").strip()
        and (os.environ.get("OIDC_CLIENT_ID") or "").strip()
    )


def oidc_require_mfa() -> bool:
    """When true, finish_callback rejects tokens without MFA evidence."""
    raw = (os.environ.get("OIDC_REQUIRE_MFA") or "0").strip().lower()
    return raw in ("1", "true", "yes", "on")


def claims_indicate_mfa(claims: dict) -> bool:
    """Heuristic MFA evidence from IdP token/userinfo claims.

    Accepted signals (any one):
      - ``amr`` contains mfa / otp / totp / sms / hwk / pwd+otp style values
      - ``acr`` matches configured ``OIDC_MFA_ACR_VALUES`` or common high values
      - Entra-style ``auth_time`` with ``amr`` already covered; also
        ``http://schemas.microsoft.com/...`` rarely present in OIDC userinfo
    Prefer Conditional Access at the IdP; this is a belt-and-suspenders check.
    """
    if not claims:
        return False
    amr = claims.get("amr") or claims.get("AMR")
    if isinstance(amr, str):
        amr_list = [amr]
    elif isinstance(amr, list):
        amr_list = [str(x) for x in amr]
    else:
        amr_list = []
    mfa_amr = {
        "mfa",
        "otp",
        "totp",
        "sms",
        "hwk",
        "hwk_pin",
        "pop",
        "sc",
        "swk",
        "wia",
        "face",
        "fpt",
        "pin",
        "pwd",  # alone not enough — need second factor
    }
    strong = {
        "mfa",
        "otp",
        "totp",
        "sms",
        "hwk",
        "hwk_pin",
        "sc",
        "swk",
        "face",
        "fpt",
        "pop",
    }
    lower = {a.lower() for a in amr_list}
    if lower & strong:
        return True
    # multi-method amr (e.g. pwd + otp) counts as MFA
    if len(lower) >= 2 and ("pwd" in lower or "password" in lower) and (lower & strong or "otp" in lower):
        return True

    acr = str(claims.get("acr") or claims.get("ACR") or "").strip()
    if acr:
        allowed_raw = (os.environ.get("OIDC_MFA_ACR_VALUES") or "").strip()
        if allowed_raw:
            allowed = {v.strip() for v in allowed_raw.split(",") if v.strip()}
            if acr in allowed:
                return True
        # Common high-assurance defaults when no explicit list
        if acr in (
            "urn:mace:incommon:iap:silver",
            "urn:mace:incommon:iap:gold",
            "http://schemas.openid.net/pape/policies/2007/06/multi-factor",
            "phr",
            "phrh",
            "AAL2",
            "AAL3",
            "2",
            "3",
        ):
            return True
        # Entra often uses numeric strings; treat >1 as stepped-up when require is on
        try:
            if float(acr) >= 2:
                return True
        except ValueError:
            pass

    # Optional custom claim
    claim_name = (os.environ.get("OIDC_MFA_CLAIM") or "").strip()
    if claim_name and claims.get(claim_name) in (True, "true", "1", 1, "yes"):
        return True
    return False


def oidc_config_public() -> Dict[str, Any]:
    """OIDC portion of public auth config (no client secret)."""
    if not oidc_enabled():
        return {"enabled": False, "require_mfa": False}
    return {
        "enabled": True,
        "issuer": (os.environ.get("OIDC_ISSUER") or "").rstrip("/"),
        "client_id": os.environ.get("OIDC_CLIENT_ID"),
        "scopes": (os.environ.get("OIDC_SCOPES") or "openid email profile").strip(),
        "login_path": "/api/auth/oidc/login",
        "require_mfa": oidc_require_mfa(),
    }


def _discover(issuer: str) -> dict:
    url = issuer.rstrip("/") + "/.well-known/openid-configuration"
    r = requests.get(url, timeout=10)
    r.raise_for_status()
    return r.json()


def _pkce_pair() -> Tuple[str, str]:
    verifier = secrets.token_urlsafe(48)
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
        .decode()
        .rstrip("=")
    )
    return verifier, challenge


def begin_login() -> RedirectResponse:
    if not oidc_enabled():
        raise HTTPException(404, "OIDC not configured")
    issuer = (os.environ.get("OIDC_ISSUER") or "").rstrip("/")
    client_id = os.environ.get("OIDC_CLIENT_ID") or ""
    redirect_uri = (os.environ.get("OIDC_REDIRECT_URI") or "").strip()
    if not redirect_uri:
        raise HTTPException(500, "OIDC_REDIRECT_URI not set")
    try:
        meta = _discover(issuer)
    except Exception as e:
        logger.warning("OIDC discovery failed: %s", e)
        raise HTTPException(502, f"OIDC discovery failed: {e}") from e
    auth_ep = meta.get("authorization_endpoint")
    if not auth_ep:
        raise HTTPException(502, "OIDC authorization_endpoint missing")
    state = secrets.token_urlsafe(24)
    verifier, challenge = _pkce_pair()
    _pending[state] = {
        "verifier": verifier,
        "exp": time.time() + 600,
        "token_endpoint": meta.get("token_endpoint"),
        "userinfo_endpoint": meta.get("userinfo_endpoint"),
    }
    # purge old
    now = time.time()
    for k in list(_pending.keys()):
        if _pending[k].get("exp", 0) < now:
            _pending.pop(k, None)
    scopes = (os.environ.get("OIDC_SCOPES") or "openid email profile").strip()
    q = urlencode(
        {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "scope": scopes,
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
    )
    return RedirectResponse(url=f"{auth_ep}?{q}", status_code=302)


def _map_role(claims: dict) -> str:
    role_claim = (os.environ.get("OIDC_ROLE_CLAIM") or "").strip()
    if role_claim and claims.get(role_claim):
        val = str(claims.get(role_claim)).lower()
        if val in ("admin", "senior_reviewer", "analyst"):
            return val
    raw_map = (os.environ.get("OIDC_GROUP_ROLE_MAP") or "").strip()
    if raw_map:
        try:
            mapping = json.loads(raw_map)
            groups = claims.get("groups") or claims.get("roles") or []
            if isinstance(groups, str):
                groups = [groups]
            for g in groups:
                if g in mapping:
                    r = str(mapping[g]).lower()
                    if r in ("admin", "senior_reviewer", "analyst"):
                        return r
        except Exception:
            pass
    return "analyst"


async def finish_callback(code: str, state: str) -> JSONResponse:
    if not oidc_enabled():
        raise HTTPException(404, "OIDC not configured")
    pending = _pending.pop(state or "", None)
    if not pending or pending.get("exp", 0) < time.time():
        raise HTTPException(400, "Invalid or expired OIDC state")
    if not code:
        raise HTTPException(400, "Missing authorization code")
    token_ep = pending.get("token_endpoint")
    if not token_ep:
        raise HTTPException(502, "OIDC token_endpoint missing")
    redirect_uri = (os.environ.get("OIDC_REDIRECT_URI") or "").strip()
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "client_id": os.environ.get("OIDC_CLIENT_ID") or "",
        "code_verifier": pending.get("verifier") or "",
    }
    secret = (os.environ.get("OIDC_CLIENT_SECRET") or "").strip()
    auth = None
    if secret:
        auth = (os.environ.get("OIDC_CLIENT_ID") or "", secret)
    try:
        tr = requests.post(token_ep, data=data, auth=auth, timeout=15)
        tr.raise_for_status()
        tokens = tr.json()
    except Exception as e:
        logger.warning("OIDC token exchange failed: %s", e)
        raise HTTPException(502, f"OIDC token exchange failed: {e}") from e

    access = tokens.get("access_token") or ""
    claims: dict = {}
    # Prefer userinfo
    uinfo_ep = pending.get("userinfo_endpoint")
    if uinfo_ep and access:
        try:
            ur = requests.get(
                uinfo_ep,
                headers={"Authorization": f"Bearer {access}"},
                timeout=10,
            )
            if ur.ok:
                claims = ur.json()
        except Exception as e:
            logger.warning("OIDC userinfo failed: %s", e)
    if not claims and tokens.get("id_token"):
        # Scaffold: decode JWT payload without full JWKS verify (lab only)
        try:
            parts = str(tokens["id_token"]).split(".")
            pad = "=" * (-len(parts[1]) % 4)
            claims = json.loads(base64.urlsafe_b64decode(parts[1] + pad))
        except Exception:
            claims = {}

    email = (claims.get("email") or claims.get("preferred_username") or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(400, "OIDC identity missing email claim")

    if oidc_require_mfa() and not claims_indicate_mfa(claims):
        logger.warning("OIDC MFA required but claims lack amr/acr evidence for %s", email)
        raise HTTPException(
            403,
            "Multi-factor authentication required. Complete MFA at your identity provider "
            "(or set OIDC_REQUIRE_MFA=0 for lab). Ensure Conditional Access issues amr/acr claims.",
        )

    name = (claims.get("name") or claims.get("given_name") or email.split("@")[0]).strip()
    role = _map_role(claims)
    oidc_sub = str(claims.get("sub") or "")

    doc = await users_repo.find_by_email_ci(email)
    if not doc:
        user = UserInDB(
            email=email,
            name=name,
            role=role,
            password_hash=hash_password(secrets.token_urlsafe(32)),
        )
        doc = user.model_dump(mode="json")
        if oidc_sub:
            doc["oidc_sub"] = oidc_sub
        try:
            from backend.tenancy import stamp_org

            doc = stamp_org(doc)
        except Exception:
            pass
        await users_repo.insert(doc)
    else:
        # keep existing role unless empty
        if oidc_sub and not doc.get("oidc_sub"):
            try:
                await users_repo.update_fields(doc["id"], {"oidc_sub": oidc_sub})
            except Exception:
                pass

    session_hours = await svc.session_hours()
    token = create_access_token(
        doc["id"], doc["email"], doc.get("role") or role, expire_hours=session_hours
    )
    return _token_response(token, doc, session_hours)
