# ACTIRA self-diagnostic + safe auto-fix (Windows PowerShell)
#
# Usage:
#   .\scripts\diagnose.ps1
#   .\scripts\diagnose.ps1 -Fix
#   .\scripts\diagnose.ps1 -Fix -Deep
#   .\scripts\diagnose.ps1 -Fix -StartMongo
#   .\scripts\diagnose.ps1 -Json
#
# Exit: 0 = pass, 1 = failures remain

[CmdletBinding()]
param(
  [switch]$Fix,
  [switch]$Deep,
  [switch]$StartMongo,
  [switch]$Json,
  [switch]$Quiet
)

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$script:results = [System.Collections.Generic.List[object]]::new()
$script:fixed = 0; $script:failed = 0; $script:warned = 0; $script:passed = 0

function Write-Log {
  param([string]$Message, [string]$Color = "Gray")
  if (-not $Quiet) { Write-Host $Message -ForegroundColor $Color }
}

function Add-Result {
  param(
    [ValidateSet("pass","fail","warn","info","fixed")][string]$Status,
    [string]$Id, [string]$Name, [string]$Detail, [string]$FixHint = ""
  )
  $script:results.Add([pscustomobject]@{ status=$Status; id=$Id; name=$Name; detail=$Detail; fix=$FixHint }) | Out-Null
  switch ($Status) {
    "pass"  { $script:passed++; Write-Log "[OK]    $Name - $Detail" "Green" }
    "fixed" { $script:fixed++;  Write-Log "[FIXED] $Name - $Detail" "Cyan" }
    "warn"  { $script:warned++; Write-Log "[WARN]  $Name - $Detail" "Yellow"; if ($FixHint) { Write-Log "        Fix: $FixHint" "DarkYellow" } }
    "fail"  { $script:failed++; Write-Log "[FAIL]  $Name - $Detail" "Red"; if ($FixHint) { Write-Log "        Fix: $FixHint" "Yellow" } }
    "info"  { Write-Log "[INFO]  $Name - $Detail" "DarkGray" }
  }
}

function Get-CommandPath {
  param([string]$Name)
  $c = Get-Command $Name -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  $null
}

function Test-ListeningPort {
  param([int]$Port)
  try {
    return $null -ne (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1)
  } catch {
    try {
      $client = New-Object System.Net.Sockets.TcpClient
      $iar = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
      $ok = $iar.AsyncWaitHandle.WaitOne(400)
      if ($ok -and $client.Connected) { $client.Close(); return $true }
      $client.Close(); return $false
    } catch { return $false }
  }
}

function Get-EnvValue {
  param([string]$Path, [string]$Key)
  if (-not (Test-Path $Path)) { return $null }
  $line = Get-Content $Path -ErrorAction SilentlyContinue | Where-Object { $_ -match "^\s*$([regex]::Escape($Key))\s*=" } | Select-Object -First 1
  if (-not $line) { return $null }
  ($line -replace "^\s*$([regex]::Escape($Key))\s*=\s*", "").Trim().Trim('"').Trim("'")
}

