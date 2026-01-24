# Build script for Increlution Automation Editor
# Usage: .\build.ps1 [-Environment <Production|Staging|Red|Green>]

param(
    [ValidateSet("Production", "Staging", "Red", "Green")]
    [string]$Environment = "Production"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Building for $Environment ===" -ForegroundColor Cyan

# Build frontend
Write-Host "`nBuilding frontend..." -ForegroundColor Yellow
Push-Location frontend

if ($Environment -eq "Staging") {
    npm run build:staging
} else {
    npm run build
}

if ($LASTEXITCODE -ne 0) {
    Pop-Location
    Write-Host "Frontend build failed!" -ForegroundColor Red
    exit 1
}
Pop-Location

# Publish backend
Write-Host "`nPublishing backend..." -ForegroundColor Yellow
Push-Location backend
dotnet publish IncrelutionAutomationEditor.Api.csproj -c Release -r linux-x64 --self-contained false -o ../publish

if ($LASTEXITCODE -ne 0) {
    Pop-Location
    Write-Host "Backend publish failed!" -ForegroundColor Red
    exit 1
}
Pop-Location

Write-Host "`n=== Build Complete ===" -ForegroundColor Green
Write-Host "Output: ./publish"
Write-Host "`nTo deploy, upload the publish folder to your server and run:"
Write-Host "  ./deploy.sh $($Environment.ToLower())" -ForegroundColor Cyan
