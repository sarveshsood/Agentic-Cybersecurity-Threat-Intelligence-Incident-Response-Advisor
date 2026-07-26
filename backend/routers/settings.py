"""ACTIRA API routes — auto-split from server.py (v1.1 modularization)."""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Literal, Optional

from fastapi import (
    APIRouter, Depends, HTTPException, Body, Query,
)
from pydantic import BaseModel, ValidationError

from backend.auth import (
    get_current_user, require_roles,
)
from backend.core import services as svc
from backend.core.database import ROOT_DIR, db
from backend.models import (
    Settings, SECRET_SETTINGS_FIELDS, SETTINGS_CLEAR_SENTINEL,
)
from backend.secret_vault import encrypt_settings_doc
from backend.secrets_util import (
    has_secret, sync_llm_keys_to_env, clean_secret, clear_secrets_from_env, TI_SECRET_FIELDS, LLM_SECRET_FIELDS,
    NOTIFICATION_SECRET_FIELDS,
    is_real_slack_webhook, diagnose_slack_webhook,
)

logger = logging.getLogger("actira")

router = APIRouter(tags=['settings'])


# ---------- Settings ----------
@router.get("/settings")
async def get_settings(user=Depends(get_current_user)):
    s = await svc.get_settings()
    # email is non-secret. Prefer Mongo when key is present (incl. explicit null after reset);
    # fall back to env only for older docs that never stored the field.
    if "email_alerts_to" in s:
        email_val = (s.get("email_alerts_to") or "").strip() or None
    else:
        email_val = (os.environ.get("EMAIL_ALERTS_TO") or "").strip() or None
    # Never leak secret keys — return booleans only (DB or env bootstrap counts as configured)
    # Explicit allow-list: SECRET_SETTINGS_FIELDS never appear as keys in this payload.
    payload = {
        "llm_provider": s.get("llm_provider"),
        "llm_model": s.get("llm_model"),
        "llm_temperature": s.get("llm_temperature", 0.2),
        "llm_token_budget_monthly": s.get("llm_token_budget_monthly", 0),
        "grounding_threshold": s.get("grounding_threshold"),
        "hitl_severity_min": s.get("hitl_severity_min"),
        "auto_approve_grounding_min": s.get("auto_approve_grounding_min", 0.9),
        "correlation_window_minutes": s.get("correlation_window_minutes", 30),
        "session_timeout_hours": s.get("session_timeout_hours", 24),
        "failed_login_lockout": s.get("failed_login_lockout", 5),
        "incident_retention_days": s.get("incident_retention_days", 90),
        "enrichment_cache_ttl_hours": s.get("enrichment_cache_ttl_hours", 24),
        "cohere_rerank_enabled": bool(s.get("cohere_rerank_enabled", True)),
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
        # Only true for a real Incoming Webhook URL (not OAuth xox… tokens)
        "has_slack": is_real_slack_webhook(s.get("slack_webhook_url"))
                     or is_real_slack_webhook(os.environ.get("SLACK_WEBHOOK_URL", "")),
        "email_alerts_to": email_val,
        "has_email": bool(email_val),
    }
    # A-M1: expose monthly token meter (non-secret)
    try:
        from backend.llm_usage import usage_snapshot
        payload["llm_usage"] = await usage_snapshot(s, db)
    except Exception:
        payload["llm_usage"] = None
    # A-S3: vault diagnostics (no key material)
    try:
        from backend.secret_vault import vault_status
        payload["secrets_vault"] = vault_status()
    except Exception:
        payload["secrets_vault"] = {"enabled": False}
    # Defense-in-depth: strip any secret field names that might slip in later
    for secret_key in SECRET_SETTINGS_FIELDS:
        payload.pop(secret_key, None)
    return payload


