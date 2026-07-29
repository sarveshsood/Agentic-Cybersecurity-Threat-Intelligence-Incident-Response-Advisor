#!/usr/bin/env bash
# ACTIRA quality gate: smoke → functional → security
# Usage: ./scripts/quality-gate.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PYTHONPATH="$ROOT"

echo "==> Smoke"
(cd backend && python -m pytest \
  tests/test_model_management_queue.py \
  tests/test_ops_status.py \
  tests/test_secret_vault_auth_residuals.py \
  -n 0 -q --tb=line)

echo "==> Functional (backend unit, no live LLM)"
(cd backend && python -m pytest tests -n 0 \
  -m "not integration and not e2e and not performance and not requires_llm and not security" \
  -q --tb=line)

echo "==> Security"
python -m pytest -c pytest.ini tests/security -n 0 -q --tb=line

echo "==> Quality gate complete"
