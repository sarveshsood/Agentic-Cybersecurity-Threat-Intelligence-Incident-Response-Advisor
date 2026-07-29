"""Secret helpers: resolve keys (DB → env), detect placeholders, sync .env safely."""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# UI/settings field → process env var (bootstrap + optional .env sync)
LLM_KEY_ENV_MAP = {
    "anthropic_api_key": "ANTHROPIC_API_KEY",
    "openai_api_key": "OPENAI_API_KEY",
    "gemini_api_key": "GEMINI_API_KEY",
    "groq_api_key": "GROQ_API_KEY",
}

# Threat intel keys — also syncable to .env from Settings UI
TI_KEY_ENV_MAP = {
    "abuseipdb_key": "ABUSEIPDB_API_KEY",
    "virustotal_key": "VIRUSTOTAL_API_KEY",
    "greynoise_key": "GREYNOISE_API_KEY",
    "threatfox_key": "THREATFOX_API_KEY",
    "otx_api_key": "OTX_API_KEY",
    "shodan_api_key": "SHODAN_API_KEY",
    "cohere_api_key": "COHERE_API_KEY",
}

# Notifications / webhooks treated as secrets when syncing
NOTIFICATION_KEY_ENV_MAP = {
    "slack_webhook_url": "SLACK_WEBHOOK_URL",
}

# Non-secret operational settings (Admin → Settings + bootstrap from .env)
OPS_SETTINGS_ENV_MAP = {
    "llm_provider": "LLM_PROVIDER",
    "llm_model": "LLM_MODEL",
    "llm_temperature": "LLM_TEMPERATURE",
    "llm_token_budget_monthly": "LLM_TOKEN_BUDGET_MONTHLY",
    "grounding_threshold": "GROUNDING_THRESHOLD",
    "hitl_severity_min": "HITL_SEVERITY_MIN",
    "auto_approve_grounding_min": "AUTO_APPROVE_GROUNDING_MIN",
    "correlation_window_minutes": "CORRELATION_WINDOW_MINUTES",
    "email_alerts_to": "EMAIL_ALERTS_TO",
    "session_timeout_hours": "SESSION_TIMEOUT_HOURS",
    "failed_login_lockout": "FAILED_LOGIN_LOCKOUT",
    "incident_retention_days": "INCIDENT_RETENTION_DAYS",
    "enrichment_cache_ttl_hours": "ENRICHMENT_CACHE_TTL_HOURS",
    "cohere_rerank_enabled": "ACTIRA_COHERE_RERANK",
}

_VALID_PROVIDERS = frozenset({"openai", "anthropic", "gemini", "groq"})
_VALID_SEVERITIES = frozenset({"low", "medium", "high", "critical"})

_PLACEHOLDER_EXACT = {
    "",
    "...",
    "sk-...",
    "sk-ant-...",
    "gsk_...",
    "your-key-here",
    "changeme",
    "replace-me",
}


def is_real_secret(value: Optional[str]) -> bool:
    """True if value looks like a configured secret (not empty/placeholder)."""
    if value is None:
        return False
    v = str(value).strip()
    if not v or v in _PLACEHOLDER_EXACT:
        return False
    # Trailing "..." / incomplete placeholders from templates
    if v.endswith("...") and len(v) < 20:
        return False
    # Inline comment glued to value (broken .env): treat as invalid if no real key shape
    if "#" in v and not v.startswith("sk-") and not v.startswith("gsk_"):
        v = v.split("#", 1)[0].strip()
        if not v or v in _PLACEHOLDER_EXACT:
            return False
    # Slack field must be a real Incoming Webhook — not tokens / placeholders
    if "hooks.slack.com" in v.lower() or v.lower().startswith(
            ("xoxb-", "xoxp-", "xoxe-", "xoxa-", "xoxr-", "xapp-", "xoxs-")
    ) or ".xoxp-" in v.lower() or ".xoxb-" in v.lower():
        return is_real_slack_webhook(v)
    return True


def is_real_slack_webhook(value: Optional[str]) -> bool:
    """True for a real Slack Incoming Webhook URL (not SMOKE/TEST placeholders)."""
    return diagnose_slack_webhook(value)["ok"]


