"""System router (health/ready/version/metrics) is mounted."""
from __future__ import annotations


def test_system_router_importable():
    from backend.routers import system

    paths = [getattr(r, "path", "") for r in system.router.routes]
    assert any(p.endswith("/health") or p == "/health" for p in paths)
    assert any("ready" in p for p in paths)
    assert any("version" in p for p in paths)
    assert any("metrics" in p for p in paths)


def test_system_mounted_on_app():
    from backend.server import app

    paths = []
    for r in app.routes:
        p = getattr(r, "path", None)
        if p:
            paths.append(p)
    assert "/health" in paths
    assert "/ready" in paths
    assert "/version" in paths
    assert "/metrics" in paths
