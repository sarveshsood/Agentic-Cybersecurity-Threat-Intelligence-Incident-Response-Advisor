"""ACTIRA API routes — auto-split from server.py (v1.1 modularization)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import (
    APIRouter, Depends, HTTPException, Query,
)

from backend.auth import (
    require_roles,
)
from backend.core import services as svc
from backend.core.database import db
from backend.models import (
    ReviewAction,
)

router = APIRouter(tags=['review'])


# ---------- HiTL Review Queue ----------
@router.get("/review/queue")
async def review_queue(
        skip: int = Query(0, ge=0),
        limit: int = Query(50, ge=1, le=200),
        user=Depends(require_roles("senior_reviewer")),
):
    cursor = db.incidents.find(
        {"status": "pending_review"}, {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit)
    docs = await cursor.to_list(limit)
    return docs


@router.post("/review/{incident_id}")
async def review_incident(
        incident_id: str,
        action: ReviewAction,
        user=Depends(require_roles("senior_reviewer")),
):
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

    # Conditional update: requires current status == pending_review (race-safe)
    result = await db.incidents.find_one_and_update(
        {"id": incident_id, "status": "pending_review"},
        {"$set": update},
        projection={"_id": 0, "id": 1, "status": 1},
        return_document=True,  # Motor: ReturnDocument.AFTER equivalent when True
    )
    if result is not None:
        await svc.audit(
            user,
            f"review.{action.action}",
            "incident",
            incident_id,
            {"notes": action.notes, "new_status": update.get("status")},
        )
        return {"ok": True, "status": update.get("status")}

    # Lost race or bad id — distinguish 404 vs already reviewed
    existing = await db.incidents.find_one({"id": incident_id}, {"_id": 0, "status": 1})
    if not existing:
        raise HTTPException(404, "Incident not found")
    raise HTTPException(
        409,
        f"Not in pending_review state (current: {existing.get('status')}) — "
        "another reviewer may have already acted",
    )
