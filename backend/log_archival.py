"""Application log archival + lifecycle (enterprise P3).

Copies/rotates ACTIRA log files into a dated archive directory and purges
archives older than ``LOG_ARCHIVE_RETAIN_DAYS``.

Env
---
- ``LOG_ARCHIVE_ENABLED`` — default on when file logging is on
- ``LOG_ARCHIVE_DIR`` — default ``backend/logs/archive``
- ``LOG_ARCHIVE_RETAIN_DAYS`` — default 30
"""
from __future__ import annotations

import logging
import os
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


def _truthy(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None or str(raw).strip() == "":
        return default
    return str(raw).strip().lower() in ("1", "true", "yes", "on")


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name) or default)
    except (TypeError, ValueError):
        return default


def archive_root() -> Path:
    backend_dir = Path(__file__).resolve().parent
    raw = (os.environ.get("LOG_ARCHIVE_DIR") or "").strip()
    if raw:
        p = Path(raw).expanduser()
        if not p.is_absolute():
            p = (backend_dir.parent / p).resolve()
        return p
    return backend_dir / "logs" / "archive"


def enabled() -> bool:
    # Default on when LOG_TO_FILE is on
    if os.environ.get("LOG_ARCHIVE_ENABLED") is not None:
        return _truthy("LOG_ARCHIVE_ENABLED", default=True)
    return _truthy("LOG_TO_FILE", default=True)


def retain_days() -> int:
    return max(1, _int_env("LOG_ARCHIVE_RETAIN_DAYS", 30))


def run_archival(*, source_log: Optional[Path] = None) -> Dict[str, Any]:
    """Archive current log + rotated siblings; purge old archives.

    Safe to call on startup and periodically. Never raises.
    """
    result: Dict[str, Any] = {
        "enabled": enabled(),
        "copied": [],
        "purged": 0,
        "archive_dir": str(archive_root()),
        "retain_days": retain_days(),
    }
    if not enabled():
        return result
    try:
        from backend.logging_setup import resolve_log_path

        log_path = source_log or resolve_log_path()
    except Exception:
        log_path = Path(__file__).resolve().parent / "logs" / "actira.log"

    try:
        arch = archive_root()
        arch.mkdir(parents=True, exist_ok=True)
        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        day_dir = arch / day
        day_dir.mkdir(parents=True, exist_ok=True)

        candidates: List[Path] = []
        if log_path.is_file():
            candidates.append(log_path)
        # RotatingFileHandler siblings: actira.log.1, .2, ...
        parent = log_path.parent
        if parent.is_dir():
            for p in parent.glob(f"{log_path.name}.*"):
                if p.is_file() and p.suffix.lstrip(".").isdigit():
                    candidates.append(p)

        ts = datetime.now(timezone.utc).strftime("%H%M%S")
        for src in candidates:
            dest = day_dir / f"{src.name}.{ts}"
            try:
                # Copy (don't move) so live logging continues
                if src.stat().st_size <= 0:
                    continue
                shutil.copy2(src, dest)
                result["copied"].append(str(dest))
            except OSError as e:
                logger.warning("log archive copy failed %s: %s", src, e)

        # Purge old day dirs
        cutoff = time.time() - (retain_days() * 86400)
        purged = 0
        for child in arch.iterdir():
            if not child.is_dir():
                continue
            try:
                if child.stat().st_mtime < cutoff:
                    shutil.rmtree(child, ignore_errors=True)
                    purged += 1
            except OSError:
                continue
        result["purged"] = purged
        if result["copied"] or purged:
            logger.info(
                "log archival: copied=%s purged_dirs=%s → %s",
                len(result["copied"]),
                purged,
                arch,
            )
    except Exception as e:
        logger.warning("log archival failed: %s", e)
        result["error"] = str(e)[:200]
    return result
