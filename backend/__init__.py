"""ACTIRA backend package.

Layer map (P1 — architecture cleanup, progressive adoption):

- ``backend.config``       — env / dotenv helpers
- ``backend.security``     — JWT, RBAC, password policy
- ``backend.database``     — Motor client + ``db``
- ``backend.repositories`` — Mongo collection access
- ``backend.services``     — business logic
- ``backend.routers``      — HTTP adapters only
- ``backend.schemas``      — Pydantic models (facade over ``models``)
- ``backend.agents``       — AI agent modules (facade)
- ``backend.core``         — shared lifespan helpers (compat)
- ``backend.server``       — FastAPI app entry (``backend.server:app``)
"""
