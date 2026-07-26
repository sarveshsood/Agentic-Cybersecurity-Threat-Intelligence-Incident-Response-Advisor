"""Sanity checks for mock TI/LLM catalogs."""
from __future__ import annotations

import pytest

from tests.mocks.ti_responses import (
    HTTP_429,
    abuseipdb_ok,
    llm_playbook_json,
    virustotal_ip_ok,
)

pytestmark = pytest.mark.unit


def test_vt_and_abuse_shapes():
    vt = virustotal_ip_ok()
    assert vt["data"]["attributes"]["last_analysis_stats"]["malicious"] >= 0
    ab = abuseipdb_ok()
    assert ab["data"]["abuseConfidenceScore"] >= 0


def test_llm_playbook_has_steps():
    pb = llm_playbook_json()
    assert len(pb["steps"]) >= 2
    assert pb["steps"][0]["phase"] == "detect"


def test_rate_limit_payload():
    assert "rate" in HTTP_429["error"] or HTTP_429["error"] == "rate_limit"