function Resolve-Python {
  function _try([hashtable]$Cand) {
    try {
      $psi = New-Object System.Diagnostics.ProcessStartInfo
      $psi.FileName = $Cand.Exe
      $args = @(); if ($Cand.Args) { $args += $Cand.Args }; $args += "--version"
      $psi.Arguments = ($args | ForEach-Object { if ($_ -match "\s") { """$_""" } else { $_ } }) -join " "
      $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
      $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true
      $p = New-Object System.Diagnostics.Process; $p.StartInfo = $psi
      [void]$p.Start()
      if (-not $p.WaitForExit(8000)) { try { $p.Kill() } catch {}; return $false }
      $t = ($p.StandardOutput.ReadToEnd() + $p.StandardError.ReadToEnd()).Trim()
      return ($t -match "Python 3\.(1[1-9]|[2-9]\d)")
    } catch { return $false }
  }
  $list = [System.Collections.Generic.List[object]]::new()
  foreach ($c in @(
    (Join-Path $root ".venv\Scripts\python.exe"),
    (Join-Path $root "venv\Scripts\python.exe"),
    (Join-Path $root "backend\.venv\Scripts\python.exe"),
    (Join-Path $root "backend\venv\Scripts\python.exe")
  )) { if (Test-Path $c) { $list.Add(@{ Exe=$c; Args=@() }) | Out-Null } }
  foreach ($name in @("python","python3")) {
    $p = Get-CommandPath $name
    if ($p) { $list.Add(@{ Exe=$p; Args=@() }) | Out-Null }
  }
  if (Get-CommandPath "py") {
    foreach ($a in @(@("-3.12"),@("-3.11"),@("-3"),@())) {
      $list.Add(@{ Exe="py"; Args=$a }) | Out-Null
    }
  }
  foreach ($cand in $list) { if (_try $cand) { return $cand } }
  if ($list.Count -gt 0) { return $list[0] }
  $null
}

function Invoke-Python {
  param([hashtable]$Py, [string[]]$PyArgs, [int]$TimeoutSec = 120)
  $all = @(); if ($Py.Args) { $all += $Py.Args }; $all += $PyArgs
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $Py.Exe
  $psi.Arguments = ($all | ForEach-Object { if ($_ -match '\s') { '"{0}"' -f ($_ -replace '"','\"') } else { $_ } }) -join ' '
  $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
  $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true; $psi.WorkingDirectory = $root
  $proc = New-Object System.Diagnostics.Process; $proc.StartInfo = $psi
  [void]$proc.Start()
  if (-not $proc.WaitForExit($TimeoutSec * 1000)) { try { $proc.Kill() } catch {}; return @{ ExitCode=-1; StdOut=""; StdErr="timeout" } }
  @{ ExitCode=$proc.ExitCode; StdOut=$proc.StandardOutput.ReadToEnd(); StdErr=$proc.StandardError.ReadToEnd() }
}

function Test-DockerReady {
  if (-not (Get-CommandPath "docker")) { return $false }
  & docker info 1>$null 2>$null
  $LASTEXITCODE -eq 0
}

function Test-BackendImports {
  param([hashtable]$Py)
  $code = "import importlib,sys`nm=['fastapi','uvicorn','motor','pymongo','pydantic','jwt','bcrypt','dotenv','rank_bm25']`nmiss=[]`nfor m in m:`n`n  try: importlib.import_module(m)`n  except Exception as e: miss.append(m+':'+type(e).__name__)`nif miss:`n  print('MISSING:'+','.join(miss)); sys.exit(1)`nprint('OK')"
  $tmp = Join-Path $env:TEMP ("actira_imp_" + [guid]::NewGuid().ToString('N') + ".py")
  try { Set-Content $tmp $code -Encoding UTF8; Invoke-Python -Py $Py -PyArgs @($tmp) -TimeoutSec 60 }
  finally { Remove-Item $tmp -ErrorAction SilentlyContinue }
}

Write-Log ""
Write-Log "ACTIRA self-diagnostic  (Fix=$Fix Deep=$Deep StartMongo=$StartMongo)" "Cyan"
Write-Log "Repo: $root`n"

# --- Toolchain ---
Write-Log "-- Toolchain --" "White"
$node = Get-CommandPath "node"
if ($node) {
  $nv = (& node --version 2>&1 | Out-String).Trim()
  $maj = if ($nv -match 'v?(\d+)') { [int]$Matches[1] } else { 0 }
  if ($maj -ge 18) { Add-Result pass "tool.node" "Node.js" $nv }
  else { Add-Result fail "tool.node" "Node.js" "$nv (need 18+)" "Install Node.js 18+" }
} else { Add-Result fail "tool.node" "Node.js" "not on PATH" "Install Node.js 18+" }

