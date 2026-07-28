"""Remaining enterprise gaps: cost, archival, replay helpers."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.llm_cost import estimate_usd, price_table_public, rates_for
from backend.log_archival import archive_root, run_archival
from backend.job_artifacts import save_artifact, list_artifacts
from backend.pipeline_replay import list_job_artifacts


def test_llm_cost_estimate_positive():
    est = estimate_usd(1_000_000, provider="anthropic", model="claude-sonnet-4-6")
    assert est["tokens"] == 1_000_000
    assert est["estimated_usd"] > 0
    assert est["currency"] == "USD"
    assert "disclaimer" in est


def test_llm_cost_template_zero():
    est = estimate_usd(50_000, provider="template", model="x")
    assert est["estimated_usd"] == 0.0


def test_rates_for_provider_fallback():
    rin, rout = rates_for("groq", "unknown-model-xyz")
    assert rin >= 0 and rout >= 0


def test_price_table_public():
    t = price_table_public()
    assert t["currency"] == "USD"
    assert "anthropic" in t["rates"] or any("anthropic" in k for k in t["rates"])


def test_log_archival_copies(monkeypatch, tmp_path):
    log_file = tmp_path / "actira.log"
    log_file.write_text("line1\nline2\n", encoding="utf-8")
    arch = tmp_path / "archive"
    monkeypatch.setenv("LOG_ARCHIVE_ENABLED", "1")
    monkeypatch.setenv("LOG_ARCHIVE_DIR", str(arch))
    monkeypatch.setenv("LOG_ARCHIVE_RETAIN_DAYS", "30")
    out = run_archival(source_log=log_file)
    assert out["enabled"] is True
    assert len(out["copied"]) >= 1
    assert arch.exists()


def test_log_archival_disabled(monkeypatch, tmp_path):
    monkeypatch.setenv("LOG_ARCHIVE_ENABLED", "0")
    out = run_archival(source_log=tmp_path / "x.log")
    assert out["enabled"] is False
    assert out["copied"] == []


@pytest.mark.asyncio
async def test_list_job_artifacts_empty():
    out = await list_job_artifacts("no-such-job-xyz")
    assert out["count"] == 0
    assert "artifacts" in out


@pytest.mark.asyncio
async def test_list_job_artifacts_with_files(monkeypatch, tmp_path):
    monkeypatch.setenv("JOB_ARTIFACTS_ENABLED", "1")
    monkeypatch.setenv("JOB_ARTIFACTS_DIR", str(tmp_path / "arts"))
    save_artifact("job-r1", "parsed_meta", {"events": 2})
    out = await list_job_artifacts("job-r1")
    assert out["count"] >= 1
    assert "parsed_meta.json" in out["artifacts"]
