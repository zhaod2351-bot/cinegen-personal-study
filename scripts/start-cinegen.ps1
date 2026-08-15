$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$localUrl = "http://localhost:3000"
$sessionUrl = "http://127.0.0.1:3000/api/session"

function Stop-WithMessage([string]$message) {
  Write-Host ""
  Write-Host $message -ForegroundColor Red
  Write-Host ""
  Write-Host "Please send a screenshot of this window to Codex." -ForegroundColor Yellow
  exit 1
}

function Test-CineGenReady {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $sessionUrl -TimeoutSec 2
    if ($response.StatusCode -ne 200) { return $false }
    $session = $response.Content | ConvertFrom-Json
    return ($session.token -is [string] -and $session.token.Length -gt 0)
  } catch {
    return $false
  }
}

function Open-CineGen {
  try {
    # Explorer reliably hands HTTP URLs to the user's default browser, including
    # when this launcher was started from an elevated command window.
    Start-Process -FilePath "explorer.exe" -ArgumentList $localUrl
  } catch {
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "start", "", $localUrl -WindowStyle Hidden
  }
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

if (Test-CineGenReady) {
  Write-Host "CineGen is already running. Opening $localUrl" -ForegroundColor Green
  Open-CineGen
  exit 0
}

$command = "title CineGen Local Service && cd /d `"$projectRoot`" && npm run dev:local"
Start-Process -FilePath "cmd.exe" -ArgumentList "/k", $command | Out-Null

Write-Host "Starting the local AI service..." -ForegroundColor Yellow
$ready = $false
for ($attempt = 1; $attempt -le 60; $attempt++) {
  if (Test-CineGenReady) {
    $ready = $true
    break
  }
  Start-Sleep -Seconds 1
}

if (-not $ready) {
  Stop-WithMessage "CineGen did not start within 60 seconds. Check the CineGen Local Service window for details."
}

Write-Host "CineGen is ready. Opening $localUrl" -ForegroundColor Green
Open-CineGen
