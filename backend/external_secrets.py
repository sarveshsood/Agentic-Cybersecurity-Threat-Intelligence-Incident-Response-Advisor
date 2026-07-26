"""External secret backends (Hashicorp Vault, AWS Secrets Manager) — A-S3 ops stretch.

Supports:
  1. **Hashicorp Vault Transit** — encrypt/decrypt settings secrets at rest via
     Transit engine (``enc:hvt:v1:<base64-ciphertext>``) when ``VAULT_ADDR`` +
     ``VAULT_TOKEN`` + ``VAULT_TRANSIT_KEY`` are set.
  2. **Hashicorp KV v2 references** — store ``ref:hvk:v1:path#key`` and resolve
     at runtime (secret never lands in Mongo plaintext or Fernet blob).
  3. **AWS Secrets Manager references** — store ``ref:awssm:v1:secret-id`` or
     ``ref:awssm:v1:secret-id#json_key`` (uses boto3).

Local Fernet (``enc:v1:``) remains the default when no external backend is
configured. All network calls are best-effort with clear errors; unit tests
inject fake HTTP/SM clients.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import re
from typing import Any, Callable, Dict, Optional
from urllib import error as urlerror
from urllib import request as urlrequest

logger = logging.getLogger(__name__)

HVT_PREFIX = "enc:hvt:v1:"
HVK_PREFIX = "ref:hvk:v1:"
AWSSM_PREFIX = "ref:awssm:v1:"

# Test hooks
_http_json_hook: Optional[Callable[..., Any]] = None
_awssm_hook: Optional[Callable[[str], Any]] = None


def reset_external_hooks() -> None:
    global _http_json_hook, _awssm_hook
    _http_json_hook = None
    _awssm_hook = None


def set_http_json_hook(fn: Optional[Callable[..., Any]]) -> None:
    global _http_json_hook
    _http_json_hook = fn


def set_awssm_hook(fn: Optional[Callable[[str], Any]]) -> None:
    global _awssm_hook
    _awssm_hook = fn


def is_external_ciphertext(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    return value.startswith(HVT_PREFIX)


def is_external_ref(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    return value.startswith(HVK_PREFIX) or value.startswith(AWSSM_PREFIX)


def is_external_value(value: Any) -> bool:
    return is_external_ciphertext(value) or is_external_ref(value)


def vault_addr() -> str:
    return (os.environ.get("VAULT_ADDR") or "").strip().rstrip("/")


def vault_token() -> str:
    return (os.environ.get("VAULT_TOKEN") or "").strip()


def vault_transit_key() -> str:
    return (os.environ.get("VAULT_TRANSIT_KEY") or "actira").strip() or "actira"


def vault_kv_mount() -> str:
    return (os.environ.get("VAULT_KV_MOUNT") or "secret").strip() or "secret"


def transit_enabled() -> bool:
    flag = (os.environ.get("VAULT_TRANSIT_ENABLED") or "").strip().lower()
    if flag in ("0", "false", "off", "no"):
        return False
    if flag in ("1", "true", "yes", "on"):
        return bool(vault_addr() and vault_token())
    # Auto: enable when addr+token present
    return bool(vault_addr() and vault_token())


def _http_json(
        method: str,
        url: str,
        *,
        headers: Optional[Dict[str, str]] = None,
        body: Optional[dict] = None,
        timeout: float = 8.0,
) -> dict:
    if _http_json_hook is not None:
        return _http_json_hook(method, url, headers=headers, body=body)

    data = None
    req_headers = dict(headers or {})
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        req_headers.setdefault("Content-Type", "application/json")
    # Only allow http(s) — blocks file:/ and other schemes (bandit B310).
    from urllib.parse import urlparse

    scheme = (urlparse(url).scheme or "").lower()
    if scheme not in ("http", "https"):
        raise RuntimeError(f"external vault URL scheme not allowed: {scheme or 'missing'}")
    req = urlrequest.Request(url, data=data, headers=req_headers, method=method.upper())
    try:
        with urlrequest.urlopen(req, timeout=timeout) as resp:  # nosec B310
            raw = resp.read().decode("utf-8") or "{}"
            return json.loads(raw)
    except urlerror.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"HTTP {e.code} from external vault: {err_body}") from e
    except Exception as e:
        raise RuntimeError(f"external vault request failed: {type(e).__name__}") from e


def transit_encrypt(plaintext: str) -> str:
    """Encrypt via Vault Transit; return ``enc:hvt:v1:…`` wire value."""
    addr = vault_addr()
    token = vault_token()
    key = vault_transit_key()
    if not addr or not token:
        raise RuntimeError("VAULT_ADDR and VAULT_TOKEN required for transit encrypt")
    b64 = base64.b64encode(plaintext.encode("utf-8")).decode("ascii")
    url = f"{addr}/v1/transit/encrypt/{key}"
    resp = _http_json(
        "POST",
        url,
        headers={"X-Vault-Token": token},
        body={"plaintext": b64},
    )
    ct = ((resp.get("data") or {}).get("ciphertext")) or ""
    if not ct:
        raise RuntimeError("Vault Transit encrypt returned no ciphertext")
    # Store without double-prefix; Vault already uses vault:v1:…
    return f"{HVT_PREFIX}{ct}"


def transit_decrypt(wire: str) -> str:
    if not wire.startswith(HVT_PREFIX):
        raise ValueError("not a Hashicorp Transit ciphertext")
    ct = wire[len(HVT_PREFIX):]
    addr = vault_addr()
    token = vault_token()
    key = vault_transit_key()
    if not addr or not token:
        raise RuntimeError("VAULT_ADDR and VAULT_TOKEN required for transit decrypt")
    url = f"{addr}/v1/transit/decrypt/{key}"
    resp = _http_json(
        "POST",
        url,
        headers={"X-Vault-Token": token},
        body={"ciphertext": ct},
    )
    b64 = ((resp.get("data") or {}).get("plaintext")) or ""
    if not b64:
        raise RuntimeError("Vault Transit decrypt returned empty plaintext")
    return base64.b64decode(b64.encode("ascii")).decode("utf-8")


def _parse_hvk_ref(wire: str) -> tuple[str, Optional[str]]:
    """ref:hvk:v1:path#key → (path, key|None). Path is relative to KV mount."""
    rest = wire[len(HVK_PREFIX):]
    if "#" in rest:
        path, key = rest.split("#", 1)
        return path.strip().lstrip("/"), (key.strip() or None)
    return rest.strip().lstrip("/"), None


