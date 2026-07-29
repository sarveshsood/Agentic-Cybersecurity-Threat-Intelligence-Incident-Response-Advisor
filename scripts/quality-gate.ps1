# ACTIRA quality gate: smoke → functional → security
# Usage: .\scripts\quality-gate.ps1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

function Invoke-Step([string]$Name, [scriptblock]$Block) {
    Write-Host "`n==> $Name" -ForegroundColor Cyan
    & $Block
    if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
        throw "Step failed: $Name (exit $LASTEXITCODE)"
    }
}

$py = if (Get-Command python -ErrorAction SilentlyContinue) { "python" } else { "py" }
$env:PYTHONPATH = $Root

Invoke-Step "Smoke" {
    Push-Location backend
    & $py -m pytest tests/test_model_management_queue.py tests/test_ops_status.py tests/test_secret_vault_auth_residuals.py -n 0 -q --tb=line
    Pop-Location
}

Invoke-Step "Functional (backend unit, no live LLM)" {
    Push-Location backend
    & $py -m pytest tests -n 0 `
        -m "not integration and not e2e and not performance and not requires_llm and not security" `
        -q --tb=line
    Pop-Location
}

Invoke-Step "Security" {
    & $py -m pytest -c pytest.ini tests/security -n 0 -q --tb=line
}

Write-Host "`n==> Quality gate complete" -ForegroundColor Green
