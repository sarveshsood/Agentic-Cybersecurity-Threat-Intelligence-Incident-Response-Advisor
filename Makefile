# ACTIRA — local quality gates & CI entrypoints
# Usage: make help | make ci | make test | make unit | ...
# Windows: use `make` via Git Bash / chocolatey make, or run the listed commands in PowerShell.

.PHONY: help install install-test unit integration api security e2e e2e-install \
	coverage lint format typecheck test test-serial golden openapi docker docker-test \
	clean reports ci ci-fast security-scan deps-audit frontend-lint frontend-build \
	demo bench-smoke smoke functional quality-gate

PY ?= python
PIP ?= pip
BACKEND := backend
REPORTS := reports
COV_FAIL ?= 95
PYTEST_ROOT := $(PY) -m pytest -c pytest.ini
# Serial by default for deterministic CI reports; override: make test N=2
N ?= 0

help:
	@echo "ACTIRA quality gates"
	@echo "  make install       - backend + test deps"
	@echo "  make smoke         - fast offline smoke (model mgmt, parallel, routes)"
	@echo "  make functional    - broader unit/api functional suite"
	@echo "  make security      - security tests"
	@echo "  make quality-gate  - smoke → functional → security (Sprint 7 ladder)"
	@echo "  make unit          - offline unit tests (marker unit or default backend suite)"
	@echo "  make integration   - integration tests (needs ACTIRA_INTEGRATION=1 + Mongo)"
	@echo "  make api           - API tests"
	@echo "  make e2e           - Playwright e2e (needs stack + browsers)"
	@echo "  make coverage      - unit+api with coverage gate (fail_under=$(COV_FAIL))"
	@echo "  make lint format typecheck"
	@echo "  make golden        - offline golden IR benchmark"
	@echo "  make openapi       - OpenAPI drift check"
	@echo "  make docker        - build compose images"
	@echo "  make docker-test   - docker-compose.test.yml up + pytest"
	@echo "  make demo          - one-command demo (scripts/start-demo)"
	@echo "  make bench-smoke   - local API microbenchmark (API must be up)"
	@echo "  make ci            - full quality gate (lint, type, unit, coverage, openapi, frontend build)"
	@echo "  make ci-fast       - lint + unit serial (no coverage fail gate)"
	@echo "  make clean         - remove caches and reports"

demo:
	@bash scripts/start-demo.sh 2>/dev/null || powershell -ExecutionPolicy Bypass -File scripts/start-demo.ps1

bench-smoke:
	$(PY) benchmarks/run_benchmarks.py --profile smoke

reports:
	@mkdir -p $(REPORTS)/coverage_html $(REPORTS)/playwright $(REPORTS)/security

install:
	$(PIP) install -U pip
	$(PIP) install -r $(BACKEND)/requirements.txt
	$(PIP) install -r requirements-test.txt

install-test: install

# Sprint 7 ladder: smoke → functional → security
smoke: reports
	cd $(BACKEND) && $(PY) -m pytest \
		tests/test_model_management_queue.py \
		tests/test_ops_status.py \
		tests/test_secret_vault_auth_residuals.py \
		-n 0 -q --tb=line \
		--junitxml=../$(REPORTS)/junit-smoke.xml

functional: reports
	cd $(BACKEND) && $(PY) -m pytest tests -n $(N) \
		-m "not integration and not e2e and not performance and not requires_llm and not security" \
		--junitxml=../$(REPORTS)/junit-functional.xml \
		-v --tb=short
	$(PYTEST_ROOT) tests/api -n $(N) -m "api or unit" \
		--junitxml=$(REPORTS)/junit-api-functional.xml -v --tb=short || true

unit: reports
	cd $(BACKEND) && $(PY) -m pytest tests -n $(N) -m "not integration and not e2e and not performance and not requires_llm" \
		--junitxml=../$(REPORTS)/junit-unit.xml \
		--html=../$(REPORTS)/pytest-unit.html --self-contained-html \
		-v --tb=short

integration: reports
	@echo "Requires ACTIRA_INTEGRATION=1 and reachable MONGO_URL"
	ACTIRA_INTEGRATION=1 $(PYTEST_ROOT) tests/integration backend/tests -n $(N) -m "integration or requires_mongo" \
		--junitxml=$(REPORTS)/junit-integration.xml -v

api: reports
	$(PYTEST_ROOT) tests/api backend/tests -n $(N) -m "api or unit" \
		--junitxml=$(REPORTS)/junit-api.xml -v --tb=short

security: reports
	$(PYTEST_ROOT) tests/security -n $(N) -m "security or unit" \
		--junitxml=$(REPORTS)/junit-security.xml -v
	cd $(BACKEND) && $(PY) -m pytest tests -n $(N) -m "security" \
		--junitxml=../$(REPORTS)/junit-security-backend.xml -v --tb=short || true

quality-gate: reports
	@echo "==> Quality gate 1/3: smoke"
	$(MAKE) smoke
	@echo "==> Quality gate 2/3: functional"
	$(MAKE) functional
	@echo "==> Quality gate 3/3: security"
	$(MAKE) security
	@echo "==> Quality gate complete"

performance: reports
	$(PYTEST_ROOT) tests/performance -n 0 -m performance \
		--junitxml=$(REPORTS)/junit-performance.xml -v

