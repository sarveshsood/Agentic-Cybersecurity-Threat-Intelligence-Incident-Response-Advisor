"""Ops anomaly detection on pipeline performance and API health (enterprise P3).

Uses robust statistics (median + MAD) over recent job ``pipeline_total_ms`` and
stage timings, plus simple rate signals (failure ratio, queue backlog, TI circuits).

This is **not** ML — transparent, deterministic thresholds for Ops Health.
"""
from __future__ import annotations

import statistics
from typing import Any, Dict, List, Optional, Sequence


def _median(vals: Sequence[float]) -> float:
    if not vals:
        return 0.0
    return float(statistics.median(vals))


def _mad(vals: Sequence[float], med: Optional[float] = None) -> float:
    """Median absolute deviation (scaled ~σ for normal via 1.4826)."""
    if not vals:
        return 0.0
    m = med if med is not None else _median(vals)
    devs = [abs(v - m) for v in vals]
    return float(statistics.median(devs)) * 1.4826 if devs else 0.0


def _z_robust(value: float, med: float, mad: float) -> float:
    if mad <= 1e-9:
        return 0.0 if abs(value - med) < 1e-9 else (10.0 if value > med else -10.0)
    return (value - med) / mad


def analyze_pipeline_timings(
    rows: List[Dict[str, Any]],
    *,
    z_warn: float = 2.5,
    z_crit: float = 4.0,
) -> Dict[str, Any]:
    """Flag slow jobs vs cohort baseline."""
    totals = [
        float(r.get("pipeline_total_ms") or 0)
        for r in rows
        if r.get("pipeline_total_ms") is not None
    ]
    totals = [t for t in totals if t > 0]
    alerts: List[Dict[str, Any]] = []
    if len(totals) < 3:
        return {
            "sample_size": len(totals),
            "baseline_ms": _median(totals) if totals else None,
            "mad_ms": _mad(totals) if totals else None,
            "alerts": [],
            "status": "insufficient_data",
            "message": "Need ≥3 completed job timings for baseline.",
        }

    med = _median(totals)
    mad = _mad(totals, med)
    for r in rows:
        ms = float(r.get("pipeline_total_ms") or 0)
        if ms <= 0:
            continue
        z = _z_robust(ms, med, mad)
        if z >= z_crit:
            severity = "critical"
        elif z >= z_warn:
            severity = "warning"
        else:
            continue
        alerts.append(
            {
                "kind": "slow_pipeline",
                "severity": severity,
                "job_id": r.get("id"),
                "pipeline_total_ms": ms,
                "z_score": round(z, 2),
                "baseline_ms": round(med, 1),
                "message": (
                    f"Job {str(r.get('id') or '')[:8]} took {ms:.0f}ms "
                    f"({z:.1f}σ above median {med:.0f}ms)"
                ),
            }
        )

    # Stage hotspots: stages consistently high share of total
    stage_sums: Dict[str, List[float]] = {}
    for r in rows:
        by = r.get("by_stage_ms") or {}
        if not isinstance(by, dict):
            continue
        for k, v in by.items():
            try:
                stage_sums.setdefault(str(k), []).append(float(v))
            except (TypeError, ValueError):
                pass
    hot_stages = []
    for stage, vals in stage_sums.items():
        if len(vals) < 3:
            continue
        sm = _median(vals)
        if med > 0 and sm / med >= 0.45:
            hot_stages.append({"stage": stage, "median_ms": round(sm, 1), "share": round(sm / med, 2)})
    hot_stages.sort(key=lambda x: -x["median_ms"])

    status = "ok"
    if any(a["severity"] == "critical" for a in alerts):
        status = "critical"
    elif alerts or hot_stages:
        status = "warning"

    return {
        "sample_size": len(totals),
        "baseline_ms": round(med, 1),
        "mad_ms": round(mad, 1),
        "p95_ms": round(sorted(totals)[int(0.95 * (len(totals) - 1))], 1) if totals else None,
        "alerts": alerts[:20],
        "hot_stages": hot_stages[:5],
        "status": status,
        "method": "median_mad_zscore",
    }