$npmCmd = Get-CommandPath "npm.cmd"
if ($npmCmd) { Add-Result pass "tool.npm" "npm" ((& npm.cmd --version 2>&1 | Out-String).Trim()) }
elseif (Get-CommandPath "npm") { Add-Result pass "tool.npm" "npm" ((& npm --version 2>&1 | Out-String).Trim()) }
else { Add-Result fail "tool.npm" "npm" "not on PATH" "Reinstall Node.js with npm" }

$pyInfo = Resolve-Python
if ($pyInfo) {
  $verOut = Invoke-Python -Py $pyInfo -PyArgs @("--version") -TimeoutSec 15
  $pv = ($verOut.StdOut + $verOut.StdErr).Trim()
  if ($pv -match 'Python 3\.(1[1-9]|[2-9]\d)') { Add-Result pass "tool.python" "Python" "$pv ($($pyInfo.Exe))" }
  else { Add-Result fail "tool.python" "Python" "$pv - need 3.11+" "Install Python 3.12" }
} else { Add-Result fail "tool.python" "Python" "not found" "Install Python 3.11+ or create .venv" }

if (Test-DockerReady) { Add-Result pass "tool.docker" "Docker" "daemon available" }
elseif (Get-CommandPath "docker") { Add-Result warn "tool.docker" "Docker" "daemon not running" "Start Docker Desktop" }
else { Add-Result info "tool.docker" "Docker" "not installed (OK with local Mongo)" }

# --- Python env ---
Write-Log "`n-- Python environment --" "White"
$venvPython = Join-Path $root ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
  if ($Fix -and $pyInfo) {
    Write-Log "Creating .venv ..." "DarkCyan"
    $null = Invoke-Python -Py $pyInfo -PyArgs @("-m","venv",(Join-Path $root ".venv")) -TimeoutSec 120
    if (Test-Path $venvPython) {
      $pyInfo = @{ Exe=$venvPython; Args=@() }
      Add-Result fixed "py.venv" "Python venv" "created .venv"
    } else { Add-Result fail "py.venv" "Python venv" "create failed" "py -3 -m venv .venv" }
  } else { Add-Result warn "py.venv" "Python venv" ".venv missing" ".\scripts\diagnose.ps1 -Fix" }
} else {
  $pyInfo = @{ Exe=$venvPython; Args=@() }
  Add-Result pass "py.venv" "Python venv" $venvPython
}

if ($pyInfo) {
  $imp = Test-BackendImports -Py $pyInfo
  if ($imp.ExitCode -eq 0) { Add-Result pass "py.deps" "Backend packages" "core imports OK" }
  elseif ($Fix) {
    Write-Log "Installing requirements ..." "DarkCyan"
    $null = Invoke-Python -Py $pyInfo -PyArgs @("-m","pip","install","-U","pip") -TimeoutSec 180
    $null = Invoke-Python -Py $pyInfo -PyArgs @("-m","pip","install","-r",(Join-Path $root "backend\requirements.txt")) -TimeoutSec 600
    if (Test-Path (Join-Path $root "requirements-test.txt")) {
      $null = Invoke-Python -Py $pyInfo -PyArgs @("-m","pip","install","-r",(Join-Path $root "requirements-test.txt")) -TimeoutSec 300
    }
    $imp2 = Test-BackendImports -Py $pyInfo
    if ($imp2.ExitCode -eq 0) { Add-Result fixed "py.deps" "Backend packages" "installed from requirements.txt" }
    else { Add-Result fail "py.deps" "Backend packages" (($imp2.StdOut+$imp2.StdErr).Trim()) "pip install -r backend/requirements.txt" }
  } else {
    Add-Result fail "py.deps" "Backend packages" (($imp.StdOut+$imp.StdErr).Trim()) ".\scripts\diagnose.ps1 -Fix"
  }
}