def diagnose_slack_webhook(value: Optional[str]) -> Dict[str, Any]:
    """Explain why a Slack credential is/isn't a valid Incoming Webhook URL.

    ACTIRA posts via Incoming Webhooks only (HTTP POST to hooks.slack.com).
    OAuth / bot / user tokens (xoxb-, xoxp-, xoxe-…) are NOT accepted here.
    """
    if value is None:
        return {
            "ok": False,
            "error": "empty",
            "message": "No Slack webhook provided.",
        }
    v = clean_secret(value)
    if not v:
        return {
            "ok": False,
            "error": "empty",
            "message": "No Slack webhook provided.",
        }

    lower = v.lower()

    # Common mistake: pasting a Slack API/OAuth token instead of webhook URL
    token_prefixes = (
        "xoxb-", "xoxp-", "xoxe-", "xoxa-", "xoxr-", "xapp-", "xoxs-",
    )
    if lower.startswith(token_prefixes) or ".xoxp-" in lower or ".xoxb-" in lower:
        return {
            "ok": False,
            "error": "oauth_token_not_webhook",
            "message": (
                "That looks like a Slack API/OAuth token (xox…), not an Incoming Webhook URL. "
                "ACTIRA needs a webhook URL starting with https://hooks.slack.com/services/T…/B…/… "
                "Create one at https://api.slack.com/messaging/webhooks (pick a channel → copy Webhook URL)."
            ),
        }

    if "hooks.slack.com" not in lower:
        return {
            "ok": False,
            "error": "not_webhook_url",
            "message": (
                "Not a Slack Incoming Webhook URL. Paste the full URL from Slack: "
                "https://hooks.slack.com/services/T…/B…/… "
                "(https://api.slack.com/messaging/webhooks)."
            ),
        }

    if "hooks.slack.com/services/" not in lower:
        return {
            "ok": False,
            "error": "bad_webhook_path",
            "message": (
                "Webhook URL must include /services/T…/B…/…. "
                "Copy the full Incoming Webhook URL from Slack."
            ),
        }

    bad_tokens = (
        "/smoke/", "/test/", "/xxx", "/your-", "example",
        "replace", "changeme", "dummy", "placeholder",
    )
    if any(t in lower for t in bad_tokens):
        return {
            "ok": False,
            "error": "placeholder_webhook",
            "message": (
                "That webhook looks like a placeholder (SMOKE/TEST/…). "
                "Create a real Incoming Webhook in your Slack workspace."
            ),
        }

    try:
        after = v.split("hooks.slack.com/services/", 1)[1]
        parts = [p for p in after.split("/") if p]
        if len(parts) < 3:
            return {
                "ok": False,
                "error": "incomplete_webhook",
                "message": (
                    "Webhook URL is incomplete. Expected three path parts after /services/ "
                    "(T…/B…/secret)."
                ),
            }
        if len(parts[0]) < 8 or len(parts[1]) < 8 or len(parts[2]) < 16:
            return {
                "ok": False,
                "error": "incomplete_webhook",
                "message": (
                    "Webhook URL segments look too short — copy the full URL from Slack "
                    "(hooks.slack.com/services/T…/B…/…)."
                ),
            }
    except Exception:
        return {
            "ok": False,
            "error": "invalid_webhook",
            "message": "Could not parse Slack webhook URL.",
        }

    if not lower.startswith("https://"):
        return {
            "ok": False,
            "error": "not_https",
            "message": "Webhook URL must start with https://",
        }

    return {"ok": True, "error": None, "message": "Valid Incoming Webhook URL."}


def clean_secret(value: Optional[str]) -> str:
    """Strip whitespace and accidental trailing #comments from a secret value."""
    if not value:
        return ""
    v = str(value).strip()
    # Only strip inline comments when they look like .env comment glue (space or mid-key mishap)
    if " #" in v:
        v = v.split(" #", 1)[0].strip()
    return v


def _maybe_decrypt_secret(value: Any) -> str:
    """Decrypt vault ciphertext if present; otherwise clean plaintext."""
    if value is None:
        return ""
    try:
        from backend.secret_vault import decrypt_secret, is_encrypted_value

        if is_encrypted_value(value):
            plain = decrypt_secret(value)
            return clean_secret(plain)
    except Exception:
        # Wrong key / corrupt — treat as unset rather than use ciphertext as key
        return ""
    return clean_secret(value)


def resolve_secret(settings: Optional[Dict[str, Any]], field: str, env_var: str) -> str:
    """Prefer MongoDB/settings value, then environment. Never returns placeholders.

    Values may be vault ciphertext (``enc:v1:…``); they are decrypted for runtime.
    """
    if settings:
        db_val = _maybe_decrypt_secret(settings.get(field))
        if is_real_secret(db_val):
            return db_val
    env_val = clean_secret(os.environ.get(env_var, ""))
    if is_real_secret(env_val):
        return env_val
    return ""


def resolve_llm_keys(settings: Optional[Dict[str, Any]] = None) -> Dict[str, str]:
    """Return {anthropic, openai, gemini, groq} API keys for runtime use."""
    return {
        "anthropic": resolve_secret(settings, "anthropic_api_key", "ANTHROPIC_API_KEY"),
        "openai": resolve_secret(settings, "openai_api_key", "OPENAI_API_KEY"),
        "gemini": resolve_secret(settings, "gemini_api_key", "GEMINI_API_KEY"),
        "groq": resolve_secret(settings, "groq_api_key", "GROQ_API_KEY"),
    }