def analyze_queue_health(queue: Dict[str, int]) -> Dict[str, Any]:
    q = {k: int(queue.get(k) or 0) for k in ("queued", "running", "done", "failed")}
    total = sum(q.values()) or 1
    fail_rate = q["failed"] / total
    backlog = q["queued"] + q["running"]
    alerts = []
    if fail_rate >= 0.25 and q["failed"] >= 2:
        alerts.append(
            {
                "kind": "high_failure_rate",
                "severity": "critical" if fail_rate >= 0.4 else "warning",
                "message": f"Job failure rate {fail_rate:.0%} ({q['failed']}/{total})",
                "fail_rate": round(fail_rate, 3),
            }
        )
    if backlog >= 10:
        alerts.append(
            {
                "kind": "queue_backlog",
                "severity": "warning" if backlog < 25 else "critical",
                "message": f"Queue backlog {backlog} (queued={q['queued']} running={q['running']})",
                "backlog": backlog,
            }
        )
    status = "ok"
    if any(a["severity"] == "critical" for a in alerts):
        status = "critical"
    elif alerts:
        status = "warning"
    return {"queue": q, "fail_rate": round(fail_rate, 3), "backlog": backlog, "alerts": alerts, "status": status}


def analyze_ti_circuits(circuits: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    circuits = circuits or {}
    open_ones = [
        name
        for name, st in circuits.items()
        if isinstance(st, dict) and st.get("state") == "open"
    ]
    alerts = []
    if open_ones:
        alerts.append(
            {
                "kind": "ti_circuit_open",
                "severity": "warning" if len(open_ones) < 3 else "critical",
                "message": f"TI circuit open: {', '.join(open_ones)}",
                "providers": open_ones,
            }
        )
    return {
        "open_circuits": open_ones,
        "alerts": alerts,
        "status": "critical" if len(open_ones) >= 3 else ("warning" if open_ones else "ok"),
    }


def analyze_http_registry(snapshot: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Light signal from in-process metrics histogram averages."""
    snapshot = snapshot or {}
    hist = (snapshot.get("histograms") or {}).get("actira_http_request_duration_seconds") or {}
    avg = float(hist.get("avg") or 0)
    alerts = []
    if avg >= 2.0:
        alerts.append(
            {
                "kind": "slow_api",
                "severity": "warning" if avg < 5 else "critical",
                "message": f"HTTP avg latency {avg:.2f}s (in-process sample)",
                "avg_seconds": round(avg, 3),
            }
        )
    return {
        "http_avg_seconds": round(avg, 3) if avg else None,
        "alerts": alerts,
        "status": "critical" if avg >= 5 else ("warning" if avg >= 2 else "ok"),
    }


def build_anomaly_report(
    *,
    timings: List[Dict[str, Any]],
    queue: Dict[str, int],
    ti_circuits: Optional[Dict[str, Any]] = None,
    metrics_snapshot: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    pipe = analyze_pipeline_timings(timings)
    qh = analyze_queue_health(queue)
    ti = analyze_ti_circuits(ti_circuits)
    http = analyze_http_registry(metrics_snapshot)

    all_alerts = []
    for block in (pipe, qh, ti, http):
        all_alerts.extend(block.get("alerts") or [])

    ranks = {"ok": 0, "insufficient_data": 0, "warning": 1, "critical": 2}
    overall = "ok"
    for block in (pipe, qh, ti, http):
        st = block.get("status") or "ok"
        if ranks.get(st, 0) > ranks.get(overall, 0):
            overall = st
    if overall == "insufficient_data" and any(
        b.get("status") in ("warning", "critical") for b in (qh, ti, http)
    ):
        overall = max(
            (qh.get("status"), ti.get("status"), http.get("status")),
            key=lambda s: ranks.get(s or "ok", 0),
        )

    return {
        "overall": overall,
        "pipeline": pipe,
        "queue_health": qh,
        "ti": ti,
        "http": http,
        "alerts": all_alerts[:30],
        "disclaimer": (
            "Deterministic median/MAD baselines and simple rate thresholds — "
            "not a trained ML model."
        ),
    }
