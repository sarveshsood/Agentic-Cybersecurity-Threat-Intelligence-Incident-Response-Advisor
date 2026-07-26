"""HiTL review queue business logic."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import HTTPException

from backend.models import ReviewAction
from backend.repositories.audit import audit_repo
from backend.repositories.incidents import incidents_repo


async def list_queue(*, skip: int = 0, limit: int = 50) -> List[Dict[str, Any]]:
    return await incidents_repo.list_pending_review(skip=skip, limit=limit)


async def apply_review(
    incident_id: str,
    action: ReviewAction,
    user: dict,
) -> Dict[str, Any]:
    """Atomic HiTL action — only one reviewer wins if concurrent requests race."""
    update: Dict[str, Any] = {
        "reviewer_id": user["sub"],
        "reviewer_notes": action.notes,
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
    }
    if action.action == "approve":
        update["status"] = "approved"
    elif action.action == "reject":
        update["status"] = "rejected"
    elif action.action == "edit_and_approve":
        update["status"] = "approved"
        if action.edited_playbook:
            update["playbook"] = action.edited_playbook.model_dump(mode="json")

    result = await incidents_repo.claim_review(incident_id, update)
    if result is not None:
        await audit_repo.insert(
            actor=user,
            action=f"review.{action.action}",
            target_type="incident",
            target_id=incident_id,
            detail={"notes": action.notes, "new_status": update.get("status")},
        )
        return {"ok": True, "status": update.get("status")}

    existing = await incidents_repo.get_status(incident_id)
    if not existing:
        raise HTTPException(404, "Incident not found")
    raise HTTPException(
        409,
        f"Not in pending_review state (current: {existing.get('status')}) — "
        "another reviewer may have already acted",
    )
