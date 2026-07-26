"""P3: pipeline stage timing (offline)."""
from __future__ import annotations

import sys
import time
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

pytestmark = [pytest.mark.unit]


def test_pipeline_trace_records_stages_and_total():
    from backend.pipeline_trace import PipelineTrace

    tr = PipelineTrace("job-1", kind="batch")
    with tr.stage("parse", files=2):
        time.sleep(0.01)
    with tr.stage("enrich", ioc_count=3):
        time.sleep(0.005)
    summary = tr.summary()
    assert summary["job_id"] == "job-1"
    assert summary["kind"] == "batch"
    assert summary["total_ms"] >= summary["by_stage_ms"]["parse"]
    assert "parse" in summary["by_stage_ms"]
    assert "enrich" in summary["by_stage_ms"]
    assert len(summary["stages"]) == 2
    assert summary["stages"][0]["stage"] == "parse"
    assert summary["stages"][0]["ms"] >= 5


def test_pipeline_trace_captures_error_on_stage():
    from backend.pipeline_trace import PipelineTrace

    tr = PipelineTrace("job-err")
    with pytest.raises(ValueError):
        with tr.stage("boom"):
            raise ValueError("fail-me")
    assert tr.stages[0]["stage"] == "boom"
    assert "error" in tr.stages[0]
    assert "ValueError" in tr.stages[0]["error"]


def test_pipeline_trace_otel_optional_no_crash():
    """Without OTEL installed (or with), stage still records ms."""
    from backend.pipeline_trace import PipelineTrace

    tr = PipelineTrace("job-otel")
    with tr.stage("noop"):
        pass
    assert tr.summary()["by_stage_ms"]["noop"] >= 0