regression: reports
	$(PYTEST_ROOT) tests/regression backend/tests -n $(N) -m "regression or unit" \
		--junitxml=$(REPORTS)/junit-regression.xml -v

golden: reports
	cd $(BACKEND) && $(PY) -m pytest tests/test_golden_benchmark.py -n 0 -v --tb=short \
		--junitxml=../$(REPORTS)/junit-golden.xml

coverage: reports
	cd $(BACKEND) && $(PY) -m pytest tests -n $(N) \
		-m "not integration and not e2e and not performance and not requires_llm" \
		--cov=. --cov-config=../.coveragerc --cov-report=term-missing \
		--cov-report=html:../$(REPORTS)/coverage_html \
		--cov-report=xml:../$(REPORTS)/coverage.xml \
		--cov-fail-under=$(COV_FAIL) \
		--junitxml=../$(REPORTS)/junit-coverage.xml -v

# Coverage report without failing the gate (local exploration)
coverage-report: reports
	cd $(BACKEND) && $(PY) -m pytest tests -n $(N) \
		-m "not integration and not e2e and not performance and not requires_llm" \
		--cov=. --cov-config=../.coveragerc --cov-report=term-missing \
		--cov-report=html:../$(REPORTS)/coverage_html \
		--cov-fail-under=0 -v

test: unit

test-serial:
	$(MAKE) unit N=0

lint:
	cd $(BACKEND) && $(PY) -m ruff check . --exclude tests/__pycache__ || $(PY) -m flake8 . --count --select=E9,F63,F7,F82 --show-source --statistics
	cd $(BACKEND) && $(PY) -m black --check --diff . || true
	cd $(BACKEND) && $(PY) -m isort --check-only --diff . || true

format:
	cd $(BACKEND) && $(PY) -m black .
	cd $(BACKEND) && $(PY) -m isort .
	cd $(BACKEND) && $(PY) -m ruff check . --fix || true

typecheck:
	cd $(BACKEND) && $(PY) -m mypy --config-file=../mypy.ini . || $(PY) -m mypy --ignore-missing-imports --no-error-summary hitl_gate.py models.py secrets_util.py auth.py || true

openapi:
	cd $(BACKEND) && MONGO_URL=$${MONGO_URL:-mongodb://127.0.0.1:27017} \
		DB_NAME=$${DB_NAME:-soc_console_openapi_ci} \
		JWT_SECRET=$${JWT_SECRET:-openapi-ci-not-for-production-use-32chars} \
		$(PY) scripts/export_openapi.py --check -o ../docs/openapi.json

e2e-install:
	cd frontend && npm ci || npm install
	cd frontend && npx playwright install chromium

e2e: reports
	cd frontend && npx playwright test --reporter=list,html
	@mkdir -p $(REPORTS)/playwright
	@cp -r frontend/playwright-report/* $(REPORTS)/playwright/ 2>/dev/null || true

frontend-lint:
	cd frontend && npm run lint 2>/dev/null || npx eslint "src/**/*.{js,jsx}" --max-warnings 999 || true

frontend-build:
	cd frontend && npm run build

docker:
	docker compose build

docker-test:
	docker compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from test-runner

security-scan: reports
	cd $(BACKEND) && $(PY) -m bandit -r . -x ./tests -f json -o ../$(REPORTS)/security/bandit.json || true
	cd $(BACKEND) && $(PY) -m bandit -r . -x ./tests -ll || true
	$(PIP) install -q pip-audit 2>/dev/null; pip-audit -r $(BACKEND)/requirements.txt -f json -o $(REPORTS)/security/pip-audit.json || true

deps-audit: security-scan
	@echo "==> npm audit (frontend, high+)"
	cd frontend && npm audit --audit-level=high || true

clean:
	rm -rf $(REPORTS) .coverage .coverage.* htmlcov .pytest_cache .mypy_cache .ruff_cache
	rm -rf $(BACKEND)/.pytest_cache $(BACKEND)/.mypy_cache
	rm -rf frontend/playwright-report frontend/test-results
	find . -type d -name __pycache__ -not -path "./frontend/node_modules/*" -exec rm -rf {} + 2>/dev/null || true

# Full local/CI quality gate (does not start Mongo/e2e by default)
ci: reports
	@echo "==> Lint"
	$(MAKE) lint
	@echo "==> Typecheck (best-effort)"
	$(MAKE) typecheck
	@echo "==> OpenAPI contract"
	$(MAKE) openapi
	@echo "==> Unit + framework tests (serial)"
	cd $(BACKEND) && $(PY) -m pytest tests -n 0 \
		-m "not integration and not e2e and not performance and not requires_llm" \
		--junitxml=../$(REPORTS)/junit-ci.xml \
		--html=../$(REPORTS)/pytest-ci.html --self-contained-html -v --tb=short
	@echo "==> Framework suites (root)"
	$(PY) -m pytest -c pytest.ini tests -n 0 \
		-m "not integration and not e2e and not performance and not requires_mongo and not requires_llm" \
		--junitxml=$(REPORTS)/junit-framework.xml -v --tb=short
	@echo "==> Frontend production build"
	$(MAKE) frontend-build
	@echo "==> CI gate complete (coverage gate: make coverage; e2e: make e2e)"

ci-fast: reports
	cd $(BACKEND) && $(PY) -m pytest tests -n 0 -q --tb=line \
		-m "not integration and not e2e and not performance"
