"""Platform / enterprise settings: defaults, env sync, runtime resolve.

Admin → Settings → Platform stores these in Mongo. On load/save we push
selected keys into ``os.environ`` so modules that already read env
(``ti_http``, ``logging_setup``, ``job_artifacts``, …) stay consistent.

Resolution order for callers: **Settings doc → process env → factory default**.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, Mapping, Optional

logger = logging.getLogger(__name__)

# Maps Settings field → environment variable (for process-wide modules)
SETTINGS_TO_ENV: Dict[str, str] = {
    "enrich_concurrency": "ENRICH_CONCURRENCY",
    "parse_concurrency": "PARSE_CONCURRENCY",
    "max_enrich_iocs": "MAX_ENRICH_IOCS",
    "ti_http_timeout": "TI_HTTP_TIMEOUT",
    "ti_http_retries": "TI_HTTP_RETRIES",
    "ti_http_backoff_base": "TI_HTTP_BACKOFF_BASE",
    "ti_circuit_failures": "TI_CIRCUIT_FAILURES",
    "ti_circuit_cooldown_seconds": "TI_CIRCUIT_COOLDOWN_SECONDS",
    "log_format": "LOG_FORMAT",
    "log_file_format": "LOG_FILE_FORMAT",
    "log_level": "LOG_LEVEL",
    "log_to_file": "LOG_TO_FILE",
    "log_archive_enabled": "LOG_ARCHIVE_ENABLED",
    "log_archive_retain_days": "LOG_ARCHIVE_RETAIN_DAYS",
    "job_artifacts_enabled": "JOB_ARTIFACTS_ENABLED",
    "job_payload_retain": "JOB_PAYLOAD_RETAIN",
    "job_artifacts_retain_hours": "JOB_ARTIFACTS_RETAIN_HOURS",
    "audit_worm_enabled": "AUDIT_WORM_ENABLED",
    "audit_siem_webhook_url": "AUDIT_SIEM_WEBHOOK_URL",
    "job_broker_enabled": "JOB_BROKER_ENABLED",
    "job_broker_url": "JOB_BROKER_URL",
    "job_broker_queue": "JOB_BROKER_QUEUE",
}

# Public (non-secret) platform fields returned on GET /settings
PUBLIC_PLATFORM_FIELDS = (
    "max_enrich_iocs",
    "enrich_concurrency",
    "parse_concurrency",
    "ti_http_timeout",
    "ti_http_retries",
    "ti_http_backoff_base",
    "ti_circuit_failures",
    "ti_circuit_cooldown_seconds",
    "log_format",
    "log_file_format",
    "log_level",
    "log_to_file",
    "log_archive_enabled",
    "log_archive_retain_days",
    "job_artifacts_enabled",
    "job_payload_retain",
    "job_artifacts_retain_hours",
    "audit_worm_enabled",
    "job_broker_enabled",
    "job_broker_queue",
)

FACTORY_PLATFORM: Dict[str, Any] = {
    "max_enrich_iocs": 50,
    "enrich_concurrency": 8,
    "parse_concurrency": 4,
    "ti_http_timeout": 8.0,
    "ti_http_retries": 2,
    "ti_http_backoff_base": 0.4,
    "ti_circuit_failures": 5,
    "ti_circuit_cooldown_seconds": 60,
    "log_format": "text",
    "log_file_format": "",
    "log_level": "INFO",
    "log_to_file": True,
    "log_archive_enabled": True,
    "log_archive_retain_days": 30,
    "job_artifacts_enabled": False,
    "job_payload_retain": False,
    "job_artifacts_retain_hours": 168,
    "audit_worm_enabled": True,
    "job_broker_enabled": False,
    "job_broker_queue": "actira.jobs",
}

RECOMMENDED_PLATFORM: Dict[str, Any] = {
    **FACTORY_PLATFORM,
    "enrich_concurrency": 8,
    "parse_concurrency": 4,
    "ti_http_timeout": 10.0,
    "ti_http_retries": 3,
    "log_format": "json",
    "log_file_format": "json",
    "log_level": "INFO",
    "job_artifacts_enabled": True,
    "job_payload_retain": False,  # disk-heavy; enable for demos that need re-queue
    "audit_worm_enabled": True,
    "log_archive_enabled": True,
    "log_archive_retain_days": 30,
}


def _bool_to_env(v: Any) -> str:
    return "1" if bool(v) else "0"


def apply_platform_to_environ(settings: Optional[Mapping[str, Any]]) -> None:
    """Push platform fields into os.environ (overrides process env for children)."""
    if not settings:
        return
    for field, env_name in SETTINGS_TO_ENV.items():
        if field not in settings:
            continue
        val = settings.get(field)
        if val is None:
            continue
        if isinstance(val, bool):
            os.environ[env_name] = _bool_to_env(val)
        elif isinstance(val, (int, float)):
            os.environ[env_name] = str(val)
        else:
            s = str(val).strip()
            # empty string: for log_file_format means "follow log_format" — clear env
            if s == "" and field == "log_file_format":
                os.environ.pop(env_name, None)
            elif s:
                os.environ[env_name] = s
    # Reconfigure logging if format/level changed (best-effort)
    try:
        from backend.logging_setup import configure_logging

        configure_logging(force=True)
    except Exception as e:
        logger.debug("logging reconfigure after settings: %s", e)
    # Reset TI session so proxy/timeouts pick up new values
    try:
        from backend import ti_http

        ti_http.reset_session()
    except Exception:
        pass


def public_platform_payload(settings: Mapping[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for k in PUBLIC_PLATFORM_FIELDS:
        if k in settings and settings[k] is not None:
            out[k] = settings[k]
        else:
            out[k] = FACTORY_PLATFORM.get(k)
    # has_* for secrets (never return raw values)
    def _present(v: Any) -> bool:
        s = str(v or "").strip()
        return bool(s) and s not in ("***", "••••", "redacted")

    out["has_audit_siem_webhook"] = _present(settings.get("audit_siem_webhook_url")) or _present(
        os.environ.get("AUDIT_SIEM_WEBHOOK_URL")
    )
    out["has_job_broker_url"] = _present(settings.get("job_broker_url")) or _present(
        os.environ.get("JOB_BROKER_URL")
    )
    return out
