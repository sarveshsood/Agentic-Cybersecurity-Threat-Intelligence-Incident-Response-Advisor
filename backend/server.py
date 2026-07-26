"""Main FastAPI server — ACTIRA (Agentic Cybersecurity Threat Intelligence & Incident Response Advisor).

v1.1: domain routes live under ``routers/``; shared DB/services under ``core/``.

Canonical entry (P0):
    uvicorn backend.server:app --reload --host 0.0.0.0 --port 8001

Run from the repository root with ``PYTHONPATH=.`` (or install the package).
"""
from __future__ import annotations

import logging
import os
import traceback
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

# Load .env before modules that read os.environ at import (auth.JWT_SECRET, core.database).
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from fastapi import FastAPI, Request, Depends
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.auth import get_current_user, set_user_loader
from backend.core.database import client, db
from backend.core import services as svc
from backend.routers import include_all_routers
from backend.golden_eval import router as eval_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("actira")

# Re-export for legacy tests / scripts that import from server
_get_settings = svc.get_settings
seed_demo_data = svc.seed_demo_data


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        logger.info("Startup: loading configuration (ENV=%s)", os.environ.get("ENV", "dev"))
        logger.info("Startup: connecting MongoDB…")
        try:
            await client.admin.command("ping")
            logger.info("Startup: MongoDB connected")
        except Exception as ping_err:
            raise RuntimeError(
                f"Cannot reach MongoDB at MONGO_URL (ping failed: {type(ping_err).__name__}: {ping_err}). "
                "Start MongoDB or fix MONGO_URL in backend/.env."
            ) from ping_err

        async def _load_user_from_db(payload: dict) -> dict:
            uid = payload.get("sub")
            if not uid:
                from fastapi import HTTPException

                raise HTTPException(401, "Invalid token subject")
            doc = await db.users.find_one(
                {"id": uid},
                {"_id": 0, "id": 1, "email": 1, "name": 1, "role": 1},
            )
            if not doc:
                from fastapi import HTTPException

                raise HTTPException(401, "User no longer exists")
            return {
                "sub": doc["id"],
                "email": doc.get("email") or payload.get("email"),
                "role": doc.get("role") or "analyst",
                "name": doc.get("name"),
                "exp": payload.get("exp"),
            }

        logger.info("Startup: initializing authentication…")
        set_user_loader(_load_user_from_db)
        await svc.seed_demo_data()
        await svc.get_settings()
        logger.info("Startup: settings loaded")
        try:
            from backend.knowledge_base import kb

            custom = await db.kb_docs.find({}, {"_id": 0}).to_list(500)
            n = kb.load_custom_docs(custom)
            if n:
                logger.info("Startup: loaded %s custom KB docs from Mongo", n)
                import asyncio

                await asyncio.to_thread(kb.reindex_vectors)
        except Exception as kbe:
            logger.warning("custom KB load skipped: %s", kbe)

        logger.info("Startup: ensuring indexes…")
        await db.incidents.create_index("id", unique=True)
        await db.incidents.create_index([("status", 1), ("created_at", -1)])
        try:
            from backend.services.analytics_service import ensure_analytics_indexes

            await ensure_analytics_indexes(db)
            logger.info("Startup: analytics indexes ready")
        except Exception as aidx:
            logger.warning("analytics indexes skipped: %s", aidx)
        await db.log_jobs.create_index("id", unique=True)
        await db.audit_log.create_index([("ts", -1)])
        await db.roadmap.create_index("id", unique=True)
        try:
            await db.users.create_index("email", unique=True)
        except Exception as email_idx_err:
            logger.warning("users.email unique index: %s", email_idx_err)
        try:
            from backend.auth_throttle import ensure_throttle_indexes

            await ensure_throttle_indexes(db)
        except Exception as idx_err:
            logger.warning("throttle indexes skipped: %s", idx_err)
        try:
            from backend.secret_vault import vault_status

            vs = vault_status()
            logger.info(
                "Startup: secret_vault ready (key_source=%s recommend_master=%s)",
                vs.get("key_source"),
                vs.get("recommend_master_key") or vs.get("recommend_explicit_master_key"),
            )
        except Exception as ve:
            logger.warning("secret_vault status: %s", ve)
        try:
            from backend.enrichment_cache import ensure_indexes as ensure_enrich_cache_indexes

            await ensure_enrich_cache_indexes(db)
        except Exception as eci:
            logger.warning("enrichment_cache indexes skipped: %s", eci)
        try:
            await db.log_jobs.create_index([("queue_state", 1), ("queued_at", 1)])
        except Exception as qe:
            logger.warning("queue index skipped: %s", qe)
        try:
            await svc.ensure_roadmap_seeded()
        except Exception as rse:
            logger.warning("roadmap auto-merge skipped: %s", rse)
        try:
            from backend.otel_setup import setup_otel

            if setup_otel("actira"):
                logger.info("Startup: OpenTelemetry OTLP exporter ready")
        except Exception as ote:
            logger.warning("otel setup skipped: %s", ote)
        try:
            from backend.job_queue import start_worker

            logger.info("Startup: starting job worker…")
            start_worker(db)
        except Exception as we:
            logger.exception("job worker failed to start: %s", we)
        try:
            from backend.llm_usage import set_usage_db

            set_usage_db(db)
        except Exception as ue:
            logger.warning("llm_usage bind skipped: %s", ue)
        try:
            from backend.job_status import purge_old_sidecars
            from backend.notifications import purge_old_outbox
            from backend.auth_throttle import purge_stale_throttle_docs
            from backend.retention import purge_from_settings

            n1 = purge_old_sidecars(7)
            n2 = purge_old_outbox(7)
            n3 = await purge_stale_throttle_docs(db, max_age_days=14)
            settings_snap = await svc.get_settings()
            n4 = await purge_from_settings(db, settings_snap)
            if n1 or n2 or any(n3.values()) or n4.get("incidents_deleted"):
                logger.info(
                    "Startup: retention purge sidecars=%s outbox=%s throttle=%s incidents=%s",
                    n1,
                    n2,
                    n3,
                    n4,
                )
        except Exception as pe:
            logger.warning("startup retention purge skipped: %s", pe)
        logger.info("Startup complete — routers registered, ready to serve")
    except Exception:
        logger.exception("Lifespan startup failed")
        raise
    yield
    try:
        from backend.job_queue import stop_worker

        await stop_worker()
    except Exception:
        logger.exception("Error stopping job worker")
    try:
        client.close()
    except Exception:
        logger.exception("Error during shutdown")


