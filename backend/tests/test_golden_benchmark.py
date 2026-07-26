"""CI gates for golden IR dataset (offline — no Mongo, no LLM API).

  cd backend
  pytest tests/test_golden_benchmark.py -v -n 0

Aggregate thresholds live in golden_eval.DEFAULT_THRESHOLDS.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
from backend.golden_eval import (  # noqa: E402
    DEFAULT_THRESHOLDS,
    check_thresholds,
    evaluate_case,
    load_golden_dataset,
    run_benchmark,
    run_offline_case,
)

GOLDEN_PATH = Path(__file__).resolve().parent / "golden" / "dataset.json"


@pytest.fixture(scope="module")
def dataset():
    assert GOLDEN_PATH.exists(), f"missing {GOLDEN_PATH} — run tests/golden/build_dataset.py"
    cases = load_golden_dataset(GOLDEN_PATH)
    assert len(cases) >= DEFAULT_THRESHOLDS["min_cases"]
    return cases


@pytest.fixture(scope="module")
def benchmark(dataset):
    return run_benchmark(GOLDEN_PATH)


class TestGoldenDatasetShape:
    def test_min_case_count(self, dataset):
        assert len(dataset) >= 30

    def test_each_case_has_log_and_expected(self, dataset):
        for c in dataset:
            assert c.get("id"), c
            assert (c.get("log") or "").strip(), c["id"]
            exp = c.get("expected") or {}
            assert "iocs" in exp and "technique_ids" in exp, c["id"]
            assert exp.get("playbook_phases"), c["id"]


class TestOfflinePipelineDeterminism:
    def test_template_playbook_phases(self):
        pred = run_offline_case(
            "sshd: Failed password for root from 185.220.101.45\n",
            force_template_playbook=True,
        )
        phases = set(pred["playbook_phases"])
        for p in ("containment", "eradication", "recovery", "lessons_learned"):
            assert p in phases
        assert pred["llm_provider"] == "template"
        assert pred["grounding_score"] >= 0.5

    def test_private_ip_filtered(self):
        pred = run_offline_case(
            "sshd: Failed password for root from 10.1.2.3\n"
            "sshd: Failed password for root from 8.8.8.8\n",
            force_template_playbook=True,
        )
        ips = {i["value"] for i in pred["iocs"] if i["type"] == "ip"}
        assert "8.8.8.8" in ips
        assert "10.1.2.3" not in ips


class TestGoldenMetrics:
    def test_aggregate_passes_thresholds(self, benchmark):
        summary = benchmark["summary"]
        failures = benchmark["failures"]
        assert failures == [], f"CI gate failures: {failures}; summary={summary}"

    def test_mean_ioc_f1(self, benchmark):
        assert benchmark["summary"]["mean_ioc_f1"] >= DEFAULT_THRESHOLDS["min_ioc_f1"]

    def test_mean_technique_recall(self, benchmark):
        assert (
                benchmark["summary"]["mean_technique_recall"]
                >= DEFAULT_THRESHOLDS["min_technique_recall"]
        )

    def test_mean_grounding(self, benchmark):
        assert benchmark["summary"]["mean_grounding"] >= DEFAULT_THRESHOLDS["min_mean_grounding"]

    def test_phase_coverage(self, benchmark):
        assert (
                benchmark["summary"]["full_phase_fraction"]
                >= DEFAULT_THRESHOLDS["min_phase_coverage"]
        )

    def test_latency(self, benchmark):
        assert benchmark["summary"]["mean_latency_s"] <= DEFAULT_THRESHOLDS["max_mean_latency_s"]

    def test_no_case_errors(self, benchmark):
        assert benchmark["summary"]["n_errors"] == 0

    def test_per_case_min_grounding(self, dataset):
        for c in dataset:
            r = evaluate_case(c)
            assert not r.error, (c["id"], r.error)
            min_g = float((c.get("expected") or {}).get("min_grounding") or 0.5)
            assert r.grounding_score >= min_g, (c["id"], r.grounding_score, min_g)


class TestCheckThresholdsHelper:
    def test_check_thresholds_detects_low_f1(self):
        bad = {
            "n_cases": 32,
            "n_errors": 0,
            "mean_ioc_f1": 0.1,
            "mean_technique_recall": 1.0,
            "mean_grounding": 1.0,
            "full_phase_fraction": 1.0,
            "mean_latency_s": 0.01,
        }
        fails = check_thresholds(bad)
        assert any("mean_ioc_f1" in f for f in fails)
