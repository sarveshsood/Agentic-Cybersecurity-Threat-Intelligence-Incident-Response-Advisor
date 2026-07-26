# ACTIRA CI/CD

## Workflows (`.github/workflows/`)

| Workflow        | File             | Trigger            | Purpose                                                                   |
|-----------------|------------------|--------------------|---------------------------------------------------------------------------|
| **CI**          | `ci.yml`         | push/PR            | Unit, framework, lint, openapi, golden, frontend build, coverage artifact |
| **Test matrix** | `test.yml`       | PR/path + dispatch | unit / security / integration (Mongo service)                             |
| **Lint**        | `lint.yml`       | path filters       | ruff/black/isort/flake8/mypy                                              |
| **Security**    | `security.yml`   | PR, weekly, main   | bandit, pip-audit, security pytest                                        |
| **E2E**         | `e2e.yml`        | weekly / manual    | Playwright with Mongo + live stack                                        |
| **Release**     | `release.yml`    | tags `v*` / manual | Full offline gates + docker build + SBOM freeze                           |
| **Golden**      | `golden-ci.yml`  | backend paths      | Offline golden IR (existing)                                              |
| **OpenAPI**     | `openapi-ci.yml` | backend/docs       | Contract snapshot (existing)                                              |

## Quality gates

Hard fail:

- Unit / framework tests (non-integration, non-e2e)
- Golden benchmark
- OpenAPI drift
- Frontend production build
- Critical flake8 (E9/F63/F7/F82)
- Security pytest suite (on security workflow)

Soft / informational (toggle to hard later):

- Coverage &lt; 95% (hard when `COV_STRICT=1` repo variable or `make coverage`)
- Bandit / pip-audit findings (uploaded as artifacts; bandit `-ll` severity)
- Ruff/black full style (non-blocking until baseline clean)

## Local parity

```bash
make ci          # closest to GitHub CI offline gate
make docker-test # compose Mongo + backend + pytest runner
make e2e         # requires stack; mirrors e2e.yml
```

## Secrets

CI uses synthetic secrets only:

- `JWT_SECRET=…-not-for-production-…`
- No real LLM / TI keys in default pipelines (`FORCE_MOCK_TI=true`)

Optional live jobs should use GitHub Environments + secrets (`ANTHROPIC_API_KEY`, etc.) and `ACTIRA_LIVE_LLM=1`.

## Artifacts

- `pytest-reports`, `coverage-html`, `bandit-report`, `pip-audit-report`, `playwright-report`, `sbom-pip-freeze`

## Docker

- `docker-compose.yml` — local Mongo/backend/frontend
- `docker-compose.test.yml` — CI-style test runner

## Pre-commit

```bash
pip install pre-commit
pre-commit install
pre-commit run --all-files
```

Config: `.pre-commit-config.yaml` (black, ruff, isort, mypy core, detect-secrets, large files).

If `.secrets.baseline` is missing:

```bash
pip install detect-secrets
detect-secrets scan > .secrets.baseline
```

## Release checklist

1. `make ci` green locally
2. Tag `vX.Y.Z` → `release.yml`
3. Confirm OpenAPI + golden + docker build
4. Review security artifacts
5. Deploy only with production env vars (strong `JWT_SECRET`, `ENV=production`, no demo seed)
