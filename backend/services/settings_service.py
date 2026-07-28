"""Settings domain service — public payloads, updates, profiles, alert tests."""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Literal, Optional

from fastapi import HTTPException
from pydantic import BaseModel, ValidationError

from backend.core import services as svc
from backend.database import ROOT_DIR, db
from backend.models import SECRET_SETTINGS_FIELDS, SETTINGS_CLEAR_SENTINEL, Settings
from backend.secret_vault import encrypt_settings_doc
from backend.secrets_util import (
    LLM_SECRET_FIELDS,
    NOTIFICATION_SECRET_FIELDS,
    TI_SECRET_FIELDS,
    clean_secret,
    clear_secrets_from_env,
    diagnose_slack_webhook,
    has_secret,
    is_real_slack_webhook,
    sync_llm_keys_to_env,
)

logger = logging.getLogger("actira")

# Production-leaning recommended ops (aligned with memory/WEEKLY_DISCUSSIONS.md).
RECOMMENDED_SETTINGS_OPS = {
    "llm_provider": "anthropic",
    "llm_model": "claude-sonnet-4-6",
    "llm_temperature": 0.15,
    "llm_token_budget_monthly": 500_000,
    "llm_fallback_enabled": True,
    "llm_fallback_provider": "anthropic",
    "grounding_threshold": 0.75,
    "hitl_severity_min": "high",
    "auto_approve_grounding_min": 0.92,
    "correlation_window_minutes": 45,
    "session_timeout_hours": 8,
    "failed_login_lockout": 5,
    "incident_retention_days": 180,
    "enrichment_cache_ttl_hours": 12,
    # Platform / enterprise
    "max_enrich_iocs": 50,
    "enrich_concurrency": 8,
    "parse_concurrency": 4,
    "ti_http_timeout": 10.0,
    "ti_http_retries": 3,
    "ti_http_backoff_base": 0.4,
    "ti_circuit_failures": 5,
    "ti_circuit_cooldown_seconds": 60,
    "log_format": "json",
    "log_file_format": "json",
    "log_level": "INFO",
    "log_to_file": True,
    "log_archive_enabled": True,
    "log_archive_retain_days": 30,
    "job_artifacts_enabled": True,
    "job_payload_retain": False,
    "job_artifacts_retain_hours": 168,
    "audit_worm_enabled": True,
    "job_broker_enabled": False,
    "job_broker_queue": "actira.jobs",
}


class SettingsResetBody(BaseModel):
    keep_secrets: bool = True


class SettingsProfileBody(BaseModel):
    profile: Literal["recommended", "factory"] = "recommended"
    keep_secrets: bool = True


class ClearSecretsBody(BaseModel):
    scope: Literal["threat_intel", "llm", "notifications", "all", "custom"] = "threat_intel"
    fields: Optional[List[str]] = None
    confirm: bool = False


class TestEmailBody(BaseModel):
    to: Optional[str] = None
    save_recipient: bool = False


class TestSlackBody(BaseModel):
    webhook_url: Optional[str] = None
    save_webhook: bool = False


