"""Deterministic release readiness algorithm (qa-readiness-v1).

Pure function of suite runs + coverage + defects — no LLM authority.
See ``docs/product/TESTING_HEALTH_CENTER_DESIGN.md`` §11.
"""
from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.qa.module_map import MODULE_MAP_VERSION

ALGORITHM_VERSION = "qa-readiness-v1"
# Org gate: backend Cobertura line-rate must be **>= 96%** (product: "more than 95%")
CODE_COVERAGE_GATE = 96.0


def _env_bool(name: str, default: bool = False) -> bool:
    raw = (os.environ.get(name) or "").strip().lower()
    if not raw:
        return default
    if raw in ("1", "true", "yes", "on"):
        return True
    if raw in ("0", "false", "no", "off"):
        return False
    return default


def coverage_mode() -> str:
    raw = (os.environ.get("QA_READINESS_COVERAGE_MODE") or "soft").strip().lower()
    return "hard" if raw == "hard" else "soft"


def max_unit_age_hours() -> float:
    try:
        return float(os.environ.get("QA_READINESS_MAX_UNIT_AGE_HOURS") or "72")
    except (TypeError, ValueError):
        return 72.0


def max_golden_age_hours() -> float:
    try:
        return float(os.environ.get("QA_READINESS_MAX_GOLDEN_AGE_HOURS") or "168")
    except (TypeError, ValueError):
        return 168.0


def require_security() -> bool:
    return _env_bool("QA_READINESS_REQUIRE_SECURITY", False)


def require_e2e() -> bool:
    return _env_bool("QA_READINESS_REQUIRE_E2E", False)


def _parse_ts(raw: Any) -> Optional[datetime]:
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.replace(tzinfo=timezone.utc)
    s = str(raw).strip()
    if not s:
        return None
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _age_hours(finished_at: Any, now: Optional[datetime] = None) -> Optional[float]:
    dt = _parse_ts(finished_at)
    if not dt:
        return None
    now = now or datetime.now(timezone.utc)
    return max(0.0, (now - dt).total_seconds() / 3600.0)


def _suite_passed(run: Optional[Dict[str, Any]]) -> bool:
    if not run:
        return False
    if run.get("status") == "passed":
        return True
    counts = run.get("counts") or {}
    failed = int(counts.get("failed") or 0)
    errors = int(counts.get("errors") or 0)
    total = int(counts.get("total") or 0)
    return total > 0 and failed == 0 and errors == 0 and run.get("status") != "error"


