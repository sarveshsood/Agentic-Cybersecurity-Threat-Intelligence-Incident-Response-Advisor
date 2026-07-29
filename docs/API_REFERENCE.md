# ACTIRA — API Reference

## Canonical contract

- **Committed snapshot:** [openapi.json](openapi.json) (**source of truth** for HTTP paths)
- **Live Swagger:** `http://127.0.0.1:8001/docs`
- **ReDoc:** `http://127.0.0.1:8001/redoc`
- **Drift check:** `python backend/scripts/export_openapi.py --check`

Application HTTP routes are dual-mounted under **`/api`** and **`/api/v1`** (same handlers). Prefer OpenAPI over this summary.

### Realtime channels (not fully in OpenAPI)

| Channel | Path | Notes |
|---------|------|-------|
| SSE | `GET /api/sse/ops` (also `/api/v1/sse/ops`) | In OpenAPI when exported |
| **WebSocket** | `WS /api/ws/ops` | Implemented (`backend/routers/realtime.py`); **typically absent from OpenAPI** JSON — use README / ops status, not Swagger alone |
| Flag | `FEATURE_REALTIME_OPS` (default on) | SPA: `REACT_APP_REALTIME_OPS=0` to disable client |

Auth for WS/SSE: httpOnly cookie `actira_access_token` and/or query/header token as implemented.

## Authentication

| Client              | Method                                                       |
|---------------------|--------------------------------------------------------------|
| SPA (browser)       | httpOnly cookie (`actira_access_token`) + `withCredentials`  |
| API clients / tests | `Authorization: Bearer <jwt>` from login JSON (when enabled) |
| Log forwarders      | `X-Ingest-Key: <INGEST_API_KEY>` or user JWT                 |

Login: `POST /api/auth/login`  
Current user: `GET /api/auth/me`

## Core resource groups

| Group     | Examples                                                                   |
|-----------|----------------------------------------------------------------------------|
| Auth      | `/api/auth/register`, `/login`, `/me`, OIDC `/api/auth/oidc/*`             |
| Logs      | `/api/logs/upload`, `/upload-batch`, `/jobs`, `/ingest`, `/ingest/raw`     |
| Incidents | `/api/incidents`, collab assignment/comments when `FEATURE_*` on           |
| Review    | `/api/review/queue`, `/api/review/{id}`                                    |
| KB        | `/api/kb/search`, `/vector-status`, `/reindex`, `/custom`, `/ingest`       |
| Notifications | `/api/notifications`, `/{id}/read`, `/read-all` (feature-flagged)     |
| Settings  | `/api/settings` GET/PUT (secrets as `has_*` only on GET)                   |
| Analytics | `/api/kpis`, `/api/analytics`                                              |
| Ops       | `/api/ops/status`, SSE `/api/sse/ops`, **WS** `/api/ws/ops`                |
| Eval      | `/api/eval/golden-benchmark`                                               |
| Health    | `/api/health`, `/health`, `/metrics`                                       |

## Errors

| Code | Meaning                             |
|------|-------------------------------------|
| 401  | Missing/invalid auth                |
| 403  | Authenticated but role insufficient |
| 404  | Resource not found                  |
| 409  | Review race / conflict              |
| 422  | Validation error (Pydantic)         |
| 429  | Throttle (login) where configured   |

## Pagination

List endpoints support query parameters where implemented (see OpenAPI for `limit`/`skip`/`status` filters). Prefer
OpenAPI as source of truth over this summary.

## Rate limiting

Login lockout/IP throttle exist. Global API rate limiting is a **roadmap** item for internet-exposed deploys.