async def public_settings_payload() -> Dict[str, Any]:
    """Admin UI settings view — never includes raw secret values."""
    s = await svc.get_settings()
    if "email_alerts_to" in s:
        email_val = (s.get("email_alerts_to") or "").strip() or None
    else:
        email_val = (os.environ.get("EMAIL_ALERTS_TO") or "").strip() or None
    payload = {
        "llm_provider": s.get("llm_provider"),
        "llm_model": s.get("llm_model"),
        "llm_temperature": s.get("llm_temperature", 0.2),
        "llm_token_budget_monthly": s.get("llm_token_budget_monthly", 0),
        "llm_fallback_enabled": bool(s.get("llm_fallback_enabled", True)),
        "llm_fallback_provider": s.get("llm_fallback_provider") or "anthropic",
        "grounding_threshold": s.get("grounding_threshold"),
        "hitl_severity_min": s.get("hitl_severity_min"),
        "auto_approve_grounding_min": s.get("auto_approve_grounding_min", 0.9),
        "correlation_window_minutes": s.get("correlation_window_minutes", 30),
        "session_timeout_hours": s.get("session_timeout_hours", 24),
        "failed_login_lockout": s.get("failed_login_lockout", 5),
        "incident_retention_days": s.get("incident_retention_days", 90),
        "enrichment_cache_ttl_hours": s.get("enrichment_cache_ttl_hours", 24),
        "cohere_rerank_enabled": bool(s.get("cohere_rerank_enabled", True)),
        "llm_technique_refine": bool(s.get("llm_technique_refine", False)),
        "llm_redact_iocs": bool(s.get("llm_redact_iocs", False)),
        "has_anthropic": has_secret(s, "anthropic_api_key", "ANTHROPIC_API_KEY"),
        "has_openai": has_secret(s, "openai_api_key", "OPENAI_API_KEY"),
        "has_gemini": has_secret(s, "gemini_api_key", "GEMINI_API_KEY"),
        "has_groq": has_secret(s, "groq_api_key", "GROQ_API_KEY"),
        "has_abuseipdb": has_secret(s, "abuseipdb_key", "ABUSEIPDB_API_KEY"),
        "has_virustotal": has_secret(s, "virustotal_key", "VIRUSTOTAL_API_KEY"),
        "has_greynoise": has_secret(s, "greynoise_key", "GREYNOISE_API_KEY"),
        "has_threatfox": has_secret(s, "threatfox_key", "THREATFOX_API_KEY"),
        "has_otx": has_secret(s, "otx_api_key", "OTX_API_KEY"),
        "has_shodan": has_secret(s, "shodan_api_key", "SHODAN_API_KEY"),
        "has_cohere": has_secret(s, "cohere_api_key", "COHERE_API_KEY"),
        "has_slack": is_real_slack_webhook(s.get("slack_webhook_url"))
        or is_real_slack_webhook(os.environ.get("SLACK_WEBHOOK_URL", "")),
        "email_alerts_to": email_val,
        "has_email": bool(email_val),
    }
    try:
        from backend.platform_settings import public_platform_payload

        payload.update(public_platform_payload(s))
    except Exception:
        pass
    try:
        from backend.llm_usage import usage_snapshot

        payload["llm_usage"] = await usage_snapshot(s, db)
    except Exception:
        payload["llm_usage"] = None
    try:
        from backend.secret_vault import vault_status

        payload["secrets_vault"] = vault_status()
    except Exception:
        payload["secrets_vault"] = {"enabled": False}
    try:
        from backend.llm_provider import last_effective_llm

        eff = last_effective_llm()
        payload["llm_effective_provider"] = eff.get("provider")
        payload["llm_effective_model"] = eff.get("model")
        payload["llm_via_fallback"] = bool(eff.get("via_fallback"))
        payload["llm_effective_ts"] = eff.get("ts")
    except Exception:
        payload["llm_effective_provider"] = None
        payload["llm_effective_model"] = None
        payload["llm_via_fallback"] = False
        payload["llm_effective_ts"] = None
    for secret_key in SECRET_SETTINGS_FIELDS:
        payload.pop(secret_key, None)
    return payload


def _validate_llm_selection(doc: Dict[str, Any]) -> None:
    """Validate provider; allow custom model IDs (catalog is a convenience list, not a hard gate)."""
    from backend.llm_provider import PROVIDER_MODELS, is_known_model

    provider = str(doc.get("llm_provider") or "anthropic").strip().lower()
    model = str(doc.get("llm_model") or "").strip()
    if provider not in PROVIDER_MODELS:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown llm_provider '{provider}'. Allowed: {', '.join(PROVIDER_MODELS)}",
        )
    if not model:
        raise HTTPException(status_code=422, detail="llm_model is required")
    # Unknown model IDs are allowed so Settings can pin vendor aliases / new IDs
    # without a code deploy — catalog is the curated UX list, not a hard reject list.
    if not is_known_model(provider, model):
        logger.info(
            "settings: custom llm_model %r for provider %s (not in catalog allow-list)",
            model,
            provider,
        )
    fb = doc.get("llm_fallback_provider")
    if fb and str(fb).strip().lower() not in ("", "none", *PROVIDER_MODELS.keys()):
        raise HTTPException(
            status_code=422,
            detail=f"Unknown llm_fallback_provider '{fb}'",
        )


