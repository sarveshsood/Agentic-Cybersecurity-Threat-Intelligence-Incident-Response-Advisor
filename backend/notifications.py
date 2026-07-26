"""Alert delivery: Slack + email without requiring SMTP.

Transport priority for email:
  1. SMTP — if SMTP_HOST + SMTP_FROM (+ auth when user set) are configured
  2. Zero-config HTTP gateway (FormSubmit) — no SMTP details needed
  3. Always write a local outbox record so smoke tests / UI can verify the path

Recipient: Settings email_alerts_to / EMAIL_ALERTS_TO (comma-separated ok).
"""
from __future__ import annotations

import json
import logging
import os
import smtplib
import ssl
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import requests

from backend.secrets_util import (
    clean_secret,
    is_real_secret,
    is_real_slack_webhook,
    diagnose_slack_webhook,
)

logger = logging.getLogger("actira.notifications")

ROOT_DIR = Path(__file__).parent
OUTBOX_DIR = ROOT_DIR / "data" / "email_outbox"

# Optional hook set by server startup to persist outbox into Mongo
_outbox_sink: Optional[Callable[[Dict[str, Any]], None]] = None


def set_outbox_sink(fn: Optional[Callable[[Dict[str, Any]], None]]) -> None:
    global _outbox_sink
    _outbox_sink = fn


@dataclass
class SmtpConfig:
    host: str
    port: int
    user: str
    password: str
    from_addr: str
    use_tls: bool = True

    @property
    def ready(self) -> bool:
        if not self.host or not self.from_addr:
            return False
        if self.user and not is_real_secret(self.password):
            return False
        return True


def load_smtp_config() -> SmtpConfig:
    host = (os.environ.get("SMTP_HOST") or "").strip()
    port_raw = (os.environ.get("SMTP_PORT") or "587").strip()
    try:
        port = int(port_raw)
    except ValueError:
        port = 587
    user = (os.environ.get("SMTP_USER") or "").strip()
    password = clean_secret(os.environ.get("SMTP_PASSWORD", ""))
    from_addr = (os.environ.get("SMTP_FROM") or user or "").strip()
    use_tls = (os.environ.get("SMTP_USE_TLS") or "true").strip().lower() not in (
        "0", "false", "no", "off",
    )
    return SmtpConfig(
        host=host,
        port=port,
        user=user,
        password=password,
        from_addr=from_addr,
        use_tls=use_tls,
    )


def http_gateway_enabled() -> bool:
    """HTTP email gateway (FormSubmit etc.).

    A-N1: Default OFF unless ENV is dev/test/local, or EMAIL_HTTP_GATEWAY is
    explicitly true. Production must opt in — never send SOC alert bodies to a
    third-party form service by accident.
    """
    raw = (os.environ.get("EMAIL_HTTP_GATEWAY") or "").strip().lower()
    env = (os.environ.get("ENV") or "dev").strip().lower()
    if raw in ("1", "true", "yes", "on"):
        return True
    if raw in ("0", "false", "no", "off"):
        return False
    # Unset: only default-on for local dev
    return env in ("dev", "test", "local", "")


def email_transport_status() -> Dict[str, Any]:
    smtp = load_smtp_config()
    smtp_ready = smtp.ready
    http_on = http_gateway_enabled()
    if smtp_ready:
        primary = "smtp"
    elif http_on:
        primary = "http_gateway"
    else:
        primary = "outbox_only"
    return {
        "primary": primary,
        "smtp_ready": smtp_ready,
        "http_gateway": http_on,
        "requires_smtp": False,
        "note": (
            "SMTP is optional. Without it, ACTIRA delivers via a free HTTP email gateway "
            "(FormSubmit) and always logs an outbox copy. First FormSubmit send to a new "
            "address may require clicking an activation link in that inbox."
            if not smtp_ready
            else "Using configured SMTP for delivery."
        ),
        "smtp": {
            "configured": smtp_ready,
            "host": smtp.host or None,
            "port": smtp.port,
            "user_set": bool(smtp.user),
            "password_set": is_real_secret(smtp.password),
            "from_addr": smtp.from_addr or None,
            "use_tls": smtp.use_tls,
        },
    }


