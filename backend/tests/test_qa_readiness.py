"""PR-3: readiness algorithm pure tests + ingest auth helpers."""
from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

pytestmark = [pytest.mark.unit]


def _run(suite_type="unit", status="passed", hours_ago=1.0, **extra):
    fin = (datetime.now(timezone.utc) - timedelta(hours=hours_ago)).isoformat()
    counts = extra.pop("counts", None) or {
        "total": 10,
        "passed": 10 if status == "passed" else 8,
        "failed": 0 if status == "passed" else 2,
        "skipped": 0,
        "errors": 0,
    }
    return {
        "id": f"run_{suite_type}",
        "suite_type": suite_type,
        "status": status,
        "counts": counts,
        "finished_at": fin,
        "build": {"id": "b1"},
        **extra,
    }


def test_readiness_ready_soft_coverage(monkeypatch):
    monkeypatch.setenv("QA_READINESS_COVERAGE_MODE", "soft")
    monkeypatch.setenv("QA_READINESS_REQUIRE_SECURITY", "0")
    monkeypatch.setenv("QA_READINESS_REQUIRE_E2E", "0")
    from backend.qa.readiness import compute_readiness

    snap = compute_readiness(
        unit_run=_run("unit"),
        golden_run=_run("golden"),
        coverage={
            "id": "cov1",
            "gate_percent": 95,
            "backend": {"percent": 91.2},
            "frontend": {"available": False},
        },
        open_critical_defects=0,
    )
    assert snap["verdict"] == "READY"
    assert snap["algorithm_version"] == "qa-readiness-v1"
    assert any("coverage_gate" in w or "91.2" in w for w in snap["soft_warnings"])
    assert "unit_pass" not in snap["blockers"]


def test_readiness_not_ready_unit_fail(monkeypatch):
    monkeypatch.setenv("QA_READINESS_COVERAGE_MODE", "soft")
    from backend.qa.readiness import compute_readiness

    snap = compute_readiness(
        unit_run=_run("unit", status="failed"),
        golden_run=_run("golden"),
        coverage={"id": "c", "backend": {"percent": 99.0}, "gate_percent": 95},
    )
    assert snap["verdict"] == "NOT_READY"
    assert "unit_pass" in snap["blockers"]


def test_readiness_hard_coverage(monkeypatch):
    monkeypatch.setenv("QA_READINESS_COVERAGE_MODE", "hard")
    from backend.qa.readiness import compute_readiness

    snap = compute_readiness(
        unit_run=_run("unit"),
        golden_run=_run("golden"),
        coverage={"id": "c", "backend": {"percent": 91.2}, "gate_percent": 95},
    )
    assert snap["verdict"] == "NOT_READY"
    assert "coverage_gate" in snap["blockers"]


def test_readiness_security_required_missing(monkeypatch):
    monkeypatch.setenv("QA_READINESS_REQUIRE_SECURITY", "1")
    monkeypatch.setenv("QA_READINESS_COVERAGE_MODE", "soft")
    from backend.qa.readiness import compute_readiness

    snap = compute_readiness(
        unit_run=_run("unit"),
        golden_run=_run("golden"),
        security_run=None,
        coverage={"id": "c", "backend": {"percent": 96.0}, "gate_percent": 95},
    )
    assert snap["verdict"] == "NOT_READY"
    assert "security_pytest_pass" in snap["blockers"]


def test_readiness_inputs_hash_stable(monkeypatch):
    monkeypatch.setenv("QA_READINESS_COVERAGE_MODE", "soft")
    monkeypatch.delenv("QA_READINESS_REQUIRE_SECURITY", raising=False)
    from backend.qa.readiness import compute_readiness

    now = datetime(2026, 7, 29, 12, 0, 0, tzinfo=timezone.utc)
    kwargs = dict(
        unit_run=_run("unit"),
        golden_run=_run("golden"),
        coverage={"id": "c", "backend": {"percent": 96.0}, "gate_percent": 95},
        now=now,
    )
    a = compute_readiness(**kwargs)
    b = compute_readiness(**kwargs)
    assert a["inputs_hash"] == b["inputs_hash"]
    assert a["verdict"] == "READY"


def test_ingest_token_match(monkeypatch):
    from backend.services.qa_ingest_service import _keys_match

    assert _keys_match("abc", "abc") is True
    assert _keys_match("abc", "abd") is False
    assert _keys_match("", "x") is False


def test_qa_routes_include_ingest():
    from backend.server import app

    paths = {getattr(r, "path", None) for r in app.routes}
    assert "/api/qa/ingest" in paths
    assert "/api/qa/summary" in paths
    assert "/api/qa/release/latest" in paths
    assert "/api/v1/qa/ingest" in paths


def test_ingest_404_when_flag_off(monkeypatch):
    monkeypatch.delenv("FEATURE_QA_HEALTH_CENTER", raising=False)
    from fastapi.testclient import TestClient
    from backend.server import app

    client = TestClient(app)
    r = client.post("/api/qa/ingest")
    assert r.status_code == 404
