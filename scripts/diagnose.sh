#!/usr/bin/env bash
# ACTIRA self-diagnostic + safe auto-fix (Unix / Git Bash / WSL)
# Usage: ./scripts/diagnose.sh [--fix] [--deep] [--start-mongo] [--json]
set -u
FIX=0; DEEP=0; START_MONGO=0; JSON=0; QUIET=0
for arg in "$@"; do
  case "$arg" in
    --fix|-f) FIX=1 ;;
    --deep|-d) DEEP=1 ;;
    --start-mongo) START_MONGO=1 ;;
    --json) JSON=1 ;;
    --quiet|-q) QUIET=1 ;;
    -h|--help) sed -n '2,4p' "$0"; exit 0 ;;
    *) echo "Unknown arg: $arg" >&2; exit 2 ;;
  esac
done
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"
PASSED=0; FIXED=0; WARNED=0; FAILED=0
log() { local c="$1"; shift; [[ "$QUIET" -eq 1 ]] && return 0
  case "$c" in green) printf '\033[32m%s\033[0m\n' "$*";; red) printf '\033[31m%s\033[0m\n' "$*";;
  yellow) printf '\033[33m%s\033[0m\n' "$*";; cyan) printf '\033[36m%s\033[0m\n' "$*";;
  white) printf '\033[1m%s\033[0m\n' "$*";; *) printf '%s\n' "$*";; esac; }
add_result() {
  local status="$1" id="$2" name="$3" detail="$4" fix_hint="${5:-}"
  case "$status" in
    pass) PASSED=$((PASSED+1)); log green "[OK]    $name - $detail" ;;
    fixed) FIXED=$((FIXED+1)); log cyan "[FIXED] $name - $detail" ;;
    warn) WARNED=$((WARNED+1)); log yellow "[WARN]  $name - $detail"; [[ -n "$fix_hint" ]] && log yellow "        Fix: $fix_hint" ;;
    fail) FAILED=$((FAILED+1)); log red "[FAIL]  $name - $detail"; [[ -n "$fix_hint" ]] && log yellow "        Fix: $fix_hint" ;;
    info) log gray "[INFO]  $name - $detail" ;;
  esac
}
port_listen() {
  local p="$1"
  if command -v ss >/dev/null 2>&1; then ss -lnt 2>/dev/null | grep -qE "[:.]$p[[:space:]]"; return $?; fi
  if command -v lsof >/dev/null 2>&1; then lsof -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; return $?; fi
  (echo >/dev/tcp/127.0.0.1/"$p") >/dev/null 2>&1
}
env_get() {
  local f="$1" k="$2"; [[ -f "$f" ]] || { echo ""; return; }
  grep -E "^[[:space:]]*${k}[[:space:]]*=" "$f" 2>/dev/null | head -1 | sed -E "s/^[[:space:]]*${k}[[:space:]]*=[[:space:]]*//" | tr -d '\r' | sed -E "s/^[\"']|[\"']$//g"
}
resolve_python() {
  [[ -x "$ROOT/.venv/bin/python" ]] && { echo "$ROOT/.venv/bin/python"; return; }
  [[ -x "$ROOT/backend/.venv/bin/python" ]] && { echo "$ROOT/backend/.venv/bin/python"; return; }
  command -v python3 2>/dev/null || command -v python 2>/dev/null || echo ""
}
docker_ready() { command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; }

log cyan "ACTIRA self-diagnostic  (fix=$FIX deep=$DEEP start_mongo=$START_MONGO)"
log white "-- Toolchain --"
if command -v node >/dev/null 2>&1; then
  NV=$(node --version 2>&1 | tr -d '\r'); MAJOR=$(echo "$NV" | sed -E 's/^v?([0-9]+).*/\1/')
  [[ "${MAJOR:-0}" -ge 18 ]] && add_result pass tool.node "Node.js" "$NV" || add_result fail tool.node "Node.js" "$NV (need 18+)" "Install Node 18+"
else add_result fail tool.node "Node.js" "not on PATH" "Install Node 18+"; fi
command -v npm >/dev/null 2>&1 && add_result pass tool.npm "npm" "$(npm --version 2>&1 | tr -d '\r')" || add_result fail tool.npm "npm" "not on PATH" "Reinstall Node"
PY=$(resolve_python)
if [[ -n "$PY" ]]; then
  PV=$("$PY" --version 2>&1 | tr -d '\r')
  echo "$PV" | grep -qE 'Python 3\.(1[1-9]|[2-9][0-9])' && add_result pass tool.python "Python" "$PV" || add_result fail tool.python "Python" "$PV" "Install 3.11+"