def smtp_status() -> Dict[str, Any]:
    """Backward-compatible shape used by older clients."""
    t = email_transport_status()
    s = dict(t["smtp"])
    s["configured"] = t["smtp_ready"]
    s["hint"] = t["note"]
    return s


def resolve_alert_recipients(settings: Optional[dict] = None, override_to: Optional[str] = None) -> List[str]:
    if override_to and str(override_to).strip():
        raw = str(override_to).strip()
    else:
        raw = ""
        if settings:
            raw = str(settings.get("email_alerts_to") or "").strip()
        if not raw:
            raw = (os.environ.get("EMAIL_ALERTS_TO") or "").strip()
    if not raw:
        return []
    return [p.strip() for p in raw.replace(";", ",").split(",") if p.strip() and "@" in p]


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _write_outbox(entry: Dict[str, Any]) -> str:
    """Persist outbox JSON under backend/data/email_outbox/ (always)."""
    OUTBOX_DIR.mkdir(parents=True, exist_ok=True)
    eid = entry.get("id") or str(uuid.uuid4())
    entry["id"] = eid
    path = OUTBOX_DIR / f"{eid}.json"
    path.write_text(json.dumps(entry, indent=2, default=str), encoding="utf-8")
    if _outbox_sink:
        try:
            _outbox_sink(entry)
        except Exception as e:
            logger.warning("outbox sink failed: %s", e)
    return eid


def purge_old_outbox(max_age_days: int = 7) -> int:
    """A-P4: remove outbox JSON older than max_age_days."""
    if not OUTBOX_DIR.exists():
        return 0
    import time
    cutoff = time.time() - max(1, int(max_age_days)) * 86400
    removed = 0
    for p in OUTBOX_DIR.glob("*.json"):
        try:
            if p.stat().st_mtime < cutoff:
                p.unlink()
                removed += 1
        except OSError as e:
            logger.warning("purge outbox %s: %s", p, e)
    return removed


