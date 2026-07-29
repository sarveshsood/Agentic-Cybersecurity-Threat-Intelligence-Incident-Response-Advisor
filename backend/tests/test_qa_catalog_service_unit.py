"""Unit tests for catalog service with mocked Mongo."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

pytestmark = [pytest.mark.unit]


class _Cursor:
    def __init__(self, rows):
        self._rows = list(rows)

    def sort(self, *a, **k):
        return self

    def skip(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def __aiter__(self):
        self._i = 0
        return self

    async def __anext__(self):
        if self._i >= len(self._rows):
            raise StopAsyncIteration
        row = self._rows[self._i]
        self._i += 1
        return row

    async def to_list(self, n):
        return list(self._rows)[:n]


class _Col:
    def __init__(self, rows=None):
        self.rows = list(rows or [])
        self.updates = []

    async def count_documents(self, q=None):
        return len(self.rows)

    def find(self, q=None, proj=None):
        return _Cursor(self.rows)

    async def find_one(self, q=None, proj=None, **kwargs):
        if not q:
            return self.rows[0] if self.rows else None
        if "id" in (q or {}):
            for r in self.rows:
                if r.get("id") == q["id"]:
                    return r
        return self.rows[0] if self.rows else None

    async def update_one(self, filt, upd, upsert=False):
        self.updates.append((filt, upd, upsert))
        return MagicMock(modified_count=1)

    async def create_index(self, *a, **k):
        return None

    async def insert_one(self, doc):
        self.rows.append(doc)


@pytest.mark.asyncio
async def test_list_cases_mocked():
    from backend.services import qa_catalog_service as cat

    cases = [
        {
            "id": "TC-A-001",
            "title": "t",
            "runner": "golden",
            "module": "AI",
            "status": "pass",
            "priority": "P0",
        },
        {
            "id": "TC-B-001",
            "title": "u",
            "runner": "manual",
            "module": "Backend",
            "status": "not_run",
            "priority": "P1",
        },
    ]
    col = _Col(cases)
    runs = _Col([])

    with patch.object(cat, "_col", return_value=col), patch.object(cat, "_runs_col", return_value=runs):
        with patch.object(cat, "ensure_seeded", new=AsyncMock()):
            out = await cat.list_cases(limit=50)
            assert out["total"] >= 1
            assert "stats" in out
            assert out["stats"]["pass"] >= 0


@pytest.mark.asyncio
async def test_get_case_404():
    from backend.services import qa_catalog_service as cat
    from fastapi import HTTPException

    with patch.object(cat, "ensure_seeded", new=AsyncMock()), patch.object(
        cat, "_col", return_value=_Col([])
    ):
        with pytest.raises(HTTPException) as ei:
            await cat.get_case("nope")
        assert ei.value.status_code == 404


@pytest.mark.asyncio
async def test_set_case_verdict_mocked():
    from backend.services import qa_catalog_service as cat

    col = _Col(
        [
            {
                "id": "TC-A-001",
                "title": "t",
                "runner": "manual",
                "status": "not_run",
                "run_count": 0,
            }
        ]
    )
    runs = _Col([])

    with patch.object(cat, "ensure_seeded", new=AsyncMock()), patch.object(
        cat, "_col", return_value=col
    ), patch.object(cat, "_runs_col", return_value=runs), patch.object(
        cat, "get_case", new=AsyncMock(return_value={"id": "TC-A-001", "status": "pass"})
    ):
        out = await cat.set_case_verdict(
            "TC-A-001", actor={"role": "admin", "email": "a@b.c"}, status="pass", note="ok"
        )
        assert out["ok"] is True
        assert out["status"] == "pass"


@pytest.mark.asyncio
async def test_set_case_verdict_forbidden():
    from backend.services import qa_catalog_service as cat
    from fastapi import HTTPException

    # RBAC is checked before ensure_seeded / Mongo — no patches required
    with pytest.raises(HTTPException) as ei:
        await cat.set_case_verdict("TC-A-001", actor={"role": "analyst"}, status="pass")
    assert ei.value.status_code == 403


@pytest.mark.asyncio
async def test_seed_catalog_already_present():
    from backend.services import qa_catalog_service as cat

    col = _Col([{"id": "x"}])
    with patch.object(cat, "_col", return_value=col):
        out = await cat.seed_catalog(force=False)
        assert out["seeded"] is False
