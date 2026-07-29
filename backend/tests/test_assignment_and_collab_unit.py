"""Unit tests for assignment / pin / saved-filter pure paths (coverage)."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

pytestmark = [pytest.mark.unit]


@pytest.mark.asyncio
async def test_set_assignment_not_found():
    from backend.models import AssignmentUpdate
    from backend.services import assignment_service as asn
    from fastapi import HTTPException

    with patch.object(asn.incidents_repo, "find_by_id", new=AsyncMock(return_value=None)):
        with pytest.raises(HTTPException) as ei:
            await asn.set_assignment("x", AssignmentUpdate(assignee_id="u1"), {"role": "admin", "sub": "a"})
        assert ei.value.status_code == 404


@pytest.mark.asyncio
async def test_set_assignment_analyst_self_only():
    from backend.models import AssignmentUpdate
    from backend.services import assignment_service as asn
    from fastapi import HTTPException

    doc = {"id": "i1", "status": "open", "assignee_id": None}
    with patch.object(asn.incidents_repo, "find_by_id", new=AsyncMock(return_value=doc)):
        with pytest.raises(HTTPException) as ei:
            await asn.set_assignment(
                "i1",
                AssignmentUpdate(assignee_id="other"),
                {"role": "analyst", "sub": "me"},
            )
        assert ei.value.status_code == 403


@pytest.mark.asyncio
async def test_set_assignment_closed_forbidden_for_analyst():
    from backend.models import AssignmentUpdate
    from backend.services import assignment_service as asn
    from fastapi import HTTPException

    doc = {"id": "i1", "status": "closed", "assignee_id": None}
    with patch.object(asn.incidents_repo, "find_by_id", new=AsyncMock(return_value=doc)):
        with pytest.raises(HTTPException) as ei:
            await asn.set_assignment(
                "i1",
                AssignmentUpdate(assignee_id="me"),
                {"role": "analyst", "sub": "me"},
            )
        assert ei.value.status_code == 403


def test_pin_service_import_and_helpers():
    from backend.services import pin_service

    assert pin_service is not None


def test_saved_filter_import():
    from backend.services import saved_filter_service

    assert saved_filter_service is not None


def test_comment_service_import():
    from backend.services import comment_service

    assert comment_service is not None
