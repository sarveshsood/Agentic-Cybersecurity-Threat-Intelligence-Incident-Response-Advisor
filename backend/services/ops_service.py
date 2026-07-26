"""Ops / HA status for the admin Ops Health UI."""
from __future__ import annotations

import os
from typing import Any, Dict, List

from backend.core import services as svc
from backend.database import db
from backend.job_queue import job_worker_enabled


def _env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


async def ops_status() -> Dict[str, Any]:
    """Snapshot of multi-replica / HA-relevant runtime flags + light Mongo stats."""
    health = await svc.health_check()
    mongo_up = health.get("mongo") == "up"

    queue_counts: Dict[str, int] = {}
    recent_timings: List[Dict[str, Any]] = []
    if mongo_up:
        try:
            for state in ("queued", "running", "done", "failed"):
                queue_counts[state] = await db.log_jobs.count_documents(
                    {"status": state}
                )
        except Exception:
            queue_counts = {}
        try:
            cursor = (
                db.log_jobs.find(
                    {"pipeline_total_ms": {"$exists": True}},
                    {
                        "_id": 0,
                        "id": 1,
                        "status": 1,
                        "pipeline_total_ms": 1,
                        "stage_timings.by_stage_ms": 1,
                        "stage_timings.total_ms": 1,
                    },
                )
                .sort([("pipeline_total_ms", -1)])
                .limit(8)
            )
            rows = await cursor.to_list(8)
            for r in rows:
                st = r.get("stage_timings") or {}
                recent_timings.append(
                    {
                        "id": r.get("id"),
                        "status": r.get("status"),
                        "pipeline_total_ms": r.get("pipeline_total_ms")
                        or st.get("total_ms"),
                        "by_stage_ms": st.get("by_stage_ms") or {},
                    }
                )
        except Exception:
            recent_timings = []

    llm_usage = None
    try:
        from backend.llm_usage import usage_snapshot

        settings = await svc.get_settings()
        llm_usage = await usage_snapshot(settings, db)
    except Exception:
        llm_usage = None

    worker_on = job_worker_enabled()
    payload_backend = _env("ACTIRA_JOB_PAYLOAD_BACKEND", "mongo").lower() or "mongo"
    env_name = _env("ENV", "dev").lower() or "dev"

    try:
        from backend.services import analytics_cache as acache

        kpi_ttl = acache.kpi_ttl()
        dash_ttl = acache.analytics_ttl()
    except Exception:
        kpi_ttl = 30.0
        dash_ttl = 60.0

    ha_hints: List[str] = []
    if worker_on and env_name in ("production", "prod", "staging"):
        ha_hints.append(
            "This process has ACTIRA_JOB_WORKER enabled. In multi-replica Helm, "
            "API pods should use ACTIRA_JOB_WORKER=0 and a single worker Deployment."
        )
    if not worker_on:
        ha_hints.append(
            "Job worker is disabled on this process — uploads need a separate worker "
            "pod (or another process) with ACTIRA_JOB_WORKER=1."
        )
    if payload_backend != "mongo":
        ha_hints.append(
            f"Job payload backend is '{payload_backend}'. Prefer 'mongo' for multi-node."
        )
    if env_name in ("dev", "test", "local"):
        ha_hints.append("ENV is non-production — multi-replica checklist is optional for local demos.")

    return {
        "service": "ACTIRA",
        "env": env_name,
        "mongo": health.get("mongo"),
        "ready": mongo_up,
        "status": health.get("status"),
        "job_worker_enabled": worker_on,
        "job_payload_backend": payload_backend,
        "replica_layout": {
            "recommended_api_worker_flag": "0",
            "recommended_worker_flag": "1",
            "this_process_is_worker": worker_on,
            "note": "Each process only sees its own ACTIRA_JOB_WORKER flag; use Helm labels for cluster view.",
        },
        "analytics_cache": {
            "scope": "process-local",
            "kpi_ttl_seconds": kpi_ttl,
            "dashboard_ttl_seconds": dash_ttl,
            "force_refresh_query": "force_refresh=true",
        },
        "pipeline_trace": {
            "enabled": True,
            "stages": [
                "expand",
                "parse",
                "correlate",
                "ioc_extract",
                "enrich",
                "attack_map",
                "playbook",
                "hitl_gate",
            ],
            "persisted_on": "log_jobs.stage_timings + pipeline_total_ms",
        },
        "queue": queue_counts,
        "llm_usage": llm_usage,
        "recent_job_timings": recent_timings,
        "ha_hints": ha_hints,
        "docs": {
            "ha_validation": "docs/operations/HA_VALIDATION.md",
            "load_test_10_100": "benchmarks/reports/LOAD_TEST_10_100.md",
            "multi_worker": "docs/MULTI_WORKER.md",
            "helm_prod": "deployments/helm/actira/values-prod.yaml",
        },
        "load_test_cli": (
            "python benchmarks/run_benchmarks.py --profile light --write-md"
        ),
    }
