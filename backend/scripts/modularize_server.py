#!/usr/bin/env python3
"""One-shot v1.1 modularizer: split server.py into core/ + routers/.

Run from backend/:  python scripts/modularize_server.py
Idempotent if routers already exist with marker.
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BAK = ROOT / "server.py.v1pre_modular.bak"
SRC = BAK if BAK.exists() else ROOT / "server.py"
lines = SRC.read_text(encoding="utf-8").splitlines(keepends=True)


def slice_lines(start: int, end: int) -> str:
    """1-based inclusive start, exclusive end."""
    return "".join(lines[start - 1: end - 1])


COMMON_IMPORTS = '''\
"""ACTIRA API routes — auto-split from server.py (v1.1 modularization)."""
from __future__ import annotations

import os
import logging
import asyncio
import uuid
import time
import traceback
import re
import secrets as pysecrets
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Literal, Optional

from fastapi import (
    APIRouter, Depends, HTTPException, UploadFile, File, Form,
    BackgroundTasks, Request, Header, Body, Query, Response,
)
from fastapi.responses import StreamingResponse, JSONResponse
import json as _json
from pydantic import BaseModel, Field, ValidationError

from backend.models import (
    User, UserCreatePublic, UserInDB, LoginRequest, TokenResponse,
    Incident, LogJob, Settings, SECRET_SETTINGS_FIELDS, ReviewAction, AuditEvent, new_id,
    SETTINGS_CLEAR_SENTINEL,
)
from secrets_util import (
    has_secret, sync_llm_keys_to_env, bootstrap_settings_kwargs, clean_secret, is_real_secret,
    clear_secrets_from_env, TI_SECRET_FIELDS, LLM_SECRET_FIELDS, NOTIFICATION_SECRET_FIELDS,
    is_real_slack_webhook, diagnose_slack_webhook,
)
from roadmap_data import ROADMAP_SEED, default_tasks_for_item
from auth import (
    hash_password, verify_password, create_access_token, decode_token,
    get_current_user, require_roles, set_user_loader, validate_password_strength,
)
from backend.pipeline import run_pipeline, run_batch_pipeline
from backend.knowledge_base import kb
from golden_eval import (
    DEFAULT_THRESHOLDS,
    load_golden_dataset,
    run_benchmark,
)
from core.database import db, client
from core import services as svc

logger = logging.getLogger("actira")

# Compat aliases for handlers that used private helpers
_get_settings = svc.get_settings
_audit = svc.audit
_strip_id = svc.strip_id
_auth_cookie_kwargs = svc.auth_cookie_kwargs
_session_hours = svc.session_hours
_lockout_limit = svc.lockout_limit
_settings_defaults = svc.settings_defaults
_last_golden_run = None  # set via svc for eval router

'''


def transform_body(text: str, *, auth: bool = False) -> str:
    text = text.replace("@api.", "@router.")
    if auth:
        text = text.replace("@auth_router.", "@router.")
    # services that live in core.services and were private
    for name in (
            "_ensure_roadmap_seeded",
            "_merge_settings_update",
            "_persist_settings",
            "_slim_golden_payload",
            "_health_check",
            "_resolve_ingest_actor",
            "_enqueue_text_ingest",
            "_ingest_keys_match",
    ):
        # leave local defs if present in body; only rewrite call sites for moved helpers
        pass
    return text


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print(f"wrote {path.relative_to(ROOT)} ({len(content.splitlines())} lines)")


# --- core/database.py ---
write(
    ROOT / "core" / "database.py",
    '''\
"""Mongo client + database handle (import early after dotenv)."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).resolve().parents[1]
load_dotenv(ROOT_DIR / ".env")

if "MONGO_URL" not in os.environ:
    raise RuntimeError(
        "MONGO_URL is not set. Copy backend/.env.example to backend/.env and configure it, "
        "or set the environment variable. Mongo is required for ACTIRA."
    )
if "DB_NAME" not in os.environ:
    raise RuntimeError("DB_NAME is not set in environment (see backend/.env).")

