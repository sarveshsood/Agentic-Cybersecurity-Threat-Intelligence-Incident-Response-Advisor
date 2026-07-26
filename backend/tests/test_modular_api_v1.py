"""v1.1 modularization tests — router package + /api and /api/v1 parity.

Structural tests are fully offline. Live HTTP checks hit a running API if present
(optional), avoiding Starlette TestClient + Motor event-loop issues on Windows.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
os.environ.setdefault("ENV", "test")
os.environ.setdefault("JWT_SECRET", "ci-jwt-secret-not-for-production-use-32b")
os.environ.setdefault("FORCE_MOCK_TI", "true")
os.environ.setdefault("MONGO_URL", os.environ.get("MONGO_URL", "mongodb://127.0.0.1:27017"))
os.environ.setdefault("DB_NAME", os.environ.get("DB_NAME", "soc_console"))

pytestmark = [pytest.mark.unit]

LIVE_BASE = os.environ.get("ACTIRA_TEST_BASE", "http://127.0.0.1:8001").rstrip("/")


def test_router_package_imports():
    from backend.routers import (
        analytics,
        audit,
        auth,
        eval_routes,
        incidents,
        investigate,
        kb,
        logs,
        meta,
        review,
        roadmap,
        settings,
        workspace,
        build_api_router,
    )

    api = build_api_router()
    assert api is not None
    for mod in (
            analytics,
            audit,
            auth,
            eval_routes,
            incidents,
            investigate,
            kb,
            logs,
            meta,
            review,
            roadmap,
            settings,
            workspace,
    ):
        assert hasattr(mod, "router"), mod.__name__


def test_core_services_exports():
    from backend.core import services as svc
    from backend.core.database import client, db

    assert db is not None
    assert client is not None
    assert callable(svc.get_settings)
    assert callable(svc.health_check)
    assert callable(svc.audit)
    assert callable(svc.seed_demo_data)


def test_server_app_has_api_and_v1_routes():
    import backend.server as server

    paths = {getattr(r, "path", None) for r in server.app.routes}
    assert "/api/health" in paths
    assert "/api/auth/login" in paths
    assert "/api/incidents" in paths
    assert "/api/v1/health" in paths
    assert "/api/v1/auth/login" in paths
    assert "/api/v1/incidents" in paths
    assert "/health" in paths
    assert "/ready" in paths
    assert "/version" in paths


def test_openapi_includes_v1_paths():
    import backend.server as server

    schema = server.app.openapi()
    paths = schema.get("paths") or {}
    assert "/api/health" in paths
    assert "/api/v1/health" in paths
    assert "/api/auth/login" in paths
    assert "/api/v1/auth/login" in paths
    # Rough parity: same number of /api vs /api/v1 path keys
    api_n = sum(1 for p in paths if p.startswith("/api/") and not p.startswith("/api/v1"))
    v1_n = sum(1 for p in paths if p.startswith("/api/v1"))
    assert api_n == v1_n
    assert api_n >= 40


def test_server_reexports_db_for_compat():
    import backend.server as server

    assert hasattr(server, "db")
    assert hasattr(server, "app")
    assert callable(getattr(server, "seed_demo_data", None))


def test_build_api_router_route_count_stable():
    from backend.routers import build_api_router

    a = build_api_router()
    b = build_api_router()
    assert len(a.routes) == len(b.routes)
    assert len(a.routes) >= 20


def _live_get(path: str):
    import urllib.error
    import urllib.request

    try:
        with urllib.request.urlopen(f"{LIVE_BASE}{path}", timeout=3) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.URLError as e:
        pytest.skip(f"API not reachable at {LIVE_BASE}: {e}")
    except Exception as e:
        pytest.skip(f"API request failed: {e}")


def test_live_health_api_and_v1_if_server_up():
    """Optional: when uvicorn is running on ACTIRA_TEST_BASE."""
    import json

    s1, b1 = _live_get("/api/health")
    s2, b2 = _live_get("/api/v1/health")
    assert s1 == 200 and s2 == 200
    j1, j2 = json.loads(b1), json.loads(b2)
    assert j1.get("service") == "ACTIRA"
    assert j2.get("service") == "ACTIRA"


def test_live_login_parity_if_server_up():
    import json
    import urllib.error
    import urllib.request

    payload = json.dumps(
        {"email": "analyst@soc.example.com", "password": "Analyst123!"}
    ).encode()

    def post(path: str):
        req = urllib.request.Request(
            f"{LIVE_BASE}{path}",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return resp.status, json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            try:
                return e.code, json.loads(body)
            except Exception:
                return e.code, {"raw": body}
        except urllib.error.URLError as e:
            pytest.skip(f"API not reachable at {LIVE_BASE}: {e}")

    # Probe health first
    _live_get("/api/health")
    c1, b1 = post("/api/auth/login")
    c2, b2 = post("/api/v1/auth/login")
    assert c1 == c2, (c1, b1, c2, b2)
    if c1 == 200:
        assert b1.get("access_token") and b2.get("access_token")
