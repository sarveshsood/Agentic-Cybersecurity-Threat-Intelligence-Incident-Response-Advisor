"""QA Health Center PR-1: flag, dual mount, healthz 404-when-off."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

pytestmark = [pytest.mark.unit]


def test_qa_routes_registered():
    from backend.server import app

    paths = {getattr(r, "path", None) for r in app.routes}
    assert "/api/qa/healthz" in paths
    assert "/api/v1/qa/healthz" in paths


def test_qa_healthz_404_when_flag_off(monkeypatch):
    # Use explicit "0" (not delenv): load_dotenv(backend/.env) re-enables from file
    # when the var is missing, which turns a 404 into auth 401.
    monkeypatch.setenv("FEATURE_QA_HEALTH_CENTER", "0")
    from backend.server import app

    client = TestClient(app)
    r = client.get("/api/qa/healthz")
    assert r.status_code == 404
    detail = r.json().get("detail") or ""
    assert "qa_health_center" in detail


def test_qa_healthz_401_when_flag_on_no_auth(monkeypatch):
    monkeypatch.setenv("FEATURE_QA_HEALTH_CENTER", "1")
    from backend.server import app

    client = TestClient(app)
    r = client.get("/api/qa/healthz")
    # Feature present → auth required (not 404)
    assert r.status_code in (401, 403)


def test_is_feature_enabled_qa(monkeypatch):
    from backend.feature_flags import is_feature_enabled

    monkeypatch.delenv("FEATURE_QA_HEALTH_CENTER", raising=False)
    assert is_feature_enabled("qa_health_center") is False
    monkeypatch.setenv("FEATURE_QA_HEALTH_CENTER", "1")
    assert is_feature_enabled("qa_health_center") is True
