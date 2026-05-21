param(
  [string]$SigningKeyPath = "$env:USERPROFILE\.tauri\caveman-ai-interview-copilot.key",
  [string]$SigningKeyPassword = $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD,
  [string]$ReleaseBaseUrl = "https://github.com/puneetdixit200/caveman-ai-interview-copilot/releases/latest/download",
  [string]$LatestJsonPath = "",
  [string]$ReleaseNotes = "Caveman signed desktop update."
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

if ([string]::IsNullOrWhiteSpace($env:TAURI_SIGNING_PRIVATE_KEY)) {
  if (-not (Test-Path -LiteralPath $SigningKeyPath)) {
    throw "Missing Tauri signing key at $SigningKeyPath. Run: npm run tauri signer generate -- -w $SigningKeyPath or set TAURI_SIGNING_PRIVATE_KEY."
  }

  $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw -LiteralPath $SigningKeyPath
}

if ($SigningKeyPassword) {
  $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $SigningKeyPassword
}

Push-Location $RepoRoot
try {
  npm run tauri build -- --ci --config src-tauri/tauri.release.conf.json

  $ManifestArgs = @(
    "scripts/generate-latest-json.mjs",
    "--base-url",
    $ReleaseBaseUrl,
    "--notes",
    $ReleaseNotes
  )
  if ($LatestJsonPath) {
    $ManifestArgs += @("--output", $LatestJsonPath)
  }

  node @ManifestArgs
}
finally {
  Pop-Location
}