async def update_settings(body: Dict[str, Any], user: dict) -> Dict[str, Any]:
    existing = await svc.get_settings()
    doc = svc.merge_settings_update(existing, body)
    _validate_llm_selection(doc)
    keys_touched = [
        f
        for f in SECRET_SETTINGS_FIELDS
        if f in body
        and str(body.get(f) or "").strip()
        and str(body.get(f) or "").strip() != SETTINGS_CLEAR_SENTINEL
    ]
    cleared = [
        f
        for f in SECRET_SETTINGS_FIELDS
        if f in (body.get("clear_fields") or body.get("clear_secrets") or [])
        or str(body.get(f) or "").strip() == SETTINGS_CLEAR_SENTINEL
    ]
    if cleared:
        try:
            clear_secrets_from_env(ROOT_DIR / ".env", cleared)
        except OSError as e:
            logger.warning("Could not clear secrets from .env: %s", e)
    await svc.persist_settings(
        doc,
        user,
        "settings.update",
        {
            "llm_model": doc.get("llm_model"),
            "llm_provider": doc.get("llm_provider"),
            "keys_updated": keys_touched,
            "keys_cleared": cleared,
        },
    )
    return {
        "ok": True,
        "llm_provider": doc.get("llm_provider"),
        "llm_model": doc.get("llm_model"),
    }


async def reset_settings(opts: SettingsResetBody, user: dict) -> Dict[str, Any]:
    existing = await svc.get_settings()
    doc = Settings().model_dump()
    if opts.keep_secrets:
        for key_field in SECRET_SETTINGS_FIELDS:
            if existing.get(key_field):
                doc[key_field] = existing[key_field]
    else:
        for key_field in SECRET_SETTINGS_FIELDS:
            doc[key_field] = None
    doc["id"] = "global"
    doc["email_alerts_to"] = None
    os.environ.pop("EMAIL_ALERTS_TO", None)
    await db.settings.update_one(
        {"id": "global"}, {"$set": encrypt_settings_doc(doc)}, upsert=True
    )
    try:
        sync_llm_keys_to_env(ROOT_DIR / ".env", doc)
        from backend.secrets_util import _apply_env_file_updates

        _apply_env_file_updates(ROOT_DIR / ".env", {"EMAIL_ALERTS_TO": ""})
    except OSError as e:
        logger.warning("Could not sync reset settings to .env: %s", e)
    await svc.audit(
        user,
        "settings.reset",
        "settings",
        "global",
        {"keep_secrets": opts.keep_secrets},
    )
    return {"ok": True, "keep_secrets": opts.keep_secrets}


async def list_profiles() -> Dict[str, Any]:
    factory = Settings().model_dump()
    for f in SECRET_SETTINGS_FIELDS:
        factory.pop(f, None)
    factory.pop("email_alerts_to", None)
    return {
        "factory": factory,
        "recommended": dict(RECOMMENDED_SETTINGS_OPS),
        "notes": {
            "recommended": (
                "Anthropic + Sonnet for prompt-cache friendly multi-step playbooks; "
                "stricter grounding/HiTL; 8h sessions; 180d retention. Secrets unchanged."
            ),
            "factory": (
                "Pydantic model defaults (demo-friendly). Secrets kept unless keep_secrets=false."
            ),
        },
    }


