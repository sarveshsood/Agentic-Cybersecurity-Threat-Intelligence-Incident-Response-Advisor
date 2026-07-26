# Backend structure (v1.1 modularization)

## Layout

```
backend/
  server.py              # FastAPI app, lifespan, middleware, CORS — entry: uvicorn server:app
  core/
    database.py          # Motor client + db
    services.py          # get_settings, audit, seed, health_check, …
  routers/
    auth.py              # /auth/*
    logs.py              # upload, ingest, jobs
    incidents.py
    review.py
    analytics.py         # kpis + analytics
    settings.py
    roadmap.py
    investigate.py
    audit.py
    kb.py
    eval_routes.py       # golden benchmark
    meta.py              # / and /health under /api
  pipeline.py, auth.py, models.py, …   # domain modules (unchanged roles)
```

## URL mounts

| Prefix                | Purpose                              |
|-----------------------|--------------------------------------|
| `/api/*`              | Canonical (SPA default)              |
| `/api/v1/*`           | Versioned alias (identical handlers) |
| `/health`, `/metrics` | Top-level ops                        |

Do not change frontend until you intentionally migrate to `/api/v1`.

## Adding a route

1. Prefer the matching file under `routers/`.
2. Use `from core.database import db` and `from core import services as svc`.
3. Register via `routers/__init__.py` → `build_api_router()` if a new module.
4. Export OpenAPI: `python backend/scripts/export_openapi.py`
5. Add/adjust tests under `backend/tests/`.

## Compatibility

- Tests and docs still use `import server` / `server:app`.
- `server.db`, `server.seed_demo_data` re-exported for older scripts.
