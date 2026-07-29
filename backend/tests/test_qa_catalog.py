"""Use-case catalog seed + list (PR use cases)."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

pytestmark = [pytest.mark.unit]


def test_seed_file_has_all_cases():
    from backend.services.qa_catalog_service import load_seed_file

    payload = load_seed_file()
    assert payload["count"] >= 100
    cases = payload["cases"]
    assert len(cases) == payload["count"]
    ids = {c["id"] for c in cases}
    assert "TC-AUTH-001" in ids
    assert "TC-SEC-001" in ids
    assert "TC-E2E-001" in ids
    assert "TC-PERF-001" in ids
    assert "TC-RES-001" in ids
    assert any(c.get("runner") == "golden" for c in cases)
    # All major health modules from appendix areas
    modules = {c.get("module") for c in cases}
    for m in ("Security", "Backend", "AI", "Frontend", "API", "Performance", "DevOps", "Documentation"):
        assert m in modules, m


def test_cases_route_registered():
    from backend.server import app

    paths = {getattr(r, "path", None) for r in app.routes}
    assert "/api/qa/cases" in paths
    assert "/api/qa/usecases/run" in paths
    assert "/api/qa/seed/catalog" in paths
    assert any(
        getattr(r, "path", None) == "/api/qa/cases/{case_id}/verdict" for r in app.routes
    )


def test_playwright_json_maps_tc_ids():
    from backend.services.qa_playwright_runner import parse_playwright_json

    report = {
        "suites": [
            {
                "specs": [
                    {
                        "title": "TC-E2E-001 Login → Dashboard",
                        "tests": [{"results": [{"status": "passed"}]}],
                    },
                    {
                        "title": "TC-E2E-006 Logout",
                        "tests": [
                            {
                                "results": [
                                    {
                                        "status": "failed",
                                        "error": {"message": "timeout"},
                                    }
                                ]
                            }
                        ],
                    },
                ]
            }
        ]
    }
    by = parse_playwright_json(report)
    assert by["TC-E2E-001"]["status"] == "pass"
    assert by["TC-E2E-006"]["status"] == "fail"


def test_playwright_spec_exists():
    from backend.services.qa_playwright_runner import SPEC, PLAYWRIGHT_TC_IDS

    assert SPEC.is_file(), SPEC
    assert "TC-E2E-001" in PLAYWRIGHT_TC_IDS


@pytest.mark.asyncio
async def test_smoke_runner_not_blanket_skipped():
    """automation=auto must produce pass/fail/blocked — not skipped."""
    from backend.services.qa_smoke_runner import execute_smoke_case

    auto_case = {
        "id": "TC-API-001",
        "title": "dual mount",
        "automation": "auto",
        "runner": "manual",
        "module": "API",
        "description": "parity",
        "expected": "both mounts",
    }
    out = await execute_smoke_case(auto_case, actor={"role": "admin"})
    assert out["status"] in ("pass", "fail", "blocked")
    assert out["status"] != "skipped"

    manual_case = {
        "id": "TC-DASH-001",
        "title": "UI dashboard",
        "automation": "manual",
        "runner": "manual",
        "module": "Frontend",
        "description": "click around",
        "expected": "renders",
    }
    mout = await execute_smoke_case(manual_case, actor={"role": "admin"})
    assert mout["status"] == "blocked"
