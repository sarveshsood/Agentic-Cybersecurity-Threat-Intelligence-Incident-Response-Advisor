# Local Development Guide

## Day-to-day

**Terminal A — API**

```bash
cd backend
uvicorn server:app --reload --host 0.0.0.0 --port 8001
```

**Terminal B — UI**

```bash
cd frontend
npm start
```

**Mongo:** `docker compose up -d mongodb`

## Hot reload

- Backend: uvicorn `--reload`
- Frontend: CRA / webpack HMR

## Environment

| File            | Notes                                         |
|-----------------|-----------------------------------------------|
| `backend/.env`  | Never commit                                  |
| `frontend/.env` | `REACT_APP_BACKEND_URL=http://localhost:8001` |

## Useful make targets

```bash
make unit
make lint
make golden
make openapi
make ci-fast
```

## Feature flags (lab)

Use Settings profiles and env toggles (`FORCE_MOCK_TI`, `ACTIRA_VECTOR_STORE`, `ACTIRA_EMBEDDING_BACKEND`,
`SEED_DEMO_USERS`). Formal flag service is roadmap; document toggles in CONFIGURATION.md.