def has_secret(settings: Optional[Dict[str, Any]], field: str, env_var: Optional[str] = None) -> bool:
    if settings:
        raw = settings.get(field)
        try:
            from backend.secret_vault import is_encrypted_value

            if is_encrypted_value(raw):
                # Encrypted blob implies a real secret was stored (even if key rotated)
                if raw and len(str(raw)) > 20:
                    # Prefer decrypt check so wrong-key doesn't false-positive forever
                    plain = _maybe_decrypt_secret(raw)
                    if is_real_secret(plain):
                        return True
                    # Ciphertext present but undecryptable — still count as configured
                    # only if env cannot supply; treat as has_secret for UI "configured"
                    return True
        except Exception:
            pass
        if is_real_secret(_maybe_decrypt_secret(raw) if raw else ""):
            return True
        if is_real_secret(raw):
            return True
    if env_var and is_real_secret(os.environ.get(env_var, "")):
        return True
    return False


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or str(raw).strip() == "":
        return default
    try:
        return float(str(raw).strip())
    except (TypeError, ValueError):
        return default


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or str(raw).strip() == "":
        return default
    try:
        return int(float(str(raw).strip()))
    except (TypeError, ValueError):
        return default


def _secret_or_none(env_name: str) -> Optional[str]:
    v = clean_secret(os.environ.get(env_name, ""))
    return v if is_real_secret(v) else None


def bootstrap_settings_kwargs() -> Dict[str, Any]:
    """Build Settings constructor kwargs from process env (first-boot seed).

    Used when MongoDB has no settings document yet. After seed, Admin → Settings
    owns the values; secrets still fall back to env via resolve_secret().
    """
    provider = (os.environ.get("LLM_PROVIDER") or "anthropic").strip().lower()
    if provider not in _VALID_PROVIDERS:
        provider = "anthropic"

    hitl = (os.environ.get("HITL_SEVERITY_MIN") or "critical").strip().lower()
    if hitl not in _VALID_SEVERITIES:
        hitl = "critical"

    email = (os.environ.get("EMAIL_ALERTS_TO") or "").strip() or None

    return {
        "llm_provider": provider,
        "llm_model": (os.environ.get("LLM_MODEL") or "claude-sonnet-5").strip() or "claude-sonnet-5",
        "llm_temperature": _env_float("LLM_TEMPERATURE", 0.2),
        "llm_token_budget_monthly": _env_int("LLM_TOKEN_BUDGET_MONTHLY", 0),
        "anthropic_api_key": _secret_or_none("ANTHROPIC_API_KEY"),
        "openai_api_key": _secret_or_none("OPENAI_API_KEY"),
        "gemini_api_key": _secret_or_none("GEMINI_API_KEY"),
        "groq_api_key": _secret_or_none("GROQ_API_KEY"),
        "grounding_threshold": _env_float("GROUNDING_THRESHOLD", 0.7),
        "hitl_severity_min": hitl,
        "auto_approve_grounding_min": _env_float("AUTO_APPROVE_GROUNDING_MIN", 0.9),
        "correlation_window_minutes": _env_int("CORRELATION_WINDOW_MINUTES", 30),
        "abuseipdb_key": _secret_or_none("ABUSEIPDB_API_KEY"),
        "virustotal_key": _secret_or_none("VIRUSTOTAL_API_KEY"),
        "greynoise_key": _secret_or_none("GREYNOISE_API_KEY"),
        "threatfox_key": _secret_or_none("THREATFOX_API_KEY"),
        "otx_api_key": _secret_or_none("OTX_API_KEY"),
        "shodan_api_key": _secret_or_none("SHODAN_API_KEY"),
        "cohere_api_key": _secret_or_none("COHERE_API_KEY"),
        "cohere_rerank_enabled": (
                (os.environ.get("ACTIRA_COHERE_RERANK") or "1").strip().lower()
                not in ("0", "false", "off", "no", "disabled")
        ),
        "slack_webhook_url": _secret_or_none("SLACK_WEBHOOK_URL"),
        "email_alerts_to": email,
        "session_timeout_hours": _env_int("SESSION_TIMEOUT_HOURS", 24),
        "failed_login_lockout": _env_int("FAILED_LOGIN_LOCKOUT", 5),
        "incident_retention_days": _env_int("INCIDENT_RETENTION_DAYS", 90),
        "enrichment_cache_ttl_hours": _env_int("ENRICHMENT_CACHE_TTL_HOURS", 24),
    }


