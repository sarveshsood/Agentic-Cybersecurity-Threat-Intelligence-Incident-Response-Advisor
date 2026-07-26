"""Ops / Health status service (offline unit)."""
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
async def test_ops_status_shape_with_mocked_mongo():
    from backend.services import ops_service

    health = {"status": "ok", "service": "ACTIRA", "mongo": "up"}
    fake_usage = {
        "month": "2026-07",
        "tokens_used": 10,
        "budget": 100,
        "unlimited": False,
        "percent_used": 10.0,
        "exhausted": False,
    }

    with patch("backend.services.ops_service.svc.health_check", new=AsyncMock(return_value=health)), patch(
        "backend.services.ops_service.svc.get_settings", new=AsyncMock(return_value={})
    ), patch(
        "backend.services.ops_service.job_worker_enabled", return_value=False
    ), patch(
        "backend.llm_usage.usage_snapshot", new=AsyncMock(return_value=fake_usage)
    ), patch(
        "backend.services.ops_service.db"
    ) as mock_db:
        mock_db.log_jobs.count_documents = AsyncMock(return_value=0)
        mock_db.log_jobs.find = lambda *a, **k: type(
            "C",
            (),
            {
                "sort": lambda self, *x, **y: self,
                "limit": lambda self, *x, **y: self,
                "to_list": AsyncMock(return_value=[]),
            },
        )()

        out = await ops_service.ops_status()

    assert out["ready"] is True
    assert out["mongo"] == "up"
    assert out["job_worker_enabled"] is False
    assert "pipeline_trace" in out
    assert "analytics_cache" in out
    assert out["llm_usage"]["tokens_used"] == 10
    assert "docs" in out
    assert "ha_validation" in out["docs"]


def test_ops_router_exposes_ops_status():
    from backend.routers import meta as m

    paths = {getattr(r, "path", None) for r in m.router.routes}
    assert "/ops/status" in paths
