"""Encrypt-at-rest for Settings secrets stored in MongoDB (A-S3 full vault).

Uses Fernet (AES-128-CBC + HMAC) from the ``cryptography`` package by default.

Key resolution (first match wins):
  1. ``SECRETS_MASTER_KEY`` — Fernet key (url-safe base64 32 bytes) **or** any
     long passphrase (hashed to a Fernet key).
  2. Derived from ``JWT_SECRET`` + fixed domain string (zero-config; rotating
     JWT_SECRET will re-key vault — prefer an explicit master key in prod).

Wire format in Mongo:
  - ``enc:v1:<fernet-token>`` — local Fernet
  - ``enc:hvt:v1:…`` — Hashicorp Vault Transit (when configured)
  - ``ref:hvk:v1:path#key`` — Hashicorp KV v2 reference
  - ``ref:awssm:v1:id#key`` — AWS Secrets Manager reference

Plaintext legacy values are accepted on read and re-encrypted on next write
or via :func:`migrate_settings_doc`.
"""
from __future__ import annotations

import base64
import hashlib
import logging
import os
from functools import lru_cache
from typing import Any, Dict, Iterable, Optional, Tuple

logger = logging.getLogger(__name__)

ENC_PREFIX = "enc:v1:"


# Lazy import models field list to avoid circular imports at module load
def _secret_fields() -> Tuple[str, ...]:
    try:
        from backend.models import SECRET_SETTINGS_FIELDS
        return tuple(SECRET_SETTINGS_FIELDS)
    except Exception:
        return (
            "anthropic_api_key",
            "openai_api_key",
            "gemini_api_key",
            "groq_api_key",
            "abuseipdb_key",
            "virustotal_key",
            "greynoise_key",
            "threatfox_key",
            "otx_api_key",
            "shodan_api_key",
            "cohere_api_key",
            "slack_webhook_url",
        )


def is_encrypted_value(value: Any) -> bool:
    """True for any vault-managed wire value (local or external)."""
    if not isinstance(value, str):
        return False
    if value.startswith(ENC_PREFIX):
        return True
    try:
        from backend.external_secrets import is_external_value
        return is_external_value(value)
    except Exception:
        return False


def _fernet_key_from_material(material: bytes) -> bytes:
    digest = hashlib.sha256(material).digest()
    return base64.urlsafe_b64encode(digest)


@lru_cache(maxsize=1)
def _fernet():
    """Build Fernet instance; cached for process lifetime."""
    from cryptography.fernet import Fernet

    raw = (os.environ.get("SECRETS_MASTER_KEY") or "").strip()
    if raw:
        # Try as a ready-made Fernet key first
        try:
            return Fernet(raw.encode("utf-8") if isinstance(raw, str) else raw)
        except Exception:
            pass
        try:
            return Fernet(_fernet_key_from_material(raw.encode("utf-8")))
        except Exception as e:
            raise RuntimeError(
                "SECRETS_MASTER_KEY is set but invalid. Use a Fernet key "
                "(cryptography.fernet.Fernet.generate_key()) or a long passphrase."
            ) from e

    jwt = (os.environ.get("JWT_SECRET") or "").strip()
    if not jwt:
        # Dev fallback — encrypt still works but key is weak; warn once
        logger.warning(
            "secret_vault: no SECRETS_MASTER_KEY or JWT_SECRET; using weak dev key. "
            "Set SECRETS_MASTER_KEY in production."
        )
        jwt = "dev-secret-vault-fallback"
    return Fernet(_fernet_key_from_material((jwt + "|actira-secrets-v1").encode("utf-8")))


def reset_fernet_cache() -> None:
    """Test helper — clear cached Fernet after env changes."""
    _fernet.cache_clear()


def encrypt_secret(plaintext: Optional[str]) -> Optional[str]:
    """Encrypt a secret for Mongo storage. None/empty stay None.

    Normalizes vault:// / awssm:// pastes into refs. External refs are stored
    as-is (no re-encryption). When Hashicorp Transit is enabled, new plaintext
    secrets use ``enc:hvt:v1:``; otherwise local Fernet ``enc:v1:``.
    """
    if plaintext is None:
        return None
    try:
        from backend.external_secrets import normalize_secret_input, is_external_value, transit_enabled, transit_encrypt
    except Exception:
        normalize_secret_input = None  # type: ignore
        is_external_value = lambda _v: False  # type: ignore
        transit_enabled = lambda: False  # type: ignore
        transit_encrypt = None  # type: ignore

    text = str(plaintext).strip()
    if not text:
        return None
    if normalize_secret_input is not None:
        text = normalize_secret_input(text) or ""
    if not text:
        return None
    if is_encrypted_value(text) or (is_external_value and is_external_value(text)):
        return text
    if text.startswith(ENC_PREFIX):
        return text
    # Prefer external Transit when configured
    if transit_enabled and transit_enabled() and transit_encrypt is not None:
        try:
            return transit_encrypt(text)
        except Exception as e:
            logger.warning(
                "secret_vault: Hashicorp Transit encrypt failed (%s); falling back to local Fernet",
                type(e).__name__,
            )
    token = _fernet().encrypt(text.encode("utf-8")).decode("ascii")
    return f"{ENC_PREFIX}{token}"


