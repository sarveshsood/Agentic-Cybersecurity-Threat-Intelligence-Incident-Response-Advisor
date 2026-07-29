"""Enterprise platform track: JSON logs, TI HTTP, metrics, artifacts, settings versions."""
from __future__ import annotations

import json
import logging
from pathlib import Path

import pytest

from backend.logging_setup import JsonFormatter, RequestContextFilter, configure_logging
from backend.request_context import bind_log_context
from backend import ti_http
from backend import metrics_registry as mr
from backend import job_artifacts as ja
from backend.settings_versions import public_snapshot


def test_json_formatter_includes_user_and_rid():
    with bind_log_context(request_id="rid-1", email="a@example.com", user_id="u1", role="analyst"):
        rec = logging.LogRecord(
            name="t",
            level=logging.INFO,
            pathname=__file__,
            lineno=1,
            msg="hello %s",
            args=("world",),
            exc_info=None,
        )
        RequestContextFilter().filter(rec)
        line = JsonFormatter().format(rec)
        data = json.loads(line)
        assert data["msg"] == "hello world"
        assert data["request_id"] == "rid-1"
        assert data["user"] == "a@example.com"
        assert data["user_id"] == "u1"
        assert data["level"] == "INFO"


def test_configure_logging_json_file(monkeypatch, tmp_path):
    monkeypatch.setenv("LOG_TO_FILE", "1")
    monkeypatch.setenv("LOG_DIR", str(tmp_path))
    monkeypatch.setenv("LOG_FILE", "json.log")
    monkeypatch.setenv("LOG_FORMAT", "json")
    path = configure_logging(force=True)
    assert path is not None
    with bind_log_context(request_id="r2", email="b@x.com", user_id="u2"):
        logging.getLogger("actira.test").info("json-line")
    for h in logging.getLogger().handlers:
        h.flush()
    text = path.read_text(encoding="utf-8")
    assert "json-line" in text
    # last non-empty line should parse as JSON
    last = [ln for ln in text.splitlines() if ln.strip()][-1]
    obj = json.loads(last)
    assert obj["user"] == "b@x.com"


def test_ti_circuit_opens_and_blocks(monkeypatch):
    ti_http.reset_circuits()
    monkeypatch.setenv("TI_CIRCUIT_FAILURES", "2")
    monkeypatch.setenv("TI_CIRCUIT_COOLDOWN_SECONDS", "30")
    ti_http._circuit_failure("virustotal")
    ti_http._circuit_failure("virustotal")
    states = ti_http.circuit_states()
    assert states["virustotal"]["state"] == "open"
    with pytest.raises(ti_http.CircuitOpenError):
        ti_http._circuit_allow("virustotal")
    ti_http.reset_circuits()


def test_metrics_prometheus_render():
    mr.reset_for_tests()
    mr.inc_counter("actira_http_requests_total", method="GET", status="200")
    mr.observe_histogram("actira_http_request_duration_seconds", 0.12)
    mr.set_gauge("actira_incidents_total", 3)
    text = mr.render_prometheus()
    assert "actira_up 1" in text
    assert "actira_http_requests_total" in text
    assert "actira_incidents_total 3" in text
    assert "_bucket" in text


def test_job_artifacts_roundtrip(monkeypatch, tmp_path):
    monkeypatch.setenv("JOB_ARTIFACTS_ENABLED", "1")
    monkeypatch.setenv("JOB_ARTIFACTS_DIR", str(tmp_path / "arts"))
    p = ja.save_artifact("job-abc", "parsed_meta", {"events": 3})
    assert p is not None and p.is_file()
    assert "parsed_meta.json" in ja.list_artifacts("job-abc")
    data = ja.load_artifact("job-abc", "parsed_meta")
    assert data["events"] == 3


def test_job_artifacts_disabled_by_default(monkeypatch, tmp_path):
    monkeypatch.delenv("JOB_ARTIFACTS_ENABLED", raising=False)
    monkeypatch.setenv("JOB_ARTIFACTS_DIR", str(tmp_path / "arts"))
    assert ja.save_artifact("j1", "x", {"a": 1}) is None


def test_settings_public_snapshot_strips_secrets():
    snap = public_snapshot(
        {
            "llm_model": "x",
            "virustotal_key": "secret-should-not-appear",
            "grounding_threshold": 0.7,
        }
    )
    assert snap["llm_model"] == "x"
    assert "virustotal_key" not in snap
    assert snap["grounding_threshold"] == 0.7


def test_enrich_concurrency_env_default():
    """Semaphore pool is clamped 1..32 via pipeline_parallel + _enrich_all (smoke)."""
    from backend.pipeline import _enrich_all
    from backend.pipeline_parallel import resolve_enrich_concurrency
    import inspect

    src = inspect.getsource(_enrich_all)
    assert "Semaphore" in src
    assert "resolve_enrich_concurrency" in src
    # Env/settings clamp lives in pipeline_parallel (Sprint 4)
    assert resolve_enrich_concurrency({"enrich_concurrency": 100}) == 32
    assert resolve_enrich_concurrency({"enrich_concurrency": 0}) == 1


def test_parse_concurrency_pool():
    """Multi-file parse uses bounded semaphore + resolve_parse_concurrency."""
    from backend.pipeline import _parse_all, run_batch_pipeline
    from backend.pipeline_parallel import resolve_parse_concurrency
    import inspect

    src = inspect.getsource(_parse_all)
    assert "Semaphore" in src
    assert "to_thread" in src
    batch_src = inspect.getsource(run_batch_pipeline)
    assert "resolve_parse_concurrency" in batch_src or "parse_concurrency" in batch_src
    assert resolve_parse_concurrency({"parse_concurrency": 100}) == 16
    assert resolve_parse_concurrency({}) == 4
