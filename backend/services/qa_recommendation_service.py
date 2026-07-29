"""Generate advisory TestRecommendationSignal + TestRecommendation from live QA data.

Rule-based only for v1 (KD-12) — no LLM auto-block. Optional narrative fields are
templates, not free-form model authority.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from backend.models import new_id, utc_now
from backend.qa.recommendation_models import (
    TestRecommendation,
    TestRecommendationSignal,
)
from backend.qa.readiness import CODE_COVERAGE_GATE
from backend.repositories.qa_repo import json_safe, qa_repo
from backend.database import db

logger = logging.getLogger("actira")


def _clamp01(x: float) -> float:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(1.0, v))


async def _collect_signals() -> List[TestRecommendationSignal]:
    now = utc_now()
    signals: List[TestRecommendationSignal] = []

    # --- Coverage gaps (packages) ---
    cov = await qa_repo.get_coverage(build_id=None)
    if cov:
        backend = cov.get("backend") or {}
        pct = backend.get("percent")
        if pct is not None:
            gap = max(0.0, float(CODE_COVERAGE_GATE) - float(pct)) / float(CODE_COVERAGE_GATE)
            signals.append(
                TestRecommendationSignal(
                    entity_type="module",
                    entity_id="Backend",
                    signal_type="coverage_gap",
                    value=_clamp01(gap),
                    timestamp=now,
                    source="coverage_tool",
                    metadata={
                        "percent": pct,
                        "gate": CODE_COVERAGE_GATE,
                        "build_id": (cov.get("build") or {}).get("id"),
                        "source": cov.get("source"),
                        "lines_covered": backend.get("lines_covered"),
                        "lines_valid": backend.get("lines_valid"),
                    },
                )
            )
        for pkg in (cov.get("packages") or [])[:40]:
            lr = pkg.get("line_rate")
            if lr is None:
                continue
            try:
                rate = float(lr)
            except (TypeError, ValueError):
                continue
            if rate >= 0.96:
                continue
            name = pkg.get("name") or "unknown"
            signals.append(
                TestRecommendationSignal(
                    entity_type="file",
                    entity_id=str(name),
                    signal_type="coverage_gap",
                    value=_clamp01(1.0 - rate),
                    timestamp=now,
                    source="coverage_tool",
                    metadata={"line_rate": rate, "branch_rate": pkg.get("branch_rate")},
                )
            )

    # --- Suite failure rates ---
    for suite_type in ("unit", "golden", "security", "e2e"):
        run = await qa_repo.find_suite(suite_type, build_id=None)
        if not run:
            if suite_type == "unit":
                signals.append(
                    TestRecommendationSignal(
                        entity_type="suite",
                        entity_id="unit",
                        signal_type="stale_suite",
                        value=1.0,
                        timestamp=now,
                        source="test_runner",
                        metadata={"note": "no unit suite ingested"},
                    )
                )
            continue
        counts = run.get("counts") or {}
        total = int(counts.get("total") or 0)
        failed = int(counts.get("failed") or 0) + int(counts.get("errors") or 0)
        if total > 0 and failed > 0:
            signals.append(
                TestRecommendationSignal(
                    entity_type="suite",
                    entity_id=suite_type,
                    signal_type="failure_rate",
                    value=_clamp01(failed / total),
                    timestamp=now,
                    source="test_runner",
                    metadata={
                        "run_id": run.get("id"),
                        "status": run.get("status"),
                        "failed": failed,
                        "total": total,
                        "build_id": (run.get("build") or {}).get("id"),
                        "source": run.get("source"),
                    },
                )
            )
        # Flaky-ish: high skip rate
        skipped = int(counts.get("skipped") or 0)
        if total > 5 and skipped / total >= 0.15:
            signals.append(
                TestRecommendationSignal(
                    entity_type="suite",
                    entity_id=suite_type,
                    signal_type="flakiness",
                    value=_clamp01(skipped / total),
                    timestamp=now,
                    source="test_runner",
                    metadata={"skipped": skipped, "total": total, "run_id": run.get("id")},
                )
            )

    # --- Per-test failures from latest unit run ---
    unit = await qa_repo.find_suite("unit", build_id=None)
    if unit and unit.get("id"):
        fails = (
            await db.qa_case_results.find(
                {"run_id": unit["id"], "status": {"$in": ["failed", "error"]}},
                {"_id": 0},
            )
            .limit(30)
            .to_list(30)
        )
        for f in fails:
            node = f.get("nodeid") or f.get("name") or "unknown"
            signals.append(
                TestRecommendationSignal(
                    entity_type="test",
                    entity_id=str(node)[:300],
                    signal_type="failure_rate",
                    value=1.0,
                    timestamp=now,
                    source="test_runner",
                    metadata={
                        "message": (f.get("message") or "")[:400],
                        "module": f.get("module"),
                        "run_id": unit.get("id"),
                    },
                )
            )

    # --- Catalog use cases: blocked / not_run ---
    try:
        col = db.qa_test_cases
        blocked_n = await col.count_documents({"status": "blocked"})
        not_run_n = await col.count_documents({"status": {"$in": ["not_run", None]}})
        fail_n = await col.count_documents({"status": "fail"})
        total_c = await col.count_documents({})
        if total_c:
            if blocked_n:
                signals.append(
                    TestRecommendationSignal(
                        entity_type="module",
                        entity_id="Catalog",
                        signal_type="blocked_manual",
                        value=_clamp01(blocked_n / total_c),
                        timestamp=now,
                        source="catalog",
                        metadata={"blocked": blocked_n, "catalog_total": total_c},
                    )
                )
            if not_run_n:
                signals.append(
                    TestRecommendationSignal(
                        entity_type="module",
                        entity_id="Catalog",
                        signal_type="not_run",
                        value=_clamp01(not_run_n / total_c),
                        timestamp=now,
                        source="catalog",
                        metadata={"not_run": not_run_n, "catalog_total": total_c},
                    )
                )
            if fail_n:
                signals.append(
                    TestRecommendationSignal(
                        entity_type="module",
                        entity_id="Catalog",
                        signal_type="failure_rate",
                        value=_clamp01(fail_n / total_c),
                        timestamp=now,
                        source="catalog",
                        metadata={"fail": fail_n, "catalog_total": total_c},
                    )
                )
    except Exception as e:
        logger.debug("catalog signals skip: %s", e)

    # --- Readiness blockers ---
    release = await qa_repo.latest_release()
    if release:
        for b in release.get("blockers") or []:
            signals.append(
                TestRecommendationSignal(
                    entity_type="module",
                    entity_id="Release",
                    signal_type="stale_suite" if "fresh" in str(b) else "failure_rate",
                    value=1.0,
                    timestamp=now,
                    source="readiness",
                    metadata={"blocker": b, "verdict": release.get("verdict")},
                )
            )

    return signals


def _recommendations_from_signals(
    signals: List[TestRecommendationSignal],
) -> List[TestRecommendation]:
    now = utc_now()
    recs: List[TestRecommendation] = []
    by_type: Dict[str, List[TestRecommendationSignal]] = {}
    for s in signals:
        by_type.setdefault(s.signal_type, []).append(s)

    # Coverage
    cov_sigs = by_type.get("coverage_gap") or []
    if cov_sigs:
        top = sorted(cov_sigs, key=lambda x: x.value, reverse=True)[:8]
        backend = next((s for s in top if s.entity_id == "Backend"), top[0])
        pct = (backend.metadata or {}).get("percent")
        recs.append(
            TestRecommendation(
                title="Raise backend line coverage toward gate",
                description=(
                    f"Measured coverage is {pct}% (gate {CODE_COVERAGE_GATE}%). "
                    "Add tests for lowest-covered packages and re-run live quality."
                ),
                recommendation_type="add_coverage",
                risk_score=_clamp01(backend.value),
                confidence=0.85,
                explanation=(
                    "Coverage gap signal from ingested Cobertura snapshot. "
                    "Run Admin → Live unit + coverage for fresh measurement."
                ),
                related_entities=[s.entity_id for s in top],
                suggested_test_cases=[
                    {
                        "focus": s.entity_id,
                        "hint": f"Add unit tests targeting {s.entity_id} (line_rate gap value={s.value:.2f})",
                    }
                    for s in top
                    if s.entity_type in ("file", "module")
                ][:10],
                status="open",
                signal_ids=[s.id for s in top],
                created_at=now,
                updated_at=now,
            )
        )

    # Failing unit suite / tests
    fail_suite = [s for s in (by_type.get("failure_rate") or []) if s.entity_type == "suite"]
    fail_tests = [s for s in (by_type.get("failure_rate") or []) if s.entity_type == "test"]
    if fail_suite or fail_tests:
        top_tests = fail_tests[:10]
        recs.append(
            TestRecommendation(
                title="Stabilize failing unit tests",
                description=(
                    f"{len(fail_tests)} failing test case(s) in latest unit suite. "
                    "Fix assertions/environment, then re-run live quality."
                ),
                recommendation_type="stabilize_flaky"
                if (by_type.get("flakiness"))
                else "re_run_unit",
                risk_score=_clamp01(
                    max([s.value for s in fail_suite] + [1.0 if fail_tests else 0.0] or [0.5])
                ),
                confidence=0.9,
                explanation="Derived from latest unit JUnit case results (status failed/error).",
                related_entities=[s.entity_id for s in top_tests]
                + [s.entity_id for s in fail_suite],
                suggested_test_cases=[
                    {
                        "nodeid": s.entity_id,
                        "action": "fix_or_quarantine",
                        "message": (s.metadata or {}).get("message"),
                    }
                    for s in top_tests
                ],
                status="open",
                signal_ids=[s.id for s in fail_suite + top_tests],
                created_at=now,
                updated_at=now,
            )
        )

    # Flakiness / skips
    flaky = by_type.get("flakiness") or []
    if flaky:
        recs.append(
            TestRecommendation(
                title="Reduce high skip rate in automated suites",
                description="Large skip share can hide regressions. Review skip markers and CI env flags.",
                recommendation_type="stabilize_flaky",
                risk_score=_clamp01(max(s.value for s in flaky)),
                confidence=0.7,
                explanation="Skip ratio from suite counts ≥ 15%.",
                related_entities=[s.entity_id for s in flaky],
                status="open",
                signal_ids=[s.id for s in flaky],
                created_at=now,
                updated_at=now,
            )
        )

    # Manual / blocked catalog
    blocked = by_type.get("blocked_manual") or []
    not_run = by_type.get("not_run") or []
    if blocked:
        s0 = blocked[0]
        recs.append(
            TestRecommendation(
                title="Automate or verdict blocked use cases",
                description=(
                    f"{(s0.metadata or {}).get('blocked')} catalog cases are blocked "
                    "(manual/UI). Add Playwright mappings or Mark pass/fail."
                ),
                recommendation_type="automate",
                risk_score=_clamp01(s0.value * 0.8),
                confidence=0.75,
                explanation="Catalog statuses from QA use-case tracker.",
                related_entities=["Catalog", "TC-E2E-*"],
                suggested_test_cases=[
                    {
                        "action": "map_to_playwright",
                        "hint": "Extend frontend/e2e/qa-catalog.spec.js for high-priority blocked rows",
                    }
                ],
                status="open",
                signal_ids=[s.id for s in blocked],
                created_at=now,
                updated_at=now,
            )
        )
    if not_run:
        s0 = not_run[0]
        recs.append(
            TestRecommendation(
                title="Run remaining not_run catalog cases",
                description="Some TC-* cases have never been executed in a UI batch.",
                recommendation_type="re_run_unit",
                risk_score=_clamp01(s0.value * 0.5),
                confidence=0.65,
                explanation="Catalog not_run count vs total.",
                related_entities=["Catalog"],
                status="open",
                signal_ids=[s.id for s in not_run],
                created_at=now,
                updated_at=now,
            )
        )

    # Missing unit suite
    stale = by_type.get("stale_suite") or []
    if any(s.entity_id == "unit" for s in stale):
        recs.append(
            TestRecommendation(
                title="Ingest or run live unit suite",
                description="No unit suite snapshot found. Use Admin → Run live unit + coverage.",
                recommendation_type="ingest_artifacts",
                risk_score=0.95,
                confidence=0.95,
                explanation="Readiness unit_pass requires suite_type=unit artifacts.",
                related_entities=["unit", "Release"],
                status="open",
                signal_ids=[s.id for s in stale if s.entity_id == "unit"],
                created_at=now,
                updated_at=now,
            )
        )

    # Security gap if no security suite
    # (optional soft signal — only if we want)
    security = next(
        (s for s in (by_type.get("stale_suite") or []) if s.entity_id == "security"),
        None,
    )
    # if never produced security signal, check absence via suite list not needed

    # Sort by risk
    recs.sort(key=lambda r: r.risk_score, reverse=True)
    return recs


async def refresh_recommendations(*, actor: Optional[dict] = None) -> Dict[str, Any]:
    """Rebuild signals from live QA data and upsert open recommendations."""
    await qa_repo.ensure_indexes()
    signals = await _collect_signals()
    sig_docs = [s.model_dump(mode="json") for s in signals]
    await qa_repo.replace_signals(sig_docs)
    recs = _recommendations_from_signals(signals)
    rec_docs = [r.model_dump(mode="json") for r in recs]
    n = await qa_repo.upsert_recommendations(rec_docs)
    return json_safe(
        {
            "ok": True,
            "signal_count": len(sig_docs),
            "recommendation_count": n,
            "generated_at": utc_now().isoformat(),
            "actor": (actor or {}).get("email") or (actor or {}).get("sub"),
            "top": rec_docs[:5],
        }
    )


async def list_signals(
    *,
    signal_type: Optional[str] = None,
    entity_type: Optional[str] = None,
    limit: int = 100,
) -> Dict[str, Any]:
    items = await qa_repo.list_signals(
        signal_type=signal_type, entity_type=entity_type, limit=limit
    )
    return {"items": items, "total": len(items), "limit": limit}


async def list_recommendations(
    *,
    status: Optional[str] = None,
    recommendation_type: Optional[str] = None,
    limit: int = 50,
    auto_refresh_if_empty: bool = True,
) -> Dict[str, Any]:
    items = await qa_repo.list_recommendations(
        status=status, recommendation_type=recommendation_type, limit=limit
    )
    if auto_refresh_if_empty and not items:
        await refresh_recommendations()
        items = await qa_repo.list_recommendations(
            status=status, recommendation_type=recommendation_type, limit=limit
        )
    return {
        "items": items,
        "total": len(items),
        "limit": limit,
        "advisory": True,
        "note": "Recommendations are advisory (KD-12) — they never alone force NOT_READY.",
    }


async def set_recommendation_status(
    rid: str,
    *,
    actor: dict,
    status: str,
    note: Optional[str] = None,
) -> Dict[str, Any]:
    if (actor or {}).get("role") != "admin":
        raise HTTPException(403, "Updating recommendation status requires admin")
    allowed = {"open", "accepted", "rejected", "implemented"}
    if status not in allowed:
        raise HTTPException(400, f"status must be one of {sorted(allowed)}")
    row = await qa_repo.update_recommendation_status(rid, status=status, note=note)
    if not row:
        raise HTTPException(404, "Recommendation not found")
    return {"ok": True, "recommendation": row}
