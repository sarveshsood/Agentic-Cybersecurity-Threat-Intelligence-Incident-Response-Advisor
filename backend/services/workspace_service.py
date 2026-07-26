"""Investigation Workspace business logic (notes + derived views)."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from backend.core import services as svc
from backend.investigation_views import (
    build_entity_graph,
    build_investigation_timeline,
    normalize_workspace,
)
from backend.models import NoteCreate, NoteUpdate, WorkspaceNote, new_id, utc_now
from backend.repositories.incidents import incidents_repo

ELEVATED_ROLES = frozenset({"senior_reviewer", "admin"})
NOTES_LIMIT = 200


def is_elevated(user: dict) -> bool:
    return (user or {}).get("role") in ELEVATED_ROLES


def can_modify_note(user: dict, note: dict) -> bool:
    if is_elevated(user):
        return True
    return note.get("author_id") == (user or {}).get("sub")


def _note_to_mongo(note: WorkspaceNote) -> Dict[str, Any]:
    return note.model_dump(mode="json")


async def get_workspace(incident_id: str) -> Dict[str, Any]:
    doc = await incidents_repo.find_by_id(incident_id)
    if not doc:
        raise HTTPException(404, "Incident not found")
    return normalize_workspace(doc.get("workspace"))


async def list_notes(incident_id: str, kind: Optional[str] = None) -> List[Dict[str, Any]]:
    ws = await get_workspace(incident_id)
    notes = ws.get("notes") or []
    if kind:
        notes = [n for n in notes if isinstance(n, dict) and n.get("kind") == kind]
    return notes


async def add_note(incident_id: str, body: NoteCreate, user: dict) -> Dict[str, Any]:
    doc = await incidents_repo.find_by_id(incident_id)
    if not doc:
        raise HTTPException(404, "Incident not found")

    now = utc_now()
    note = WorkspaceNote(
        id=new_id(),
        kind=body.kind,
        title=body.title,
        body=body.body,
        tags=list(body.tags or []),
        linked_iocs=list(body.linked_iocs or []),
        linked_techniques=list(body.linked_techniques or []),
        linked_event_refs=list(body.linked_event_refs or []),
        pinned=bool(body.pinned),
        author_id=user.get("sub"),
        author_email=user.get("email"),
        created_at=now,
        updated_at=now,
    )
    note_doc = _note_to_mongo(note)
    updated = await incidents_repo.push_workspace_note(
        incident_id, note_doc, notes_limit=NOTES_LIMIT
    )
    if not updated:
        # Either missing (race) or at limit
        again = await incidents_repo.find_by_id(incident_id)
        if not again:
            raise HTTPException(404, "Incident not found")
        n = len((again.get("workspace") or {}).get("notes") or [])
        if n >= NOTES_LIMIT:
            raise HTTPException(400, "notes_limit: maximum 200 notes per incident")
        raise HTTPException(400, "notes_limit: maximum 200 notes per incident")

    try:
        await svc.audit(
            user,
            "workspace.note.create",
            "incident",
            incident_id,
            {"note_id": note.id, "kind": note.kind},
        )
    except Exception:
        pass
    return note_doc


async def update_note(
    incident_id: str, note_id: str, body: NoteUpdate, user: dict
) -> Dict[str, Any]:
    doc = await incidents_repo.find_by_id(incident_id)
    if not doc:
        raise HTTPException(404, "Incident not found")
    notes = (doc.get("workspace") or {}).get("notes") or []
    note = next((n for n in notes if isinstance(n, dict) and n.get("id") == note_id), None)
    if not note:
        raise HTTPException(404, "Note not found")
    if not can_modify_note(user, note):
        raise HTTPException(403, "Not allowed to modify this note")

    patch = body.model_dump(exclude_unset=True, mode="json")
    # Never accept author spoofing
    patch.pop("author_id", None)
    patch.pop("author_email", None)
    patch.pop("id", None)
    patch["updated_at"] = utc_now().isoformat()

    author_filter = None if is_elevated(user) else user.get("sub")
    updated = await incidents_repo.update_workspace_note(
        incident_id, note_id, patch, author_id=author_filter
    )
    if not updated:
        raise HTTPException(403, "Not allowed to modify this note")

    notes2 = (updated.get("workspace") or {}).get("notes") or []
    out = next((n for n in notes2 if n.get("id") == note_id), None)
    try:
        await svc.audit(
            user,
            "workspace.note.update",
            "incident",
            incident_id,
            {"note_id": note_id, "kind": (out or note).get("kind")},
        )
    except Exception:
        pass
    if not out:
        raise HTTPException(404, "Note not found")
    return out


async def delete_note(incident_id: str, note_id: str, user: dict) -> Dict[str, Any]:
    doc = await incidents_repo.find_by_id(incident_id)
    if not doc:
        raise HTTPException(404, "Incident not found")
    notes = (doc.get("workspace") or {}).get("notes") or []
    note = next((n for n in notes if isinstance(n, dict) and n.get("id") == note_id), None)
    if not note:
        raise HTTPException(404, "Note not found")
    if not can_modify_note(user, note):
        raise HTTPException(403, "Not allowed to modify this note")

    author_filter = None if is_elevated(user) else user.get("sub")
    modified = await incidents_repo.pull_workspace_note(
        incident_id, note_id, author_id=author_filter
    )
    if not modified:
        raise HTTPException(403, "Not allowed to modify this note")

    try:
        await svc.audit(
            user,
            "workspace.note.delete",
            "incident",
            incident_id,
            {"note_id": note_id, "kind": note.get("kind")},
        )
    except Exception:
        pass
    return {"ok": True, "note_id": note_id}


async def get_timeline(
    incident_id: str,
    *,
    limit: int = 100,
    source_file: Optional[str] = None,
    severity: Optional[str] = None,
    kind: Optional[str] = None,
) -> Dict[str, Any]:
    doc = await incidents_repo.find_by_id(incident_id)
    if not doc:
        raise HTTPException(404, "Incident not found")
    return build_investigation_timeline(
        doc,
        limit=limit,
        source_file=source_file,
        severity=severity,
        kind=kind,
    )


async def get_entity_graph(
    incident_id: str,
    *,
    max_nodes: int = 40,
    max_edges: int = 80,
) -> Dict[str, Any]:
    doc = await incidents_repo.find_by_id(incident_id)
    if not doc:
        raise HTTPException(404, "Incident not found")
    return build_entity_graph(doc, max_nodes=max_nodes, max_edges=max_edges)


async def get_rca(incident_id: str) -> Dict[str, Any]:
    ws = await get_workspace(incident_id)
    return {"rca": ws.get("rca")}
