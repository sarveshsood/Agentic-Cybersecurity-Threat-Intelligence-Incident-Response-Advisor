"""Pydantic models for QA test recommendations (advisory; KD-12).

Collections:
  - ``qa_recommendation_signals``
  - ``qa_recommendations``
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from backend.models import new_id, utc_now

EntityType = Literal["module", "file", "endpoint", "prompt", "test", "use_case", "suite"]
SignalType = Literal[
    "churn",
    "complexity",
    "failure_rate",
    "coverage_gap",
    "ai_hallucination",
    "flakiness",
    "cost",
    "not_run",
    "blocked_manual",
    "stale_suite",
    "security_gap",
]
SignalSource = Literal[
    "git",
    "coverage_tool",
    "test_runner",
    "llm_eval",
    "catalog",
    "readiness",
    "live_pytest",
]
RecommendationType = Literal[
    "automate",
    "stabilize_flaky",
    "add_coverage",
    "add_ai_eval",
    "performance",
    "security",
    "re_run_unit",
    "ingest_artifacts",
]
RecommendationStatus = Literal["open", "accepted", "rejected", "implemented"]


class TestRecommendationSignal(BaseModel):
    """Atomic quality signal feeding recommendation ranking."""

    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=new_id)
    entity_type: EntityType
    entity_id: str
    signal_type: SignalType
    value: float = Field(
        ...,
        description="Normalized 0–1 when possible; otherwise raw (document in metadata)",
    )
    timestamp: datetime = Field(default_factory=utc_now)
    source: SignalSource
    metadata: Dict[str, Any] = Field(default_factory=dict)


class TestRecommendation(BaseModel):
    """Advisory recommendation — never auto-blocks release (KD-12)."""

    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=new_id)
    title: str
    description: str = ""
    recommendation_type: RecommendationType
    risk_score: float = Field(0.0, ge=0.0, le=1.0)
    confidence: float = Field(0.5, ge=0.0, le=1.0)
    explanation: str = ""
    related_entities: List[str] = Field(default_factory=list)
    suggested_test_cases: Optional[List[Dict[str, Any]]] = None
    status: RecommendationStatus = "open"
    signal_ids: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class RecommendationStatusBody(BaseModel):
    status: RecommendationStatus
    note: Optional[str] = Field(None, max_length=1000)
