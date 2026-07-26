"""H-07 PR-1: feature flags env parsing, snapshot, require_feature dependency."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

pytestmark = [pytest.mark.unit]


def test_env_bool_defaults_and_truthy(monkeypatch):
    from backend.feature_flags import env_bool

    monkeypatch.delenv("FEATURE_TEST_X", raising=False)
    assert env_bool("FEATURE_TEST_X") is False
    assert env_bool("FEATURE_TEST_X", default=True) is True

    for v in ("1", "true", "YES", "On"):
        monkeypatch.setenv("FEATURE_TEST_X", v)
        assert env_bool("FEATURE_TEST_X") is True

    for v in ("0", "false", "NO", "off"):
        monkeypatch.setenv("FEATURE_TEST_X", v)
        assert env_bool("FEATURE_TEST_X") is False


def test_collab_features_default_all_off(monkeypatch):
    from backend.feature_flags import FEATURE_ENV_MAP, FEATURE_KEYS, collab_features

    for env in FEATURE_ENV_MAP.values():
        monkeypatch.delenv(env, raising=False)

    snap = collab_features()
    assert set(snap.keys()) == set(FEATURE_KEYS)
    assert all(v is False for v in snap.values())


def test_collab_features_selective_on(monkeypatch):
    from backend.feature_flags import FEATURE_ENV_MAP, collab_features, is_feature_enabled

    for env in FEATURE_ENV_MAP.values():
        monkeypatch.delenv(env, raising=False)
    monkeypatch.setenv("FEATURE_COLLAB_ASSIGN", "1")
    monkeypatch.setenv("FEATURE_PINS", "true")

    snap = collab_features()
    assert snap["collab_assign"] is True
    assert snap["pins"] is True
    assert snap["collab_comments"] is False
    assert is_feature_enabled("collab_assign") is True
    assert is_feature_enabled("saved_filters") is False
    assert is_feature_enabled("nope") is False


def test_require_feature_404_when_off(monkeypatch):
    from backend.feature_flags import require_feature

    monkeypatch.delenv("FEATURE_COLLAB_COMMENTS", raising=False)

    app = FastAPI()

    @app.get("/demo", dependencies=[Depends(require_feature("collab_comments"))])
    async def demo():
        return {"ok": True}

    client = TestClient(app)
    r = client.get("/demo")
    assert r.status_code == 404
    assert "collab_comments" in (r.json().get("detail") or "")


def test_require_feature_allows_when_on(monkeypatch):
    from backend.feature_flags import require_feature

    monkeypatch.setenv("FEATURE_COLLAB_COMMENTS", "1")

    app = FastAPI()

    @app.get("/demo", dependencies=[Depends(require_feature("collab_comments"))])
    async def demo():
        return {"ok": True}

    client = TestClient(app)
    r = client.get("/demo")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_meta_features_route_shape():
    """Route is registered on the real app under /api and /api/v1."""
    from backend.server import app

    paths = {getattr(r, "path", None) for r in app.routes}
    assert "/api/meta/features" in paths
    assert "/api/v1/meta/features" in paths

    client = TestClient(app)
    r = client.get("/api/meta/features")
    assert r.status_code == 200
    body = r.json()
    for key in (
        "collab_assign",
        "collab_comments",
        "notification_center",
        "saved_filters",
        "pins",
    ):
        assert key in body
        assert isinstance(body[key], bool)
