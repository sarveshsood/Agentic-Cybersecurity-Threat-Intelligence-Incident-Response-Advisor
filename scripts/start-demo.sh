#!/usr/bin/env bash
# ACTIRA one-command demo start (Unix)
# Usage:
#   ./scripts/start-demo.sh
#   ./scripts/start-demo.sh --no-build
#   ./scripts/start-demo.sh --api-only
#   ./scripts/start-demo.sh --skip-docker
#
# Prefer Docker Compose when available; otherwise starts API (+ frontend) with local Mongo.
# Local API always runs from repo root: uvicorn backend.server:app (PYTHONPATH=repo root).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f "$ROOT/backend/server.py" ]]; then
  echo "ERROR: cannot resolve repo root (expected backend/server.py under $ROOT)" >&2
  exit 1
fi

NO_BUILD=0
API_ONLY=0
SKIP_DOCKER=0
for arg in "$@"; do
  case "$arg" in
    --no-build) NO_BUILD=1 ;;
    --api-only) API_ONLY=1 ;;
    --skip-docker) SKIP_DOCKER=1 ;;
    -h|--help)
      echo "Usage: $0 [--no-build] [--api-only] [--skip-docker]"
      exit 0
      ;;
  esac
done

echo "==> ACTIRA demo start"
echo "    Root: $ROOT"

if [[ ! -f backend/.env ]]; then
  if [[ -f backend/.env.example ]]; then
    cp backend/.env.example backend/.env
    echo "Created backend/.env from example — set JWT_SECRET for non-lab use."
  else
    echo "ERROR: backend/.env missing and no .env.example" >&2
    exit 1
  fi
fi

if [[ ! -f frontend/.env ]]; then
  echo "REACT_APP_BACKEND_URL=http://localhost:8001" > frontend/.env
  echo "Created frontend/.env"
fi

wait_api_health() {
  local attempts="${1:-40}"
  local sleep_s="${2:-3}"
  local i
  for i in $(seq 1 "$attempts"); do
    if curl -sf http://127.0.0.1:8001/api/health >/dev/null 2>&1; then
      return 0
    fi
    sleep "$sleep_s"
  done
  return 1
}

show_ready() {
  local healthy="$1"
  if [[ "$healthy" == "1" ]]; then
    echo "API healthy."
  else
    echo "API not healthy yet — check logs / Mongo."
  fi
  echo "UI:  http://localhost:3000"
  echo "API: http://localhost:8001/docs"
  echo "Demo: analyst@soc.example.com / Analyst123!  (lab seed)"
}

resolve_python() {
  local c
  for c in \
    "$ROOT/.venv/bin/python" \
    "$ROOT/venv/bin/python" \
    "$ROOT/env/bin/python" \
    "$ROOT/backend/.venv/bin/python" \
    "$ROOT/backend/venv/bin/python"
  do
    if [[ -x "$c" ]]; then
      echo "$c"
      return 0
    fi
  done
  if command -v python3 >/dev/null 2>&1; then
    command -v python3
    return 0
  fi
  if command -v python >/dev/null 2>&1; then
    command -v python
    return 0
  fi
  return 1
}

# --- Docker path ---
if [[ "$SKIP_DOCKER" -eq 0 ]] && command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  if [[ "$NO_BUILD" -eq 1 ]]; then
    echo "==> docker compose up -d"
    docker compose up -d
  else
    echo "==> docker compose up -d --build"
    docker compose up -d --build
  fi
  echo "Waiting for health..."
  if wait_api_health 40 3; then
    show_ready 1
  else
    show_ready 0
    echo "Hint: docker compose logs backend"
  fi
  exit 0
fi

# --- Local path ---
echo "Docker not available — local mode (ensure Mongo on :27017)"

if ! PY="$(resolve_python)"; then
  echo "ERROR: No Python found. Create .venv (Python 3.11+) and re-run." >&2
  exit 1
fi
echo "Python: $PY"

# Canonical entry: package import from repo root (backend.* absolute imports)
mkdir -p "$ROOT/backend/logs"
BACKEND_LOG="$ROOT/backend/logs/start-demo-api.log"
(
  cd "$ROOT"
  export PYTHONPATH="$ROOT"
  exec "$PY" -m uvicorn backend.server:app --host 0.0.0.0 --port 8001 --reload
) >"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
echo "Backend launching on :8001 (pid $BACKEND_PID, uvicorn backend.server:app, log $BACKEND_LOG)"

if [[ "$API_ONLY" -eq 0 ]]; then
  if command -v npm >/dev/null 2>&1; then
    FRONTEND_LOG="$ROOT/backend/logs/start-demo-ui.log"
    (
      cd "$ROOT/frontend"
      if [[ ! -d node_modules ]]; then
        npm install
      fi
      exec npm start
    ) >"$FRONTEND_LOG" 2>&1 &
    FRONTEND_PID=$!
    echo "Frontend launching on :3000 (pid $FRONTEND_PID, log $FRONTEND_LOG)"
  else
    echo "npm not found — start UI manually: cd frontend && npm start"
  fi
else
  echo "ApiOnly: skip frontend. Start with: cd frontend && npm start"
fi

echo "Waiting for health..."
if wait_api_health 20 2; then
  show_ready 1
else
  show_ready 0
  echo "Hint: ./scripts/diagnose.sh  or  tail -f $BACKEND_LOG"
  echo "      Ensure Mongo is up and PYTHONPATH is the repo root."
fi
exit 0