async def apply_profile(body: SettingsProfileBody, user: dict) -> Dict[str, Any]:
    existing = await svc.get_settings()
    if body.profile == "factory":
        doc = Settings().model_dump()
        doc["email_alerts_to"] = None
        os.environ.pop("EMAIL_ALERTS_TO", None)
    else:
        doc = {**{k: v for k, v in existing.items() if k != "_id"}}
        doc.update(RECOMMENDED_SETTINGS_OPS)
        if not (doc.get("email_alerts_to") or "").strip():
            doc["email_alerts_to"] = existing.get("email_alerts_to")

    if body.keep_secrets:
        for key_field in SECRET_SETTINGS_FIELDS:
            if existing.get(key_field):
                doc[key_field] = existing[key_field]
    else:
        for key_field in SECRET_SETTINGS_FIELDS:
            doc[key_field] = None
        try:
            clear_secrets_from_env(ROOT_DIR / ".env", list(SECRET_SETTINGS_FIELDS))
        except OSError as e:
            logger.warning("Could not clear secrets from .env: %s", e)

    try:
        doc = Settings(**{k: v for k, v in doc.items() if k != "id"}).model_dump()
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=e.errors()) from e
    doc["id"] = "global"
    if body.profile == "factory":
        doc["email_alerts_to"] = None

    await db.settings.update_one(
        {"id": "global"}, {"$set": encrypt_settings_doc(doc)}, upsert=True
    )
    try:
        sync_llm_keys_to_env(ROOT_DIR / ".env", doc)
        if body.profile == "factory":
            from backend.secrets_util import _apply_env_file_updates

            _apply_env_file_updates(ROOT_DIR / ".env", {"EMAIL_ALERTS_TO": ""})
    except OSError as e:
        logger.warning("Could not sync profile settings to .env: %s", e)
    await svc.audit(
        user,
        "settings.apply_profile",
        "settings",
        "global",
        {"profile": body.profile, "keep_secrets": body.keep_secrets},
    )
    return {
        "ok": True,
        "profile": body.profile,
        "keep_secrets": body.keep_secrets,
        "applied": dict(RECOMMENDED_SETTINGS_OPS) if body.profile == "recommended" else "factory",
    }


async def clear_secrets(body: ClearSecretsBody, user: dict) -> Dict[str, Any]:
    if not body.confirm:
        raise HTTPException(
            status_code=400,
            detail="Set confirm=true to clear secrets (destructive).",
        )

    if body.scope == "threat_intel":
        fields = list(TI_SECRET_FIELDS)
    elif body.scope == "llm":
        fields = list(LLM_SECRET_FIELDS)
    elif body.scope == "notifications":
        fields = list(NOTIFICATION_SECRET_FIELDS)
    elif body.scope == "all":
        fields = list(SECRET_SETTINGS_FIELDS)
    else:
        fields = [f for f in (body.fields or []) if f in SECRET_SETTINGS_FIELDS]
        if not fields:
            raise HTTPException(
                400, "scope=custom requires fields with valid secret field names"
            )

    existing = await svc.get_settings()
    doc = {**{k: v for k, v in existing.items() if k != "_id"}}
    for f in fields:
        doc[f] = None
    doc["id"] = "global"
    await db.settings.update_one(
        {"id": "global"}, {"$set": encrypt_settings_doc(doc)}, upsert=True
    )

    cleared_env: list[str] = []
    try:
        cleared_env = clear_secrets_from_env(ROOT_DIR / ".env", fields)
    except OSError as e:
        logger.warning("Could not clear secrets from .env: %s", e)

    await svc.audit(
        user,
        "settings.clear_secrets",
        "settings",
        "global",
        {"scope": body.scope, "fields": fields, "env_cleared": cleared_env},
    )
    return {
        "ok": True,
        "scope": body.scope,
        "cleared_fields": fields,
        "env_cleared": cleared_env,
        "note": "Threat intel will use mock enrichment until new keys are saved.",
    }