mongo_url = os.environ["MONGO_URL"]
_MONGO_SERVER_SELECTION_MS = int(os.environ.get("MONGO_SERVER_SELECTION_MS", "5000") or "5000")
client = AsyncIOMotorClient(
    mongo_url,
    serverSelectionTimeoutMS=_MONGO_SERVER_SELECTION_MS,
    connectTimeoutMS=int(os.environ.get("MONGO_CONNECT_TIMEOUT_MS", "5000") or "5000"),
)
db = client[os.environ["DB_NAME"]]
''',
)

# --- core/services.py from helper slices ---
helpers = slice_lines(440, 549)  # strip_id through _audit
# plus settings merge/persist from later
merge_persist = slice_lines(1368, 1459)
slim_golden = slice_lines(2782, 2817)
health_fn = slice_lines(367, 379)
seed_fn = slice_lines(2941, 2978)
roadmap_seed = slice_lines(1956, 2027)

services_body = helpers + "\n" + merge_persist + "\n" + slim_golden + "\n" + health_fn + "\n"
# rename private helpers to public where useful
services_body = services_body.replace("async def _get_settings", "async def get_settings")
services_body = services_body.replace("def _settings_defaults", "def settings_defaults")
services_body = services_body.replace("def _auth_cookie_kwargs", "def auth_cookie_kwargs")
services_body = services_body.replace("async def _session_hours", "async def session_hours")
services_body = services_body.replace("async def _lockout_limit", "async def lockout_limit")
services_body = services_body.replace("async def _audit", "async def audit")
services_body = services_body.replace("def _strip_id", "def strip_id")
services_body = services_body.replace("def _merge_settings_update", "def merge_settings_update")
services_body = services_body.replace("async def _persist_settings", "async def persist_settings")
services_body = services_body.replace("def _slim_golden_payload", "def slim_golden_payload")
services_body = services_body.replace("async def _health_check", "async def health_check")
# internal refs after rename
services_body = services_body.replace("_settings_defaults()", "settings_defaults()")
services_body = services_body.replace("await _get_settings()", "await get_settings()")

write(
    ROOT / "core" / "services.py",
    '''\
