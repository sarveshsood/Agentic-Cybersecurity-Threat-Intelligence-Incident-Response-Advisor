# ACTIRA Testing Guide

## Philosophy

- **Offline first**: unit, golden, security, and most API tests run without live LLM or TI keys.
- **Deterministic**: `FORCE_MOCK_TI=true`, hash embeddings, template/mock LLM paths in CI.
- **One command gate**: `make ci` (or GitHub Actions `CI` workflow).
- **Do not run the full suite during framework setup** unless you intend to; this guide is the runbook.

## Layout

```
backend/tests/          # Existing production suites (hardening, golden, RBAC, …)
tests/                  # Framework suites
  conftest.py           # Shared fixtures
  data/                 # Synthetic logs, IoCs, edge cases
  unit/                 # Offline unit extensions
  api/                  # HTTP API tests
  integration/          # Mongo-backed (ACTIRA_INTEGRATION=1)
  security/             # OWASP-oriented
  performance/          # Micro smoke
  regression/           # MODULE_REVIEW residual locks
frontend/e2e/           # Playwright
```

## Install

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
source .venv/bin/activate
pip install -r backend/requirements.txt -r requirements-test.txt
cd frontend && npm ci   # or npm install
npx playwright install chromium
```

## Commands

| Command                                        | What it runs                                      |
|------------------------------------------------|---------------------------------------------------|
| `make unit`                                    | Backend offline tests                             |
| `make test`                                    | Alias of unit                                     |
| `make coverage`                                | Unit + coverage HTML/XML; **fails if &lt; 95%**   |
| `make coverage-report`                         | Coverage without fail gate                        |
| `make security`                                | `tests/security`                                  |
| `make integration`                             | Needs `ACTIRA_INTEGRATION=1` + Mongo              |
| `make e2e`                                     | Playwright (stack must be up)                     |
| `make golden`                                  | Offline golden IR                                 |
| `make openapi`                                 | Contract drift check                              |
| `make lint` / `make format` / `make typecheck` | Static analysis                                   |
| `make ci`                                      | Full local quality gate (no e2e/Mongo by default) |
| `make docker-test`                             | `docker-compose.test.yml`                         |

### Pytest directly

```bash
# From repo root
pytest -c pytest.ini tests -n 0 -m "not integration and not e2e"
pytest -c pytest.ini tests/security -v
pytest --cov=backend --cov-config=.coveragerc --cov-fail-under=95

# Backend-local (uses backend/pytest.ini xdist -n 2)
cd backend && pytest tests -n 0
cd backend && pytest tests/test_golden_benchmark.py -n 0
```

### Markers

| Marker                           | Meaning                              |
|----------------------------------|--------------------------------------|
| `unit`                           | Offline                              |
| `integration` / `requires_mongo` | Needs Mongo + `ACTIRA_INTEGRATION=1` |
| `api`                            | HTTP / TestClient                    |
| `security`                       | Security suite                       |
| `performance`                    | Perf smoke                           |
| `regression`                     | Bug locks                            |
| `e2e`                            | Full stack                           |
| `golden`                         | Golden IR                            |
| `requires_llm`                   | Live LLM (`ACTIRA_LIVE_LLM=1`)       |

## Environment variables

| Variable                | Default / CI                |
|-------------------------|-----------------------------|
| `ENV`                   | `test` or `dev`             |
| `JWT_SECRET`            | Policy ≥32; runtime ≥16 outside lab |
| `MONGO_URL`             | `mongodb://127.0.0.1:27017` |
| `DB_NAME`               | `soc_console_test`          |
| `FORCE_MOCK_TI`         | `true` in tests             |
| `ACTIRA_INTEGRATION`    | `1` to enable integration   |
| `ACTIRA_E2E`            | `1` for pytest e2e markers  |
| `ACTIRA_LIVE_LLM`       | `1` for live LLM            |
| `PLAYWRIGHT_BASE_URL`   | `http://localhost:3000`     |
| `REACT_APP_BACKEND_URL` | `http://localhost:8001`     |

## Reports

Generated under `reports/` (gitignored except documented paths):

- `junit-*.xml` — CI parsers
- `pytest-*.html` — human-readable
- `coverage_html/` — line/branch coverage
- `coverage.xml` — Codecov-compatible
- `frontend/playwright-report/` — E2E HTML

## Fixtures

See `tests/conftest.py` and `tests/data/README.md`.

Highlights: `make_jwt`, `sample_incident`, `sample_iocs`, `mock_mongo_db`, `mock_ti_enrich`, log paths.

## Coverage goal

- **Gate**: 95% line+branch on backend application modules (`.coveragerc` `fail_under = 95`).
- Existing suite may be below 95% today — use `make coverage-report` to measure, then expand tests until `make coverage`
  is green.
- CI `coverage` job is informational unless repository variable `COV_STRICT=1`.

## Prerequisites

- Python 3.12+
- Node 20+ for frontend/e2e
- Mongo 7 for integration / e2e
- Playwright browsers: `npx playwright install chromium`

## Troubleshooting

| Symptom                       | Fix                                                                         |
|-------------------------------|-----------------------------------------------------------------------------|
| `xdist -n` conflicts          | Use `pytest -n 0` or Makefile targets                                       |
| App import fails in API tests | Missing deps — reinstall requirements; Mongo optional for many health paths |
| Integration all skipped       | Export `ACTIRA_INTEGRATION=1`                                               |
| E2E login fails               | Ensure demo seed (`ENV=dev`, empty DB) and ports 3000/8001                  |
| Coverage gate fails           | Run `make coverage-report`; add unit tests for uncovered modules            |

## Related docs

- [CI_CD.md](./CI_CD.md)
- [E2E_TESTING.md](./E2E_TESTING.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
