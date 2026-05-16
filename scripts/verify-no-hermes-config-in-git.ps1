# Fail if Hermes local config is tracked or present in any commit on current branch.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$tracked = git ls-files "**/.hermes/**" "src-tauri/~/**" 2>$null
if ($tracked) {
    Write-Error "Tracked Hermes paths found:`n$($tracked -join "`n")"
}

$history = git log --oneline HEAD -- "src-tauri/~/.hermes/config.yaml" 2>$null
if ($history) {
    Write-Error "Git history still references src-tauri/~/.hermes/config.yaml:`n$history"
}

Write-Host "OK: no Hermes config in index or branch history."
