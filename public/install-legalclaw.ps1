# LegalClaw desktop installer (Windows 10/11).
#
# Installs the LegalClaw skills bundle into your local Hermes Agent home
# (the same Hermes that Hermes Desktop uses). Requires a personal activation
# key from https://cpaautomation.ai/dashboard/activation.
#
# Usage:
#   $env:CPAA_ACTIVATION_KEY="cpaa_live_..."; iwr https://cpaautomation.ai/install-legalclaw.ps1 -UseBasicParsing | iex
#   # or download and run:
#   .\install-legalclaw.ps1 -Key cpaa_live_... [-Force]
#
# Environment overrides:
#   CPAA_ACTIVATION_KEY  your personal activation key (or pass via -Key)
#   CPAA_API_BASE        activation API base (default https://api.cpaautomation.ai)
#   HERMES_HOME          Hermes home directory (default %LOCALAPPDATA%\hermes)

param(
    [string]$Key,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$ApiBase = if ($env:CPAA_API_BASE) { $env:CPAA_API_BASE } else { "https://api.cpaautomation.ai" }
$HermesHome = if ($env:HERMES_HOME) { $env:HERMES_HOME } else { Join-Path $env:LOCALAPPDATA "hermes" }
$MarkerFile = Join-Path $HermesHome ".cpaa\legalclaw-installed"
$HermesDesktopUrl = "https://hermes-agent.nousresearch.com/desktop"

# 1. Hermes must already be installed (Hermes Desktop or CLI).
if (-not (Test-Path $HermesHome) -and -not (Get-Command hermes -ErrorAction SilentlyContinue)) {
    Write-Host "Hermes Agent not found (looked for $HermesHome and the hermes command)."
    Write-Host ""
    Write-Host "Install Hermes Desktop first: $HermesDesktopUrl"
    Write-Host "Then re-run this installer."
    exit 64
}

New-Item -ItemType Directory -Force -Path (Join-Path $HermesHome ".cpaa") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $HermesHome "skills") | Out-Null

# 2. Idempotency: skip if already installed unless -Force.
if ((Test-Path $MarkerFile) -and -not $Force) {
    $ConfigFile = Join-Path $HermesHome "config.yaml"
    if ((Test-Path $ConfigFile) -and (Select-String -Path $ConfigFile -SimpleMatch "# >>> cpaa-connector >>>" -Quiet)) {
        Write-Host "LegalClaw is already installed (marker: $MarkerFile)."
        Write-Host "Re-run with -Force to reinstall."
        exit 0
    }
    Write-Host "Updating LegalClaw to enable CPAAutomation integrations."
}

# 3. Activation key from -Key, env, or interactive prompt.
if (-not $Key) { $Key = $env:CPAA_ACTIVATION_KEY }
if (-not $Key) { $Key = Read-Host "Enter your LegalClaw activation key (cpaa_live_...)" }
if (-not $Key) {
    Write-Host "Activation key required."
    Write-Host "Get yours at https://cpaautomation.ai/dashboard/activation."
    exit 64
}

$TmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ("cpaa-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $TmpDir | Out-Null

try {
    # 4. Exchange the activation key for a short-lived signed bundle URL.
    $Fingerprint = $env:COMPUTERNAME
    if (-not $Fingerprint) { $Fingerprint = "unknown" }
    $Payload = @{
        activation_key = $Key
        fingerprint    = $Fingerprint
        install_type   = "desktop"
        product        = "legalclaw"
    } | ConvertTo-Json

    Write-Host "Activating with $ApiBase ..."
    try {
        $Response = Invoke-RestMethod -Method Post -Uri "$ApiBase/api/activation/bundle" `
            -ContentType "application/json" -Body $Payload -UseBasicParsing
    }
    catch {
        Write-Host "Activation failed: invalid/revoked key, or the activation server is unreachable."
        Write-Host "Check your key at https://cpaautomation.ai/dashboard/activation and try again."
        exit 77
    }

    if (-not $Response.bundle_url) {
        Write-Host "Activation failed: no bundle URL returned."
        exit 77
    }

    # 5. Download and verify the bundle.
    Write-Host "Downloading the LegalClaw bundle ..."
    $BundlePath = Join-Path $TmpDir "legalclaw-profile.tar.gz"
    Invoke-WebRequest -Uri $Response.bundle_url -OutFile $BundlePath -UseBasicParsing

    if ($Response.sha256) {
        $ActualSha = (Get-FileHash -Path $BundlePath -Algorithm SHA256).Hash.ToLower()
        if ($ActualSha -ne $Response.sha256.ToLower()) {
            Write-Host "Checksum mismatch: expected $($Response.sha256), got $ActualSha. Aborting."
            exit 65
        }
    }

    # 6. Back up any existing top-level files the bundle would overwrite.
    $Ts = (Get-Date).ToUniversalTime().ToString("yyyyMMddHHmmss")
    foreach ($f in @("config.yaml", "SOUL.md", "distribution.yaml")) {
        $Existing = Join-Path $HermesHome $f
        if (Test-Path $Existing) {
            Copy-Item $Existing "$Existing.backup-$Ts"
            Write-Host "Backed up existing $f to $f.backup-$Ts"
        }
    }

    # 7. Install into the Hermes home (tar.exe ships with Windows 10 1803+).
    tar.exe -xzf $BundlePath -C $HermesHome
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to extract the bundle (tar exit code $LASTEXITCODE)."
        exit 65
    }

    # Give Hermes live access to this user's CPAAutomation integrations.
    if ($Response.connector_mcp_url -and $Response.connector_token) {
        $ConfigPath = Join-Path $HermesHome "config.yaml"
        $Config = if (Test-Path $ConfigPath) { [System.IO.File]::ReadAllText($ConfigPath) } else { "" }
        $ManagedPattern = '(?ms)^# >>> cpaa-connector >>>\r?\n.*?^# <<< cpaa-connector <<<\r?\n?'
        $Config = [regex]::Replace($Config, $ManagedPattern, "")
        $ManagedBlock = @"
# >>> cpaa-connector >>>
# Managed by the LegalClaw desktop installer; do not edit.
mcp_servers:
  cpaa-connector:
    url: "$($Response.connector_mcp_url)"
    headers:
      Authorization: "Bearer $($Response.connector_token)"
# <<< cpaa-connector <<<
"@
        $Config = $Config.TrimEnd("`r", "`n") + "`r`n`r`n" + $ManagedBlock.Trim() + "`r`n"
        [System.IO.File]::WriteAllText($ConfigPath, $Config, (New-Object System.Text.UTF8Encoding($false)))
        Write-Host "CPAAutomation integrations enabled."
    }
    else {
        Write-Host "CPAAutomation integrations are temporarily unavailable; the skills were still installed."
    }

    (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ") | Set-Content -Path $MarkerFile

    Write-Host ""
    Write-Host "LegalClaw installed into $HermesHome."
    Write-Host "Next steps:"
    Write-Host "  1. Launch Hermes Desktop."
    Write-Host "  2. Open the Skills pane - the LegalClaw skills are ready to use."
    Write-Host "  3. CLI check: hermes skills list"
}
finally {
    Remove-Item -Recurse -Force $TmpDir -ErrorAction SilentlyContinue
}
