# ACTIRA one-command demo start (Windows PowerShell)
# Usage:
#   .\scripts\start-demo.ps1
#   .\scripts\start-demo.ps1 -NoBuild          # compose up without --build
#   .\scripts\start-demo.ps1 -ApiOnly          # skip frontend spawn in local mode
#   .\scripts\start-demo.ps1 -SkipDocker       # force local uvicorn path even if Docker exists
#
# Prefer Docker Compose when available; otherwise starts API (+ frontend) with local Mongo.
# Local API always runs from repo root: uvicorn backend.server:app (PYTHONPATH=repo root).

[CmdletBinding()]
param(
  [switch]$NoBuild,
  [switch]$ApiOnly,
  [switch]$SkipDocker
)

$ErrorActionPreference = "Stop"
$Root = $null
if ($PSScriptRoot) {
  $Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
  $Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
}
if (-not (Test-Path (Join-Path $Root "backend\server.py"))) {
  throw "Cannot resolve repo root (expected backend\server.py under $Root)"
}
Set-Location $Root

Write-Host "==> ACTIRA demo start" -ForegroundColor Cyan
Write-Host "    Root: $Root" -ForegroundColor DarkGray

# --- bootstrap env files ---
if (-not (Test-Path "backend\.env")) {
  if (Test-Path "backend\.env.example") {
    Copy-Item "backend\.env.example" "backend\.env"
    Write-Host "Created backend\.env from example - set JWT_SECRET before production use." -ForegroundColor Yellow
  } else {
    throw "backend\.env missing and no .env.example"
  }
}

if (-not (Test-Path "frontend\.env")) {
  @"
REACT_APP_BACKEND_URL=http://localhost:8001
"@ | Set-Content -Encoding utf8 "frontend\.env"
  Write-Host "Created frontend\.env"
}

function Resolve-PythonExecutable {
  $candidates = @(
    (Join-Path $Root ".venv\Scripts\python.exe"),
    (Join-Path $Root "venv\Scripts\python.exe"),
    (Join-Path $Root "env\Scripts\python.exe"),
    (Join-Path $Root "backend\.venv\Scripts\python.exe"),
    (Join-Path $Root "backend\venv\Scripts\python.exe"),
    (Join-Path $Root "backend\env\Scripts\python.exe")
  )

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  foreach ($name in @("python", "py")) {
    $command = Get-Command $name -ErrorAction SilentlyContinue
    if ($command -and $command.Source -and (Test-Path $command.Source)) {
      return $command.Source
    }
  }

  return $null
}

function Wait-ApiHealth {
  param([int]$Attempts = 40, [int]$SleepSec = 3)
  for ($i = 0; $i -lt $Attempts; $i++) {
    try {
      $r = Invoke-WebRequest "http://127.0.0.1:8001/api/health" -UseBasicParsing -TimeoutSec 2
      if ($r.StatusCode -eq 200) { return $true }
    } catch {
      # keep waiting
    }
    Start-Sleep -Seconds $SleepSec
  }
  return $false
}

function Show-ReadyBanner {
  param([bool]$Healthy)
  if ($Healthy) {
    Write-Host "API healthy." -ForegroundColor Green
  } else {
    Write-Host "API not healthy yet - check logs / Mongo." -ForegroundColor Yellow
  }
  Write-Host "UI:  http://localhost:3000" -ForegroundColor Green
  Write-Host "API: http://localhost:8001/docs" -ForegroundColor Green
  Write-Host "Demo: analyst@soc.example.com / Analyst123!  (lab seed)" -ForegroundColor Cyan
}

# --- Docker path ---
$dockerOk = $false
if (-not $SkipDocker) {
  try {
    $null = Get-Command docker -ErrorAction Stop
    docker info 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $dockerOk = $true }
  } catch {
    $dockerOk = $false
  }
}

if ($dockerOk) {
  $composeArgs = @("compose", "up", "-d")
  if (-not $NoBuild) { $composeArgs += "--build" }
  Write-Host "==> docker $($composeArgs -join ' ')" -ForegroundColor Cyan
  & docker @composeArgs
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose failed (exit $LASTEXITCODE)"
  }
  Write-Host "Waiting for health..."
  $ok = Wait-ApiHealth
  Show-ReadyBanner -Healthy $ok
  if (-not $ok) {
    Write-Host "Hint: docker compose logs backend" -ForegroundColor Yellow
  }
  exit 0
}

# --- Local path (no Docker) ---
Write-Host "Docker not available - local mode (ensure Mongo on :27017)" -ForegroundColor Yellow

$pythonExe = Resolve-PythonExecutable
if (-not $pythonExe) {
  throw "No working Python executable found. Create a local .venv or install Python 3.11+ and re-run .\scripts\diagnose.ps1"
}
Write-Host "Python: $pythonExe" -ForegroundColor DarkGray

# Canonical entry: package import from repo root (backend.* absolute imports).
# Avoid here-strings (CRLF/LF pitfalls); single-line -Command is reliable on Windows PS.
$backendCmd = "Set-Location -LiteralPath '$Root'; `$env:PYTHONPATH = '$Root'; & '$pythonExe' -m uvicorn backend.server:app --host 0.0.0.0 --port 8001 --reload"
Start-Process -FilePath "powershell.exe" -WorkingDirectory $Root -ArgumentList @(
  "-NoExit",
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-Command", $backendCmd
)
Write-Host "Backend launching on :8001 (uvicorn backend.server:app)" -ForegroundColor Cyan

if (-not $ApiOnly) {
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $npm) { $npm = Get-Command npm -ErrorAction SilentlyContinue }
  if ($npm) {
    $fe = Join-Path $Root "frontend"
    $frontendCmd = "Set-Location -LiteralPath '$fe'; if (-not (Test-Path node_modules)) { npm install }; npm start"
    Start-Process -FilePath "powershell.exe" -WorkingDirectory $fe -ArgumentList @(
      "-NoExit",
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-Command", $frontendCmd
    )
    Write-Host "Frontend launching on :3000" -ForegroundColor Cyan
  } else {
    Write-Host "npm not found - start UI manually: cd frontend; npm start" -ForegroundColor Yellow
  }
} else {
  Write-Host "ApiOnly: skip frontend. Start with: cd frontend; npm start" -ForegroundColor DarkGray
}

Write-Host "Waiting for health..."
$ok = Wait-ApiHealth -Attempts 20 -SleepSec 2
Show-ReadyBanner -Healthy $ok
if (-not $ok) {
  Write-Host "Hint: .\scripts\diagnose.ps1 -Fix -StartMongo" -ForegroundColor Yellow
  Write-Host "      Ensure Mongo is up and PYTHONPATH is the repo root." -ForegroundColor Yellow
}
exit 0
