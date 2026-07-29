#!/usr/bin/env bash
# Safe cleanup of ACTIRA runtime artifacts
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
for t in backend/data/job_artifacts backend/data/job_payloads backend/data/email_outbox backend/logs/archive; do
  if [[ -d "$t" ]]; then
    rm -rf "$t"
    mkdir -p "$t"
    echo "Cleaned $t"
  fi
done
echo "Done. Mongo incidents/settings are NOT deleted."