def resolve_hvk_ref(wire: str) -> str:
    path, field = _parse_hvk_ref(wire)
    addr = vault_addr()
    token = vault_token()
    mount = vault_kv_mount()
    if not addr or not token:
        raise RuntimeError("VAULT_ADDR and VAULT_TOKEN required for KV resolve")
    # KV v2 read path: /v1/{mount}/data/{path}
    url = f"{addr}/v1/{mount}/data/{path}"
    resp = _http_json("GET", url, headers={"X-Vault-Token": token})
    data = ((resp.get("data") or {}).get("data")) or {}
    if field:
        val = data.get(field)
    else:
        # Single-value secret or first string field
        if isinstance(data, dict) and "value" in data:
            val = data.get("value")
        elif isinstance(data, dict) and len(data) == 1:
            val = next(iter(data.values()))
        else:
            val = data.get("value") or data.get("password") or data.get("api_key")
    if val is None:
        raise RuntimeError(f"KV secret missing field {field or '(default)'} at {path}")
    return str(val)


def _parse_awssm_ref(wire: str) -> tuple[str, Optional[str]]:
    rest = wire[len(AWSSM_PREFIX):]
    if "#" in rest:
        sid, key = rest.split("#", 1)
        return sid.strip(), (key.strip() or None)
    return rest.strip(), None


def resolve_awssm_ref(wire: str) -> str:
    secret_id, json_key = _parse_awssm_ref(wire)
    if not secret_id:
        raise RuntimeError("empty AWS Secrets Manager secret id")
    if _awssm_hook is not None:
        raw = _awssm_hook(secret_id)
    else:
        import boto3  # type: ignore

        client = boto3.client(
            "secretsmanager",
            region_name=(os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or None),
        )
        resp = client.get_secret_value(SecretId=secret_id)
        raw = resp.get("SecretString")
        if raw is None and resp.get("SecretBinary"):
            raw = base64.b64decode(resp["SecretBinary"]).decode("utf-8")
    if raw is None:
        raise RuntimeError(f"AWS SM secret empty: {secret_id}")
    text = str(raw)
    if not json_key:
        return text
    try:
        obj = json.loads(text)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"AWS SM secret is not JSON but key #{json_key} requested") from e
    if json_key not in obj:
        raise RuntimeError(f"AWS SM secret missing key {json_key}")
    return str(obj[json_key])


# Friendly paste formats accepted from Settings UI → normalized wire refs
_HVK_PASTE = re.compile(
    r"^(?:vaultkv|hvk|vault)://(?P<path>[^#\s]+)(?:#(?P<field>[^\s]+))?$",
    re.I,
)
_AWSSM_PASTE = re.compile(
    r"^(?:awssm|sm|secretsmanager)://(?P<id>[^#\s]+)(?:#(?P<field>[^\s]+))?$",
    re.I,
)


def normalize_secret_input(value: Optional[str]) -> Optional[str]:
    """Normalize vault:// and awssm:// pastes into stable wire refs.

    Plaintext and existing enc:/ref: values pass through unchanged.
    """
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if is_external_value(text) or text.startswith("enc:v1:"):
        return text
    m = _HVK_PASTE.match(text)
    if m:
        path = m.group("path").lstrip("/")
        field = m.group("field")
        return f"{HVK_PREFIX}{path}" + (f"#{field}" if field else "")
    m = _AWSSM_PASTE.match(text)
    if m:
        sid = m.group("id")
        field = m.group("field")
        return f"{AWSSM_PREFIX}{sid}" + (f"#{field}" if field else "")
    return text


def resolve_external(value: str) -> str:
    """Decrypt or resolve an external wire value to plaintext."""
    if value.startswith(HVT_PREFIX):
        return transit_decrypt(value)
    if value.startswith(HVK_PREFIX):
        return resolve_hvk_ref(value)
    if value.startswith(AWSSM_PREFIX):
        return resolve_awssm_ref(value)
    raise ValueError("not an external secret value")


def external_status() -> Dict[str, Any]:
    return {
        "hashicorp_vault": {
            "addr_configured": bool(vault_addr()),
            "token_configured": bool(vault_token()),
            "transit_enabled": transit_enabled(),
            "transit_key": vault_transit_key() if transit_enabled() else None,
            "kv_mount": vault_kv_mount(),
        },
        "aws_secrets_manager": {
            "region": (os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "") or None,
            "boto3_available": True,  # listed in requirements
        },
        "wire_prefixes": {
            "local_fernet": "enc:v1:",
            "hashicorp_transit": HVT_PREFIX,
            "hashicorp_kv_ref": HVK_PREFIX,
            "aws_sm_ref": AWSSM_PREFIX,
        },
    }