# --- Frontend ---
Write-Log "`n-- Frontend --" "White"
$nm = Join-Path $root "frontend\node_modules"
if (-not (Test-Path (Join-Path $root "frontend\package.json"))) {
  Add-Result fail "fe.pkg" "frontend/package.json" "missing" "Restore from git"
} elseif (Test-Path $nm) {
  Add-Result pass "fe.deps" "Frontend deps" "node_modules present"
} elseif ($Fix -and $npmCmd) {
  Write-Log "npm install ..." "DarkCyan"
  Push-Location (Join-Path $root "frontend")
  try { & npm.cmd install 2>&1 | Out-Null; $code = $LASTEXITCODE } finally { Pop-Location }
  if ((Test-Path $nm) -and $code -eq 0) { Add-Result fixed "fe.deps" "Frontend deps" "npm install completed" }
  else { Add-Result fail "fe.deps" "Frontend deps" "npm install failed" "cd frontend; npm.cmd install" }
} else {
  Add-Result fail "fe.deps" "Frontend deps" "node_modules missing" ".\scripts\diagnose.ps1 -Fix"
}

# --- Config ---
Write-Log "`n-- Configuration --" "White"
$be = Join-Path $root "backend\.env"
$beEx = Join-Path $root "backend\.env.example"
$fe = Join-Path $root "frontend\.env"

if (-not (Test-Path $be)) {
  if ($Fix -and (Test-Path $beEx)) { Copy-Item $beEx $be; Add-Result fixed "cfg.backend" "backend/.env" "created from .env.example" }
  else { Add-Result fail "cfg.backend" "backend/.env" "missing" "Copy-Item backend\.env.example backend\.env" }
} else { Add-Result pass "cfg.backend" "backend/.env" "exists" }

