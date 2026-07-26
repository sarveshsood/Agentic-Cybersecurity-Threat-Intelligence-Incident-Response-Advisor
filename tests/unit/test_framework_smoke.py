"""Framework smoke — fixtures + core offline modules load correctly."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[2] / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

pytestmark = pytest.mark.unit


def test_test_data_logs_exist(test_data_dir: Path, apache_log_path: Path, syslog_path: Path):
    assert test_data_dir.is_dir()
    assert apache_log_path.is_file() and apache_log_path.stat().st_size > 0
    assert syslog_path.is_file()
    assert (test_data_dir / "edge" / "empty.log").is_file()
    assert (test_data_dir / "packages" / "multi_source.zip").is_file()


def test_sample_incident_fixture(sample_incident):
    assert sample_incident["severity"] == "high"
    assert sample_incident["status"] == "pending_review"
    assert len(sample_incident["iocs"]) >= 3
    assert sample_incident["playbook"]["grounding_score"] < 0.75


def test_jwt_factory(make_jwt, jwt_secret):
    import jwt as pyjwt

    token = make_jwt(sub="u-admin", role="admin")
    payload = pyjwt.decode(token, jwt_secret, algorithms=["HS256"])
    assert payload["sub"] == "u-admin"
    assert payload["role"] == "admin"


def test_hitl_gate_importable():
    from backend.hitl_gate import decide_incident_status

    status, hitl, auto = decide_incident_status(
        "critical",
        0.99,
        grounding_threshold=0.7,
        hitl_severity_min="critical",
        auto_approve_grounding_min=0.9,
    )
    assert status == "pending_review"
    assert hitl is True
    assert auto is False


def test_ioc_extractor_on_fixture_log(apache_log_path: Path):
    from backend.ioc_extractor import extract_iocs

    text = apache_log_path.read_text(encoding="utf-8", errors="replace")
    iocs = extract_iocs(text)
    values = {getattr(i, "value", None) or (i.get("value") if isinstance(i, dict) else None) for i in iocs}
    # Public test net IP should be extracted
    assert any(v and "203.0.113" in str(v) for v in values)


def test_mock_ti_enrich(mock_ti_enrich, sample_iocs):
    out = mock_ti_enrich(sample_iocs[0])
    assert out["enriched"] is True
    assert out["sources"] == ["mock"]


def test_parse_llm_json_robust():
    from llm_provider import parse_llm_json

    assert parse_llm_json('{"a": 1}') == {"a": 1}
    # fenced
    assert parse_llm_json('```json\n{"b": 2}\n```')["b"] == 2
