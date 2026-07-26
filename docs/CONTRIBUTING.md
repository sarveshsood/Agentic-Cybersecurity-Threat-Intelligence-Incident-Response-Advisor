# Contributing to ACTIRA

## Development setup

1. Clone repo; Python 3.12 + Node 20
2. `pip install -r backend/requirements.txt -r requirements-test.txt`
3. `cd frontend && npm install`
4. Copy env examples; never commit secrets
5. `docker compose up -d mongodb`
6. Start backend (8001) and frontend (3000) per README

## Before opening a PR

```bash
make ci-fast          # quick offline check
# preferred:
make ci               # fuller gate
pre-commit run --all-files
```

For backend logic changes, add or extend tests under `backend/tests/` or `tests/`.

## Test policy

- Prefer **offline** unit tests
- Mark Mongo-dependent tests `integration` / `requires_mongo`
- Never call live paid APIs in default CI
- Golden suite must stay mock TI + template playbook
- Fix quality gates rather than disabling them

## Code style

- Python: black + isort (profile black) + ruff
- JS: existing CRA/eslint setup (`npm run lint`)
- No secrets in logs; use `redact_for_log`

## PR checklist

- [ ] Tests added/updated for behavior change
- [ ] `make unit` or CI green
- [ ] OpenAPI updated if routes change (`python backend/scripts/export_openapi.py`)
- [ ] Docs if operator-facing behavior changes
- [ ] No hardcoded secrets

## Architecture notes

See `README.md`, `memory/PRD.md`, `docs/SPEC_WORKFLOW.md`, `docs/TESTING.md`.
