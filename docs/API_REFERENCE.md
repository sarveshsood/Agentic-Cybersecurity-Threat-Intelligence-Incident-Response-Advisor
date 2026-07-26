# ACTIRA — API Reference

## Canonical contract

- **Committed snapshot:** [openapi.json](openapi.json)
- **Live Swagger:** `http://127.0.0.1:8001/docs`
- **ReDoc:** `http://127.0.0.1:8001/redoc`
- **Drift check:** `python backend/scripts/export_openapi.py --check`

All application routes are under the `/api` prefix (unversioned today).  
**Roadmap:** dual-mount `/api/v1` without breaking existing clients.

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
| Auth      | `/api/auth/register`, `/login`, `/me`                                      |
| Logs      | `/api/logs/upload`, `/upload-batch`, `/jobs`, `/ingest`, `/ingest/raw`     |
| Incidents | `/api/incidents`, `/{id}`, `/{id}/citations`, `/{id}/similar`, investigate |
| Review    | `/api/review/queue`, `/api/review/{id}`                                    |
| KB        | `/api/kb/search`, `/vector-status`, `/reindex`, `/custom`, `/ingest`       |
| Settings  | `/api/settings` GET/PUT (secrets as `has_*` only on GET)                   |
| Analytics | `/api/kpis`, `/api/analytics`                                              |
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
