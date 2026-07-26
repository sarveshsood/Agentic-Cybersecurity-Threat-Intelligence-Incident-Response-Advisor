"""Pipeline stage timing for jobs (P3 / v1.3 observability first slice).

Records wall-clock ms per pipeline stage so Upload/job UI and operators can see
where time is spent (parse vs enrich vs playbook). Optional OpenTelemetry spans
when ``opentelemetry-api`` is installed — otherwise pure in-process timings.
"""
from __future__ import annotations

import logging
import time
from contextlib import contextmanager
from typing import Any, Dict, Iterator, List, Optional

logger = logging.getLogger("actira.pipeline_trace")


def _otel_start(name: str, attributes: Optional[Dict[str, Any]] = None):
    """Best-effort OTEL span; returns context manager or None."""
    try:
        from opentelemetry import trace  # type: ignore

        tracer = trace.get_tracer("actira.pipeline")
        span = tracer.start_as_current_span(name)
        if attributes:
            # enter later via context manager protocol
            cm = span

            class _AttrSpan:
                def __enter__(self):
                    s = cm.__enter__()
                    try:
                        for k, v in (attributes or {}).items():
                            if v is not None:
                                s.set_attribute(str(k), v)
                    except Exception:
                        pass
                    return s

                def __exit__(self, *exc):
                    return cm.__exit__(*exc)

            return _AttrSpan()
        return span
    except Exception:
        return None


class PipelineTrace:
    """Accumulate stage timings for a single pipeline job."""

    def __init__(self, job_id: str, *, kind: str = "batch"):
        self.job_id = job_id
        self.kind = kind
        self.stages: List[Dict[str, Any]] = []
        self._t0 = time.perf_counter()
        self._active: Optional[str] = None

    @contextmanager
    def stage(self, name: str, **attrs: Any) -> Iterator[None]:
        """Time a named stage; records ms and optional error."""
        name = (name or "stage").strip() or "stage"
        self._active = name
        t0 = time.perf_counter()
        err: Optional[str] = None
        otel = _otel_start(
            f"pipeline.{name}",
            {"job_id": self.job_id, "pipeline.kind": self.kind, **attrs},
        )
        try:
            if otel is not None:
                otel.__enter__()
            yield
        except Exception as e:
            err = f"{type(e).__name__}: {e}"[:500]
            raise
        finally:
            ms = round((time.perf_counter() - t0) * 1000.0, 2)
            entry: Dict[str, Any] = {"stage": name, "ms": ms}
            if err:
                entry["error"] = err
            if attrs:
                # keep small; stringify non-JSON-ish
                safe = {}
                for k, v in attrs.items():
                    if isinstance(v, (str, int, float, bool)) or v is None:
                        safe[k] = v
                    else:
                        safe[k] = str(v)[:120]
                if safe:
                    entry["attrs"] = safe
            self.stages.append(entry)
            self._active = None
            if otel is not None:
                try:
                    otel.__exit__(None, None, None)
                except Exception:
                    pass
            logger.debug("[job %s] stage %s %.2fms", self.job_id, name, ms)

    def total_ms(self) -> float:
        return round((time.perf_counter() - self._t0) * 1000.0, 2)

    def summary(self) -> Dict[str, Any]:
        stages = list(self.stages)
        by_name = {s["stage"]: s["ms"] for s in stages if "ms" in s}
        return {
            "job_id": self.job_id,
            "kind": self.kind,
            "total_ms": self.total_ms(),
            "stages": stages,
            "by_stage_ms": by_name,
        }
