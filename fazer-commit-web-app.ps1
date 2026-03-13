# Rode este script na raiz do projeto "Precifica certo" (Terminal do Cursor).
# Faz: commit em web-app -> commit em web-app-merge -> commit na raiz (incluindo src).

$ErrorActionPreference = "Stop"
$root = Get-Location

Write-Host "1/3 Committando em web-app..." -ForegroundColor Cyan
Set-Location (Join-Path $root "web-app")
git add .
$status = git status --short
if ($status) {
    git commit -m "chore: recurrence, recalc and expense config updates"
} else {
    Write-Host "   Nada para commitar em web-app (working tree limpo)." -ForegroundColor Yellow
}
Set-Location $root

Write-Host "2/3 Committando em web-app-merge..." -ForegroundColor Cyan
Set-Location (Join-Path $root "web-app-merge")
git add .
$status = git status --short
if ($status) {
    git commit -m "chore: recurrence options and generation logic"
} else {
    Write-Host "   Nada para commitar em web-app-merge (working tree limpo)." -ForegroundColor Yellow
}
Set-Location $root

Write-Host "3/3 Committando na raiz (web-app, web-app-merge, src)..." -ForegroundColor Cyan
git add web-app web-app-merge src
git add .
git status
git commit -m "feat: fluxo recorrência, recalc 12 meses, pricing-engine e merge de impostos"

Write-Host "Concluído." -ForegroundColor Green
