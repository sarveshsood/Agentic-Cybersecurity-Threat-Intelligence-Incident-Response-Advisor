"""P3: LLM usage meter on KPIs (offline unit)."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

pytestmark = [pytest.mark.unit]


def test_usage_snapshot_shape_offline():
    from backend.llm_usage import usage_snapshot
    import asyncio

    snap = asyncio.run(usage_snapshot({"llm_token_budget_monthly": 1000}, db=None))
    assert snap["month"]
    assert snap["tokens_used"] == 0
    assert snap["budget"] == 1000
    assert snap["unlimited"] is False
    assert snap["remaining"] == 1000
    assert snap["percent_used"] == 0.0
    assert "calls" in snap
    assert "exhausted" in snap


def test_usage_snapshot_unlimited():
    from backend.llm_usage import usage_snapshot
    import asyncio

    snap = asyncio.run(usage_snapshot({"llm_token_budget_monthly": 0}, db=None))
    assert snap["unlimited"] is True
    assert snap["remaining"] is None
    assert snap["percent_used"] is None


@pytest.mark.asyncio
async def test_kpis_attach_llm_usage_not_cached():
    from backend.services import analytics_cache as cache
    from backend.services import analytics_service as svc

    cache.invalidate()
    fake_usage = {
        "month": "2026-07",
        "tokens_used": 42,
        "calls": 3,
        "budget": 100,
        "unlimited": False,
        "remaining": 58,
        "percent_used": 42.0,
        "exhausted": False,
        "last_provider": "mock",
        "last_model": "x",
    }
    base = {
        "total_incidents": 1,
        "critical_incidents": 0,
        "pending_review": 0,
        "approved": 0,
        "rejected": 0,
        "closed": 0,
        "new": 0,
        "in_progress": 0,
        "acceptance_rate": 0.0,
        "mean_grounding_score": 0.0,
        "mean_mttr_hours": None,
        "median_mttr_hours": None,
        "mttr_sample_size": 0,
        "severity_distribution": [],
        "status_distribution": [],
        "top_ioc_types": [],
        "attack_heatmap": {},
        "engine": "test",
    }

    with patch.object(svc, "_kpis_compute", new=AsyncMock(return_value=dict(base))), patch(
        "backend.core.services.get_settings", new=AsyncMock(return_value={"llm_token_budget_monthly": 100})
    ), patch(
        "backend.llm_usage.usage_snapshot", new=AsyncMock(return_value=fake_usage)
    ):
        first = await svc.kpis(force_refresh=True)
        assert first["llm_usage"]["tokens_used"] == 42
        assert first["cache"] == "miss"

        second = await svc.kpis(force_refresh=False)
        assert second["cache"] == "hit"
        # Fresh attach even on cache hit
        assert second["llm_usage"]["tokens_used"] == 42
        # Cached payload must not bake llm_usage into the store permanently as sole source
        assert "llm_usage" not in (cache.get("kpis:v2") or {})