def decrypt_secret(value: Optional[str]) -> Optional[str]:
    """Decrypt enc:v1: / enc:hvt:v1: or resolve ref:* ; plaintext legacy as-is."""
    if value is None:
        return None
    if not isinstance(value, str):
        value = str(value)
    if not value:
        return None

    # Safely try external resolution only if the external module exists.
    # Catching ModuleNotFoundError/ImportError prevents throwing looping errors.
    try:
        from backend.external_secrets import is_external_value, resolve_external
        if is_external_value(value):
            return resolve_external(value)
    except (ModuleNotFoundError, ImportError):
        pass
    except Exception as e:
        logger.error("secret_vault: external resolve/decrypt failed: %s", type(e).__name__)
        # Fall through instead of raising, stopping recursive request loops

    if not value.startswith(ENC_PREFIX):
        return value
    token = value[len(ENC_PREFIX):]
    try:
        from cryptography.fernet import InvalidToken

        return _fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except InvalidToken:
        logger.error("secret_vault: failed to decrypt value (wrong SECRETS_MASTER_KEY?)")
        return value  # Return raw value instead of crashing request loops
    except Exception as e:
        logger.error("secret_vault: decrypt error: %s", type(e).__name__)
        return value


def encrypt_settings_doc(doc: Dict[str, Any], fields: Optional[Iterable[str]] = None) -> Dict[str, Any]:
    """Return a copy of settings with secret fields encrypted for Mongo."""
    out = dict(doc or {})
    for field in fields or _secret_fields():
        if field not in out:
            continue
        val = out.get(field)
        if val is None or val == "":
            out[field] = None
            continue
        try:
            out[field] = encrypt_secret(str(val))
        except Exception as e:
            logger.warning("encrypt %s failed: %s", field, type(e).__name__)
    return out


def decrypt_settings_doc(doc: Dict[str, Any], fields: Optional[Iterable[str]] = None) -> Dict[str, Any]:
    """Return a copy with secret fields decrypted for runtime use."""
    out = dict(doc or {})
    for field in fields or _secret_fields():
        if field not in out or out.get(field) is None:
            continue
        val = out.get(field)
        if not isinstance(val, str) or not val:
            continue
        try:
            out[field] = decrypt_secret(val)
        except Exception:
            logger.warning("decrypt %s failed; leaving encrypted", field)
    return out


def migrate_settings_doc(doc: Dict[str, Any], fields: Optional[Iterable[str]] = None) -> Tuple[Dict[str, Any], bool]:
    """Decrypt for runtime + re-encrypt plaintext fields. Returns (doc, changed)."""
    fields = tuple(fields or _secret_fields())
    storage = dict(doc or {})
    changed = False
    for field in fields:
        val = storage.get(field)
        if val is None or val == "":
            continue
        if not isinstance(val, str):
            continue
        if is_encrypted_value(val):
            continue
        try:
            storage[field] = encrypt_secret(val)
            changed = True
        except Exception as e:
            logger.warning("migrate encrypt %s: %s", field, type(e).__name__)
    return storage, changed


def vault_status() -> Dict[str, Any]:
    """Non-secret diagnostics for admin/ops."""
    has_master = bool((os.environ.get("SECRETS_MASTER_KEY") or "").strip())
    has_jwt = bool((os.environ.get("JWT_SECRET") or "").strip())
    status: Dict[str, Any] = {
        "enabled": True,
        "prefix": ENC_PREFIX,
        "key_source": "SECRETS_MASTER_KEY" if has_master else ("JWT_SECRET_derived" if has_jwt else "dev_fallback"),
        "recommend_explicit_master_key": not has_master,
        "backend": "local_fernet",
    }
    try:
        from backend.external_secrets import external_status, transit_enabled
        ext = external_status()
        status["external"] = ext
        if transit_enabled():
            status["backend"] = "hashicorp_transit"
            status["key_source"] = "VAULT_TRANSIT"
    except Exception as e:
        status["external"] = {"error": type(e).__name__}
    return status
