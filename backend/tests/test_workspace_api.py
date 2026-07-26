"""Workspace notes authz + route registration (offline mocks)."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

pytestmark = [pytest.mark.unit]


def test_workspace_routes_registered():
    from backend.routers import workspace as wr
    from backend.routers import ALL_DOMAIN_ROUTERS

    assert wr in ALL_DOMAIN_ROUTERS
    paths = {getattr(r, "path", None) for r in wr.router.routes}
    assert "/incidents/{incident_id}/workspace" in paths
    assert "/incidents/{incident_id}/workspace/notes" in paths
    assert "/incidents/{incident_id}/workspace/timeline" in paths
    assert "/incidents/{incident_id}/workspace/entity-graph" in paths
    assert "/incidents/{incident_id}/workspace/rca" in paths


def test_can_modify_note_authz():
    from backend.services.workspace_service import can_modify_note, is_elevated

    note = {"id": "n1", "author_id": "u-a"}
    assert can_modify_note({"sub": "u-a", "role": "analyst"}, note) is True
    assert can_modify_note({"sub": "u-b", "role": "analyst"}, note) is False
    assert can_modify_note({"sub": "u-b", "role": "senior_reviewer"}, note) is True
    assert can_modify_note({"sub": "u-b", "role": "admin"}, note) is True
    assert is_elevated({"role": "admin"}) is True
    assert is_elevated({"role": "analyst"}) is False


def test_note_create_model_validation():
    from backend.models import NoteCreate
    from pydantic import ValidationError

    n = NoteCreate(body="hello finding", kind="finding", tags=["a"])
    assert n.body == "hello finding"
    with pytest.raises(ValidationError):
        NoteCreate(body="")
    with pytest.raises(ValidationError):
        NoteCreate(body="x", tags=["x" * 65])


@pytest.mark.asyncio
async def test_add_note_sets_server_author():
    from backend.models import NoteCreate
    from backend.services import workspace_service as ws

    incident = {"id": "inc-1", "workspace": {"version": 1, "notes": []}}
    pushed = {
        "id": "inc-1",
        "workspace": {"version": 1, "notes": [{"id": "will-replace"}]},
    }

    with patch.object(ws.incidents_repo, "find_by_id", new=AsyncMock(return_value=incident)):
        with patch.object(
            ws.incidents_repo,
            "push_workspace_note",
            new=AsyncMock(return_value=pushed),
        ) as push:
            with patch.object(ws.svc, "audit", new=AsyncMock()):
                out = await ws.add_note(
                    "inc-1",
                    NoteCreate(body="seen lateral movement"),
                    {"sub": "user-1", "email": "a@x.com", "role": "analyst"},
                )
    assert out["author_id"] == "user-1"
    assert out["author_email"] == "a@x.com"
    assert out["body"] == "seen lateral movement"
    assert push.await_count == 1
    pushed_note = push.await_args.args[1]
    assert pushed_note["author_id"] == "user-1"
    assert "author_id" in pushed_note


@pytest.mark.asyncio
async def test_update_note_forbidden_for_other_analyst():
    from backend.models import NoteUpdate
    from backend.services import workspace_service as ws
    from fastapi import HTTPException

    incident = {
        "id": "inc-1",
        "workspace": {
            "notes": [
                {
                    "id": "n1",
                    "author_id": "owner",
                    "kind": "note",
                    "body": "secret",
                }
            ]
        },
    }
    with patch.object(ws.incidents_repo, "find_by_id", new=AsyncMock(return_value=incident)):
        with pytest.raises(HTTPException) as ei:
            await ws.update_note(
                "inc-1",
                "n1",
                NoteUpdate(body="hacked"),
                {"sub": "other", "role": "analyst"},
            )
    assert ei.value.status_code == 403


@pytest.mark.asyncio
async def test_update_note_elevated_ok():
    from backend.models import NoteUpdate
    from backend.services import workspace_service as ws

    incident = {
        "id": "inc-1",
        "workspace": {
            "notes": [{"id": "n1", "author_id": "owner", "kind": "note", "body": "old"}]
        },
    }
    updated = {
        "id": "inc-1",
        "workspace": {
            "notes": [{"id": "n1", "author_id": "owner", "kind": "note", "body": "new"}]
        },
    }
    with patch.object(ws.incidents_repo, "find_by_id", new=AsyncMock(return_value=incident)):
        with patch.object(
            ws.incidents_repo,
            "update_workspace_note",
            new=AsyncMock(return_value=updated),
        ):
            with patch.object(ws.svc, "audit", new=AsyncMock()):
                out = await ws.update_note(
                    "inc-1",
                    "n1",
                    NoteUpdate(body="new"),
                    {"sub": "rev1", "role": "senior_reviewer"},
                )
    assert out["body"] == "new"


@pytest.mark.asyncio
async def test_timeline_endpoint_service():
    from backend.services import workspace_service as ws

    incident = {
        "id": "inc-1",
        "correlation": {
            "attack_chain": [
                {
                    "timestamp": "2024-01-01T00:00:00+00:00",
                    "event_type": "login",
                    "actor": "u",
                    "target": "h",
                    "summary": "x",
                    "source_file": "a.log",
                    "severity": "high",
                }
            ],
            "timeline": [],
            "entities": {},
            "correlations": [],
        },
    }
    with patch.object(ws.incidents_repo, "find_by_id", new=AsyncMock(return_value=incident)):
        out = await ws.get_timeline("inc-1", limit=10)
    assert out["source"] == "correlation"
    assert out["events"][0]["id"] == "ac:0"


@pytest.mark.asyncio
async def test_get_rca_envelope_null():
    from backend.services import workspace_service as ws

    with patch.object(
        ws.incidents_repo,
        "find_by_id",
        new=AsyncMock(return_value={"id": "inc-1"}),
    ):
        out = await ws.get_rca("inc-1")
    assert out == {"rca": None}
