#!/usr/bin/env bash
# ACTIRA local env bootstrap (Unix)
# Creates backend/.env + frontend/.env from examples when missing.
# Does NOT start services — use start-demo.sh or healthcheck.sh after.
#
# Usage:
#   ./scripts/bootstrap-env.sh
#   ./scripts/bootstrap-env.sh --force   # rewrite frontend/.env only
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
FORCE=0
if [[ "${1:-}" == "--force" ]]; then FORCE=1; fi

if [[ ! -f backend/server.py ]]; then
  echo "Cannot resolve repo root (expected backend/server.py)" >&2
  exit 1
fi

echo "==> ACTIRA bootstrap-env"
echo "    Root: $ROOT"

if [[ ! -f backend/.env ]]; then
  if [[ ! -f backend/.env.example ]]; then
    echo "Missing backend/.env.example" >&2
    exit 1
  fi
  cp backend/.env.example backend/.env
  echo "[OK]  Created backend/.env from example — set JWT_SECRET before production."
else
  echo "[OK]  backend/.env already present (left unchanged)"
fi

if [[ ! -d frontend ]]; then
  echo "[SKIP] frontend/ missing"
elif [[ ! -f frontend/.env ]] || [[ "$FORCE" -eq 1 ]]; then
  printf 'REACT_APP_BACKEND_URL=http://127.0.0.1:8001\n' > frontend/.env
  echo "[OK]  Wrote frontend/.env (REACT_APP_BACKEND_URL=http://127.0.0.1:8001)"
else
  echo "[OK]  frontend/.env already present (left unchanged; --force to rewrite)"
fi

echo ""
echo "Next:"
echo "  1. Edit backend/.env (JWT_SECRET, optional LLM keys)"
echo "  2. pip install -r backend/requirements.txt  (from repo root, PYTHONPATH=.)"
echo "  3. cd frontend && npm install"
echo "  4. ./scripts/start-demo.sh --skip-docker   OR docker compose up"
echo "  5. ./scripts/healthcheck.sh"
exit 0
