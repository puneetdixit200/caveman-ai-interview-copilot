param(
  [string]$SigningKeyPath = "$env:USERPROFILE\.tauri\caveman-ai-interview-copilot.key",
  [string]$SigningKeyPassword = $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD,
  [string]$ReleaseBaseUrl = "https://github.com/puneetdixit200/caveman-ai-interview-copilot/releases/latest/download",
  [string]$LatestJsonPath = "",
  [string]$ReleaseNotes = "Caveman signed desktop update."
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$BuildConfigPath = "src-tauri/tauri.release.conf.json"

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
  $WindowsCodeSignThumbprint = $env:WINDOWS_CODESIGN_CERTIFICATE_THUMBPRINT
  $WindowsCodeSignCommand = $env:WINDOWS_CODESIGN_SIGN_COMMAND
  if (-not [string]::IsNullOrWhiteSpace($WindowsCodeSignThumbprint) -or -not [string]::IsNullOrWhiteSpace($WindowsCodeSignCommand)) {
    $WindowsBundleConfig = @{
      digestAlgorithm = "sha256"
      timestampUrl = if ([string]::IsNullOrWhiteSpace($env:WINDOWS_CODESIGN_TIMESTAMP_URL)) {
        "http://timestamp.digicert.com"
      }
      else {
        $env:WINDOWS_CODESIGN_TIMESTAMP_URL
      }
    }

    if (-not [string]::IsNullOrWhiteSpace($WindowsCodeSignThumbprint)) {
      $WindowsBundleConfig.certificateThumbprint = $WindowsCodeSignThumbprint
    }

    if (-not [string]::IsNullOrWhiteSpace($WindowsCodeSignCommand)) {
      $WindowsBundleConfig.signCommand = $WindowsCodeSignCommand
    }

    $GeneratedReleaseConfig = @{
      bundle = @{
        createUpdaterArtifacts = $true
        windows = $WindowsBundleConfig
      }
    }
    $GeneratedConfigPath = Join-Path $RepoRoot "src-tauri\target\tauri.release.generated.conf.json"
    New-Item -ItemType Directory -Force -Path (Split-Path $GeneratedConfigPath) | Out-Null
    $GeneratedReleaseConfig | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $GeneratedConfigPath -Encoding UTF8
    $BuildConfigPath = $GeneratedConfigPath
  }

  $SidecarConfigPath = Join-Path $RepoRoot "src-tauri\target\tauri.release.sidecars.generated.conf.json"
  node "scripts/prepare-whisper-sidecars.mjs" "--target" "current" "--base-config" $BuildConfigPath "--output-config" $SidecarConfigPath
  $BuildConfigPath = $SidecarConfigPath

  npm run tauri build -- --ci --config $BuildConfigPath

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
