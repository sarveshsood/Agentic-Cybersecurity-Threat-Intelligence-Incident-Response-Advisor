"""Audit log API — list, summary, integrity, telemetry."""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Depends, Query

from backend.security import get_current_user, require_roles
from backend.services import audit_service

router = APIRouter(tags=["audit"])

_READ_ROLES = ("admin", "senior_reviewer")


@router.get("/audit")
async def get_audit(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    q: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    actor: Optional[str] = Query(None),
    target_type: Optional[str] = Query(None),
    include_meta: bool = Query(
        False,
        description="When true, return {items,total,skip,limit} for server-side pagination",
    ),
    user=Depends(require_roles(*_READ_ROLES)),
):
    """Normalized audit entries (who/what/when + integrity flags)."""
    return await audit_service.list_audit(
        skip=skip,
        limit=limit,
        q=q,
        action=action,
        actor=actor,
        target_type=target_type,
        include_meta=include_meta,
    )


@router.get("/audit/logs")
async def get_audit_logs(
    q: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    limit: int = Query(500, ge=1, le=500),
    user=Depends(require_roles(*_READ_ROLES)),
):
    """Audit Trail UI compatibility endpoint."""
    return await audit_service.list_audit_logs(q=q, action=action, limit=limit)


@router.get("/audit/actions")
async def get_audit_actions(
    limit: int = Query(200, ge=1, le=500),
    user=Depends(require_roles(*_READ_ROLES)),
):
    """Distinct audit action names for dynamic UI filters."""
    return await audit_service.list_actions(limit=limit)


@router.get("/audit/summary")
async def get_audit_summary(
    days: int = Query(7, ge=1, le=90),
    user=Depends(require_roles(*_READ_ROLES)),
):
    """Rule-based audit intelligence summary."""
    return await audit_service.summary(days=days)


@router.get("/audit/integrity")
async def get_audit_integrity(
    sample: int = Query(100, ge=1, le=500),
    user=Depends(require_roles(*_READ_ROLES)),
):
    """Best-effort hash/chain verification over recent entries."""
    return await audit_service.integrity(sample=sample)


@router.post("/audit/telemetry")
async def post_audit_telemetry(
    body: Dict[str, Any] = Body(default={}),
    user=Depends(get_current_user),
):
    """Optional client telemetry (403 page, etc.). Authenticated users only."""
    event = str(body.get("event") or body.get("action") or "client_event")
    detail = body.get("detail") if isinstance(body.get("detail"), dict) else {
        k: v for k, v in (body or {}).items() if k not in ("event", "action")
    }
    return await audit_service.record_telemetry(actor=user, event=event, detail=detail)


@router.get("/audit/export")
async def export_audit(
    limit: int = Query(500, ge=1, le=2000),
    action: Optional[str] = Query(None),
    user=Depends(require_roles("admin")),
):
    """Export recent audit rows as JSON + append to local WORM JSONL path."""
    from backend.audit_export import export_range_jsonl, worm_status
    from backend.repositories.audit import audit_repo

    rows = await audit_service.list_audit(
        skip=0, limit=limit, action=action, normalize=False
    )
    # list_audit may return {items: ...}
    if isinstance(rows, dict):
        items = rows.get("items") or rows.get("logs") or []
    else:
        items = rows or []
    path = export_range_jsonl(list(items))
    return {
        "ok": True,
        "count": len(items),
        "path": str(path),
        "worm": worm_status(),
    }


@router.get("/audit/worm-status")
async def audit_worm_status(user=Depends(require_roles("admin"))):
    from backend.audit_export import worm_status

    return worm_status()


@router.post("/audit/siem-test")
async def audit_siem_test(user=Depends(require_roles("admin"))):
    """Send a synthetic audit event to AUDIT_SIEM_WEBHOOK_URL (if configured)."""
    from backend.audit_export import forward_siem, siem_webhook

    if not siem_webhook():
        return {"ok": False, "error": "AUDIT_SIEM_WEBHOOK_URL not set"}
    result = forward_siem(
        {
            "id": "siem-test",
            "action": "audit.siem_test",
            "actor_email": (user or {}).get("email"),
            "detail": {"source": "ops"},
        }
    )
    return result