@router.put("/settings")
async def update_settings(
        body: Dict[str, Any] = Body(...),
        user=Depends(require_roles("admin")),
):
    """Save Admin → Settings. Blank secret fields keep existing keys; use
    clear_fields / __CLEAR__ / POST /settings/clear-secrets to wipe."""
    existing = await svc.get_settings()
    doc = svc.merge_settings_update(existing, body)
    keys_touched = [
        f for f in SECRET_SETTINGS_FIELDS
        if f in body and str(body.get(f) or "").strip()
           and str(body.get(f) or "").strip() != SETTINGS_CLEAR_SENTINEL
    ]
    cleared = [
        f for f in SECRET_SETTINGS_FIELDS
        if f in (body.get("clear_fields") or body.get("clear_secrets") or [])
           or str(body.get(f) or "").strip() == SETTINGS_CLEAR_SENTINEL
    ]
    # If secrets were cleared via sentinel, also blank .env so has_* / resolve don't re-hydrate
    if cleared:
        try:
            clear_secrets_from_env(ROOT_DIR / ".env", cleared)
        except OSError as e:
            logger.warning("Could not clear secrets from .env: %s", e)
    await svc.persist_settings(
        doc, user, "settings.update",
        {
            "llm_model": doc.get("llm_model"),
            "llm_provider": doc.get("llm_provider"),
            "keys_updated": keys_touched,
            "keys_cleared": cleared,
        },
    )
    return {"ok": True, "llm_provider": doc.get("llm_provider"), "llm_model": doc.get("llm_model")}


@router.post("/settings")
async def update_settings_post(
        body: Dict[str, Any] = Body(...),
        user=Depends(require_roles("admin")),
):
    """Alias for PUT /settings (some proxies mishandle PUT)."""
    return await update_settings(body, user)


class SettingsResetBody(BaseModel):
    """Reset runtime settings to factory defaults.

    keep_secrets=True (default): restore ops/thresholds only; leave API keys & Slack.
    keep_secrets=False: wipe secrets too (keys fall back to backend/.env on next resolve).
    """
    keep_secrets: bool = True


@router.post("/settings/reset")
async def reset_settings(
        body: SettingsResetBody = SettingsResetBody(),
        user=Depends(require_roles("admin")),
):
    """Factory-reset Admin → Settings to Pydantic defaults (not env overrides)."""
    opts = body
    existing = await svc.get_settings()
    # Pure model defaults — independent of current Mongo / .env ops overrides
    doc = Settings().model_dump()
    if opts.keep_secrets:
        for key_field in SECRET_SETTINGS_FIELDS:
            if existing.get(key_field):
                doc[key_field] = existing[key_field]
    else:
        # Explicit wipe of stored secrets; resolve_secret() still falls back to .env
        for key_field in SECRET_SETTINGS_FIELDS:
            doc[key_field] = None
    doc["id"] = "global"
    # Factory ops clear email (non-secret); avoid env fallback re-hydrating old value
    doc["email_alerts_to"] = None
    os.environ.pop("EMAIL_ALERTS_TO", None)
    await db.settings.update_one({"id": "global"}, {"$set": encrypt_settings_doc(doc)}, upsert=True)
    try:
        # Sync ops to .env; only re-write secrets that we still keep
        sync_llm_keys_to_env(ROOT_DIR / ".env", doc)
        # Explicitly blank email in .env (sync skips empty email by design)
        from backend.secrets_util import _apply_env_file_updates
        _apply_env_file_updates(ROOT_DIR / ".env", {"EMAIL_ALERTS_TO": ""})
    except OSError as e:
        logger.warning("Could not sync reset settings to .env: %s", e)
    await svc.audit(
        user, "settings.reset", "settings", "global",
        {"keep_secrets": opts.keep_secrets},
    )
    return {"ok": True, "keep_secrets": opts.keep_secrets}


# Production-leaning recommended ops (aligned with memory/WEEKLY_DISCUSSIONS.md).
# Prefer Anthropic for prompt caching; stricter HiTL/grounding; safer sessions.
RECOMMENDED_SETTINGS_OPS = {
    "llm_provider": "anthropic",
    "llm_model": "claude-sonnet-4-6",
    "llm_temperature": 0.15,
    "llm_token_budget_monthly": 500_000,
    "grounding_threshold": 0.75,
    "hitl_severity_min": "high",
    "auto_approve_grounding_min": 0.92,
    "correlation_window_minutes": 45,
    "session_timeout_hours": 8,
    "failed_login_lockout": 5,
    "incident_retention_days": 180,
    "enrichment_cache_ttl_hours": 12,
}