if (Test-Path $be) {
  $mongoUrl = Get-EnvValue $be "MONGO_URL"
  $jwt = Get-EnvValue $be "JWT_SECRET"
  $envName = Get-EnvValue $be "ENV"
  $cors = Get-EnvValue $be "CORS_ORIGINS"
  $provider = Get-EnvValue $be "LLM_PROVIDER"; if (-not $provider) { $provider = "anthropic" }

  if ([string]::IsNullOrWhiteSpace($mongoUrl)) {
    if ($Fix) { Add-Content $be "`nMONGO_URL=mongodb://localhost:27017"; Add-Result fixed "cfg.mongo" "MONGO_URL" "set default" }
    else { Add-Result fail "cfg.mongo" "MONGO_URL" "empty" "Set MONGO_URL in backend/.env" }
  } else { Add-Result pass "cfg.mongo" "MONGO_URL" "configured" }

  $weak = [string]::IsNullOrWhiteSpace($jwt) -or $jwt -match 'generate-a-32' -or $jwt.Length -lt 16
  if ($weak) {
    $lab = $envName -in @("dev","test","local",$null,"")
    if ($Fix -and $lab) {
      $bytes = New-Object byte[] 48
      [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
      $newJwt = [Convert]::ToBase64String($bytes)
      $content = Get-Content $be -Raw
      if ($content -match '(?m)^\s*JWT_SECRET\s*=') {
        $content = [regex]::Replace($content, '(?m)^\s*JWT_SECRET\s*=.*$', "JWT_SECRET=$newJwt")
      } else { $content = $content.TrimEnd() + "`r`nJWT_SECRET=$newJwt`r`n" }
      Set-Content $be $content -Encoding UTF8 -NoNewline
      Add-Result fixed "cfg.jwt" "JWT_SECRET" "generated lab secret"
    } else {
      $sev = if ($envName -in @("production","staging")) { "fail" } else { "warn" }
      Add-Result $sev "cfg.jwt" "JWT_SECRET" "weak/placeholder" "Set long JWT_SECRET (or -Fix in lab)"
    }
  } else { Add-Result pass "cfg.jwt" "JWT_SECRET" "set ($($jwt.Length) chars)" }

  if ($cors) { Add-Result pass "cfg.cors" "CORS_ORIGINS" $cors }
  else { Add-Result warn "cfg.cors" "CORS_ORIGINS" "empty" "Include http://localhost:3000" }

  $keyMap = @{ anthropic="ANTHROPIC_API_KEY"; openai="OPENAI_API_KEY"; gemini="GEMINI_API_KEY"; groq="GROQ_API_KEY" }
  $keyName = $keyMap[$provider.ToLower()]; if (-not $keyName) { $keyName = "ANTHROPIC_API_KEY" }
  $llmKey = Get-EnvValue $be $keyName
  if ([string]::IsNullOrWhiteSpace($llmKey)) {
    Add-Result warn "cfg.llm" "LLM key ($provider)" "empty - templates may be used" "Set key in .env or Admin Settings"
  } else { Add-Result pass "cfg.llm" "LLM key ($provider)" "present" }
}

if (-not (Test-Path $fe)) {
  if ($Fix) {
    Set-Content $fe "REACT_APP_BACKEND_URL=http://localhost:8001`r`n" -Encoding UTF8
    Add-Result fixed "cfg.frontend" "frontend/.env" "created"
  } else { Add-Result fail "cfg.frontend" "frontend/.env" "missing" "Copy frontend\.env.example frontend\.env" }
} else {
  $beUrl = Get-EnvValue $fe "REACT_APP_BACKEND_URL"
  if ([string]::IsNullOrWhiteSpace($beUrl)) {
    if ($Fix) { Add-Content $fe "`nREACT_APP_BACKEND_URL=http://localhost:8001"; Add-Result fixed "cfg.frontend" "REACT_APP_BACKEND_URL" "set" }
    else { Add-Result fail "cfg.frontend" "REACT_APP_BACKEND_URL" "empty" "Set REACT_APP_BACKEND_URL" }
  } elseif ($beUrl -match '/api/?$') {
    Add-Result warn "cfg.frontend" "REACT_APP_BACKEND_URL" "$beUrl (do not append /api)" "Client adds /api"
  } else { Add-Result pass "cfg.frontend" "REACT_APP_BACKEND_URL" $beUrl }
}

# --- Ports ---
Write-Log "`n-- Ports & services --" "White"
$mongoUp = Test-ListeningPort 27017
if ($mongoUp) { Add-Result pass "svc.mongo" "MongoDB :27017" "listening" }
elseif ($Fix -and $StartMongo -and (Test-DockerReady)) {
  Write-Log "docker compose up -d mongodb ..." "DarkCyan"
  Push-Location $root; try { & docker compose up -d mongodb 2>&1 | Out-Null } finally { Pop-Location }
  $ready = $false
  for ($i=0; $i -lt 30; $i++) { Start-Sleep 2; if (Test-ListeningPort 27017) { $ready=$true; break } }
  if ($ready) { Add-Result fixed "svc.mongo" "MongoDB :27017" "started via compose"; $mongoUp = $true }
  else { Add-Result fail "svc.mongo" "MongoDB :27017" "not ready" "docker compose logs mongodb" }
} else {
  Add-Result fail "svc.mongo" "MongoDB :27017" "not listening" "docker compose up -d mongodb  OR  -Fix -StartMongo"
}

$apiUp = Test-ListeningPort 8001
if ($apiUp) {
  Add-Result pass "svc.api.port" "Backend :8001" "listening"
  try {
    $h = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:8001/api/health" -TimeoutSec 5
    if ($h.StatusCode -eq 200) { Add-Result pass "svc.api.health" "GET /api/health" "HTTP 200" }
    else { Add-Result fail "svc.api.health" "GET /api/health" "HTTP $($h.StatusCode)" "Check logs" }
  } catch {
    Add-Result fail "svc.api.health" "GET /api/health" $_.Exception.Message "Check Mongo + uvicorn logs"
  }
} else {
  Add-Result warn "svc.api.port" "Backend :8001" "not listening" ".\scripts\start-demo.ps1  OR  uvicorn server:app --port 8001"
}

$uiUp = Test-ListeningPort 3000
if ($uiUp) { Add-Result pass "svc.ui" "Frontend :3000" "listening" }
else { Add-Result warn "svc.ui" "Frontend :3000" "not listening" "cd frontend; npm.cmd start" }

# --- Deep ---
if ($Deep -and $pyInfo) {
  Write-Log "`n-- Deep checks --" "White"
  $bad = @()
  foreach ($m in @("server.py","models.py","pipeline.py","auth.py","playbook_agent.py","hitl_gate.py")) {
    $p = Join-Path $root "backend\$m"
    if (-not (Test-Path $p)) { continue }
    $c = Invoke-Python -Py $pyInfo -PyArgs @("-m","py_compile",$p) -TimeoutSec 30
    if ($c.ExitCode -ne 0) { $bad += $m }
  }
  if ($bad.Count -eq 0) { Add-Result pass "deep.compile" "Python key modules" "compile OK" }
  else { Add-Result fail "deep.compile" "Python compile" ("failed: "+($bad -join ", ")) "Fix syntax" }

  $smoke = Join-Path $root "backend\tests\test_hardening.py"
  if (Test-Path $smoke) {
    Write-Log "Smoke pytest ..." "DarkCyan"
    $env:FORCE_MOCK_TI = "true"; $env:ENV = "test"
    $pt = Invoke-Python -Py $pyInfo -PyArgs @("-m","pytest",$smoke,"-q","-n","0","--tb=line") -TimeoutSec 180
    if ($pt.ExitCode -eq 0) { Add-Result pass "deep.pytest" "Smoke tests" "passed" }
    else {
      $tail = (($pt.StdOut+"`n"+$pt.StdErr).Trim() -split "`n" | Select-Object -Last 6) -join " | "
      Add-Result fail "deep.pytest" "Smoke tests" $tail "pytest backend/tests/test_hardening.py -q -n 0"
    }
  }
}

# --- Summary ---
Write-Log "`n============================================================" "Cyan"
Write-Log ("Summary:  {0} passed  |  {1} fixed  |  {2} warnings  |  {3} failed" -f $script:passed,$script:fixed,$script:warned,$script:failed) "White"

if ($script:failed -eq 0) {
  Write-Log "Result: healthy enough to run." "Green"
  if (-not $apiUp) { Write-Log "  Next: .\scripts\start-demo.ps1" "Gray" }
  Write-Log "  UI http://localhost:3000  |  API http://localhost:8001/docs" "Gray"
  Write-Log "  Demo: analyst@soc.example.com / Analyst123!" "Gray"
} else {
  Write-Log "Result: $($script:failed) issue(s) need attention." "Yellow"
  $script:results | Where-Object { $_.status -eq "fail" } | ForEach-Object {
    Write-Log ("  * [{0}] {1}" -f $_.id, $_.name) "Red"
    if ($_.fix) { Write-Log ("      {0}" -f $_.fix) "Yellow" }
  }
  if (-not $Fix) {
    Write-Log "`nTip: .\scripts\diagnose.ps1 -Fix" "Cyan"
    Write-Log "     .\scripts\diagnose.ps1 -Fix -StartMongo" "Cyan"
    Write-Log "     .\scripts\diagnose.ps1 -Fix -Deep" "Cyan"
  }
}

if ($Json) {
  [pscustomobject]@{
    repo=$root; fixMode=[bool]$Fix; deep=[bool]$Deep
    passed=$script:passed; fixed=$script:fixed; warnings=$script:warned; failed=$script:failed
    results=$script:results
  } | ConvertTo-Json -Depth 6
}

if ($script:failed -gt 0) { exit 1 }
exit 0

