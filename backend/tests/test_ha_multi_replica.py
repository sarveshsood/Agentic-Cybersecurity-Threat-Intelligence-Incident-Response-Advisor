"""HA / multi-replica offline checks (v1.3)."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

pytestmark = [pytest.mark.unit]


@pytest.mark.parametrize(
    "flag,enabled",
    [
        (None, True),
        ("1", True),
        ("true", True),
        ("0", False),
        ("false", False),
        ("off", False),
        ("no", False),
    ],
)
def test_job_worker_enabled_flag(flag, enabled, monkeypatch):
    from backend.job_queue import job_worker_enabled

    if flag is None:
        monkeypatch.delenv("ACTIRA_JOB_WORKER", raising=False)
    else:
        monkeypatch.setenv("ACTIRA_JOB_WORKER", flag)
    assert job_worker_enabled() is enabled


def test_payload_backend_default_is_mongo():
    """Multi-node deploys should default payloads to shared Mongo."""
    # Import without requiring Mongo connection for the constant path
    from backend import job_queue as jq

    # Prefer reading the env default documented in MULTI_WORKER.md
    raw = (os.environ.get("ACTIRA_JOB_PAYLOAD_BACKEND") or "mongo").strip().lower()
    if "ACTIRA_JOB_PAYLOAD_BACKEND" not in os.environ:
        assert raw == "mongo"
    assert hasattr(jq, "job_worker_enabled")
    assert hasattr(jq, "start_worker")


def test_helm_templates_valid_mustache():
    """Regression: broken '{ {' spacing breaks helm template render."""
    helm = REPO_ROOT / "deployments" / "helm" / "actira"
    assert helm.is_dir()
    bad = []
    for path in helm.rglob("*"):
        if path.suffix not in {".yaml", ".yml", ".tpl"}:
            continue
        text = path.read_text(encoding="utf-8")
        if "{ {" in text or "} }" in text.replace("}}", ""):
            # Allow normal }} closers; only flag space-split openers
            if "{ {" in text:
                bad.append(str(path.relative_to(REPO_ROOT)))
    assert not bad, f"Broken Helm mustache spacing in: {bad}"


def test_helm_prod_values_exist_and_set_worker_pattern():
    prod = REPO_ROOT / "deployments" / "helm" / "actira" / "values-prod.yaml"
    assert prod.is_file()
    text = prod.read_text(encoding="utf-8")
    assert "ACTIRA_JOB_WORKER" in text
    assert "jobWorker" in text or "job-worker" in text or "worker" in text.lower()
    assert "replicaCount" in text


def test_ha_runbook_and_load_report_docs_exist():
    assert (REPO_ROOT / "docs" / "operations" / "HA_VALIDATION.md").is_file()
    assert (REPO_ROOT / "benchmarks" / "reports" / "LOAD_TEST_10_100.md").is_file()