"""Shared application services used by routers and lifespan."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from backend.models import Settings, new_id
from secrets_util import bootstrap_settings_kwargs
from core.database import db

logger = logging.getLogger("actira")

# In-process golden benchmark cache (also persisted to Mongo by eval routes)
last_golden_run: Optional[Dict[str, Any]] = None

'''
    + services_body
    + "\n"
    + roadmap_seed.replace("async def _ensure_roadmap_seeded", "async def ensure_roadmap_seeded")
    + "\n"
    + seed_fn
    + "\n",
)

# Fix seed and roadmap still using private names in services
sp = (ROOT / "core" / "services.py").read_text(encoding="utf-8")
sp = sp.replace("from secret_vault", "from secret_vault")  # keep
# seed uses hash_password — need import
if "from auth import" not in sp:
    sp = sp.replace(
        "from secrets_util import bootstrap_settings_kwargs",
        "from secrets_util import bootstrap_settings_kwargs\n"
        "from auth import hash_password\n"
        "from backend.models import UserInDB\n"
        "from roadmap_data import ROADMAP_SEED, default_tasks_for_item",
    )
# ensure_roadmap_seeded uses ROADMAP_SEED
(ROOT / "core" / "services.py").write_text(sp, encoding="utf-8")

# --- Router specs: (module, start, end, auth_router?, router_prefix, tags) ---
# end is exclusive 1-based
ROUTER_SPECS = [
    ("auth", 550, 662, True, "/auth", ["auth"]),
    ("logs", 662, 950, False, "", ["logs"]),
    ("incidents", 950, 1094, False, "", ["incidents"]),
    ("review", 1094, 1157, False, "", ["review"]),
    ("analytics", 1157, 1307, False, "", ["analytics"]),
    ("settings", 1307, 1951, False, "", ["settings"]),
    ("roadmap", 1951, 2352, False, "", ["roadmap"]),
    ("investigate", 2352, 2568, False, "", ["investigate"]),
    ("audit", 2568, 2580, False, "", ["audit"]),
    ("kb", 2580, 2781, False, "", ["kb"]),
    ("eval_routes", 2781, 2924, False, "", ["eval"]),
    ("meta", 2924, 2940, False, "", ["meta"]),
]

# Ingest helpers are inside logs section (797+); settings has merge which we moved —
# settings router still has _merge/_persist local defs that we should rewrite to svc.

for name, start, end, is_auth, prefix, tags in ROUTER_SPECS:
    body = slice_lines(start, end)
    # Drop section comment-only issues; remove helper defs moved to services for settings
    if name == "settings":
        # remove _merge_settings_update and _persist_settings function bodies (lines were 1368-1458)
        # they're inside this slice — strip by markers
        import re

        body = re.sub(
            r"\ndef _merge_settings_update\(existing: dict, payload: dict\) -> dict:.*?(?=\nasync def _persist_settings)",
            "\n",
            body,
            count=1,
            flags=re.S,
        )
        body = re.sub(
            r"\nasync def _persist_settings\(doc: dict, user: dict, action: str, detail: dict \| None = None\) -> dict:.*?(?=\n@api\.put\(\"/settings\"\))",
            "\n",
            body,
            count=1,
            flags=re.S,
        )
        body = body.replace("await _persist_settings(", "await svc.persist_settings(")
        body = body.replace("_merge_settings_update(", "svc.merge_settings_update(")
        body = body.replace("await _get_settings()", "await svc.get_settings()")
        body = body.replace("await _audit(", "await svc.audit(")
    if name == "roadmap":
        import re

        body = re.sub(
            r"\nasync def _ensure_roadmap_seeded\(\) -> None:.*?(?=\nclass RoadmapUpdateBody)",
            "\n",
            body,
            count=1,
            flags=re.S,
        )
        body = body.replace("await _ensure_roadmap_seeded()", "await svc.ensure_roadmap_seeded()")
        body = body.replace("await _get_settings()", "await svc.get_settings()")
        body = body.replace("await _audit(", "await svc.audit(")
    if name == "eval_routes":
        import re

        body = re.sub(
            r"\ndef _slim_golden_payload\(out: Dict\[str, Any\], \*, include_cases: bool\) -> Dict\[str, Any\]:.*?(?=\n@api\.get\(\"/eval/golden-benchmark\"\))",
            "\n",
            body,
            count=1,
            flags=re.S,
        )
        body = body.replace("_slim_golden_payload(", "svc.slim_golden_payload(")
        body = body.replace("global _last_golden_run", "global last_golden_run")
        body = body.replace("_last_golden_run", "svc.last_golden_run")
        # broken: svc.last_golden_run assignment for global — fix manually after
    if name == "meta":
        body = body.replace("await _health_check()", "await svc.health_check()")
    if name == "auth":
        body = body.replace("await _session_hours()", "await svc.session_hours()")
        body = body.replace("await _lockout_limit()", "await svc.lockout_limit()")
        body = body.replace("_auth_cookie_kwargs(", "svc.auth_cookie_kwargs(")
        body = body.replace("await _audit(", "await svc.audit(")
        body = body.replace("await _get_settings()", "await svc.get_settings()")
    if name in ("logs", "incidents", "review", "investigate", "kb", "analytics"):
        body = body.replace("await _get_settings()", "await svc.get_settings()")
        body = body.replace("await _audit(", "await svc.audit(")
        body = body.replace("_strip_id(", "svc.strip_id(")

    body = transform_body(body, auth=is_auth)
    router_init = f'router = APIRouter(prefix={prefix!r}, tags={tags!r})\n\n' if prefix else f'router = APIRouter(tags={tags!r})\n\n'
    content = COMMON_IMPORTS + router_init + body
    if name == "eval_routes":
        # fix broken global/svc assignment
        content = content.replace("global svc.last_golden_run", "")
        content = content.replace(
            "svc.last_golden_run = out",
            "svc.last_golden_run = out  # noqa: store on services module",
        )
        # reading last run
        content = content.replace(
            "if svc.last_golden_run:",
            "if svc.last_golden_run is not None:",
        )
    write(ROOT / "routers" / f"{name}.py", content)

write(
    ROOT / "core" / "__init__.py",
    '"""Core infrastructure (database, shared services)."""\n',
)
write(
    ROOT / "routers" / "__init__.py",
    '''\
"""Domain API routers — included by server.py under /api and /api/v1."""
from __future__ import annotations

from fastapi import APIRouter, FastAPI

from routers import (
    analytics,
    audit,
    auth,
    eval_routes,
    incidents,
    investigate,
    kb,
    logs,
    meta,
    review,
    roadmap,
    settings,
)


def build_api_router() -> APIRouter:
    """Compose the full /api tree (same paths as pre-modular server)."""
    api = APIRouter()
    # Auth is mounted at /api/auth via its own prefix when included on app
    api.include_router(logs.router)
    api.include_router(incidents.router)
    api.include_router(review.router)
    api.include_router(analytics.router)
    api.include_router(settings.router)
    api.include_router(roadmap.router)
    api.include_router(investigate.router)
    api.include_router(audit.router)
    api.include_router(kb.router)
    api.include_router(eval_routes.router)
    api.include_router(meta.router)
    return api


def include_all_routers(app: FastAPI) -> None:
    """Mount legacy /api and versioned /api/v1 (identical handlers)."""
    api = build_api_router()
    app.include_router(api, prefix="/api")
    app.include_router(api, prefix="/api/v1")
    app.include_router(auth.router, prefix="/api")
    app.include_router(auth.router, prefix="/api/v1")
'''
)

print("DONE modularize core+routers — next: write slim server.py")