class SettingsProfileBody(BaseModel):
    """Apply a named ops profile without wiping secrets by default."""
    profile: Literal["recommended", "factory"] = "recommended"
    keep_secrets: bool = True


@router.get("/settings/profiles")
async def settings_profiles(user=Depends(get_current_user)):
    """Document factory vs recommended ops for tooltips / apply buttons."""
    factory = Settings().model_dump()
    # Strip secrets from public profile docs
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
            "factory": "Pydantic model defaults (demo-friendly). Secrets kept unless keep_secrets=false.",
        },
    }


@router.post("/settings/apply-profile")
async def apply_settings_profile(
        body: SettingsProfileBody = Body(default=SettingsProfileBody()),
        user=Depends(require_roles("admin")),
):
    """Apply factory or recommended ops profile (keeps API keys / Slack by default).

    Persists immediately — no separate Save required.
    """
    existing = await svc.get_settings()
    if body.profile == "factory":
        doc = Settings().model_dump()
        doc["email_alerts_to"] = None
        os.environ.pop("EMAIL_ALERTS_TO", None)
    else:
        doc = {**{k: v for k, v in existing.items() if k != "_id"}}
        doc.update(RECOMMENDED_SETTINGS_OPS)
        # Keep existing email unless empty — recommended does not invent an address
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

    # Coerce through Settings for type safety
    try:
        doc = Settings(**{k: v for k, v in doc.items() if k != "id"}).model_dump()
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=e.errors()) from e
    doc["id"] = "global"
    if body.profile == "factory":
        doc["email_alerts_to"] = None

    await db.settings.update_one({"id": "global"}, {"$set": encrypt_settings_doc(doc)}, upsert=True)
    try:
        sync_llm_keys_to_env(ROOT_DIR / ".env", doc)
        if body.profile == "factory":
            from backend.secrets_util import _apply_env_file_updates
            _apply_env_file_updates(ROOT_DIR / ".env", {"EMAIL_ALERTS_TO": ""})
    except OSError as e:
        logger.warning("Could not sync profile settings to .env: %s", e)
    await svc.audit(
        user, "settings.apply_profile", "settings", "global",
        {"profile": body.profile, "keep_secrets": body.keep_secrets},
    )
    return {
        "ok": True,
        "profile": body.profile,
        "keep_secrets": body.keep_secrets,
        "applied": dict(RECOMMENDED_SETTINGS_OPS) if body.profile == "recommended" else "factory",
    }


class ClearSecretsBody(BaseModel):
    """Wipe stored API keys (Mongo + process env + backend/.env)."""
    scope: Literal["threat_intel", "llm", "notifications", "all", "custom"] = "threat_intel"
    fields: Optional[List[str]] = None  # required when scope=custom
    confirm: bool = False


class TestEmailBody(BaseModel):
    """Send a smoke-test alert email. SMTP is optional (HTTP gateway is the default)."""
    to: Optional[str] = None  # override recipient; default = settings email_alerts_to
    save_recipient: bool = False  # if to= set, also persist as email_alerts_to


class TestSlackBody(BaseModel):
    """Send a smoke-test Slack message via Incoming Webhook."""
    webhook_url: Optional[str] = None  # optional override; else settings / env
    save_webhook: bool = False  # if webhook_url set, also persist as slack_webhook_url


