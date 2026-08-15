$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$localUrl = "http://localhost:3000"

function Stop-WithMessage([string]$message) {
  Write-Host ""
  Write-Host $message -ForegroundColor Red
  Write-Host ""
  Write-Host "Please send a screenshot of this window to Codex." -ForegroundColor Yellow
  exit 1
}

Write-Host "CineGen One-click Launcher" -ForegroundColor Cyan
Write-Host "Project: $projectRoot"

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
  Stop-WithMessage "Node.js was not found. Install Node.js LTS and try again."
}

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  Stop-WithMessage "npm was not found. Reinstall Node.js LTS and try again."
}

Set-Location -LiteralPath $projectRoot

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "node_modules"))) {
  Write-Host "First launch: installing project dependencies. Please wait..." -ForegroundColor Yellow
  & npm.cmd install
  if ($LASTEXITCODE -ne 0) {
    Stop-WithMessage "Project dependency installation failed."
  }
}

$command = "title CineGen Local Service && cd /d `"$projectRoot`" && npm run dev:local"
Start-Process -FilePath "cmd.exe" -ArgumentList "/k", $command | Out-Null

Write-Host "Starting the local AI service..." -ForegroundColor Yellow
$ready = $false
for ($attempt = 1; $attempt -le 60; $attempt++) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $localUrl -TimeoutSec 2
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
      $ready = $true
      break
    }
  } catch {
    Start-Sleep -Seconds 1
  }
}

if (-not $ready) {
  Stop-WithMessage "CineGen did not start within 60 seconds. Check the CineGen Local Service window for details."
}

Write-Host "CineGen is ready. Opening $localUrl" -ForegroundColor Green
Start-Process $localUrl
