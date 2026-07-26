"""RCA fallback + generate path (offline; no live LLM)."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

pytestmark = [pytest.mark.unit]


def _inc():
    return {
        "id": "inc-rca",
        "title": "Brute force",
        "severity": "high",
        "threat_score": 72,
        "summary": "SSH brute force",
        "techniques": [{"technique_id": "T1110", "name": "Brute Force", "tactic": "Credential Access"}],
        "iocs": [{"type": "ip", "value": "9.9.9.9", "threat_score": 80}],
        "correlation": {
            "attack_chain": [
                {
                    "timestamp": "2024-01-01T12:00:00+00:00",
                    "event_type": "failed_login",
                    "actor": "root",
                    "target": "ssh01",
                    "source_file": "auth.log",
                    "summary": "Failed password",
                }
            ],
            "correlations": [],
        },
    }


def test_fallback_rca_stitches_chain():
    from backend.rca import fallback_rca

    rca = fallback_rca(_inc(), reason="no key")
    assert rca.fallback is True
    assert "T1110" in rca.mitre_refs
    assert "failed_login" in rca.narrative or "chain" in rca.narrative.lower()
    assert rca.provider == "fallback"


@pytest.mark.asyncio
async def test_generate_rca_budget_fallback():
    from backend.llm_usage import BudgetExceededError
    from backend.rca import generate_rca

    with patch("backend.rca.assert_within_budget", create=True):
        with patch(
            "backend.llm_usage.assert_within_budget",
            new=AsyncMock(side_effect=BudgetExceededError(100, 50)),
        ):
            rca = await generate_rca(_inc(), settings={"llm_token_budget_monthly": 50})
    assert rca.fallback is True
    assert "budget" in (rca.fallback_reason or "").lower() or "budget" in rca.narrative.lower()


@pytest.mark.asyncio
async def test_generate_and_store_returns_envelope():
    from backend.services import workspace_service as ws
    from backend.models import WorkspaceRca, utc_now

    fake = WorkspaceRca(
        narrative="story",
        hypothesis="h",
        confidence=0.6,
        evidence=["e"],
        mitre_refs=["T1110"],
        unknowns=[],
        generated_at=utc_now(),
        provider="fallback",
        model="template",
        fallback=True,
        fallback_reason="test",
    )
    with patch.object(ws.incidents_repo, "find_by_id", new=AsyncMock(return_value=_inc())):
        with patch.object(
            ws.incidents_repo,
            "set_workspace_rca",
            new=AsyncMock(return_value={"id": "inc-rca", "workspace": {"rca": fake.model_dump(mode="json")}}),
        ):
            with patch("backend.rca.generate_rca", new=AsyncMock(return_value=fake)):
                with patch.object(ws.svc, "get_settings", new=AsyncMock(return_value={})):
                    with patch.object(ws.svc, "audit", new=AsyncMock()):
                        out = await ws.generate_and_store_rca(
                            "inc-rca", {"sub": "u1", "email": "a@b.c", "role": "analyst"}
                        )
    assert "rca" in out
    assert out["rca"]["narrative"] == "story"
    assert out["rca"]["fallback"] is True


def test_post_rca_route_registered():
    from backend.routers import workspace as wr

    paths = {(getattr(r, "path", None), tuple(sorted(getattr(r, "methods", []) or []))) for r in wr.router.routes}
    assert any(p[0] == "/incidents/{incident_id}/workspace/rca" and "POST" in p[1] for p in paths)
