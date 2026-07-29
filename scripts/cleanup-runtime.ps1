# Safe cleanup of ACTIRA runtime artifacts (NOT source code)
# Usage: .\scripts\cleanup-runtime.ps1 [-WhatIf]
param([switch]$WhatIf)
$ErrorActionPreference = "Stop"
$Root = if ($PSScriptRoot) { (Resolve-Path (Join-Path $PSScriptRoot "..")).Path } else { Get-Location }
Set-Location $Root
$targets = @(
  "backend\data\job_artifacts",
  "backend\data\job_payloads",
  "backend\data\email_outbox",
  "backend\logs\archive"
)
foreach ($t in $targets) {
  $p = Join-Path $Root $t
  if (Test-Path $p) {
    if ($WhatIf) { Write-Host "Would remove $p" -ForegroundColor Yellow }
    else {
      Remove-Item -Recurse -Force $p -ErrorAction SilentlyContinue
      New-Item -ItemType Directory -Force -Path $p | Out-Null
      Write-Host "Cleaned $p" -ForegroundColor Green
    }
  }
}
Write-Host "Done. Mongo incidents/settings are NOT deleted." -ForegroundColor Cyan
