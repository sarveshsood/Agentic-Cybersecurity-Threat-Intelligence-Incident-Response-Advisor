"""Incident comments (H-07) — not workspace notes."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from backend.core import services as svc
from backend.models import IncidentCommentCreate, IncidentCommentUpdate, new_id, utc_now
from backend.repositories.comments import comments_repo
from backend.repositories.incidents import incidents_repo
from backend.repositories.users import users_repo
from backend.services import notification_inbox_service as inbox


def _elevated(role: str) -> bool:
    return role in ("senior_reviewer", "admin")


async def list_comments(incident_id: str, actor: dict) -> List[Dict[str, Any]]:
    inc = await incidents_repo.find_by_id(incident_id)
    if not inc:
        raise HTTPException(404, "Incident not found")
    elevated = _elevated(actor.get("role") or "")
    rows = await comments_repo.list_for_incident(
        incident_id, include_deleted=elevated, limit=300
    )
    out = []
    for r in rows:
        if r.get("deleted_at") and not elevated:
            continue
        item = dict(r)
        if r.get("deleted_at") and not elevated:
            item["body"] = "[deleted]"
        out.append(item)
    return out


async def create_comment(
    incident_id: str, body: IncidentCommentCreate, actor: dict
) -> Dict[str, Any]:
    inc = await incidents_repo.find_by_id(incident_id)
    if not inc:
        raise HTTPException(404, "Incident not found")
    parent_id = (body.parent_id or "").strip() or None
    if parent_id:
        parent = await comments_repo.find_by_id(parent_id)
        if not parent or parent.get("incident_id") != incident_id:
            raise HTTPException(400, "Invalid parent_id")
        if parent.get("parent_id"):
            raise HTTPException(400, "Nested reply-to-reply not allowed (depth ≤ 1)")
        if parent.get("deleted_at"):
            raise HTTPException(400, "Cannot reply to deleted comment")

    sub = actor.get("sub") or actor.get("id")
    doc = {
        "id": new_id(),
        "incident_id": incident_id,
        "parent_id": parent_id,
        "body": body.body.strip(),
        "author_id": sub,
        "author_email": actor.get("email") or "",
        "author_name": actor.get("name") or "",
        "created_at": utc_now(),
        "updated_at": utc_now(),
        "deleted_at": None,
        "deleted_by_id": None,
    }
    await comments_repo.insert(doc)
    await svc.audit(
        actor,
        "incident.comment.create",
        "incident_comment",
        doc["id"],
        {"incident_id": incident_id, "parent_id": parent_id},
    )

    # Mentions
    for em in inbox.parse_mention_emails(doc["body"]):
        u = await users_repo.find_by_email_ci(em)
        if u and u.get("id"):
            await inbox.emit(
                user_id=u["id"],
                kind="mention",
                title="You were mentioned in a comment",
                body=doc["body"][:240],
                incident_id=incident_id,
                actor_id=sub,
            )
    # Reply notify parent author
    if parent_id:
        parent = await comments_repo.find_by_id(parent_id)
        if parent and parent.get("author_id"):
            await inbox.emit(
                user_id=parent["author_id"],
                kind="comment_reply",
                title="New reply on your comment",
                body=doc["body"][:240],
                incident_id=incident_id,
                actor_id=sub,
            )

    return {k: v for k, v in doc.items() if k != "_id"}


async def update_comment(
    incident_id: str, comment_id: str, body: IncidentCommentUpdate, actor: dict
) -> Dict[str, Any]:
    c = await comments_repo.find_by_id(comment_id)
    if not c or c.get("incident_id") != incident_id:
        raise HTTPException(404, "Comment not found")
    if c.get("deleted_at"):
        raise HTTPException(400, "Comment deleted")
    sub = actor.get("sub") or actor.get("id")
    role = actor.get("role") or ""
    if c.get("author_id") != sub and not _elevated(role):
        raise HTTPException(403, "Cannot edit others' comments")
    updated = await comments_repo.update_fields(
        comment_id, {"body": body.body.strip(), "updated_at": utc_now()}
    )
    await svc.audit(
        actor,
        "incident.comment.update",
        "incident_comment",
        comment_id,
        {"incident_id": incident_id},
    )
    return updated or c


async def delete_comment(incident_id: str, comment_id: str, actor: dict) -> Dict[str, Any]:
    c = await comments_repo.find_by_id(comment_id)
    if not c or c.get("incident_id") != incident_id:
        raise HTTPException(404, "Comment not found")
    if c.get("deleted_at"):
        return c
    sub = actor.get("sub") or actor.get("id")
    role = actor.get("role") or ""
    if c.get("author_id") != sub and not _elevated(role):
        raise HTTPException(403, "Cannot delete others' comments")
    updated = await comments_repo.update_fields(
        comment_id,
        {
            "deleted_at": utc_now(),
            "deleted_by_id": sub,
            "body": "[deleted]",
            "updated_at": utc_now(),
        },
    )
    await svc.audit(
        actor,
        "incident.comment.delete",
        "incident_comment",
        comment_id,
        {"incident_id": incident_id},
    )
    return updated or c
