param(
  [string]$SigningKeyPath = "$env:USERPROFILE\.tauri\caveman-ai-interview-copilot.key"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $SigningKeyPath)) {
  throw "Missing Tauri signing key at $SigningKeyPath. Run: npm run tauri signer generate -- --write-keys $SigningKeyPath"
}

$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw -LiteralPath $SigningKeyPath
npm run tauri build -- --ci --config src-tauri/tauri.release.conf.json
