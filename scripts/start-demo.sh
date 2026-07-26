#!/usr/bin/env bash
# ACTIRA one-command demo start (Unix)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> ACTIRA demo start"

if [[ ! -f backend/.env ]]; then
  cp backend/.env.example backend/.env
  echo "Created backend/.env from example — set JWT_SECRET for non-lab use."
fi

if [[ ! -f frontend/.env ]]; then
  echo "REACT_APP_BACKEND_URL=http://localhost:8001" > frontend/.env
  echo "Created frontend/.env"
fi

if docker info >/dev/null 2>&1; then
  echo "==> docker compose up -d --build"
  docker compose up -d --build
  echo "Waiting for health..."
  for i in $(seq 1 40); do
    if curl -sf http://127.0.0.1:8001/api/health >/dev/null; then
      echo "API healthy. UI: http://localhost:3000  API docs: http://localhost:8001/docs"
      echo "Demo: analyst@soc.example.com / Analyst123!  (lab seed)"
      exit 0
    fi
    sleep 3
  done
  echo "Compose up but health not ready — docker compose logs backend"
  exit 0
fi

echo "Docker not available — start Mongo, then:"
echo "  cd backend && python -m uvicorn server:app --host 0.0.0.0 --port 8001"
echo "  cd frontend && npm start"
exit 1
