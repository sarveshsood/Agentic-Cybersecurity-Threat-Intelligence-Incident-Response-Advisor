"""QA recommendation signals + advisory recommendations."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

pytestmark = [pytest.mark.unit]


def test_models_roundtrip():
    from backend.qa.recommendation_models import TestRecommendation, TestRecommendationSignal

    s = TestRecommendationSignal(
        entity_type="module",
        entity_id="Backend",
        signal_type="coverage_gap",
        value=0.4,
        source="coverage_tool",
        metadata={"percent": 60},
    )
    assert 0 <= s.value <= 1
    r = TestRecommendation(
        title="Add coverage",
        description="x",
        recommendation_type="add_coverage",
        risk_score=0.7,
        confidence=0.8,
        explanation="because",
        related_entities=["Backend"],
        signal_ids=[s.id],
    )
    assert r.status == "open"
    d = r.model_dump(mode="json")
    assert d["recommendation_type"] == "add_coverage"


def test_recommendations_route_registered():
    from backend.server import app

    paths = {getattr(r, "path", None) for r in app.routes}
    assert "/api/qa/recommendations" in paths
    assert "/api/qa/recommendations/refresh" in paths
    assert "/api/qa/signals" in paths


def test_recommendations_from_signals_coverage():
    from backend.qa.recommendation_models import TestRecommendationSignal
    from backend.services.qa_recommendation_service import _recommendations_from_signals
    from backend.models import utc_now

    now = utc_now()
    sigs = [
        TestRecommendationSignal(
            entity_type="module",
            entity_id="Backend",
            signal_type="coverage_gap",
            value=0.5,
            timestamp=now,
            source="coverage_tool",
            metadata={"percent": 50.0},
        ),
        TestRecommendationSignal(
            entity_type="test",
            entity_id="tests.test_x::test_y",
            signal_type="failure_rate",
            value=1.0,
            timestamp=now,
            source="test_runner",
            metadata={"message": "assert False"},
        ),
    ]
    recs = _recommendations_from_signals(sigs)
    types = {r.recommendation_type for r in recs}
    assert "add_coverage" in types
    assert recs[0].risk_score >= 0
