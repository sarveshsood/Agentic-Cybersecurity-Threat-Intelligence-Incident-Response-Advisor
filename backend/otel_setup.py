"""Optional OpenTelemetry OTLP export (soft dependency).

Enable with::

    ACTIRA_OTEL_ENABLED=1
    OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

Optional packages (not in core requirements)::

    pip install opentelemetry-api opentelemetry-sdk opentelemetry-exporter-otlp-proto-http

If packages or env are missing, this is a no-op.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict

logger = logging.getLogger("actira.otel")

_configured = False
_status: Dict[str, Any] = {
    "configured": False,
    "enabled_env": False,
    "endpoint_set": False,
    "sdk_available": False,
    "exporter": None,
    "error": None,
}


def otel_status() -> Dict[str, Any]:
    return dict(_status)


def setup_otel(service_name: str = "actira") -> bool:
    """Configure TracerProvider + OTLP HTTP exporter once. Never raises."""
    global _configured
    if _configured:
        return bool(_status.get("configured"))

    enabled = (os.environ.get("ACTIRA_OTEL_ENABLED") or "").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    endpoint = (os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT") or "").strip()
    _status["enabled_env"] = enabled
    _status["endpoint_set"] = bool(endpoint)

    if not enabled and not endpoint:
        _configured = True
        return False

    try:
        from opentelemetry import trace  # type: ignore
        from opentelemetry.sdk.resources import Resource  # type: ignore
        from opentelemetry.sdk.trace import TracerProvider  # type: ignore
        from opentelemetry.sdk.trace.export import BatchSpanProcessor  # type: ignore
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import (  # type: ignore
            OTLPSpanExporter,
        )

        _status["sdk_available"] = True
        resource = Resource.create(
            {
                "service.name": os.environ.get("OTEL_SERVICE_NAME") or service_name,
                "service.namespace": "actira",
            }
        )
        provider = TracerProvider(resource=resource)
        kwargs = {}
        if endpoint:
            # SDK accepts endpoint with or without /v1/traces depending on version
            kwargs["endpoint"] = endpoint.rstrip("/") + (
                "" if endpoint.rstrip("/").endswith("traces") else "/v1/traces"
            )
        exporter = OTLPSpanExporter(**kwargs) if kwargs else OTLPSpanExporter()
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)
        _status["configured"] = True
        _status["exporter"] = "otlp-http"
        _status["error"] = None
        # Optional auto-instrument (install opentelemetry-instrumentation-*)
        auto = []
        try:
            from opentelemetry.instrumentation.requests import RequestsInstrumentor  # type: ignore

            RequestsInstrumentor().instrument()
            auto.append("requests")
        except Exception:
            pass
        try:
            from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor  # type: ignore

            HTTPXClientInstrumentor().instrument()
            auto.append("httpx")
        except Exception:
            pass
        try:
            from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor  # type: ignore

            # Caller may pass app later; mark available for instrument_app()
            _status["fastapi_instrumentor"] = True
            auto.append("fastapi_ready")
        except Exception:
            _status["fastapi_instrumentor"] = False
        _status["auto_instrument"] = auto
        logger.info(
            "OpenTelemetry OTLP exporter configured (endpoint_set=%s auto=%s)",
            bool(endpoint),
            auto,
        )
    except Exception as e:
        _status["sdk_available"] = "opentelemetry" in str(type(e).__module__) or _status[
            "sdk_available"
        ]
        _status["configured"] = False
        _status["error"] = f"{type(e).__name__}: {e}"[:300]
        logger.warning("OpenTelemetry setup skipped: %s", e)

    _configured = True
    return bool(_status.get("configured"))


def instrument_fastapi_app(app: Any) -> bool:
    """Best-effort FastAPI auto-instrument after app creation."""
    if not _status.get("configured"):
        return False
    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor  # type: ignore

        FastAPIInstrumentor.instrument_app(app)
        _status["fastapi_instrumented"] = True
        return True
    except Exception as e:
        _status["fastapi_instrumented"] = False
        logger.debug("FastAPI OTEL instrument skipped: %s", e)
        return False


def get_tracer(name: str = "actira"):
    """Return a tracer if OTEL is configured, else a no-op-friendly object."""
    try:
        from opentelemetry import trace  # type: ignore

        return trace.get_tracer(name)
    except Exception:
        return _NoopTracer()


class _NoopSpan:
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def set_attribute(self, *args, **kwargs):
        return None

    def record_exception(self, *args, **kwargs):
        return None

    def set_status(self, *args, **kwargs):
        return None


class _NoopTracer:
    def start_as_current_span(self, name: str, **kwargs):
        return _NoopSpan()


def span(name: str, **attributes):
    """Context manager for a named span with optional attributes."""
    tracer = get_tracer()
    cm = tracer.start_as_current_span(name)
    # Attach attributes after enter when real span
    class _AttrSpan:
        def __enter__(self_inner):
            self_inner._span = cm.__enter__()
            for k, v in attributes.items():
                try:
                    self_inner._span.set_attribute(k, v)
                except Exception:
                    pass
            return self_inner._span

        def __exit__(self_inner, *args):
            return cm.__exit__(*args)

    return _AttrSpan()
