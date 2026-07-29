# ACTIRA local env bootstrap (Windows)
# Creates backend/.env + frontend/.env from examples when missing.
# Does NOT start services — use start-demo.ps1 or healthcheck.ps1 after.
#
# Usage:
#   .\scripts\bootstrap-env.ps1
#   .\scripts\bootstrap-env.ps1 -Force   # rewrite frontend/.env only

param([switch]$Force)

$ErrorActionPreference = "Stop"
$Root = if ($PSScriptRoot) {
  (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
  (Get-Location).Path
}
Set-Location $Root

if (-not (Test-Path (Join-Path $Root "backend\server.py"))) {
  throw "Cannot resolve repo root (expected backend\server.py under $Root)"
}

Write-Host "==> ACTIRA bootstrap-env" -ForegroundColor Cyan
Write-Host "    Root: $Root" -ForegroundColor DarkGray

# backend/.env
$beEnv = Join-Path $Root "backend\.env"
$beEx = Join-Path $Root "backend\.env.example"
if (-not (Test-Path $beEnv)) {
  if (-not (Test-Path $beEx)) { throw "Missing backend\.env.example" }
  Copy-Item $beEx $beEnv
  Write-Host '[OK]  Created backend\.env from example — set JWT_SECRET before production.' -ForegroundColor Green
} else {
  Write-Host '[OK]  backend\.env already present (left unchanged)' -ForegroundColor Green
}

# frontend/.env
$feDir = Join-Path $Root "frontend"
$feEnv = Join-Path $feDir ".env"
if (-not (Test-Path $feDir)) {
  Write-Host '[SKIP] frontend/ missing' -ForegroundColor Yellow
} elseif ((-not (Test-Path $feEnv)) -or $Force) {
  Set-Content -Path $feEnv -Encoding utf8 -Value "REACT_APP_BACKEND_URL=http://127.0.0.1:8001"
  Write-Host '[OK]  Wrote frontend\.env (REACT_APP_BACKEND_URL=http://127.0.0.1:8001)' -ForegroundColor Green
} else {
  Write-Host '[OK]  frontend\.env already present (left unchanged; pass -Force to rewrite)' -ForegroundColor Green
}

Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  1. Edit backend\.env (JWT_SECRET, optional LLM keys)"
Write-Host "  2. pip install -r backend\requirements.txt  (from repo root, PYTHONPATH=.)"
Write-Host "  3. cd frontend; npm install"
Write-Host "  4. .\scripts\start-demo.ps1 -SkipDocker   OR docker compose up"
Write-Host "  5. .\scripts\healthcheck.ps1"
exit 0