def _apply_env_file_updates(env_path: Path, updates: Dict[str, str]) -> None:
    """Rewrite or append KEY=value lines in an .env file."""
    if not updates:
        return

    if env_path.exists():
        text = env_path.read_text(encoding="utf-8")
    else:
        text = ""

    lines = text.splitlines()
    seen = set()
    out = []
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in line:
            out.append(line)
            continue
        key, _, _rest = line.partition("=")
        key = key.strip()
        if key in updates:
            out.append(f"{key}={updates[key]}")
            seen.add(key)
        else:
            out.append(line)

    for key, val in updates.items():
        if key not in seen:
            out.append(f"{key}={val}")

    env_path.write_text("\n".join(out) + "\n", encoding="utf-8")


def sync_keys_to_env(
        env_path: Path,
        settings: Dict[str, Any],
        include_ti: bool = True,
        include_ops: bool = True,
) -> None:
    """Update backend/.env when admin saves Settings.

    Syncs:
      - LLM API keys (always when real)
      - Threat-intel keys when include_ti=True
      - Slack webhook when real
      - Operational non-secret settings when include_ops=True

    Only writes secrets that are present and real. Never logs values.
    """
    if not env_path:
        return

    maps = dict(LLM_KEY_ENV_MAP)
    maps.update(NOTIFICATION_KEY_ENV_MAP)
    if include_ti:
        maps.update(TI_KEY_ENV_MAP)

    updates: Dict[str, str] = {}
    for field, env_name in maps.items():
        val = clean_secret(settings.get(field))
        if is_real_secret(val):
            updates[env_name] = val
            os.environ[env_name] = val

    if include_ops:
        for field, env_name in OPS_SETTINGS_ENV_MAP.items():
            if field not in settings or settings.get(field) is None:
                continue
            val = settings.get(field)
            # Skip empty email so we don't wipe with blank
            if field == "email_alerts_to" and not str(val or "").strip():
                continue
            text = str(val).strip() if not isinstance(val, bool) else str(val)
            updates[env_name] = text
            os.environ[env_name] = text

    _apply_env_file_updates(env_path, updates)


def sync_llm_keys_to_env(env_path: Path, settings: Dict[str, Any]) -> None:
    """Backward-compatible alias — syncs LLM + TI keys + ops settings + Slack.

    A-S3: In non-dev ENV, skip writing secrets to disk (process env still updated
    inside sync_keys_to_env via os.environ for the current process only when
    SYNC_SECRETS_TO_ENV is forced). Default: no .env secret write outside dev.
    """
    env = (os.environ.get("ENV") or "dev").strip().lower()
    force = (os.environ.get("SYNC_SECRETS_TO_ENV") or "").strip().lower() in (
        "1", "true", "yes", "on",
    )
    if env not in ("dev", "test", "local", "") and not force:
        logger.info(
            "Skipping .env secret sync (ENV=%s). Set SYNC_SECRETS_TO_ENV=true to force.",
            env,
        )
        # Still push non-persistent process env for LLM clients in this process
        try:
            for field, env_name in {**LLM_KEY_ENV_MAP, **TI_KEY_ENV_MAP, **NOTIFICATION_KEY_ENV_MAP}.items():
                val = clean_secret(settings.get(field)) if isinstance(settings, dict) else ""
                if is_real_secret(val):
                    os.environ[env_name] = val
        except Exception as e:
            logger.warning("process-env secret apply failed: %s", e)
        return
    sync_keys_to_env(env_path, settings, include_ti=True, include_ops=True)


# Field → env map for all secret scopes (clear + resolve)
ALL_SECRET_ENV_MAP = {
    **LLM_KEY_ENV_MAP,
    **TI_KEY_ENV_MAP,
    **NOTIFICATION_KEY_ENV_MAP,
}

TI_SECRET_FIELDS = tuple(TI_KEY_ENV_MAP.keys())
LLM_SECRET_FIELDS = tuple(LLM_KEY_ENV_MAP.keys())
NOTIFICATION_SECRET_FIELDS = tuple(NOTIFICATION_KEY_ENV_MAP.keys())


def clear_secrets_from_env(env_path: Path, fields: list[str]) -> list[str]:
    """Blank selected secret fields in process env and backend/.env.

    Returns the list of env var names that were cleared.
    """
    cleared_env: list[str] = []
    updates: Dict[str, str] = {}
    for field in fields:
        env_name = ALL_SECRET_ENV_MAP.get(field)
        if not env_name:
            continue
        if env_name in os.environ:
            os.environ.pop(env_name, None)
        updates[env_name] = ""
        cleared_env.append(env_name)
    if updates and env_path:
        _apply_env_file_updates(env_path, updates)
    return cleared_env


def redact_for_log(value: str, keep: int = 4) -> str:
    """Safe fragment for logs (never full secret)."""
    v = clean_secret(value)
    if not v:
        return "<empty>"
    if len(v) <= keep * 2:
        return "***"
    return f"{v[:keep]}…{v[-keep:]} (len={len(v)})"
