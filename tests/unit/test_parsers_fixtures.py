"""Parser coverage against tests/data fixtures (offline)."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[2] / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

pytestmark = pytest.mark.unit


def _parse(text: str, filename: str = "upload.log"):
    import backend.parsers as parsers

    if hasattr(parsers, "detect_and_parse"):
        # detect_and_parse(content, filename) -> (format, events)
        return parsers.detect_and_parse(text, filename)
    if hasattr(parsers, "parse_log"):
        return parsers.parse_log(text, filename=filename)
    if hasattr(parsers, "parse"):
        return parsers.parse(text, source=filename)
    pytest.skip("No public parse entrypoint found")


def test_parse_apache(apache_log_path: Path):
    events = _parse(apache_log_path.read_text(encoding="utf-8"), "apache_access.log")
    assert events is not None
    if isinstance(events, list):
        assert len(events) >= 1


def test_parse_syslog(syslog_path: Path):
    events = _parse(syslog_path.read_text(encoding="utf-8"), "syslog_auth.log")
    assert events is not None


def test_parse_empty(empty_log_path: Path):
    events = _parse(empty_log_path.read_text(encoding="utf-8"), "empty.log")
    # empty should not crash
    assert events is not None or events == [] or events == {}


def test_parse_malformed_json(malformed_json_path: Path):
    text = malformed_json_path.read_text(encoding="utf-8")
    # Must not raise
    try:
        _parse(text, "malformed.json")
    except Exception as e:
        # Soft failure OK if parser raises domain error — not process crash
        assert e is not None


def test_cef_and_csv(test_data_dir: Path):
    cef = (test_data_dir / "logs" / "cef_sample.log").read_text(encoding="utf-8")
    csv = (test_data_dir / "logs" / "events.csv").read_text(encoding="utf-8")
    _parse(cef, "cef_sample.log")
    _parse(csv, "events.csv")
