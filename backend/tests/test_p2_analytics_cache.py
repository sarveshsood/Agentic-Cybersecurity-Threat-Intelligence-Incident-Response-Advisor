"""P2 analytics cache + KPI engine smoke (offline)."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

pytestmark = [pytest.mark.unit]


def test_analytics_cache_ttl_roundtrip():
    from backend.services import analytics_cache as cache

    cache.invalidate()
    assert cache.get("x") is None
    cache.set("x", {"a": 1}, ttl=60)
    assert cache.get("x") == {"a": 1}
    cache.set("y", 2, ttl=0)  # ttl 0 → no store
    assert cache.get("y") is None
    assert cache.invalidate("x") == 1
    assert cache.get("x") is None


def test_kpi_ttl_env_helpers():
    from backend.services import analytics_cache as cache

    assert cache.kpi_ttl() >= 0
    assert cache.analytics_ttl() >= 0


def test_analytics_router_exposes_force_refresh():
    from backend.routers import analytics as ar

    paths = {getattr(r, "path", None) for r in ar.router.routes}
    assert "/kpis" in paths
    assert "/analytics" in paths
