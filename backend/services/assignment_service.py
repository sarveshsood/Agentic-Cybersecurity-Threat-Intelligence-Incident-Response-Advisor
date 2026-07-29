"""Incident assignment (H-07)."""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import HTTPException

from backend.core import services as svc
from backend.models import AssignmentUpdate, utc_now
from backend.repositories.incidents import incidents_repo
from backend.repositories.users import users_repo
from backend.services import notification_inbox_service as inbox


def _elevated(role: str) -> bool:
    return role in ("senior_reviewer", "admin")


def _public_user(u: Optional[dict]) -> Optional[dict]:
    if not u:
        return None
    return {
        "id": u.get("id"),
        "email": u.get("email"),
        "name": u.get("name"),
        "role": u.get("role"),
    }


async def set_assignment(
    incident_id: str, body: AssignmentUpdate, actor: dict
) -> Dict[str, Any]:
    doc = await incidents_repo.find_by_id(incident_id)
    if not doc:
        raise HTTPException(404, "Incident not found")

    patch = body.model_dump(exclude_unset=True)
    if not patch:
        return doc

    role = (actor.get("role") or "analyst").strip()
    sub = actor.get("sub") or actor.get("id")
    email = actor.get("email") or ""
    closed = (doc.get("status") or "").lower() in ("closed", "rejected")
    if closed and not _elevated(role):
        raise HTTPException(403, "Only senior_reviewer/admin may assign closed/rejected cases")

    fields: Dict[str, Any] = {}
    prev = {
        "assignee_id": doc.get("assignee_id"),
        "secondary_assignee_id": doc.get("secondary_assignee_id"),
        "due_at": doc.get("due_at"),
        "sla_hint_hours": doc.get("sla_hint_hours"),
    }

    # Primary
    if "assignee_id" in patch:
        aid = patch.get("assignee_id")
        if aid is None or aid == "":
            # Clear primary + cascade secondary unless same request sets secondary
            fields["assignee_id"] = None
            fields["assignee_email"] = None
            fields["assigned_at"] = None
            fields["assigned_by_id"] = None
            if "secondary_assignee_id" not in patch or patch.get("secondary_assignee_id") in (
                None,
                "",
            ):
                fields["secondary_assignee_id"] = None
                fields["secondary_assignee_email"] = None
        else:
            if not _elevated(role) and aid != sub:
                raise HTTPException(403, "Analysts may only self-assign as primary")
            u = await users_repo.find_by_id_public(str(aid))
            if not u:
                raise HTTPException(400, "Unknown assignee_id")
            fields["assignee_id"] = u["id"]
            fields["assignee_email"] = u.get("email")
            fields["assigned_at"] = utc_now()
            fields["assigned_by_id"] = sub

    # Secondary
    if "secondary_assignee_id" in patch:
        if not _elevated(role):
            raise HTTPException(403, "Only senior_reviewer/admin may set secondary assignee")
        sid = patch.get("secondary_assignee_id")
        if sid is None or sid == "":
            fields["secondary_assignee_id"] = None
            fields["secondary_assignee_email"] = None
        else:
            primary_after = fields.get("assignee_id", doc.get("assignee_id"))
            if not primary_after:
                raise HTTPException(400, "secondary requires primary")
            u = await users_repo.find_by_id_public(str(sid))
            if not u:
                raise HTTPException(400, "Unknown secondary_assignee_id")
            fields["secondary_assignee_id"] = u["id"]
            fields["secondary_assignee_email"] = u.get("email")

    # Due / SLA
    if patch.get("clear_due"):
        fields["due_at"] = None
        if patch.get("clear_sla_hint"):
            fields["sla_hint_hours"] = None
    if "due_at" in patch and not patch.get("clear_due"):
        can_due = _elevated(role) or (
            fields.get("assignee_id", doc.get("assignee_id")) == sub
        )
        if not can_due:
            raise HTTPException(403, "Only primary assignee or elevated may set due_at")
        fields["due_at"] = patch.get("due_at")
    if patch.get("clear_sla_hint") and "sla_hint_hours" not in fields:
        fields["sla_hint_hours"] = None
    if "sla_hint_hours" in patch and not patch.get("clear_sla_hint"):
        can_due = _elevated(role) or (
            fields.get("assignee_id", doc.get("assignee_id")) == sub
        )
        if not can_due:
            raise HTTPException(403, "Only primary assignee or elevated may set sla_hint_hours")
        fields["sla_hint_hours"] = patch.get("sla_hint_hours")

    # Secondary without primary after patch
    primary_final = fields["assignee_id"] if "assignee_id" in fields else doc.get("assignee_id")
    secondary_final = (
        fields["secondary_assignee_id"]
        if "secondary_assignee_id" in fields
        else doc.get("secondary_assignee_id")
    )
    if secondary_final and not primary_final:
        raise HTTPException(400, "secondary requires primary")

    updated = await incidents_repo.update_assignment_fields(incident_id, fields)
    if not updated:
        raise HTTPException(404, "Incident not found")

    await svc.audit(
        actor,
        "incident.assign",
        "incident",
        incident_id,
        {"prev": prev, "next": {k: updated.get(k) for k in prev}, "fields": list(fields.keys())},
    )

    # Notify new primary / secondary
    new_primary = fields.get("assignee_id")
    if new_primary and new_primary != sub:
        await inbox.emit(
            user_id=new_primary,
            kind="assignment",
            title="Incident assigned to you",
            body=updated.get("title") or incident_id,
            incident_id=incident_id,
            actor_id=sub,
        )
    new_sec = fields.get("secondary_assignee_id")
    if new_sec and new_sec != sub:
        await inbox.emit(
            user_id=new_sec,
            kind="assignment",
            title="Added as secondary assignee",
            body=updated.get("title") or incident_id,
            incident_id=incident_id,
            actor_id=sub,
        )

    return updated
