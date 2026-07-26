# ACTIRA — Developer Guide

## Repo layout

See [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

## Local loop

```bash
# API
cd backend
pip install -r requirements.txt -r ../requirements-test.txt
uvicorn server:app --reload --port 8001

# UI
cd frontend && npm start

# Tests
cd backend && pytest tests -n 0 -m "not integration and not e2e and not requires_llm"
# or: make unit  (from root)
```

## Self-diagnostic (Windows)

Before troubleshooting manually, run this from the repository root:

```powershell
.\scripts\diagnose.ps1
```

It verifies Node/npm, Python, environment files, dependencies, Docker, MongoDB, ports 3000/8001/27017, and the API
health endpoint. It reads configuration only and never prints secret values. A non-zero exit code means one or more
checks failed.

## Coding norms

- Prefer pure functions for policy (see `hitl_gate.py`).
- Never return raw secrets from GET settings.
- Treat log content as untrusted data in prompts.
- Update `docs/openapi.json` via `python backend/scripts/export_openapi.py` when routes change.
- Add offline tests for security-sensitive behavior.

## Quality gates

```bash
make ci-fast    # lint + unit
make golden     # offline IR metrics
make openapi    # contract drift
```

## Where to change what

| Goal                      | Start here                                                                          |
|---------------------------|-------------------------------------------------------------------------------------|
| New HTTP route            | `backend/routers/<domain>.py` (see [BACKEND_STRUCTURE.md](dx/BACKEND_STRUCTURE.md)) |
| App lifespan / middleware | `server.py`                                                                         |
| Settings / audit helpers  | `core/services.py`                                                                  |
| Mongo handle              | `core/database.py`                                                                  |
| Pipeline stage            | `pipeline.py`                                                                       |
| Parser format             | `parsers.py`                                                                        |
| IoC patterns              | `ioc_extractor.py`                                                                  |
| Playbook prompt           | `playbook_agent.py`                                                                 |
| Retrieval                 | `knowledge_base.py`, `vector_store.py`                                              |
| Auth helpers / JWT        | `auth.py` + `routers/auth.py`                                                       |
| Frontend page             | `frontend/src/pages/`                                                               |

## Architecture (v1.1)

Domain routers under `backend/routers/`; dual mount `/api` and `/api/v1`.
Details: [dx/BACKEND_STRUCTURE.md](dx/BACKEND_STRUCTURE.md).

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](../SECURITY.md).