def llm_catalog_payload() -> Dict[str, Any]:
    from backend.llm_provider import llm_catalog

    return llm_catalog()


async def test_llm(user: dict) -> Dict[str, Any]:
    """Short connectivity probe for the configured primary LLM (admin)."""
    import time

    from backend.llm_provider import call_llm, LLMCallError, LLMConfigError

    s = await svc.get_settings()
    provider = str(s.get("llm_provider") or "anthropic")
    model = str(s.get("llm_model") or "claude-sonnet-4-6")
    t0 = time.perf_counter()
    try:
        text, eff_p, eff_m = await call_llm(
            system="You are a health-check probe. Reply with exactly: ok",
            user="ping",
            provider=provider,
            model=model,
            settings=s,
            json_mode=False,
            use_prompt_cache=False,
        )
        ms = int((time.perf_counter() - t0) * 1000)
        await svc.audit(
            user,
            "settings.test_llm",
            "settings",
            "global",
            {"ok": True, "provider": eff_p, "model": eff_m, "latency_ms": ms},
        )
        return {
            "ok": True,
            "provider": eff_p,
            "model": eff_m,
            "latency_ms": ms,
            "preview": (text or "")[:120],
        }
    except (LLMConfigError, LLMCallError, Exception) as e:
        ms = int((time.perf_counter() - t0) * 1000)
        logger.warning("test_llm failed: %s", e)
        try:
            await svc.audit(
                user,
                "settings.test_llm",
                "settings",
                "global",
                {"ok": False, "error": type(e).__name__, "latency_ms": ms},
            )
        except Exception:
            pass
        raise HTTPException(
            status_code=502,
            detail={
                "ok": False,
                "error": type(e).__name__,
                "message": str(e) or type(e).__name__,
                "provider": provider,
                "model": model,
                "latency_ms": ms,
            },
        ) from e


async def email_status() -> Dict[str, Any]:
    from backend.notifications import (
        email_transport_status,
        list_outbox,
        resolve_alert_recipients,
        smtp_status,
    )

    s = await svc.get_settings()
    recipients = resolve_alert_recipients(s)
    transport = email_transport_status()
    return {
        "smtp": smtp_status(),
        "transport": transport,
        "recipients": recipients,
        "email_alerts_to": recipients[0]
        if len(recipients) == 1
        else (", ".join(recipients) if recipients else None),
        "ready": bool(recipients),
        "requires_smtp": False,
        "outbox_recent": list_outbox(limit=5),
    }


async def email_outbox(limit: int = 20) -> Dict[str, Any]:
    from backend.notifications import list_outbox

    return {"items": list_outbox(limit=limit)}


async def test_email(body: TestEmailBody, user: dict) -> Dict[str, Any]:
    from backend.notifications import (
        email_transport_status,
        list_outbox,
        resolve_alert_recipients,
        send_test_email,
    )

    s = await svc.get_settings()
    to = (body.to or "").strip() or None

    if body.save_recipient and to:
        s["email_alerts_to"] = to
        await db.settings.update_one(
            {"id": "global"},
            {"$set": {"email_alerts_to": to}},
            upsert=True,
        )
        try:
            sync_llm_keys_to_env(ROOT_DIR / ".env", {**s, "email_alerts_to": to})
        except OSError as e:
            logger.warning("Could not sync email_alerts_to to .env: %s", e)
        os.environ["EMAIL_ALERTS_TO"] = to
        s = await svc.get_settings()

    result = send_test_email(to=to, settings=s)
    await svc.audit(
        user,
        "settings.test_email",
        "settings",
        "global",
        {
            "ok": result.get("ok"),
            "transport": result.get("transport"),
            "recipients": result.get("recipients"),
            "error": result.get("error"),
            "outbox_id": result.get("outbox_id"),
        },
    )
    if result.get("error") == "no_recipient":
        raise HTTPException(status_code=400, detail=result)

    if not result.get("ok"):
        raise HTTPException(
            status_code=502,
            detail={
                **result,
                "message": (
                    "Remote email delivery failed. An outbox copy was saved under "
                    "backend/data/email_outbox/. Check activation_note / network."
                ),
            },
        )

    needs_activation = bool(result.get("needs_activation"))
    delivered = bool(result.get("delivered", not needs_activation))
    if needs_activation:
        message = (
            f"Activation email queued for {', '.join(result.get('recipients') or [])}. "
            "Open inbox/spam, click FormSubmit's Activate link, then Send test email again."
        )
    else:
        message = (
            f"Test email delivered via {result.get('transport', 'gateway')} "
            f"(SMTP not required). Check inbox and spam."
        )

    return {
        "ok": True,
        "delivered": delivered,
        "needs_activation": needs_activation,
        "message": message,
        "result": result,
        "transport": email_transport_status(),
        "recipients": result.get("recipients") or resolve_alert_recipients(s, to),
        "outbox_recent": list_outbox(limit=3),
        "activation_note": result.get("activation_note"),
    }