def _canonical_hash(obj: Any) -> str:
    blob = json.dumps(obj, sort_keys=True, default=str, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def compute_readiness(
    *,
    unit_run: Optional[Dict[str, Any]] = None,
    golden_run: Optional[Dict[str, Any]] = None,
    security_run: Optional[Dict[str, Any]] = None,
    e2e_run: Optional[Dict[str, Any]] = None,
    coverage: Optional[Dict[str, Any]] = None,
    open_critical_defects: int = 0,
    build: Optional[Dict[str, Any]] = None,
    quality_score: Optional[float] = None,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Return READY / NOT_READY snapshot fields (pure)."""
    now = now or datetime.now(timezone.utc)
    cov_mode = coverage_mode()
    soft_warnings: List[str] = []
    checklist: List[Dict[str, Any]] = []
    blockers: List[str] = []

    def hard(gate_id: str, passed: bool, **extra: Any) -> None:
        row = {"id": gate_id, "passed": bool(passed), "hard": True, **extra}
        checklist.append(row)
        if not passed:
            blockers.append(gate_id)

    def soft_gate(gate_id: str, passed: bool, note: str = "", **extra: Any) -> None:
        checklist.append(
            {"id": gate_id, "passed": bool(passed), "hard": False, "note": note, **extra}
        )
        if not passed and note:
            soft_warnings.append(note)

    # unit_pass — requires an ingested JUnit suite with suite_type=unit that passed
    unit_ok = _suite_passed(unit_run)
    unit_note = ""
    if not unit_run:
        unit_note = "no unit JUnit suite ingested — Admin → Ingest sample_junit.xml or CI"
    elif not unit_ok:
        unit_note = (
            f"latest unit suite status={(unit_run or {}).get('status')!r} "
            f"failed={(unit_run.get('counts') or {}).get('failed')} "
            f"build={(unit_run.get('build') or {}).get('id')}"
        )
    hard(
        "unit_pass",
        unit_ok,
        note=unit_note or None,
        evidence_run_id=(unit_run or {}).get("id"),
    )

    # unit_fresh
    unit_age = _age_hours((unit_run or {}).get("finished_at"), now)
    unit_fresh = unit_ok and unit_age is not None and unit_age <= max_unit_age_hours()
    if unit_run and unit_age is None:
        unit_fresh = unit_ok  # missing timestamp → do not fail solely on age
    fresh_note = ""
    if not unit_run:
        fresh_note = "no unit suite to age-check"
    elif not unit_ok:
        fresh_note = "unit suite did not pass — freshness N/A until green"
    elif unit_age is not None and unit_age > max_unit_age_hours():
        fresh_note = f"unit suite age {unit_age:.1f}h > max {max_unit_age_hours()}h"
    hard(
        "unit_fresh",
        unit_fresh if unit_run else False,
        note=fresh_note or None,
        age_hours=unit_age,
        max_hours=max_unit_age_hours(),
        evidence_run_id=(unit_run or {}).get("id"),
    )

    # golden_pass
    golden_ok = _suite_passed(golden_run) or bool((golden_run or {}).get("passed") is True)
    if golden_run and golden_run.get("suite_type") == "golden":
        golden_ok = _suite_passed(golden_run) or bool(golden_run.get("passed"))
    hard(
        "golden_pass",
        golden_ok,
        evidence_run_id=(golden_run or {}).get("id"),
    )

    golden_age = _age_hours((golden_run or {}).get("finished_at"), now)
    golden_fresh = golden_ok and (
        golden_age is None or golden_age <= max_golden_age_hours()
    )
    hard(
        "golden_fresh",
        golden_fresh if golden_run else False,
        age_hours=golden_age,
        max_hours=max_golden_age_hours(),
        evidence_run_id=(golden_run or {}).get("id"),
    )

    # security
    sec_req = require_security()
    if security_run is None:
        if sec_req:
            hard("security_pytest_pass", False, note="missing suite; REQUIRE_SECURITY=1")
        else:
            soft_gate(
                "security_pytest_pass",
                True,
                note="missing suite; REQUIRE_SECURITY=0",
            )
    else:
        sec_ok = _suite_passed(security_run)
        hard(
            "security_pytest_pass",
            sec_ok,
            evidence_run_id=security_run.get("id"),
        )

    # e2e
    e2e_req = require_e2e()
    if e2e_req:
        hard(
            "e2e_pass",
            _suite_passed(e2e_run),
            evidence_run_id=(e2e_run or {}).get("id"),
        )
    else:
        if e2e_run is None:
            soft_warnings.append("e2e not required by policy")
        soft_gate(
            "e2e_pass",
            True if e2e_run is None else _suite_passed(e2e_run),
            note="e2e not required by policy" if e2e_run is None else "",
            evidence_run_id=(e2e_run or {}).get("id"),
        )

    # critical defects
    hard(
        "no_open_critical_defects",
        int(open_critical_defects or 0) == 0,
        open_critical=int(open_critical_defects or 0),
    )

    # coverage
    backend = (coverage or {}).get("backend") or {}
    cov_pct = backend.get("percent")
    if cov_pct is None and coverage:
        cov_pct = (coverage.get("overall") or {}).get("percent")
    gate = float((coverage or {}).get("gate_percent") or CODE_COVERAGE_GATE)
    cov_ok = cov_pct is not None and float(cov_pct) >= gate
    if cov_mode == "hard":
        hard(
            "coverage_gate",
            cov_ok if cov_pct is not None else False,
            value=cov_pct,
            threshold=gate,
            mode=cov_mode,
            evidence_coverage_id=(coverage or {}).get("id"),
        )
    else:
        note = ""
        if cov_pct is None:
            note = "coverage not ingested (mode=soft)"
            soft_warnings.append(note)
        elif not cov_ok:
            note = f"coverage_gate: {cov_pct} < {gate} (mode=soft; does not force NOT_READY)"
            soft_warnings.append(note)
        soft_gate(
            "coverage_gate",
            cov_ok if cov_pct is not None else True,
            note=note,
            value=cov_pct,
            threshold=gate,
            mode=cov_mode,
            evidence_coverage_id=(coverage or {}).get("id"),
        )
    if coverage is None or (coverage or {}).get("frontend", {}).get("available") is False:
        if "FE coverage N/A" not in soft_warnings:
            soft_warnings.append("FE coverage N/A")

    verdict = "NOT_READY" if blockers else "READY"

    inputs = {
        "unit_run_id": (unit_run or {}).get("id"),
        "golden_run_id": (golden_run or {}).get("id"),
        "security_run_id": (security_run or {}).get("id"),
        "e2e_run_id": (e2e_run or {}).get("id"),
        "coverage_id": (coverage or {}).get("id"),
        "open_critical_defects": int(open_critical_defects or 0),
        "coverage_mode": cov_mode,
        "require_security": sec_req,
        "require_e2e": e2e_req,
    }
    inputs_hash = _canonical_hash({"inputs": inputs, "checklist": checklist})

    score = quality_score
    if score is None:
        # lightweight default from checklist hard pass rate
        hard_items = [c for c in checklist if c.get("hard")]
        if hard_items:
            score = round(100.0 * sum(1 for c in hard_items if c.get("passed")) / len(hard_items), 1)
        else:
            score = 0.0

    grade = (
        "A"
        if score >= 90
        else "B"
        if score >= 80
        else "C"
        if score >= 70
        else "D"
        if score >= 60
        else "F"
    )

    return {
        "verdict": verdict,
        "score": score,
        "grade": grade,
        "coverage_mode": cov_mode,
        "algorithm_version": ALGORITHM_VERSION,
        "module_map_version": MODULE_MAP_VERSION,
        "blockers": blockers,
        "soft_warnings": [w for w in soft_warnings if w],
        "inputs": inputs,
        "inputs_hash": inputs_hash,
        "checklist": checklist,
        "build": build or (unit_run or {}).get("build") or (coverage or {}).get("build") or {},
        "computed_at": now.isoformat(),
    }
