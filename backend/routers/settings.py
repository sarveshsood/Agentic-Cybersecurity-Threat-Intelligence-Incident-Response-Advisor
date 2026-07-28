"""Settings API routes — thin HTTP adapters over settings_service."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Body, Depends, Query

from backend.security import get_current_user, require_roles
from backend.services import settings_service
from backend.services.settings_service import (
    ClearSecretsBody,
    SettingsProfileBody,
    SettingsResetBody,
    TestEmailBody,
    TestSlackBody,
)

router = APIRouter(tags=["settings"])


@router.get("/settings")
async def get_settings(user=Depends(get_current_user)):
    return await settings_service.public_settings_payload()


@router.get("/settings/llm-catalog")
async def get_llm_catalog(user=Depends(get_current_user)):
    """Provider → model allow-list for Settings UI and clients."""
    return settings_service.llm_catalog_payload()


@router.post("/settings/test-llm")
async def test_llm_connection(user=Depends(require_roles("admin"))):
    """Probe configured LLM with a minimal completion (uses real API quota)."""
    return await settings_service.test_llm(user)


@router.put("/settings")
async def update_settings(
    body: Dict[str, Any] = Body(...),
    user=Depends(require_roles("admin")),
):
    """Save Admin → Settings. Blank secret fields keep existing keys."""
    return await settings_service.update_settings(body, user)


@router.post("/settings")
async def update_settings_post(
    body: Dict[str, Any] = Body(...),
    user=Depends(require_roles("admin")),
):
    """Alias for PUT /settings (some proxies mishandle PUT)."""
    return await settings_service.update_settings(body, user)


@router.post("/settings/reset")
async def reset_settings(
    body: SettingsResetBody = SettingsResetBody(),
    user=Depends(require_roles("admin")),
):
    """Factory-reset Admin → Settings to Pydantic defaults."""
    return await settings_service.reset_settings(body, user)


@router.get("/settings/profiles")
async def settings_profiles(user=Depends(get_current_user)):
    return await settings_service.list_profiles()


@router.post("/settings/apply-profile")
async def apply_settings_profile(
    body: SettingsProfileBody = Body(default=SettingsProfileBody()),
    user=Depends(require_roles("admin")),
):
    return await settings_service.apply_profile(body, user)


@router.post("/settings/clear-secrets")
async def clear_settings_secrets(
    body: ClearSecretsBody = Body(...),
    user=Depends(require_roles("admin")),
):
    return await settings_service.clear_secrets(body, user)


@router.get("/settings/email-status")
async def email_alert_status(user=Depends(get_current_user)):
    return await settings_service.email_status()


@router.get("/settings/email-outbox")
async def email_outbox(
    limit: int = Query(20, ge=1, le=100),
    user=Depends(require_roles("admin")),
):
    return await settings_service.email_outbox(limit=limit)


@router.post("/settings/test-email")
async def test_email_alert(
    body: TestEmailBody = Body(default=TestEmailBody()),
    user=Depends(require_roles("admin")),
):
    return await settings_service.test_email(body, user)


@router.get("/settings/slack-status")
async def slack_alert_status(user=Depends(get_current_user)):
    return await settings_service.slack_status()


@router.post("/settings/test-slack")
async def test_slack_alert(
    body: TestSlackBody = Body(default=TestSlackBody()),
    user=Depends(require_roles("admin")),
):
    return await settings_service.test_slack(body, user)


@router.get("/settings/versions")
async def settings_versions(
    limit: int = Query(50, ge=1, le=200),
    user=Depends(require_roles("admin")),
):
    """Append-only settings version history (ops snapshot; secrets redacted)."""
    from backend.database import db
    from backend.settings_versions import list_versions

    return {"items": await list_versions(db, limit=limit)}


@router.get("/settings/versions/{version}")
async def settings_version_detail(
    version: int,
    user=Depends(require_roles("admin")),
):
    from backend.database import db
    from backend.settings_versions import get_version
    from fastapi import HTTPException

    row = await get_version(db, version)
    if not row:
        raise HTTPException(404, "Version not found")
    return row
