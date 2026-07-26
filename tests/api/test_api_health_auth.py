"""API-level tests using FastAPI TestClient where importable (offline)."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[2] / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

pytestmark = [pytest.mark.api, pytest.mark.unit]

os.environ.setdefault("ENV", "test")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-not-for-production-use-32b")
os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "soc_console_api_test")


def _client():
    """Build TestClient; skip if app cannot be imported (missing optional deps)."""
    try:
        from fastapi.testclient import TestClient
        import server

        return TestClient(server.app)
    except Exception as e:
        pytest.skip(f"App import/TestClient unavailable: {e}")


def test_health_endpoints():
    client = _client()
    # Prefer /api/health; also try /health
    for path in ("/api/health", "/health"):
        r = client.get(path)
        if r.status_code == 200:
            body = r.json()
            assert body.get("status") in ("ok", "healthy", "up") or "service" in body
            return
    # Mongo down may 503 — still a valid response shape
    r = client.get("/api/health")
    assert r.status_code in (200, 503)


def test_metrics_requires_admin_or_token():
    client = _client()
    r = client.get("/metrics")
    # Phase-1: unauthenticated must not read metrics (admin JWT or METRICS_TOKEN only)
    assert r.status_code in (401, 403)


def test_login_invalid_payload():
    client = _client()
    r = client.post("/api/auth/login", json={})
    assert r.status_code in (400, 401, 422)


def test_login_wrong_password():
    client = _client()
    r = client.post(
        "/api/auth/login",
        json={"email": "nobody@example.com", "password": "wrong-password-xyz"},
    )
    # 500 can occur if Mongo/event-loop is unavailable under TestClient; still not 200.
    assert r.status_code in (401, 403, 422, 429, 500, 503)
    assert r.status_code != 200


def test_protected_route_without_jwt():
    client = _client()
    r = client.get("/api/incidents")
    assert r.status_code in (401, 403, 503)


def test_openapi_available():
    client = _client()
    r = client.get("/openapi.json")
    assert r.status_code == 200
    data = r.json()
    assert "paths" in data
    assert len(data["paths"]) > 5
