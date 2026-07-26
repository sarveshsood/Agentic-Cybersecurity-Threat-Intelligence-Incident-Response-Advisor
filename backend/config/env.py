"""Environment helpers — load ``backend/.env`` once and read typed values."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

_BACKEND_DIR = Path(__file__).resolve().parents[1]
_DOTENV_LOADED = False


def load_backend_dotenv(*, override: bool = False) -> Path:
    """Load ``backend/.env`` if present. Idempotent unless override=True."""
    global _DOTENV_LOADED
    env_path = _BACKEND_DIR / ".env"
    if not _DOTENV_LOADED or override:
        load_dotenv(env_path, override=override)
        _DOTENV_LOADED = True
    return env_path


def app_env() -> str:
    load_backend_dotenv()
    return (os.environ.get("ENV") or "dev").strip().lower()


def bool_env(name: str, default: bool = False) -> bool:
    load_backend_dotenv()
    raw = os.environ.get(name)
    if raw is None or str(raw).strip() == "":
        return default
    return str(raw).strip().lower() in ("1", "true", "yes", "on")


def int_env(name: str, default: int) -> int:
    load_backend_dotenv()
    raw = os.environ.get(name)
    if raw is None or str(raw).strip() == "":
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default
