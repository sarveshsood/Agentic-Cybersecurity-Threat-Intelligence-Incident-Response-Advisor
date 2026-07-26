"""Lightweight performance smoke — not a full load suite.

Run: pytest -m performance tests/performance -n 0
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[2] / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

pytestmark = [pytest.mark.performance, pytest.mark.slow]


def test_ioc_extract_throughput(test_data_dir: Path):
    from backend.ioc_extractor import extract_iocs

    text = (test_data_dir / "edge" / "large_sample.log").read_text(encoding="utf-8", errors="replace")
    # Repeat to ~ moderate size
    blob = "\n".join([text] * 20)
    t0 = time.perf_counter()
    iocs = extract_iocs(blob)
    elapsed = time.perf_counter() - t0
    assert elapsed < 15.0, f"extract_iocs too slow: {elapsed:.2f}s"
    assert iocs is not None


def test_hitl_gate_batch():
    from backend.hitl_gate import decide_incident_status

    t0 = time.perf_counter()
    for i in range(5000):
        decide_incident_status(
            "high" if i % 2 == 0 else "low",
            0.5 + (i % 50) / 100.0,
            grounding_threshold=0.7,
            hitl_severity_min="high",
            auto_approve_grounding_min=0.9,
        )
    elapsed = time.perf_counter() - t0
    assert elapsed < 2.0, f"hitl batch slow: {elapsed:.2f}s"
