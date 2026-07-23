# CollabFlow dev launcher — runs API (port 5000) and UI (port 5173) in parallel
# Usage: .\dev.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

# Verify .env files exist
if (-not (Test-Path "$root\server\.env")) {
    Write-Host "[WARN] server/.env not found. Copy server/.env.example and fill in your values." -ForegroundColor Yellow
}
if (-not (Test-Path "$root\client\.env")) {
    Write-Host "[WARN] client/.env not found. Copy client/.env.example and fill in your values." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  Starting CollabFlow dev environment..." -ForegroundColor Cyan
Write-Host "  API  -> http://localhost:5000" -ForegroundColor Blue
Write-Host "  UI   -> http://localhost:5173" -ForegroundColor Green
Write-Host ""
Write-Host "  Press Ctrl+C to stop both servers." -ForegroundColor Gray
Write-Host ""

Set-Location $root
npm run dev
