"""PR-2: JUnit / Cobertura parsers, module map, hostile XML."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "qa"

pytestmark = [pytest.mark.unit]


def test_module_map_tc_and_junit():
    from backend.qa.module_map import (
        MODULE_MAP_VERSION,
        map_catalog_module_raw,
        map_junit_nodeid,
        map_tc_id,
    )

    assert MODULE_MAP_VERSION == "qa_module_map_v1"
    assert map_tc_id("TC-AUTH-001") == "Security"
    assert map_tc_id("TC-AI-010") == "AI"
    assert map_tc_id("TC-UNKNOWN-1", catalog_type="API") == "API"
    assert map_catalog_module_raw("test_hardening") == "Security"
    assert map_catalog_module_raw("pipeline") == "Backend"
    assert map_junit_nodeid("tests/security/test_x.py::test_y") == "Security"
    assert map_junit_nodeid("backend.tests.test_golden_benchmark::test_gates") == "AI"
    assert map_junit_nodeid("frontend/e2e/smoke.spec.ts::login") == "Frontend"
    assert map_junit_nodeid("tests.unit.test_parsers_basic::test_syslog") == "Backend"


def test_parse_sample_junit():
    from backend.qa.junit_parser import parse_junit_xml

    raw = (FIXTURES / "sample_junit.xml").read_bytes()
    result = parse_junit_xml(raw)
    assert result.counts["total"] == 5
    assert result.counts["passed"] == 2
    assert result.counts["failed"] == 1
    assert result.counts["skipped"] == 1
    assert result.counts["errors"] == 1
    assert result.to_summary()["status"] == "failed"
    assert len(result.failures_sample) >= 1
    modules = {c.module for c in result.cases}
    assert "Security" in modules
    assert "AI" in modules
    assert "Backend" in modules
    assert result.sha256
    assert result.bytes == len(raw)


def test_parse_sample_coverage_gate():
    from backend.qa.coverage_xml_parser import parse_coverage_xml

    raw = (FIXTURES / "sample_coverage.xml").read_bytes()
    result = parse_coverage_xml(raw, gate_percent=95.0)
    assert result.percent == 91.2
    assert result.gap_to_gate == pytest.approx(3.8)
    assert result.gate_passed is False
    assert result.line_rate == pytest.approx(0.912)
    assert result.branch_rate == pytest.approx(0.88)
    snap = result.to_snapshot_fields()
    assert snap["gate_metric"] == "cobertura_line_rate"
    assert snap["frontend"]["available"] is False
    assert snap["overall"]["composition"] == "backend_only"
    names = [p["name"] for p in result.packages]
    assert any("pipeline" in n for n in names)
    # path normalization prefixes backend.
    assert any(n.startswith("backend.") or n.startswith("backend/") for n in names)


def test_coverage_gate_pass_when_high():
    from backend.qa.coverage_xml_parser import parse_coverage_xml

    xml = b"""<?xml version="1.0"?>
    <coverage line-rate="0.96" branch-rate="0.9"
      lines-valid="100" lines-covered="96" branches-valid="10" branches-covered="9"/>
    """
    r = parse_coverage_xml(xml, gate_percent=95.0)
    assert r.percent == 96.0
    assert r.gate_passed is True
    assert r.gap_to_gate == 0.0


def test_hostile_xxe_rejected_or_safe():
    from backend.qa.junit_parser import JUnitParseError, parse_junit_xml

    raw = (FIXTURES / "hostile_xxe.xml").read_bytes()
    try:
        result = parse_junit_xml(raw)
    except JUnitParseError:
        return  # rejected — good
    # If parsed, entity must not expand file contents into message
    msgs = " ".join(f.get("message", "") for f in result.failures_sample)
    assert "root:" not in msgs
    assert "/bin/" not in msgs


def test_hostile_billion_laughs_rejected():
    from backend.qa.junit_parser import JUnitParseError, parse_junit_xml

    raw = (FIXTURES / "hostile_billion_laughs.xml").read_bytes()
    with pytest.raises(JUnitParseError):
        parse_junit_xml(raw)


def test_oversized_xml_rejected():
    from backend.qa.junit_parser import JUnitParseError, parse_junit_xml
    from backend.qa.limits import MAX_XML_BYTES

    huge = b'<?xml version="1.0"?><testsuites>' + (b"x" * (MAX_XML_BYTES + 1))
    with pytest.raises(JUnitParseError):
        parse_junit_xml(huge)


def test_empty_and_bad_root():
    from backend.qa.coverage_xml_parser import CoverageParseError, parse_coverage_xml
    from backend.qa.junit_parser import JUnitParseError, parse_junit_xml

    with pytest.raises(JUnitParseError):
        parse_junit_xml(b"")
    with pytest.raises(JUnitParseError):
        parse_junit_xml(b"<notjunit/>")
    with pytest.raises(CoverageParseError):
        parse_coverage_xml(b"<notcoverage/>")


def test_defusedxml_installed():
    import defusedxml  # noqa: F401
    from defusedxml import ElementTree

    assert ElementTree is not None
