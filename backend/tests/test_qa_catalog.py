"""Use-case catalog seed + list (PR use cases)."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

pytestmark = [pytest.mark.unit]


def test_seed_file_has_all_cases():
    from backend.services.qa_catalog_service import load_seed_file

    payload = load_seed_file()
    assert payload["count"] >= 80
    cases = payload["cases"]
    assert len(cases) == payload["count"]
    ids = {c["id"] for c in cases}
    assert "TC-AUTH-001" in ids
    assert any(c.get("runner") == "golden" for c in cases)


def test_cases_route_registered():
    from backend.server import app

    paths = {getattr(r, "path", None) for r in app.routes}
    assert "/api/qa/cases" in paths
    assert "/api/qa/usecases/run" in paths
    assert "/api/qa/seed/catalog" in paths
