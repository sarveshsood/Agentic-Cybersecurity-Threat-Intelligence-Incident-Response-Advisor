"""Ops anomaly, audit WORM export, broker status."""
from __future__ import annotations

from pathlib import Path

from backend.ops_anomaly import (
    analyze_pipeline_timings,
    analyze_queue_health,
    build_anomaly_report,
)
from backend.audit_export import append_worm, worm_status, export_range_jsonl
from backend.broker_queue import broker_status, publish_job_available, enabled


def test_pipeline_timing_anomaly_flags_outlier():
    rows = [
        {"id": "a", "pipeline_total_ms": 1000, "by_stage_ms": {"enrich": 400}},
        {"id": "b", "pipeline_total_ms": 1100, "by_stage_ms": {"enrich": 450}},
        {"id": "c", "pipeline_total_ms": 1050, "by_stage_ms": {"enrich": 420}},
        {"id": "d", "pipeline_total_ms": 9000, "by_stage_ms": {"enrich": 7000}},
    ]
    out = analyze_pipeline_timings(rows, z_warn=2.0, z_crit=3.0)
    assert out["sample_size"] == 4
    assert out["baseline_ms"] is not None
    assert any(a.get("job_id") == "d" for a in out["alerts"])


def test_queue_health_backlog():
    out = analyze_queue_health({"queued": 12, "running": 2, "done": 5, "failed": 1})
    assert out["backlog"] == 14
    assert out["status"] in ("warning", "critical")


def test_build_anomaly_report_shape():
    rep = build_anomaly_report(
        timings=[{"id": "1", "pipeline_total_ms": 500, "by_stage_ms": {}}],
        queue={"queued": 0, "running": 0, "done": 10, "failed": 0},
        ti_circuits={},
        metrics_snapshot={},
    )
    assert "overall" in rep
    assert "pipeline" in rep
    assert "disclaimer" in rep


def test_worm_append(tmp_path, monkeypatch):
    monkeypatch.setenv("AUDIT_WORM_ENABLED", "1")
    monkeypatch.setenv("AUDIT_WORM_DIR", str(tmp_path / "worm"))
    p = append_worm({"id": "e1", "action": "test.action", "detail": {}})
    assert p is not None and p.is_file()
    text = p.read_text(encoding="utf-8")
    assert "test.action" in text
    st = worm_status()
    assert st["enabled"] is True


def test_export_range_jsonl(tmp_path, monkeypatch):
    monkeypatch.setenv("AUDIT_WORM_DIR", str(tmp_path / "worm2"))
    path = export_range_jsonl([{"id": "1", "action": "a"}], path=tmp_path / "worm2" / "exp.jsonl")
    assert path.is_file()
    assert "\"action\": \"a\"" in path.read_text(encoding="utf-8") or '"action": "a"' in path.read_text(
        encoding="utf-8"
    )


def test_broker_disabled_without_url(monkeypatch):
    monkeypatch.delenv("JOB_BROKER_URL", raising=False)
    monkeypatch.delenv("JOB_BROKER_ENABLED", raising=False)
    assert enabled() is False
    assert publish_job_available("job-1") is False
    st = broker_status()
    assert st["mode"] == "mongo_only"