app = FastAPI(
    title="ACTIRA API",
    description="Agentic Cybersecurity Threat Intelligence & Incident Response Advisor",
    lifespan=lifespan,
)


def _is_mongo_connectivity_error(exc: BaseException) -> bool:
    name = type(exc).__name__
    if name in (
            "ServerSelectionTimeoutError",
            "NetworkTimeout",
            "ConnectionFailure",
            "AutoReconnect",
            "NotPrimaryError",
    ):
        return True
    mod = getattr(type(exc), "__module__", "") or ""
    if "pymongo" in mod and any(
            tok in name.lower() for tok in ("timeout", "connection", "network", "selection")
    ):
        return True
    msg = str(exc).lower()
    return "server selection timeout" in msg or "connection refused" in msg


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    request_id = getattr(getattr(request, "state", None), "request_id", "unknown")
    if exc.status_code >= 500:
        logger.error(f"HTTP error [request_id={request_id}]: {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "request_id": request_id},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    request_id = getattr(getattr(request, "state", None), "request_id", "unknown")
    logger.warning(f"Validation error [request_id={request_id}]: {exc.errors()}")
    return JSONResponse(
        status_code=422,
        content={"detail": "Validation error", "errors": exc.errors(), "request_id": request_id},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    request_id = getattr(getattr(request, "state", None), "request_id", "unknown")
    path = request.url.path if hasattr(request, "url") else "unknown"
    if _is_mongo_connectivity_error(exc):
        logger.error(
            "MongoDB unavailable [request_id=%s, path=%s]: %s",
            request_id,
            path,
            exc,
        )
        return JSONResponse(
            status_code=503,
            content={
                "detail": (
                    "Database unavailable. Check that MongoDB is running and "
                    "MONGO_URL in backend/.env is correct."
                ),
                "error": "mongo_unavailable",
                "request_id": request_id,
            },
        )
    logger.exception(f"Unhandled exception [request_id={request_id}, path={path}]")
    if os.environ.get("ENV", "dev").lower() == "dev":
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={
                "detail": "Internal server error",
                "error": str(exc),
                "type": type(exc).__name__,
                "request_id": request_id,
                "path": path,
            },
        )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "request_id": request_id},
    )