else add_result fail tool.python "Python" "not found" "Install Python 3.11+"; fi
docker_ready && add_result pass tool.docker "Docker" "available" || { command -v docker >/dev/null 2>&1 && add_result warn tool.docker "Docker" "daemon down" "Start Docker" || add_result info tool.docker "Docker" "not installed"; }

log white "-- Python environment --"
if [[ ! -x "$ROOT/.venv/bin/python" ]]; then
  if [[ "$FIX" -eq 1 && -n "$PY" ]]; then
    "$PY" -m venv "$ROOT/.venv" || true
    [[ -x "$ROOT/.venv/bin/python" ]] && { PY="$ROOT/.venv/bin/python"; add_result fixed py.venv "Python venv" "created"; } || add_result fail py.venv "Python venv" "failed" "python3 -m venv .venv"
  else add_result warn py.venv "Python venv" "missing" "./scripts/diagnose.sh --fix"; fi
else PY="$ROOT/.venv/bin/python"; add_result pass py.venv "Python venv" "$PY"; fi

check_imports() {
  "$PY" - <<'PY' 2>/dev/null
import importlib, sys
mods = ["fastapi","uvicorn","motor","pymongo","pydantic","jwt","bcrypt","dotenv","rank_bm25"]
miss=[]
for m in mods:
  try: importlib.import_module(m)
  except Exception as e: miss.append("%s:%s"%(m,type(e).__name__))
if miss: print("MISSING:"+",".join(miss)); sys.exit(1)
print("OK")
PY
}
if [[ -n "$PY" ]]; then
  if check_imports >/dev/null 2>&1; then add_result pass py.deps "Backend packages" "OK"
  elif [[ "$FIX" -eq 1 ]]; then
    "$PY" -m pip install -U pip >/dev/null 2>&1 || true
    "$PY" -m pip install -r "$ROOT/backend/requirements.txt" || true
    [[ -f "$ROOT/requirements-test.txt" ]] && "$PY" -m pip install -r "$ROOT/requirements-test.txt" || true
    check_imports >/dev/null 2>&1 && add_result fixed py.deps "Backend packages" "installed" || add_result fail py.deps "Backend packages" "still missing" "pip install -r backend/requirements.txt"
  else add_result fail py.deps "Backend packages" "import failure" "./scripts/diagnose.sh --fix"; fi
fi

log white "-- Frontend --"
if [[ ! -f "$ROOT/frontend/package.json" ]]; then add_result fail fe.pkg "package.json" "missing"
elif [[ -d "$ROOT/frontend/node_modules" ]]; then add_result pass fe.deps "Frontend deps" "node_modules present"
elif [[ "$FIX" -eq 1 ]] && command -v npm >/dev/null 2>&1; then
  (cd "$ROOT/frontend" && npm install) || true
  [[ -d "$ROOT/frontend/node_modules" ]] && add_result fixed fe.deps "Frontend deps" "npm install done" || add_result fail fe.deps "Frontend deps" "npm failed"
else add_result fail fe.deps "Frontend deps" "node_modules missing" "./scripts/diagnose.sh --fix"; fi

log white "-- Configuration --"
if [[ ! -f "$ROOT/backend/.env" ]]; then
  if [[ "$FIX" -eq 1 && -f "$ROOT/backend/.env.example" ]]; then cp "$ROOT/backend/.env.example" "$ROOT/backend/.env"; add_result fixed cfg.backend "backend/.env" "created"
  else add_result fail cfg.backend "backend/.env" "missing" "cp backend/.env.example backend/.env"; fi
else add_result pass cfg.backend "backend/.env" "exists"; fi

