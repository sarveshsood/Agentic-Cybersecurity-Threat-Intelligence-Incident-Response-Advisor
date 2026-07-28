"""In-process Prometheus-style metrics for ACTIRA (no hard prometheus_client dep).

Exposes:
- Counters / gauges / histograms as Prometheus text via ``render_prometheus()``
- JSON snapshot via ``snapshot()`` for the legacy admin UI path

Scrapers: ``GET /metrics`` with ``Accept: text/plain`` or ``?format=prometheus``.
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

_lock = threading.Lock()

# name -> value
_gauges: Dict[str, float] = {}
# name -> labels_tuple -> value
_counters: Dict[str, Dict[Tuple[Tuple[str, str], ...], float]] = defaultdict(
    lambda: defaultdict(float)
)
# name -> list of observations (capped)
_histograms: Dict[str, List[float]] = defaultdict(list)
_HIST_MAX = 5000

# Default histogram buckets (seconds)
_BUCKETS = (0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0, 120.0, float("inf"))


def _labels_key(labels: Optional[Dict[str, str]]) -> Tuple[Tuple[str, str], ...]:
    if not labels:
        return ()
    return tuple(sorted((str(k), str(v)) for k, v in labels.items()))


def _fmt_labels(key: Tuple[Tuple[str, str], ...]) -> str:
    if not key:
        return ""
    inner = ",".join(f'{k}="{v}"' for k, v in key)
    return "{" + inner + "}"


def set_gauge(name: str, value: float) -> None:
    with _lock:
        _gauges[name] = float(value)


def inc_counter(name: str, amount: float = 1.0, **labels: str) -> None:
    with _lock:
        _counters[name][_labels_key(labels)] += float(amount)


def observe_histogram(name: str, value: float) -> None:
    with _lock:
        arr = _histograms[name]
        arr.append(float(value))
        if len(arr) > _HIST_MAX:
            del arr[: len(arr) - _HIST_MAX]


def record_http(method: str, path: str, status: int, duration_ms: float) -> None:
    # collapse high-cardinality path ids
    safe = path or "/"
    if "/incidents/" in safe:
        parts = safe.split("/")
        safe = "/".join(
            "ID" if (i > 0 and parts[i - 1] == "incidents" and p and p not in (
                "workspace", "notes", "timeline", "entity-graph", "rca"
            )) else p
            for i, p in enumerate(parts)
        )
    inc_counter("actira_http_requests_total", method=method.upper(), status=str(status))
    observe_histogram("actira_http_request_duration_seconds", max(0.0, duration_ms / 1000.0))


def record_ti(provider: str, outcome: str, duration_s: float) -> None:
    """outcome: live|mock|error|circuit|skip"""
    inc_counter("actira_ti_calls_total", provider=provider, outcome=outcome)
    observe_histogram("actira_ti_duration_seconds", max(0.0, duration_s))


def record_pipeline_stage(stage: str, duration_s: float, *, ok: bool = True) -> None:
    inc_counter("actira_pipeline_stage_total", stage=stage, status="ok" if ok else "error")
    observe_histogram(f"actira_pipeline_stage_{stage}_seconds", max(0.0, duration_s))
    observe_histogram("actira_pipeline_stage_seconds", max(0.0, duration_s))


def record_enrichment_batch(count: int, duration_s: float, cached: int = 0) -> None:
    inc_counter("actira_enrichment_iocs_total", amount=float(count), source="live_or_mock")
    if cached:
        inc_counter("actira_enrichment_iocs_total", amount=float(cached), source="cache")
    observe_histogram("actira_enrichment_batch_seconds", max(0.0, duration_s))


def record_llm(provider: str, tokens: int = 0, *, ok: bool = True) -> None:
    inc_counter("actira_llm_calls_total", provider=provider or "unknown", status="ok" if ok else "error")
    if tokens:
        inc_counter("actira_llm_tokens_total", amount=float(tokens), provider=provider or "unknown")


def snapshot() -> Dict[str, Any]:
    with _lock:
        return {
            "gauges": dict(_gauges),
            "counters": {
                name: {str(dict(k)): v for k, v in labels.items()}
                for name, labels in _counters.items()
            },
            "histograms": {
                name: {
                    "count": len(vals),
                    "sum": sum(vals) if vals else 0.0,
                    "avg": (sum(vals) / len(vals)) if vals else 0.0,
                }
                for name, vals in _histograms.items()
            },
        }


def render_prometheus() -> str:
    """Prometheus exposition format (text/plain; version=0.0.4)."""
    lines: List[str] = []
    with _lock:
        lines.append("# HELP actira_up ACTIRA process up")
        lines.append("# TYPE actira_up gauge")
        lines.append("actira_up 1")

        for name, val in sorted(_gauges.items()):
            lines.append(f"# TYPE {name} gauge")
            lines.append(f"{name} {val}")

        for name, labeled in sorted(_counters.items()):
            lines.append(f"# TYPE {name} counter")
            for key, val in sorted(labeled.items(), key=lambda x: str(x[0])):
                lines.append(f"{name}{_fmt_labels(key)} {val}")

        for name, vals in sorted(_histograms.items()):
            metric = name if name.endswith("_seconds") else f"{name}_seconds"
            if not metric.startswith("actira_"):
                metric = f"actira_{metric}"
            # use raw name as base for buckets
            base = name.rstrip("_seconds") if name.endswith("_seconds") else name
            lines.append(f"# TYPE {base} histogram")
            count = len(vals)
            total = sum(vals) if vals else 0.0
            sorted_vals = sorted(vals) if vals else []
            cumulative = 0
            for b in _BUCKETS:
                if b == float("inf"):
                    le = "+Inf"
                    cumulative = count
                else:
                    le = str(b)
                    cumulative = sum(1 for v in sorted_vals if v <= b)
                lines.append(f'{base}_bucket{{le="{le}"}} {cumulative}')
            lines.append(f"{base}_sum {total}")
            lines.append(f"{base}_count {count}")

    lines.append("")
    return "\n".join(lines)


def reset_for_tests() -> None:
    with _lock:
        _gauges.clear()
        _counters.clear()
        _histograms.clear()
