"""Shared application services used by routers and lifespan."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import HTTPException
from pydantic import ValidationError

from backend.auth import hash_password
from backend.core.database import ROOT_DIR, client, db
from backend.models import Settings, SECRET_SETTINGS_FIELDS, SETTINGS_CLEAR_SENTINEL, new_id, UserInDB
from backend.roadmap_data import ROADMAP_SEED, default_tasks_for_item
from backend.secrets_util import bootstrap_settings_kwargs, diagnose_slack_webhook, sync_llm_keys_to_env

logger = logging.getLogger("actira")

# In-process golden benchmark cache (also persisted to Mongo by eval routes)
last_golden_run: Optional[Dict[str, Any]] = None


def strip_id(doc):
    if isinstance(doc, dict):
        doc.pop("_id", None)
    return doc


def settings_defaults() -> dict:
    default = Settings(**bootstrap_settings_kwargs()).model_dump()
    default["id"] = "global"
    return default


async def get_settings() -> dict:
    """Load global settings. Merge with env bootstrap so older Mongo docs never
    drop new ops fields, and first-boot seeds from backend/.env.

    A-S3 vault: secrets are encrypted at rest in Mongo; this returns a
    **decrypted** in-memory copy for runtime resolve / LLM / TI callers.
    """
    from backend.secret_vault import decrypt_settings_doc, encrypt_settings_doc, migrate_settings_doc

    doc = await db.settings.find_one({"id": "global"}, {"_id": 0})
    defaults = settings_defaults()
    if not doc:
        # First boot: store encrypted secrets, return decrypted runtime view
        storage = encrypt_settings_doc(defaults)
        await db.settings.insert_one(storage)
        return decrypt_settings_doc(storage)
    # Fill any keys missing on older documents (forward-compatible)
    changed = False
    for key, val in defaults.items():
        if key == "id":
            continue
        if key not in doc or doc[key] is None:
            doc[key] = val
            changed = True
    # Migrate plaintext secrets → enc:v1:…
    storage, vault_changed = migrate_settings_doc(doc)
    if changed or vault_changed:
        await db.settings.update_one({"id": "global"}, {"$set": storage}, upsert=True)
        doc = storage
    else:
        doc = storage
    doc["id"] = "global"
    return decrypt_settings_doc(doc)


def auth_cookie_kwargs(max_age: int) -> dict:
    """httpOnly session cookie attributes (A-F1 cookie-only SPA).

    Cross-origin SPA (e.g. :3000 UI → :8001 API) needs SameSite=None + Secure
    so the browser attaches the cookie on credentialed XHR/fetch. Same-origin
    BFF/proxy can use Lax. Override with COOKIE_SAMESITE=lax|strict|none.
    """
    env = (os.environ.get("ENV") or "dev").strip().lower()
    mode = (os.environ.get("COOKIE_SAMESITE") or "auto").strip().lower()
    if mode == "auto":
        # Different ports = cross-site for cookies; default to none for SPA
        cors = os.environ.get("CORS_ORIGINS") or ""
        mode = "none" if cors.strip() else "lax"
    if mode not in ("lax", "strict", "none"):
        mode = "lax"
    # SameSite=None requires Secure; Chrome treats http://localhost as OK with Secure
    secure = mode == "none" or env not in ("dev", "test", "local", "")
    if (os.environ.get("COOKIE_SECURE") or "").strip().lower() in ("1", "true", "yes", "on"):
        secure = True
    if (os.environ.get("COOKIE_SECURE") or "").strip().lower() in ("0", "false", "no", "off"):
        secure = False
    return {
        "httponly": True,
        "secure": secure,
        "samesite": mode,
        "max_age": max_age,
        "path": "/",
    }


async def session_hours() -> int:
    s = await get_settings()
    try:
        h = int(s.get("session_timeout_hours") or 24)
    except (TypeError, ValueError):
        h = 24
    return max(1, h)


async def lockout_limit() -> int:
    s = await get_settings()
    try:
        n = int(s.get("failed_login_lockout") or 5)
    except (TypeError, ValueError):
        n = 5
    return max(1, n)


async def audit(actor: dict, action: str, target_type: str, target_id: str, detail: dict = None):
    # P1: delegate to AuditRepository (single write path)
    from backend.repositories.audit import audit_repo

    await audit_repo.insert(
        actor=actor,
        action=action,
        target_type=target_type,
        target_id=target_id,
        detail=detail,
    )


def merge_settings_update(existing: dict, payload: dict) -> dict:
    """Merge UI payload into stored settings.

    - Blank/omitted secrets keep existing values
    - Sentinel SETTINGS_CLEAR_SENTINEL (or explicit null with clear list) wipes a secret
    - Unknown keys ignored via Settings model
    """
    merged = {**existing}
    # Drop Mongo-only helpers
    merged.pop("_id", None)

    raw = dict(payload or {})
    # Support optional clear_fields: ["abuseipdb_key", ...]
    clear_fields = set(raw.pop("clear_fields", None) or [])
    # Also accept clear_secrets as alias
    for f in raw.pop("clear_secrets", None) or []:
        clear_fields.add(f)

    for key, val in raw.items():
        if key in ("id", "_id"):
            continue
        if key in SECRET_SETTINGS_FIELDS:
            if key in clear_fields:
                merged[key] = None
                continue
            if val is None:
                # null without clear list → preserve (safer default)
                continue
            text = str(val).strip()
            if text == SETTINGS_CLEAR_SENTINEL:
                merged[key] = None
            elif text:
                if key == "slack_webhook_url":
                    diag = diagnose_slack_webhook(text)
                    if not diag.get("ok"):
                        raise HTTPException(
                            status_code=400,
                            detail={
                                "ok": False,
                                "field": "slack_webhook_url",
                                "error": diag.get("error"),
                                "message": diag.get("message"),
                            },
                        )
                merged[key] = text
            # empty string → preserve existing
            continue
        if key == "email_alerts_to":
            if val is None:
                continue
            text = str(val).strip()
            if text == SETTINGS_CLEAR_SENTINEL:
                merged[key] = None
            elif text:
                merged[key] = text
            # empty → preserve existing email (use clear sentinel or factory reset to wipe)
            continue
        merged[key] = val

    for key in clear_fields:
        if key in SECRET_SETTINGS_FIELDS:
            merged[key] = None
        elif key == "email_alerts_to":
            merged[key] = None

    # Validate / coerce through Settings model (extra ignored)
    try:
        validated = Settings(**{k: v for k, v in merged.items() if k != "id"})
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=e.errors()) from e
    doc = validated.model_dump()
    doc["id"] = "global"
    return doc


async def persist_settings(doc: dict, user: dict, action: str, detail: dict | None = None) -> dict:
    """Persist settings with secrets encrypted at rest (A-S3 vault)."""
    from backend.secret_vault import encrypt_settings_doc

    # Runtime callers pass plaintext secrets; encrypt before Mongo write
    storage = encrypt_settings_doc(doc)
    await db.settings.update_one({"id": "global"}, {"$set": storage}, upsert=True)
    try:
        # .env sync uses plaintext (doc), not ciphertext
        sync_llm_keys_to_env(ROOT_DIR / ".env", doc)
    except OSError as e:
        logger.warning("Could not sync settings to .env: %s", e)
    await audit(user, action, "settings", "global", detail or {})
    return {"ok": True}


def slim_golden_payload(out: Dict[str, Any], *, include_cases: bool) -> Dict[str, Any]:
    """Shape benchmark output for the UI (optional per-case detail)."""
    payload = {
        "summary": out.get("summary") or {},
        "thresholds": out.get("thresholds") or dict(
            __import__("backend.golden_eval", fromlist=["DEFAULT_THRESHOLDS"]).DEFAULT_THRESHOLDS  # lazy import
        ),
        "failures": out.get("failures") or [],
        "passed": bool(out.get("passed")),
        "mode": "offline_template",
        "ran_at": out.get("ran_at"),
        "ran_by": out.get("ran_by"),
    }
    if include_cases:
        cases = []
        for r in out.get("results") or []:
            cases.append({
                "id": r.get("id"),
                "name": r.get("name"),
                "ioc_f1": r.get("ioc_f1"),
                "ioc_precision": r.get("ioc_precision"),
                "ioc_recall": r.get("ioc_recall"),
                "technique_recall": r.get("technique_recall"),
                "grounding_score": r.get("grounding_score"),
                "phase_coverage": r.get("phase_coverage"),
                "latency_s": r.get("latency_s"),
                "severity": r.get("severity"),
                "status": r.get("status"),
                "hitl_required": r.get("hitl_required"),
                "error": r.get("error"),
                "predicted_techniques": r.get("predicted_techniques") or [],
                "n_predicted_iocs": len(r.get("predicted_iocs") or []),
            })
        payload["cases"] = cases
    return payload


async def health_check():
    """Internal health helper."""
    try:
        await client.admin.command("ping")
        return {"status": "ok", "service": "ACTIRA", "mongo": "up"}
    except Exception as e:
        return {
            "status": "degraded",
            "service": "ACTIRA",
            "mongo": "down",
            "mongo_error": type(e).__name__,
        }


async def ensure_roadmap_seeded() -> None:
    """Insert seed on empty DB, and auto-merge new/completed seed cards into live Mongo.

    Admin Sync seed (force) still available for full refresh; this removes the need
    to manually merge after pull for new completed seed IDs (e.g. rm-review-deferred-close).
    """
    now = datetime.now(timezone.utc).isoformat()
    count = await db.roadmap.count_documents({})
    if count == 0:
        docs = []
        for item in ROADMAP_SEED:
            d = dict(item)
            d.setdefault("tasks", default_tasks_for_item(d))
            d["created_at"] = now
            d["updated_at"] = now
            docs.append(d)
        if docs:
            await db.roadmap.insert_many(docs)
            logger.info("Seeded %s roadmap items from weekly discussions", len(docs))
        return

    # Auto-merge: insert missing IDs; promote seed-completed items without wiping owner notes
    inserted = 0
    promoted = 0
    for item in ROADMAP_SEED:
        d = dict(item)
        d.setdefault("tasks", default_tasks_for_item(d))
        rid = d.get("id")
        if not rid:
            continue
        existing = await db.roadmap.find_one({"id": rid}, {"_id": 0})
        if not existing:
            d["created_at"] = now
            d["updated_at"] = now
            await db.roadmap.insert_one(d)
            inserted += 1
            continue
        seed_done = (
                str(d.get("status") or "") == "completed"
                or int(d.get("progress") or 0) >= 100
        )
        if not seed_done:
            continue
        # Promote completion from seed when local item is not yet completed
        local_status = str(existing.get("status") or "")
        local_progress = int(existing.get("progress") or 0)
        if local_status == "completed" and local_progress >= 100:
            continue
        patch = {
            "status": d.get("status") or "completed",
            "progress": int(d.get("progress") or 100),
            "summary": d.get("summary") or existing.get("summary"),
            "description": d.get("description") or existing.get("description"),
            "tasks": d.get("tasks") or existing.get("tasks"),
            "implementation_notes": d.get("implementation_notes")
                                    or existing.get("implementation_notes"),
            "modules": d.get("modules") or existing.get("modules"),
            "docs": d.get("docs") or existing.get("docs"),
            "architecture_notes": d.get("architecture_notes")
                                  or existing.get("architecture_notes"),
            "updated_at": now,
        }
        await db.roadmap.update_one({"id": rid}, {"$set": patch})
        promoted += 1
    if inserted or promoted:
        logger.info(
            "Roadmap auto-merge: inserted=%s promoted_completed=%s (seed_total=%s)",
            inserted,
            promoted,
            len(ROADMAP_SEED),
        )
    else:
        # Helps operators confirm seed is current after deploy
        logger.info(
            "Roadmap seed in sync (mongo_ids include all %s seed cards)",
            len(ROADMAP_SEED),
        )


async def seed_demo_data():
    """Seed demo users if none exist.

    Phase-1 dual gate (A-S1 hardened):
      1. ENV must be dev/test/local (never production/staging), AND
      2. SEED_DEMO_USERS must be explicitly true.

    Prevents accidental known-password accounts on empty prod DBs when ENV is
    mis-set, and requires opt-in even on local machines.
    """
    env = (os.environ.get("ENV") or "dev").strip().lower()
    force = (os.environ.get("SEED_DEMO_USERS") or "").strip().lower() in ("1", "true", "yes", "on")
    if env not in ("dev", "test", "local", ""):
        logger.info(
            "Skipping demo user seed (ENV=%s is not a lab env). Never seed known passwords in production.",
            env,
        )
        return
    if not force:
        logger.info(
            "Skipping demo user seed (SEED_DEMO_USERS not enabled). "
            "Set SEED_DEMO_USERS=true with ENV=dev|test for empty-DB lab accounts.",
        )
        return
    count = await db.users.count_documents({})
    if count > 0:
        return
    demos = [
        {"email": "analyst@soc.example.com", "name": "Ana Analyst", "role": "analyst", "password": "Analyst123!"},
        {"email": "reviewer@soc.example.com", "name": "Reggie Reviewer", "role": "senior_reviewer",
         "password": "Reviewer123!"},
        {"email": "admin@soc.example.com", "name": "Admin Root", "role": "admin", "password": "Admin123!"},
    ]
    for d in demos:
        pw = d.pop("password")
        u = UserInDB(**d, password_hash=hash_password(pw))
        await db.users.insert_one(u.model_dump(mode="json"))
    logger.info("Seeded demo users: analyst@soc.example.com / reviewer@soc.example.com / admin@soc.example.com")
