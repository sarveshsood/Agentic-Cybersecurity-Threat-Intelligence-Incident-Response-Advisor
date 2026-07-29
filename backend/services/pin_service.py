"""User favorites / pins (H-08)."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from backend.core import services as svc
from backend.models import UserPinCreate, new_id, utc_now
from backend.repositories.pins import pins_repo

# Align with frontend WorkspaceTabs
WORKSPACE_TAB_IDS = frozenset(
    {
        "case",
        "evidence",
        "timeline",
        "assets",
        "users",
        "ti",
        "mitre",
        "notes",
        "recommendations",
        "playbooks",
    }
)


async def list_pins(
    owner_id: str, *, target_type: Optional[str] = None
) -> List[Dict[str, Any]]:
    return await pins_repo.list_for_user(owner_id, target_type=target_type)


async def create_pin(body: UserPinCreate, actor: dict) -> Dict[str, Any]:
    owner = actor.get("sub") or actor.get("id")
    ttype = body.target_type
    tid = (body.target_id or "").strip()
    if not tid:
        raise HTTPException(400, "target_id required")
    if ttype == "workspace_tab" and tid not in WORKSPACE_TAB_IDS:
        raise HTTPException(400, f"Invalid workspace tab id: {tid}")
    existing = await pins_repo.find(owner, ttype, tid)
    if existing:
        return existing
    doc = {
        "id": new_id(),
        "owner_id": owner,
        "target_type": ttype,
        "target_id": tid,
        "label": (body.label or "").strip() or None,
        "created_at": utc_now(),
    }
    await pins_repo.insert(doc)
    await svc.audit(
        actor,
        "user_pin.create",
        "user_pin",
        doc["id"],
        {"target_type": ttype, "target_id": tid},
    )
    return {k: v for k, v in doc.items() if k != "_id"}


async def delete_pin(pin_id: str, actor: dict) -> Dict[str, Any]:
    owner = actor.get("sub") or actor.get("id")
    ok = await pins_repo.delete(pin_id, owner)
    if not ok:
        raise HTTPException(404, "Pin not found")
    await svc.audit(actor, "user_pin.delete", "user_pin", pin_id, {})
    return {"ok": True, "id": pin_id}


async def delete_pin_by_target(
    actor: dict, *, target_type: str, target_id: str
) -> Dict[str, Any]:
    owner = actor.get("sub") or actor.get("id")
    ok = await pins_repo.delete_by_target(owner, target_type, target_id)
    if not ok:
        raise HTTPException(404, "Pin not found")
    await svc.audit(
        actor,
        "user_pin.delete",
        "user_pin",
        f"{target_type}:{target_id}",
        {},
    )
    return {"ok": True}
