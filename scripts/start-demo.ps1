# ACTIRA one-command demo start (Windows PowerShell)
# Usage: .\scripts\start-demo.ps1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

Write-Host "==> ACTIRA demo start" -ForegroundColor Cyan

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

# Prefer full compose when Docker is available
$dockerOk = $false
try {
  docker info 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { $dockerOk = $true }
} catch {
  $dockerOk = $false
}

if ($dockerOk) {
  Write-Host "==> docker compose up -d --build"
  docker compose up -d --build
  Write-Host "Waiting for health..."
  $ok = $false
  for ($i = 0; $i -lt 40; $i++) {
    try {
      $r = Invoke-WebRequest "http://127.0.0.1:8001/api/health" -UseBasicParsing -TimeoutSec 2
      if ($r.StatusCode -eq 200) {
        $ok = $true
        break
      }
    } catch {
      Start-Sleep -Seconds 3
    }
  }
  if ($ok) {
    Write-Host "API healthy. UI: http://localhost:3000  API: http://localhost:8001/docs" -ForegroundColor Green
    Write-Host "Demo: analyst@soc.example.com / Analyst123!  (lab seed)"
    exit 0
  }
  Write-Host "Compose started but health not ready yet - check: docker compose logs backend" -ForegroundColor Yellow
  exit 0
}

Write-Host "Docker not available - starting API only (ensure Mongo on :27017)" -ForegroundColor Yellow
Write-Host "Run frontend separately: cd frontend; npm.cmd start"

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

$pythonExe = Resolve-PythonExecutable
if (-not $pythonExe) {
  throw "No working Python executable found. Create a local .venv or install Python 3.11+ and re-run .\scripts\diagnose.ps1"
}

Set-Location backend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "& '$pythonExe' -m uvicorn server:app --host 0.0.0.0 --port 8001"
Write-Host "Backend launching on :8001"
