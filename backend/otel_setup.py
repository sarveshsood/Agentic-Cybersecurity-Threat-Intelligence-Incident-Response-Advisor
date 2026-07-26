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
        logger.info(
            "OpenTelemetry OTLP exporter configured (endpoint_set=%s)",
            bool(endpoint),
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
