#!/usr/bin/env bash
# ACTIRA healthcheck (Unix)
# Usage: ./scripts/healthcheck.sh [BASE_URL] [--deep]
set -euo pipefail
BASE="http://127.0.0.1:8001"
DEEP=0
for a in "$@"; do
  case "$a" in
    --deep) DEEP=1 ;;
    http*|https*) BASE="$a" ;;
  esac
done
fail=0
ok() { printf '\033[32m[OK]\033[0m  %s\n' "$*"; }
bad() { printf '\033[31m[FAIL]\033[0m %s\n' "$*"; fail=$((fail+1)); }
warn() { printf '\033[33m[WARN]\033[0m %s\n' "$*"; }

if curl -sf "$BASE/api/health" >/dev/null; then ok "API health $BASE/api/health"; else bad "API health"; fi
if curl -sf "$BASE/api/ready" >/dev/null; then ok "ready"; else bad "ready"; fi

if curl -sf "$BASE/openapi.json" 2>/dev/null | grep -q openapi; then ok "openapi.json"; else warn "openapi.json"; fi

if [[ "$DEEP" -eq 1 ]]; then
  for path in /api/kpis /api/kpis/queue /api/settings/llm-routes; do
    code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path" || true)
    if [[ "$code" == "401" || "$code" == "403" ]]; then
      ok "$path auth-gated ($code)"
    elif [[ "$code" == "200" ]]; then
      warn "$path returned 200 without auth (lab mode?)"
    else
      warn "$path -> $code"
    fi
  done
fi

if [[ "$fail" -gt 0 ]]; then exit 1; fi
echo "All required checks passed."
exit 0
