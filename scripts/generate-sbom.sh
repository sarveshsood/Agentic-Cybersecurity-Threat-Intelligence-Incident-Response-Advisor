#!/usr/bin/env bash
# Best-effort SBOM generation when syft/cyclonedx is installed
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/reports"
if command -v syft >/dev/null 2>&1; then
  syft "dir:$ROOT/backend" -o spdx-json > "$ROOT/reports/sbom-backend.spdx.json"
  echo "Wrote reports/sbom-backend.spdx.json"
else
  echo "syft not installed — skip SBOM (https://github.com/anchore/syft)"
  echo '{"notice":"install syft for SBOM"}' > "$ROOT/reports/sbom-backend.placeholder.json"
fi
