"""Investigation Workspace API — notes + derived timeline/graph views."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query

from backend.models import NoteCreate, NoteUpdate
from backend.security import get_current_user
from backend.services import workspace_service

router = APIRouter(tags=["workspace"])


@router.get("/incidents/{incident_id}/workspace")
async def get_workspace(incident_id: str, user=Depends(get_current_user)):
    return await workspace_service.get_workspace(incident_id)


@router.get("/incidents/{incident_id}/workspace/notes")
async def list_notes(
    incident_id: str,
    kind: Optional[str] = Query(None),
    user=Depends(get_current_user),
):
    return await workspace_service.list_notes(incident_id, kind=kind)


@router.post("/incidents/{incident_id}/workspace/notes")
async def create_note(
    incident_id: str,
    body: NoteCreate,
    user=Depends(get_current_user),
):
    return await workspace_service.add_note(incident_id, body, user)


@router.patch("/incidents/{incident_id}/workspace/notes/{note_id}")
async def patch_note(
    incident_id: str,
    note_id: str,
    body: NoteUpdate,
    user=Depends(get_current_user),
):
    return await workspace_service.update_note(incident_id, note_id, body, user)


@router.delete("/incidents/{incident_id}/workspace/notes/{note_id}")
async def delete_note(
    incident_id: str,
    note_id: str,
    user=Depends(get_current_user),
):
    return await workspace_service.delete_note(incident_id, note_id, user)


@router.get("/incidents/{incident_id}/workspace/timeline")
async def workspace_timeline(
    incident_id: str,
    limit: int = Query(100, ge=1, le=500),
    source_file: Optional[str] = None,
    severity: Optional[str] = None,
    kind: Optional[str] = Query(None, description="attack_chain|ces|pipeline"),
    user=Depends(get_current_user),
):
    return await workspace_service.get_timeline(
        incident_id,
        limit=limit,
        source_file=source_file,
        severity=severity,
        kind=kind,
    )


@router.get("/incidents/{incident_id}/workspace/entity-graph")
async def workspace_entity_graph(
    incident_id: str,
    max_nodes: int = Query(40, ge=1, le=100),
    max_edges: int = Query(80, ge=1, le=200),
    user=Depends(get_current_user),
):
    return await workspace_service.get_entity_graph(
        incident_id, max_nodes=max_nodes, max_edges=max_edges
    )


@router.get("/incidents/{incident_id}/workspace/rca")
async def workspace_get_rca(incident_id: str, user=Depends(get_current_user)):
    """Always ``{ "rca": object|null }``."""
    return await workspace_service.get_rca(incident_id)