def list_outbox(limit: int = 20) -> List[Dict[str, Any]]:
    if not OUTBOX_DIR.exists():
        return []
    files = sorted(OUTBOX_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    items: List[Dict[str, Any]] = []
    for f in files[: max(1, min(limit, 100))]:
        try:
            items.append(json.loads(f.read_text(encoding="utf-8")))
        except Exception:
            continue
    return items


def _send_via_smtp(
        recipients: List[str],
        subject: str,
        body_text: str,
        body_html: Optional[str],
        cfg: SmtpConfig,
) -> Dict[str, Any]:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = cfg.from_addr
    msg["To"] = ", ".join(recipients)
    msg.set_content(body_text)
    if body_html:
        msg.add_alternative(body_html, subtype="html")

    if cfg.use_tls:
        context = ssl.create_default_context()
        with smtplib.SMTP(cfg.host, cfg.port, timeout=30) as server:
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()
            if cfg.user and cfg.password:
                server.login(cfg.user, cfg.password)
            server.send_message(msg)
    else:
        with smtplib.SMTP(cfg.host, cfg.port, timeout=30) as server:
            if cfg.user and cfg.password:
                server.login(cfg.user, cfg.password)
            server.send_message(msg)
    return {
        "ok": True,
        "delivered": True,
        "needs_activation": False,
        "transport": "smtp",
        "from": cfg.from_addr,
        "recipients": recipients,
        "subject": subject,
    }


def _formsubmit_truthy(value: Any) -> bool:
    """FormSubmit returns success as bool true or string 'true'/'false'."""
    if value is True:
        return True
    if value is False or value is None:
        return False
    return str(value).strip().lower() in ("true", "1", "yes", "ok", "success")


def _parse_formsubmit_response(status_code: int, text: str) -> Dict[str, Any]:
    """Interpret FormSubmit AJAX response (do not trust HTTP status alone).

    Real failures often still return HTTP 200 with success=false, e.g.:
      - missing Origin/Referer → \"open this page through a web server\"
      - first use of an address → activation required (activation email queued)
    """
    snippet = (text or "")[:500]
    try:
        data = json.loads(text) if text else {}
        if not isinstance(data, dict):
            data = {"raw": snippet}
    except Exception:
        data = {"raw": snippet}

    message = str(data.get("message") or data.get("error") or "").strip()
    msg_l = message.lower()
    success_flag = _formsubmit_truthy(data.get("success"))

    # Activation: FormSubmit queues an activation email (not the alert itself)
    needs_activation = (not success_flag) and (
            "activation" in msg_l
            or "activate form" in msg_l
            or "activate" in msg_l and "email" in msg_l
    )

    # Known hard failure when request looks like file:// / missing browser origin
    webserver_block = "web server" in msg_l or "html files" in msg_l

    delivered = bool(status_code < 400 and success_flag and not needs_activation)
    # Soft-ok when activation mail was claimed so UI can guide the user
    accepted = delivered or needs_activation

    if delivered:
        state = "delivered"
    elif needs_activation:
        state = "needs_activation"
    elif webserver_block:
        state = "rejected_origin"
    elif status_code >= 400:
        state = "http_error"
    else:
        state = "rejected"

    return {
        "ok": accepted,
        "delivered": delivered,
        "needs_activation": needs_activation,
        "state": state,
        "status_code": status_code,
        "message": message or None,
        "response": data,
    }


def _send_via_http_gateway(
        recipients: List[str],
        subject: str,
        body_text: str,
) -> Dict[str, Any]:
    """Deliver without SMTP using FormSubmit AJAX (no API key / no SMTP).

    Important:
      - Must send Origin + Referer or FormSubmit rejects with a fake 200.
      - Must parse JSON success field — HTTP 200 alone is NOT delivery proof.
      - First use of an address requires clicking FormSubmit's activation email,
        then resending the test alert.
    """
    results: List[Dict[str, Any]] = []
    any_delivered = False
    any_activation = False
    any_accepted = False

    # Browser-like origin required; FormSubmit rejects bare API clients otherwise.
    gateway_origin = (
            (os.environ.get("EMAIL_HTTP_ORIGIN") or "").strip()
            or "https://actira.app"
    )

    for addr in recipients:
        url = f"https://formsubmit.co/ajax/{addr}"
        # form-urlencoded is more reliable than JSON for FormSubmit AJAX
        payload = {
            "name": "ACTIRA Alerts",
            "email": "alerts@actira.app",
            "_subject": subject[:200],
            "message": body_text[:20000],
            "_template": "table",
            "_captcha": "false",
            "_honey": "",
            "_replyto": "alerts@actira.app",
        }
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
            "Origin": gateway_origin,
            "Referer": f"{gateway_origin.rstrip('/')}/",
            "User-Agent": (
                "Mozilla/5.0 (compatible; ACTIRA-Alert/1.0; "
                "+https://actira.app)"
            ),
        }
        try:
            r = requests.post(url, data=payload, headers=headers, timeout=45)
            parsed = _parse_formsubmit_response(r.status_code, r.text or "")
            if parsed["delivered"]:
                any_delivered = True
            if parsed["needs_activation"]:
                any_activation = True
            if parsed["ok"]:
                any_accepted = True
            results.append({
                "to": addr,
                "ok": parsed["ok"],
                "delivered": parsed["delivered"],
                "needs_activation": parsed["needs_activation"],
                "state": parsed["state"],
                "status_code": parsed["status_code"],
                "message": parsed["message"],
                "response": parsed["response"],
            })
            logger.info(
                "HTTP email gateway → %s status=%s state=%s delivered=%s",
                addr, r.status_code, parsed["state"], parsed["delivered"],
            )
        except Exception as e:
            logger.warning("HTTP email gateway failed for %s: %s", addr, e)
            results.append({
                "to": addr,
                "ok": False,
                "delivered": False,
                "needs_activation": False,
                "state": "exception",
                "error": str(e),
            })

    if any_delivered:
        detail = None
        activation_note = None
    elif any_activation:
        detail = (
            "Gateway requires one-time activation for this address. "
            "Check inbox/spam for a FormSubmit 'Activate Form' email, click it, "
            "then send the test email again."
        )
        activation_note = detail
    else:
        detail = (
            "HTTP email gateway rejected the request (no real delivery). "
            "Check network/firewall, try again, or set SMTP_* for direct delivery."
        )
        activation_note = None

    return {
        # ok=True means we got a usable gateway outcome (delivered OR activation queued).
        # callers that need inbox delivery should also check needs_activation / delivered.
        "ok": any_accepted,
        "delivered": any_delivered,
        "needs_activation": any_activation and not any_delivered,
        "transport": "http_gateway",
        "provider": "formsubmit",
        "recipients": recipients,
        "subject": subject,
        "per_recipient": results,
        "detail": detail,
        "activation_note": activation_note,
    }