@app.middleware("http")
async def add_correlation_and_logging(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.request_id = request_id

    if "authorization" not in [h[0].decode().lower() for h in request.scope.get("headers", [])]:
        cookie_token = request.cookies.get("actira_access_token")
        if cookie_token:
            headers = list(request.scope.get("headers", []))
            headers.append((b"authorization", f"Bearer {cookie_token}".encode()))
            request.scope["headers"] = headers

    start = datetime.now(timezone.utc)
    try:
        response = await call_next(request)
        duration = (datetime.now(timezone.utc) - start).total_seconds() * 1000
        logger.info(
            "http_request",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": getattr(response, "status_code", None),
                "duration_ms": round(duration, 1),
                "client_ip": getattr(request.client, "host", None) if request.client else None,
            },
        )
        response.headers["X-Request-ID"] = request_id
        # Baseline security headers (non-breaking for SPA/API clients)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=()",
        )
        return response
    except Exception:
        logger.exception("request failed", extra={"request_id": request_id})
        raise


_AUTH_RATE_LIMIT_PATHS = frozenset({
    "/api/auth/login",
    "/api/auth/register",
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/auth/login",
    "/auth/register",
})

try:
    RATE_LIMIT_WINDOW = int(os.environ.get("RATE_LIMIT_WINDOW_SECONDS", 60) or "60")
except (TypeError, ValueError):
    RATE_LIMIT_WINDOW = 60
try:
    RATE_LIMIT_MAX = int(os.environ.get("RATE_LIMIT_MAX_ATTEMPTS", 30) or "30")
except (TypeError, ValueError):
    RATE_LIMIT_MAX = 30


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    path = request.url.path.rstrip("/") or "/"
    if request.method == "POST" and path in _AUTH_RATE_LIMIT_PATHS:
        from backend.auth_throttle import rate_limit_allow

        client_ip = request.client.host if request.client else "unknown"
        allowed = await rate_limit_allow(
            db,
            client_ip,
            window_seconds=RATE_LIMIT_WINDOW,
            max_attempts=RATE_LIMIT_MAX,
        )
        if not allowed:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please slow down."},
            )
    return await call_next(request)


@app.get("/health")
async def health_root():
    return await svc.health_check()


@app.get("/ready")
async def ready_root():
    """Readiness probe — 200 only when Mongo is reachable."""
    body = await svc.health_check()
    if body.get("mongo") != "up":
        return JSONResponse(status_code=503, content=body)
    return body


@app.get("/version")
async def version_root():
    return {
        "service": "ACTIRA API",
        "full_name": "Agentic Cybersecurity Threat Intelligence & Incident Response Advisor",
        "api": "v1",
        "package": "backend",
        "entry": "backend.server:app",
    }


@app.get("/metrics")
async def metrics(request: Request):
    """Basic metrics (admin JWT or X-Metrics-Token only)."""
    import secrets as pysecrets

    from fastapi import HTTPException

    allowed = False
    scrape = (os.environ.get("METRICS_TOKEN") or "").strip()
    header_tok = (request.headers.get("x-metrics-token") or "").strip()
    if scrape and header_tok and pysecrets.compare_digest(scrape, header_tok):
        allowed = True
    if not allowed:
        auth = request.headers.get("authorization") or ""
        if auth.lower().startswith("bearer "):
            try:
                user = await get_current_user(auth.split(" ", 1)[1].strip())
                if user.get("role") == "admin":
                    allowed = True
            except HTTPException:
                allowed = False
    if not allowed:
        raise HTTPException(
            401,
            "Metrics require admin Bearer JWT or X-Metrics-Token (METRICS_TOKEN env)",
        )
    try:
        incident_count = await db.incidents.count_documents({})
        job_count = await db.log_jobs.count_documents({})
        pending_review = await db.incidents.count_documents({"status": "pending_review"})
    except Exception:
        incident_count = job_count = pending_review = -1
    return {
        "actira_incidents_total": incident_count,
        "actira_log_jobs_total": job_count,
        "actira_pending_review": pending_review,
        "actira_up": 1,
    }


# Audit Trail: modular router (GET /api/audit/logs, /summary, /integrity) —
# see backend/routers/audit.py (include_all_routers below).

# Domain routers (/api + /api/v1)
include_all_routers(app)

# Register Evaluation & Golden Benchmark Router
app.include_router(eval_router)


@app.middleware("http")
async def catch_all_exceptions(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception as e:
        rid = getattr(getattr(request, "state", None), "request_id", "no-id")
        path = request.url.path if hasattr(request, "url") else "unknown"
        logger.exception(f"CAUGHT BY CATCH_ALL [request_id={rid}, path={path}]")
        if os.environ.get("ENV", "dev").lower() == "dev":
            traceback.print_exc()
            return JSONResponse(
                status_code=500,
                content={
                    "detail": str(e),
                    "type": type(e).__name__,
                    "request_id": rid,
                    "path": path,
                },
            )
        return JSONResponse(status_code=500, content={"detail": "Internal server error", "request_id": rid})


cors_origins = [
    o.strip()
    for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)
