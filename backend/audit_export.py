"""WORM-style audit export + optional SIEM webhook forward.

- **File WORM path**: append-only JSONL under ``AUDIT_WORM_DIR`` (never rewritten).
- **SIEM**: POST each new audit entry (or bulk export) to ``AUDIT_SIEM_WEBHOOK_URL``.

Honesty: local JSONL is best-effort WORM (OS/admin can still delete files).
True immutability requires external object-lock / SIEM retention.
"""
from __future__ import annotations

import json
import logging
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)
_lock = threading.Lock()


def _truthy(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None or str(raw).strip() == "":
        return default
    return str(raw).strip().lower() in ("1", "true", "yes", "on")


def worm_enabled() -> bool:
    return _truthy("AUDIT_WORM_ENABLED", default=True)


def worm_dir() -> Path:
    backend = Path(__file__).resolve().parent
    raw = (os.environ.get("AUDIT_WORM_DIR") or "").strip()
    if raw:
        p = Path(raw).expanduser()
        return p if p.is_absolute() else (backend.parent / p).resolve()
    return backend / "data" / "audit_worm"


def siem_webhook() -> str:
    return (os.environ.get("AUDIT_SIEM_WEBHOOK_URL") or "").strip()


def _day_file() -> Path:
    d = worm_dir()
    d.mkdir(parents=True, exist_ok=True)
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return d / f"audit-{day}.jsonl"


def append_worm(entry: Dict[str, Any]) -> Optional[Path]:
    """Append one audit document as a JSONL line. Never overwrites."""
    if not worm_enabled():
        return None
    try:
        path = _day_file()
        line = json.dumps(entry, sort_keys=True, default=str, ensure_ascii=False) + "\n"
        with _lock:
            with path.open("a", encoding="utf-8") as f:
                f.write(line)
                f.flush()
                try:
                    os.fsync(f.fileno())
                except OSError:
                    pass
        return path
    except OSError as e:
        logger.warning("audit WORM append failed: %s", e)
        return None


def forward_siem(entry: Dict[str, Any]) -> Dict[str, Any]:
    """Best-effort HTTP POST to SIEM/webhook. Never raises."""
    url = siem_webhook()
    if not url:
        return {"ok": False, "skipped": True, "reason": "no_webhook"}
    try:
        import requests

        r = requests.post(
            url,
            json={
                "source": "actira",
                "event_type": "audit",
                "ts": datetime.now(timezone.utc).isoformat(),
                "entry": entry,
            },
            headers={"Content-Type": "application/json", "User-Agent": "ACTIRA-AuditExport/1.0"},
            timeout=float(os.environ.get("AUDIT_SIEM_TIMEOUT") or 5),
        )
        return {"ok": 200 <= r.status_code < 300, "status_code": r.status_code}
    except Exception as e:
        logger.warning("SIEM forward failed: %s", e)
        return {"ok": False, "error": type(e).__name__}


def on_audit_inserted(entry: Dict[str, Any]) -> None:
    """Hook after Mongo audit insert — WORM file + optional SIEM."""
    try:
        append_worm(entry)
    except Exception:
        pass
    if siem_webhook():
        try:
            forward_siem(entry)
        except Exception:
            pass


def export_range_jsonl(
    entries: List[Dict[str, Any]],
    *,
    path: Optional[Path] = None,
) -> Path:
    """Write a one-shot export file (append mode if path exists)."""
    if path is None:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        path = worm_dir() / f"export-{stamp}.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        for e in entries:
            f.write(json.dumps(e, sort_keys=True, default=str, ensure_ascii=False) + "\n")
    return path


def worm_status() -> Dict[str, Any]:
    d = worm_dir()
    files = []
    if d.is_dir():
        files = sorted(p.name for p in d.glob("*.jsonl"))[-20:]
    return {
        "enabled": worm_enabled(),
        "dir": str(d),
        "siem_webhook_configured": bool(siem_webhook()),
        "recent_files": files,
        "honesty": (
            "Append-only local JSONL + optional webhook. "
            "Not legal WORM storage unless the path is on immutable media / object lock."
        ),
    }