if [[ -f "$ROOT/backend/.env" ]]; then
  MONGO_URL=$(env_get "$ROOT/backend/.env" MONGO_URL)
  JWT=$(env_get "$ROOT/backend/.env" JWT_SECRET)
  ENV_NAME=$(env_get "$ROOT/backend/.env" ENV)
  [[ -z "${MONGO_URL// }" ]] && { [[ "$FIX" -eq 1 ]] && { echo "MONGO_URL=mongodb://localhost:27017" >> "$ROOT/backend/.env"; add_result fixed cfg.mongo "MONGO_URL" "set"; } || add_result fail cfg.mongo "MONGO_URL" "empty"; } || add_result pass cfg.mongo "MONGO_URL" "configured"
  if [[ -z "${JWT// }" || "$JWT" == *generate-a-32* || ${#JWT} -lt 16 ]]; then
    if [[ "$FIX" -eq 1 && ( -z "$ENV_NAME" || "$ENV_NAME" == "dev" || "$ENV_NAME" == "test" || "$ENV_NAME" == "local" ) ]]; then
      NEW_JWT=$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))' 2>/dev/null || openssl rand -base64 48 | tr -d '\n')
      if grep -qE '^[[:space:]]*JWT_SECRET=' "$ROOT/backend/.env"; then sed -i.bak -E "s|^[[:space:]]*JWT_SECRET=.*|JWT_SECRET=$NEW_JWT|" "$ROOT/backend/.env" && rm -f "$ROOT/backend/.env.bak"
      else echo "JWT_SECRET=$NEW_JWT" >> "$ROOT/backend/.env"; fi
      add_result fixed cfg.jwt "JWT_SECRET" "generated"
    else SEV=warn; [[ "$ENV_NAME" == "production" || "$ENV_NAME" == "staging" ]] && SEV=fail; add_result "$SEV" cfg.jwt "JWT_SECRET" "weak" "Set long secret or --fix"; fi
  else add_result pass cfg.jwt "JWT_SECRET" "set"; fi
fi

if [[ ! -f "$ROOT/frontend/.env" ]]; then
  [[ "$FIX" -eq 1 ]] && { echo "REACT_APP_BACKEND_URL=http://localhost:8001" > "$ROOT/frontend/.env"; add_result fixed cfg.frontend "frontend/.env" "created"; } || add_result fail cfg.frontend "frontend/.env" "missing"
else
  BE=$(env_get "$ROOT/frontend/.env" REACT_APP_BACKEND_URL)
  [[ -z "${BE// }" ]] && { [[ "$FIX" -eq 1 ]] && { echo "REACT_APP_BACKEND_URL=http://localhost:8001" >> "$ROOT/frontend/.env"; add_result fixed cfg.frontend "URL" "set"; } || add_result fail cfg.frontend "URL" "empty"; } || add_result pass cfg.frontend "REACT_APP_BACKEND_URL" "$BE"
fi

log white "-- Ports & services --"
if port_listen 27017; then add_result pass svc.mongo "MongoDB :27017" "listening"
elif [[ "$FIX" -eq 1 && "$START_MONGO" -eq 1 ]] && docker_ready; then
  (cd "$ROOT" && docker compose up -d mongodb) || true
  ready=0; for _ in $(seq 1 30); do sleep 2; port_listen 27017 && { ready=1; break; }; done
  [[ "$ready" -eq 1 ]] && add_result fixed svc.mongo "MongoDB :27017" "started" || add_result fail svc.mongo "MongoDB :27017" "not ready"
else add_result fail svc.mongo "MongoDB :27017" "not listening" "docker compose up -d mongodb"; fi

if port_listen 8001; then
  add_result pass svc.api.port "Backend :8001" "listening"
  curl -sf --max-time 5 "http://127.0.0.1:8001/api/health" >/dev/null && add_result pass svc.api.health "GET /api/health" "200" || add_result fail svc.api.health "GET /api/health" "failed"
else add_result warn svc.api.port "Backend :8001" "not listening" "./scripts/start-demo.sh"; fi
port_listen 3000 && add_result pass svc.ui "Frontend :3000" "listening" || add_result warn svc.ui "Frontend :3000" "not listening" "cd frontend && npm start"

if [[ "$DEEP" -eq 1 && -n "$PY" ]]; then
  log white "-- Deep checks --"
  bad=0
  for m in server.py models.py pipeline.py auth.py playbook_agent.py hitl_gate.py; do
    "$PY" -m py_compile "$ROOT/backend/$m" 2>/dev/null || bad=1
  done
  [[ "$bad" -eq 0 ]] && add_result pass deep.compile "Key modules" "OK" || add_result fail deep.compile "Key modules" "syntax errors"
  if [[ -f "$ROOT/backend/tests/test_hardening.py" ]]; then
    (cd "$ROOT/backend" && FORCE_MOCK_TI=true ENV=test "$PY" -m pytest tests/test_hardening.py -q -n 0 --tb=line) \
      && add_result pass deep.pytest "Smoke tests" "passed" || add_result fail deep.pytest "Smoke tests" "failed"
  fi
fi

log white "Summary: $PASSED passed | $FIXED fixed | $WARNED warnings | $FAILED failed"
[[ "$FAILED" -eq 0 ]] && log green "Result: healthy enough to run." || {
  log yellow "Result: $FAILED issue(s) remain."
  [[ "$FIX" -eq 0 ]] && log cyan "Tip: ./scripts/diagnose.sh --fix [--start-mongo] [--deep]"
}
[[ "$JSON" -eq 1 ]] && printf '{"passed":%s,"fixed":%s,"warnings":%s,"failed":%s}\n' "$PASSED" "$FIXED" "$WARNED" "$FAILED"
[[ "$FAILED" -gt 0 ]] && exit 1
exit 0