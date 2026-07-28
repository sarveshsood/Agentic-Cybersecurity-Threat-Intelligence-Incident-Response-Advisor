"""Per-job artifact persistence for pipeline replay / audit (enterprise P1-8).

When ``JOB_ARTIFACTS_ENABLED=1`` (default **off** to avoid disk growth in lab),
the pipeline can store stage snapshots under:

  ``backend/data/job_artifacts/{job_id}/``

Env
---
- ``JOB_ARTIFACTS_ENABLED`` — 1/true to enable
- ``JOB_ARTIFACTS_DIR`` — override root directory
- ``JOB_ARTIFACTS_MAX_BYTES`` — skip write if payload larger (default 5_000_000)
- ``JOB_ARTIFACTS_RETAIN_HOURS`` — purge older artifact dirs on write (default 168 = 7d)
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import time
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

_ROOT = Path(
    os.environ.get("JOB_ARTIFACTS_DIR")
    or (Path(__file__).resolve().parent / "data" / "job_artifacts")
)


def enabled() -> bool:
    raw = (os.environ.get("JOB_ARTIFACTS_ENABLED") or "").strip().lower()
    return raw in ("1", "true", "yes", "on")


def _max_bytes() -> int:
    try:
        return max(10_000, int(os.environ.get("JOB_ARTIFACTS_MAX_BYTES") or 5_000_000))
    except (TypeError, ValueError):
        return 5_000_000


def _retain_hours() -> float:
    try:
        return max(1.0, float(os.environ.get("JOB_ARTIFACTS_RETAIN_HOURS") or 168))
    except (TypeError, ValueError):
        return 168.0


def artifact_dir(job_id: str) -> Path:
    safe = "".join(c for c in (job_id or "unknown") if c.isalnum() or c in "-_")
    return _ROOT / (safe or "unknown")


def save_artifact(job_id: str, name: str, payload: Any) -> Optional[Path]:
    """Write JSON artifact ``{name}.json``. Returns path or None if disabled/failed."""
    if not enabled() or not job_id:
        return None
    safe_name = "".join(c for c in (name or "artifact") if c.isalnum() or c in "-_") or "artifact"
    try:
        text = json.dumps(payload, indent=2, default=str, ensure_ascii=False)
    except Exception as e:
        logger.warning("artifact serialize failed job=%s name=%s: %s", job_id, name, e)
        return None
    if len(text.encode("utf-8")) > _max_bytes():
        logger.info("artifact skip oversized job=%s name=%s", job_id, name)
        return None
    try:
        d = artifact_dir(job_id)
        d.mkdir(parents=True, exist_ok=True)
        path = d / f"{safe_name}.json"
        path.write_text(text, encoding="utf-8")
        _maybe_purge_old()
        return path
    except OSError as e:
        logger.warning("artifact write failed job=%s name=%s: %s", job_id, name, e)
        return None


def list_artifacts(job_id: str) -> list:
    d = artifact_dir(job_id)
    if not d.is_dir():
        return []
    return sorted(p.name for p in d.glob("*.json"))


def load_artifact(job_id: str, name: str) -> Optional[Any]:
    safe_name = "".join(c for c in (name or "") if c.isalnum() or c in "-_")
    path = artifact_dir(job_id) / f"{safe_name}.json"
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _maybe_purge_old() -> None:
    """Best-effort delete artifact dirs older than retain window."""
    try:
        if not _ROOT.is_dir():
            return
        cutoff = time.time() - (_retain_hours() * 3600)
        for child in _ROOT.iterdir():
            if not child.is_dir():
                continue
            try:
                mtime = child.stat().st_mtime
            except OSError:
                continue
            if mtime < cutoff:
                shutil.rmtree(child, ignore_errors=True)
    except Exception:
        pass
