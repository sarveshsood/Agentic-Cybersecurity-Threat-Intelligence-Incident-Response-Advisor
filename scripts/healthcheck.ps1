# ACTIRA healthcheck (Windows)
# Usage: .\scripts\healthcheck.ps1 [-BaseUrl http://127.0.0.1:8001] [-Deep]
param(
  [string]$BaseUrl = "http://127.0.0.1:8001",
  [switch]$Deep
)
$ErrorActionPreference = "Continue"
$fail = 0
function Ok($m) { Write-Host "[OK]  $m" -ForegroundColor Green }
function Bad($m) { Write-Host "[FAIL] $m" -ForegroundColor Red; $script:fail++ }
function Warn($m) { Write-Host "[WARN] $m" -ForegroundColor Yellow }

try {
  $r = Invoke-WebRequest "$BaseUrl/api/health" -UseBasicParsing -TimeoutSec 5
  if ($r.StatusCode -eq 200) { Ok "API health $BaseUrl/api/health" } else { Bad "health status $($r.StatusCode)" }
} catch { Bad "API unreachable: $($_.Exception.Message)" }

try {
  $r = Invoke-WebRequest "$BaseUrl/api/ready" -UseBasicParsing -TimeoutSec 5
  if ($r.StatusCode -eq 200) { Ok "ready" } else { Bad "ready $($r.StatusCode)" }
} catch { Bad "ready: $($_.Exception.Message)" }

# OpenAPI present (docs contract)
try {
  $r = Invoke-WebRequest "$BaseUrl/openapi.json" -UseBasicParsing -TimeoutSec 8
  if ($r.StatusCode -eq 200 -and $r.Content -match "openapi") { Ok "openapi.json" } else { Warn "openapi.json unexpected" }
} catch { Warn "openapi.json: $($_.Exception.Message)" }

if ($Deep) {
  # Unauthenticated should 401/403 — proves router is mounted
  foreach ($path in @("/api/kpis", "/api/kpis/queue", "/api/settings/llm-routes")) {
    try {
      $null = Invoke-WebRequest "$BaseUrl$path" -UseBasicParsing -TimeoutSec 5
      Warn "$path returned success without auth (lab mode?)"
    } catch {
      $code = $_.Exception.Response.StatusCode.value__
      if ($code -in 401, 403) { Ok "$path auth-gated ($code)" }
      else { Warn "$path -> $code / $($_.Exception.Message)" }
    }
  }
}

if ($fail -gt 0) { exit 1 }
Write-Host "All required checks passed." -ForegroundColor Cyan
exit 0