def send_email(
        *,
        to: List[str] | str,
        subject: str,
        body_text: str,
        body_html: Optional[str] = None,
        settings: Optional[dict] = None,
        kind: str = "alert",
) -> Dict[str, Any]:
    """Send email without requiring SMTP (HTTP gateway fallback + outbox)."""
    recipients = resolve_alert_recipients(
        settings,
        override_to=",".join(to) if isinstance(to, list) else to,
    )
    if not recipients:
        return {
            "ok": False,
            "error": "no_recipient",
            "detail": "No email_alerts_to / EMAIL_ALERTS_TO recipient configured.",
        }

    transport_meta = email_transport_status()
    delivery: Dict[str, Any] = {"ok": False}
    cfg = load_smtp_config()

    # 1) Prefer SMTP when fully configured
    if cfg.ready:
        try:
            delivery = _send_via_smtp(recipients, subject, body_text, body_html, cfg)
        except smtplib.SMTPAuthenticationError as e:
            logger.warning("SMTP auth failed, falling back to HTTP gateway: %s", e)
            delivery = {
                "ok": False,
                "error": "smtp_auth_failed",
                "detail": str(e),
                "transport": "smtp",
            }
        except Exception as e:
            logger.warning("SMTP send failed, falling back to HTTP gateway: %s", e)
            delivery = {
                "ok": False,
                "error": "smtp_send_failed",
                "detail": str(e),
                "transport": "smtp",
            }

    # 2) Zero-config HTTP gateway (default path — no SMTP details)
    if not delivery.get("ok") and http_gateway_enabled():
        http_result = _send_via_http_gateway(recipients, subject, body_text)
        if http_result.get("ok"):
            delivery = http_result
        elif not delivery.get("ok"):
            delivery = http_result

    # 3) Always record outbox (smoke / UI can verify even if remote soft-fails)
    outbox_id = str(uuid.uuid4())
    outbox_entry = {
        "id": outbox_id,
        "ts": _utc_now(),
        "kind": kind,
        "subject": subject,
        "body_text": body_text[:8000],
        "recipients": recipients,
        "transport": delivery.get("transport") or (
            "smtp" if cfg.ready else ("http_gateway" if http_gateway_enabled() else "none")
        ),
        "delivery_ok": bool(delivery.get("ok")),
        "delivered": bool(delivery.get("delivered", delivery.get("ok"))),
        "needs_activation": bool(delivery.get("needs_activation")),
        "delivery": {
            k: v for k, v in delivery.items()
            if k not in ("body_text",)
        },
    }
    _write_outbox(outbox_entry)

    if delivery.get("ok"):
        return {
            "ok": True,
            "delivered": bool(delivery.get("delivered", True)),
            "needs_activation": bool(delivery.get("needs_activation")),
            "recipients": recipients,
            "subject": subject,
            "transport": delivery.get("transport"),
            "provider": delivery.get("provider"),
            "ts": outbox_entry["ts"],
            "outbox_id": outbox_id,
            "activation_note": delivery.get("activation_note"),
            "detail": delivery.get("detail"),
            "transport_status": transport_meta,
        }

    # Outbox-only success for local verification when remote path unavailable:
    # Still report failure for remote delivery so operators know inbox may be empty,
    # but include outbox_id so smoke can assert the pipeline ran.
    return {
        "ok": False,
        "delivered": False,
        "needs_activation": bool(delivery.get("needs_activation")),
        "error": delivery.get("error") or "delivery_failed",
        "detail": delivery.get("detail") or "Email could not be delivered via SMTP or HTTP gateway.",
        "recipients": recipients,
        "subject": subject,
        "transport": delivery.get("transport"),
        "outbox_id": outbox_id,
        "outbox_ok": True,
        "delivery": delivery,
        "transport_status": transport_meta,
        "activation_note": delivery.get("activation_note"),
    }


