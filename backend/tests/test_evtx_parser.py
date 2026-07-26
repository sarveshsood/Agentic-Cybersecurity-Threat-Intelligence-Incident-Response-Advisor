"""EVTX detection / parse scaffold (offline; no python-evtx required)."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

pytestmark = [pytest.mark.unit]


def test_evtx_magic_detected():
    from backend.parsers import detect_and_parse

    raw = b"ElfFile\x00" + b"\x00" * 64
    name, events = detect_and_parse(raw, "Security.evtx")
    assert name == "evtx"
    assert isinstance(events, list)
    assert len(events) >= 1
    assert events[0].get("vendor") == "Microsoft"


def test_evtx_extension_hint():
    from backend.parsers import EvtxParser

    p = EvtxParser()
    assert p.matches_bytes(b"not-magic", "foo.evtx") >= 0.9
    assert p.matches_bytes(b"not-magic", "foo.log") == 0.0


def test_syslog_still_works():
    from backend.parsers import detect_and_parse

    text = b"Jan 12 10:00:01 web01 sshd[1]: Failed password for root from 1.2.3.4"
    name, events = detect_and_parse(text, "auth.log")
    assert name in ("syslog", "plaintext")
    assert events