async def slack_status() -> Dict[str, Any]:
    from backend.notifications import slack_status as _slack_status

    s = await svc.get_settings()
    return _slack_status(s)


async def test_slack(body: TestSlackBody, user: dict) -> Dict[str, Any]:
    from backend.notifications import resolve_slack_webhook, send_test_slack, slack_status

    s = await svc.get_settings()
    webhook = clean_secret(body.webhook_url) if body.webhook_url else ""

    if webhook:
        diag = diagnose_slack_webhook(webhook)
        if not diag.get("ok"):
            raise HTTPException(
                status_code=400,
                detail={
                    "ok": False,
                    "error": diag.get("error") or "invalid_webhook",
                    "message": diag.get("message"),
                    "status": slack_status(s),
                },
            )

    if body.save_webhook and webhook:
        s["slack_webhook_url"] = webhook
        await db.settings.update_one(
            {"id": "global"},
            {
                "$set": encrypt_settings_doc(
                    {"slack_webhook_url": webhook}, fields=("slack_webhook_url",)
                )
            },
            upsert=True,
        )
        try:
            sync_llm_keys_to_env(ROOT_DIR / ".env", {**s, "slack_webhook_url": webhook})
        except OSError as e:
            logger.warning("Could not sync slack_webhook_url to .env: %s", e)
        os.environ["SLACK_WEBHOOK_URL"] = webhook
        s = await svc.get_settings()

    result = send_test_slack(webhook_url=webhook or None, settings=s)
    await svc.audit(
        user,
        "settings.test_slack",
        "settings",
        "global",
        {
            "ok": result.get("ok"),
            "error": result.get("error"),
            "webhook_configured": result.get("webhook_configured"),
        },
    )

    if not result.get("ok") and result.get("error") in (
        "slack_not_configured",
        "empty",
        "oauth_token_not_webhook",
        "not_webhook_url",
        "bad_webhook_path",
        "placeholder_webhook",
        "incomplete_webhook",
        "invalid_webhook",
        "not_https",
    ):
        raise HTTPException(
            status_code=400,
            detail={
                **result,
                "message": result.get("detail")
                or (
                    "Slack not installed yet. Create an Incoming Webhook at "
                    "https://api.slack.com/messaging/webhooks, paste the URL "
                    "(hooks.slack.com/services/T…/B…/…) in Settings → Notifications, "
                    "then Send test Slack. Do not paste xoxb/xoxp/xoxe tokens."
                ),
                "status": slack_status(s),
            },
        )

    if not result.get("ok"):
        raise HTTPException(
            status_code=502,
            detail={
                **result,
                "message": result.get("detail") or "Slack webhook rejected the message.",
                "status": slack_status(s),
            },
        )

    return {
        "ok": True,
        "message": "Test message posted to Slack channel.",
        "result": result,
        "status": slack_status(s),
        "webhook_configured": bool(resolve_slack_webhook(s)),
    }