def send_test_email(
        *,
        to: Optional[str] = None,
        settings: Optional[dict] = None,
) -> Dict[str, Any]:
    """Smoke / Settings UI: send a known ACTIRA test message (no SMTP required)."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    subject = f"[ACTIRA] Email alert smoke test — {now}"
    text = (
        "ACTIRA email alert smoke test\n"
        "================================\n\n"
        f"Sent at: {now}\n"
        "If you received this message, alert email delivery is working "
        "(SMTP or zero-config HTTP gateway).\n\n"
        "No SMTP credentials are required for the default HTTP gateway path.\n"
        "Service: ACTIRA\n"
        "Path: Settings → Notifications → Send test email  or  POST /api/settings/test-email\n"
    )
    html = f"""
    <html><body style="font-family:Segoe UI,Arial,sans-serif;background:#0B0F19;color:#E2E8F0;padding:24px;">
      <div style="max-width:560px;margin:0 auto;border:1px solid #1E293B;border-radius:8px;padding:20px;background:#131A28;">
        <h2 style="color:#22D3EE;margin:0 0 8px;">ACTIRA email alert smoke test</h2>
        <p style="color:#94A3B8;font-size:13px;">Sent at <strong style="color:#E2E8F0;">{now}</strong></p>
        <p style="font-size:14px;line-height:1.5;">
          Alert email delivery is working. SMTP is optional — default path uses a zero-config HTTP gateway.
        </p>
        <p style="font-size:12px;color:#64748B;margin-top:20px;">
          Service: ACTIRA · POST /api/settings/test-email
        </p>
      </div>
    </body></html>
    """
    return send_email(
        to=to or "",
        subject=subject,
        body_text=text,
        body_html=html,
        settings=settings,
        kind="smoke_test",
    )


def resolve_slack_webhook(settings: Optional[dict] = None, override: Optional[str] = None) -> str:
    """Resolve Slack Incoming Webhook from override → settings → env (real URLs only)."""
    candidates = [
        override,
        (settings or {}).get("slack_webhook_url") if settings else None,
        os.environ.get("SLACK_WEBHOOK_URL", ""),
    ]
    for c in candidates:
        url = clean_secret(c)
        if is_real_slack_webhook(url):
            return url
    return ""


def slack_status(settings: Optional[dict] = None) -> Dict[str, Any]:
    """Readiness for Slack alerts (Incoming Webhook only — no OAuth bot required)."""
    url = resolve_slack_webhook(settings)
    configured = bool(url)
    return {
        "configured": configured,
        "ready": configured,
        "provider": "incoming_webhook",
        "install_url": "https://api.slack.com/messaging/webhooks",
        "hint": (
            "Paste a Slack Incoming Webhook URL (hooks.slack.com/services/T…/B…/…) "
            "in Settings → Notifications, then use Send test Slack."
            if not configured
            else "Slack Incoming Webhook configured. Critical/high/HiTL incidents post to the channel."
        ),
    }


def send_slack_webhook(webhook_url: str, text: str, blocks: Optional[list] = None) -> Dict[str, Any]:
    url = clean_secret(webhook_url)
    diag = diagnose_slack_webhook(url)
    if not diag.get("ok"):
        return {
            "ok": False,
            "error": diag.get("error") or "slack_not_configured",
            "detail": diag.get("message")
                      or (
                          "No valid Slack Incoming Webhook. Create one at "
                          "https://api.slack.com/messaging/webhooks and paste it in Settings."
                      ),
        }
    payload: Dict[str, Any] = {"text": text}
    if blocks:
        payload["blocks"] = blocks
    try:
        r = requests.post(url, json=payload, timeout=15)
        if r.status_code >= 300:
            return {
                "ok": False,
                "error": "slack_http",
                "detail": f"{r.status_code} {r.text[:200]}",
                "hint": (
                    "Invalid or revoked webhook — create a new Incoming Webhook in Slack "
                    "and update Settings."
                    if r.status_code in (403, 404)
                    else None
                ),
            }
        return {"ok": True, "transport": "slack_webhook", "status_code": r.status_code}
    except Exception as e:
        return {"ok": False, "error": "slack_failed", "detail": str(e)}


def send_test_slack(
        *,
        webhook_url: Optional[str] = None,
        settings: Optional[dict] = None,
) -> Dict[str, Any]:
    """Smoke / Settings UI: post a known ACTIRA test message to Slack."""
    url = resolve_slack_webhook(settings, override=webhook_url)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    text = (
        f"*ACTIRA Slack alert smoke test*\n"
        f"Sent at: `{now}`\n"
        f"If you see this in your channel, Slack integration is working.\n"
        f"_Path: Settings → Notifications → Send test Slack_"
    )
    result = send_slack_webhook(url, text)
    result["ts"] = _utc_now()
    result["webhook_configured"] = bool(url)
    return result


def notify_incident_created(settings: Optional[dict], incident: dict) -> Dict[str, Any]:
    """Fire Slack + email for critical / high / HiTL incidents."""
    settings = settings or {}
    severity = (incident.get("severity") or "").lower()
    hitl = bool(incident.get("hitl_required"))
    if severity not in ("critical", "high") and not hitl:
        return {"ok": True, "skipped": True, "reason": "below_alert_threshold"}

    title = incident.get("title") or "Incident"
    iid = incident.get("id") or "?"
    status = incident.get("status") or "?"
    score = incident.get("threat_score")
    subject = f"[ACTIRA] {severity.upper()} incident — {title[:80]}"
    body = (
        f"ACTIRA incident alert\n"
        f"---------------------\n"
        f"Title:    {title}\n"
        f"ID:       {iid}\n"
        f"Severity: {severity}\n"
        f"Status:   {status}\n"
        f"HiTL:     {hitl}\n"
        f"Threat:   {score}\n"
        f"Summary:  {(incident.get('summary') or '')[:500]}\n"
    )

    results: Dict[str, Any] = {}
    slack_url = resolve_slack_webhook(settings)
    if slack_url:
        results["slack"] = send_slack_webhook(slack_url, f"{subject}\n{body}")
    else:
        results["slack"] = {"ok": False, "skipped": True, "error": "slack_not_configured"}

    results["email"] = send_email(
        to="",
        subject=subject,
        body_text=body,
        settings=settings,
        kind="incident_alert",
    )
    return results
