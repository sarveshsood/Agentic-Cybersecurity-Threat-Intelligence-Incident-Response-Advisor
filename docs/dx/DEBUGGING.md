# Debugging Guide

## Backend

1. Run uvicorn with `--log-level debug` if needed
2. Watch logger `actira` / `job_queue`
3. `GET /api/health` and Mongo ping failures
4. Job stuck: inspect `log_jobs` status/progress in Mongo
5. LLM errors: provider HTTP status in logs; Settings `has_*`

### PyCharm / VS Code

- Launch from **repo root**: module `uvicorn`, args `backend.server:app --host 0.0.0.0 --port 8001 --reload`,
  env `PYTHONPATH=<repo root>` (or working directory = repo root)
- Do **not** set cwd to `backend/` with `server:app` — that breaks `from backend.*` imports
- Breakpoints in `backend/pipeline.py`, `backend/playbook_agent.py`, `backend/hitl_gate.py`

## Frontend

- Browser Network tab: failed calls to `:8001`
- Console: missing `REACT_APP_BACKEND_URL`
- React Query Devtools (if enabled) for cache

## Common breakpoints

| Symptom        | Where to look                               |
|----------------|---------------------------------------------|
| 401 loop       | `auth.py`, cookie SameSite, CORS            |
| Empty playbook | `playbook_agent.py`, LLM keys               |
| Always mock TI | `enrichment.py`, empty keys / FORCE_MOCK_TI |
| 409 review     | Expected concurrent review                  |

## Offline isolation

```bash
FORCE_MOCK_TI=true ENV=test pytest backend/tests/test_hardening.py -n 0
```
