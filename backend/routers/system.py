"""Root operational endpoints: health, ready, version, metrics.

Extracted from server.py (modular monolith shell) so the app factory stays thin.
Mounted at process root (``/health``) and under ``/api`` / ``/api/v1``.
"""
from __future__ import annotations

import os
import secrets as pysecrets

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, PlainTextResponse

from backend.auth import get_current_user
from backend.core.database import db
from backend.core import services as svc

router = APIRouter(tags=["system"])


def _global_rl_enabled() -> bool:
    return (os.environ.get("GLOBAL_RATE_LIMIT_ENABLED") or "").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def _global_rl_max() -> int:
    try:
        return int(os.environ.get("GLOBAL_RATE_LIMIT_MAX", 300) or "300")
    except (TypeError, ValueError):
        return 300


def _global_rl_window() -> int:
    try:
        return int(os.environ.get("GLOBAL_RATE_LIMIT_WINDOW_SECONDS", 60) or "60")
    except (TypeError, ValueError):
        return 60


@router.get("/health")
async def health():
    return await svc.health_check()


@router.get("/ready")
async def ready():
    """Readiness probe — 200 only when Mongo is reachable."""
    body = await svc.health_check()
    if body.get("mongo") != "up":
        return JSONResponse(status_code=503, content=body)
    return body


@router.get("/version")
async def version():
    return {
        "service": "ACTIRA API",
        "full_name": "Agentic Cybersecurity Threat Intelligence & Incident Response Advisor",
        "api": "v1",
        "package": "backend",
        "entry": "backend.server:app",
    }


@router.get("/metrics")
async def metrics(request: Request):
    """Metrics — admin JWT or X-Metrics-Token.

    - Default / ``?format=json`` → JSON gauges (legacy)
    - ``?format=prometheus`` or ``Accept: text/plain`` → Prometheus text exposition
    """
    allowed = False
    scrape = (os.environ.get("METRICS_TOKEN") or "").strip()
    header_tok = (request.headers.get("x-metrics-token") or "").strip()
    if scrape and header_tok and pysecrets.compare_digest(scrape, header_tok):
        allowed = True
    if not allowed:
        auth = request.headers.get("authorization") or ""
        if auth.lower().startswith("bearer "):
            try:
                user = await get_current_user(auth.split(" ", 1)[1].strip())
                if user.get("role") == "admin":
                    allowed = True
            except HTTPException:
                allowed = False
    if not allowed:
        raise HTTPException(
            401,
            "Metrics require admin Bearer JWT or X-Metrics-Token (METRICS_TOKEN env)",
        )
    try:
        incident_count = await db.incidents.count_documents({})
        job_count = await db.log_jobs.count_documents({})
        pending_review = await db.incidents.count_documents({"status": "pending_review"})
    except Exception:
        incident_count = job_count = pending_review = -1

    rl_on = _global_rl_enabled()
    try:
        from backend.metrics_registry import render_prometheus, set_gauge

        set_gauge("actira_incidents_total", float(incident_count))
        set_gauge("actira_log_jobs_total", float(job_count))
        set_gauge("actira_pending_review", float(pending_review))
        set_gauge("actira_global_rate_limit_enabled", 1.0 if rl_on else 0.0)
        set_gauge(
            "actira_global_rate_limit_max",
            float(_global_rl_max() if rl_on else 0),
        )
    except Exception:
        pass

    want_prom = False
    fmt = (request.query_params.get("format") or "").strip().lower()
    accept = (request.headers.get("accept") or "").lower()
    if fmt in ("prometheus", "prom", "text") or (
        "text/plain" in accept and "application/json" not in accept
    ):
        want_prom = True
    if want_prom:
        try:
            from backend.metrics_registry import render_prometheus

            body = render_prometheus()
        except Exception:
            body = "actira_up 1\n"
        return PlainTextResponse(body, media_type="text/plain; version=0.0.4; charset=utf-8")

    out = {
        "actira_incidents_total": incident_count,
        "actira_log_jobs_total": job_count,
        "actira_pending_review": pending_review,
        "actira_up": 1,
        "actira_global_rate_limit_enabled": 1 if rl_on else 0,
        "actira_global_rate_limit_max": _global_rl_max() if rl_on else 0,
        "actira_global_rate_limit_window_seconds": _global_rl_window() if rl_on else 0,
    }
    try:
        from backend.metrics_registry import snapshot
        from backend.ti_http import circuit_states

        out["registry"] = snapshot()
        out["ti_circuits"] = circuit_states()
    except Exception:
        pass
    return out