@router.post("/settings/clear-secrets")
async def clear_settings_secrets(
        body: ClearSecretsBody = Body(...),
        user=Depends(require_roles("admin")),
):
    """Clear configured secrets so enrichment falls back to mock / keys must be re-entered.

    scope:
      - threat_intel: AbuseIPDB, VirusTotal, GreyNoise, ThreatFox, OTX, Shodan, Cohere
      - llm: Anthropic / OpenAI / Gemini / Groq
      - notifications: Slack webhook
      - all: every secret field
      - custom: body.fields list of Settings field names
    """
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
            raise HTTPException(400, "scope=custom requires fields with valid secret field names")

    existing = await svc.get_settings()
    doc = {**{k: v for k, v in existing.items() if k != "_id"}}
    for f in fields:
        doc[f] = None
    doc["id"] = "global"
    await db.settings.update_one({"id": "global"}, {"$set": encrypt_settings_doc(doc)}, upsert=True)

    cleared_env: list[str] = []
    try:
        cleared_env = clear_secrets_from_env(ROOT_DIR / ".env", fields)
    except OSError as e:
        logger.warning("Could not clear secrets from .env: %s", e)

    await svc.audit(
        user, "settings.clear_secrets", "settings", "global",
        {"scope": body.scope, "fields": fields, "env_cleared": cleared_env},
    )
    return {
        "ok": True,
        "scope": body.scope,
        "cleared_fields": fields,
        "env_cleared": cleared_env,
        "note": "Threat intel will use mock enrichment until new keys are saved.",
    }


@router.get("/settings/email-status")
async def email_alert_status(user=Depends(get_current_user)):
    """Email transport readiness (SMTP optional) + recipient + recent outbox."""
    from backend.notifications import (
        email_transport_status, resolve_alert_recipients, list_outbox, smtp_status,
    )
    s = await svc.get_settings()
    recipients = resolve_alert_recipients(s)
    transport = email_transport_status()
    return {
        "smtp": smtp_status(),
        "transport": transport,
        "recipients": recipients,
        "email_alerts_to": recipients[0] if len(recipients) == 1 else (", ".join(recipients) if recipients else None),
        # Ready when we have a recipient — SMTP is optional (HTTP gateway default)
        "ready": bool(recipients),
        "requires_smtp": False,
        "outbox_recent": list_outbox(limit=5),
    }


@router.get("/settings/email-outbox")
async def email_outbox(limit: int = Query(20, ge=1, le=100), user=Depends(require_roles("admin"))):
    """List locally recorded alert emails (always written, even without SMTP)."""
    from backend.notifications import list_outbox
    return {"items": list_outbox(limit=limit)}


@router.post("/settings/test-email")
async def test_email_alert(
        body: TestEmailBody = Body(default=TestEmailBody()),
        user=Depends(require_roles("admin")),
):
    """Smoke-test email alerts. SMTP is optional — default delivery uses HTTP gateway.

    Example:
      POST /api/settings/test-email
      {"to": "sarvesh.sood@gmail.com", "save_recipient": true}
    """
    from backend.notifications import (
        send_test_email, email_transport_status, resolve_alert_recipients, list_outbox,
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
        user, "settings.test_email", "settings", "global",
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
        # Remote delivery failed — still expose outbox so operators can verify the path
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


@router.get("/settings/slack-status")
async def slack_alert_status(user=Depends(get_current_user)):
    """Slack Incoming Webhook readiness (no OAuth bot install required)."""
    from backend.notifications import slack_status
    s = await svc.get_settings()
    return slack_status(s)


@router.post("/settings/test-slack")
async def test_slack_alert(
        body: TestSlackBody = Body(default=TestSlackBody()),
        user=Depends(require_roles("admin")),
):
    """Smoke-test Slack alerts via Incoming Webhook.

    Install steps:
      1. https://api.slack.com/messaging/webhooks — Create Incoming Webhook
      2. Pick a channel → copy the URL (hooks.slack.com/services/T…/B…/…)
      3. Paste in Settings or POST here with save_webhook=true
      4. POST /api/settings/test-slack
    """
    from backend.notifications import send_test_slack, slack_status, resolve_slack_webhook

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
            {"$set": encrypt_settings_doc({"slack_webhook_url": webhook}, fields=("slack_webhook_url",))},
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
        user, "settings.test_slack", "settings", "global",
        {
            "ok": result.get("ok"),
            "error": result.get("error"),
            "webhook_configured": result.get("webhook_configured"),
        },
    )

    if not result.get("ok") and result.get("error") in (
            "slack_not_configured", "empty", "oauth_token_not_webhook",
            "not_webhook_url", "bad_webhook_path", "placeholder_webhook",
            "incomplete_webhook", "invalid_webhook", "not_https",
    ):
        raise HTTPException(
            status_code=400,
            detail={
                **result,
                "message": result.get("detail") or (
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
