"""ACTIRA logging: console + optional rotating file, text or structured JSON.

Physical log routing
--------------------
- ``LOG_TO_FILE=1`` (default on) — write rotating file under LOG_DIR
- ``LOG_DIR`` / ``LOG_FILE`` / ``LOG_LEVEL`` / ``LOG_MAX_BYTES`` / ``LOG_BACKUP_COUNT``
- ``LOG_FORMAT=text|json`` — console + file format (default **text** for human greps)
- ``LOG_FILE_FORMAT`` — optional override for file only (e.g. text console + json file)

Every record carries ``request_id``, ``user``, ``user_id``, ``user_role`` via
:class:`RequestContextFilter` (contextvars from middleware / job worker).
"""
from __future__ import annotations

import json
import logging
import os
import sys
import traceback
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any, Optional

from backend.request_context import get_request_id, get_user, get_user_id, get_user_role

_CONFIGURED = False
_FILE_PATH: Optional[Path] = None

DEFAULT_FORMAT = (
    "%(asctime)s %(levelname)s [rid=%(request_id)s] "
    "[user=%(user)s] [uid=%(user_id)s] [role=%(user_role)s] "
    "%(name)s: %(message)s"
)


class RequestContextFilter(logging.Filter):
    """Inject request_id / user / user_id / user_role onto every LogRecord."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id()  # type: ignore[attr-defined]
        record.user = get_user()  # type: ignore[attr-defined]
        record.user_id = get_user_id()  # type: ignore[attr-defined]
        record.user_role = get_user_role()  # type: ignore[attr-defined]
        return True


class JsonFormatter(logging.Formatter):
    """One JSON object per line (ELK / Datadog / CloudWatch friendly)."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": getattr(record, "request_id", "-") or "-",
            "user": getattr(record, "user", "-") or "-",
            "user_id": getattr(record, "user_id", "-") or "-",
            "user_role": getattr(record, "user_role", "-") or "-",
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
            payload["exc_type"] = (
                record.exc_info[0].__name__ if record.exc_info[0] else None
            )
        # Optional structured extras (only JSON-serializable scalars)
        for key in (
            "method",
            "path",
            "status_code",
            "duration_ms",
            "client_ip",
            "job_id",
            "provider",
            "action",
        ):
            if hasattr(record, key):
                val = getattr(record, key)
                if val is not None and isinstance(val, (str, int, float, bool)):
                    payload[key] = val
        try:
            return json.dumps(payload, ensure_ascii=False, default=str)
        except Exception:
            return json.dumps(
                {
                    "ts": datetime.now(timezone.utc).isoformat(),
                    "level": "ERROR",
                    "logger": "actira.logging",
                    "msg": "json_format_failed",
                    "request_id": "-",
                    "user": "-",
                }
            )


def _truthy(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None or str(raw).strip() == "":
        return default
    return str(raw).strip().lower() in ("1", "true", "yes", "on")


def _int_env(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or str(raw).strip() == "":
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


def _format_name(name: str) -> str:
    n = (name or "text").strip().lower()
    return "json" if n in ("json", "structured", "jsonl") else "text"


def _make_formatter(kind: str) -> logging.Formatter:
    if _format_name(kind) == "json":
        return JsonFormatter()
    return logging.Formatter(DEFAULT_FORMAT)


def resolve_log_path() -> Path:
    """Absolute path to the primary log file."""
    backend_dir = Path(__file__).resolve().parent
    log_dir = (os.environ.get("LOG_DIR") or "").strip()
    if log_dir:
        directory = Path(log_dir).expanduser()
        if not directory.is_absolute():
            directory = (backend_dir.parent / directory).resolve()
    else:
        directory = backend_dir / "logs"
    name = (os.environ.get("LOG_FILE") or "actira.log").strip() or "actira.log"
    name = Path(name).name
    return directory / name


def log_file_path() -> Optional[Path]:
    return _FILE_PATH


def configure_logging(*, force: bool = False) -> Optional[Path]:
    """Configure root logging once. Returns file path if file handler attached."""
    global _CONFIGURED, _FILE_PATH
    if _CONFIGURED and not force:
        return _FILE_PATH

    level_name = (os.environ.get("LOG_LEVEL") or "INFO").strip().upper()
    level = getattr(logging, level_name, logging.INFO)
    console_fmt = _format_name(os.environ.get("LOG_FORMAT") or "text")
    file_fmt = _format_name(
        os.environ.get("LOG_FILE_FORMAT") or os.environ.get("LOG_FORMAT") or "text"
    )

    root = logging.getLogger()
    if force:
        for h in list(root.handlers):
            root.removeHandler(h)
            try:
                h.close()
            except Exception:
                pass
        _FILE_PATH = None

    if not force and root.handlers and _CONFIGURED:
        return _FILE_PATH

    if not root.handlers or force:
        root.handlers.clear()

    ctx_filter = RequestContextFilter()

    console = logging.StreamHandler(sys.stderr)
    console.setLevel(level)
    console.setFormatter(_make_formatter(console_fmt))
    console.addFilter(ctx_filter)
    root.addHandler(console)

    file_path: Optional[Path] = None
    if _truthy("LOG_TO_FILE", default=True):
        file_path = resolve_log_path()
        try:
            file_path.parent.mkdir(parents=True, exist_ok=True)
            fh = RotatingFileHandler(
                str(file_path),
                maxBytes=max(1024 * 100, _int_env("LOG_MAX_BYTES", 10 * 1024 * 1024)),
                backupCount=max(1, _int_env("LOG_BACKUP_COUNT", 10)),
                encoding="utf-8",
            )
            fh.setLevel(level)
            fh.setFormatter(_make_formatter(file_fmt))
            fh.addFilter(ctx_filter)
            root.addHandler(fh)
            _FILE_PATH = file_path
        except OSError as exc:
            logging.getLogger("actira.logging").warning(
                "Could not open log file %s: %s", file_path, exc
            )
            file_path = None
            _FILE_PATH = None

    root.setLevel(level)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)

    _CONFIGURED = True
    return _FILE_PATH


def identity_from_authorization(auth_header: Optional[str]) -> dict:
    """Best-effort JWT claims for logging only (never raises auth errors)."""
    out = {"user_id": "", "email": "", "role": ""}
    if not auth_header:
        return out
    parts = auth_header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return out
    token = parts[1].strip()
    if not token:
        return out
    try:
        import jwt
        from backend.auth import JWT_ALGO, JWT_SECRET

        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGO],
            options={"verify_exp": False},
        )
        out["user_id"] = str(payload.get("sub") or "")
        out["email"] = str(payload.get("email") or "")
        out["role"] = str(payload.get("role") or "")
    except Exception:
        pass
    return out
