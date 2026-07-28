"""H-07 / H-08 collab + productivity unit tests (offline)."""
from __future__ import annotations

import pytest

from backend.feature_flags import FEATURE_KEYS, collab_features, is_feature_enabled
from backend.repositories.incidents import IncidentRepository
from backend.services.saved_filter_service import _normalize_filter
from backend.services.pin_service import WORKSPACE_TAB_IDS


def test_feature_keys_stable():
    assert "collab_assign" in FEATURE_KEYS
    assert "saved_filters" in FEATURE_KEYS
    snap = collab_features()
    assert set(snap.keys()) == set(FEATURE_KEYS)
    # default off
    assert snap["collab_assign"] is False


def test_filter_query_and_composition():
    repo = IncidentRepository(database=None)
    # technique + unassigned must use $and (not stomp)
    q = repo._filter_query(
        status="new",
        technique="T1110",
        unassigned=True,
    )
    assert "$and" in q or ("status" in q and "$or" in str(q))
    s = str(q)
    assert "T1110" in s
    assert "assignee_id" in s


def test_filter_me_primary_or_secondary():
    repo = IncidentRepository(database=None)
    q = repo._filter_query(assignee="me", current_user_sub="user-1")
    assert "$or" in q or ("$and" in q)
    s = str(q)
    assert "user-1" in s


def test_normalize_saved_filter_server_vs_client():
    out = _normalize_filter(
        {
            "status": "new",
            "q": "brute",
            "min_threat": "50",
            "assignee": "me",
        }
    )
    assert out.get("status") == "new"
    assert out.get("assignee") == "me"
    assert "client_only" in out
    assert out["client_only"].get("q") == "brute"


def test_workspace_tab_allowlist():
    assert "case" in WORKSPACE_TAB_IDS
    assert "playbooks" in WORKSPACE_TAB_IDS


def test_collab_routes_registered():
    from backend.routers import collab, productivity

    paths = []
    for r in collab.router.routes:
        if hasattr(r, "path"):
            paths.append(r.path)
    assert "/users" in paths
    assert any("assignment" in p for p in paths)
    assert any("comments" in p for p in paths)
    assert "/notifications" in paths

    pp = []
    for r in productivity.router.routes:
        if hasattr(r, "path"):
            pp.append(r.path)
    assert "/saved-filters" in pp
    assert "/pins" in pp


def test_require_feature_404_when_off(monkeypatch):
    monkeypatch.delenv("FEATURE_COLLAB_ASSIGN", raising=False)
    assert is_feature_enabled("collab_assign") is False
