#!/usr/bin/env bash
# LegalClaw desktop installer (macOS / Linux).
#
# Installs the LegalClaw skills bundle into your local Hermes Agent home
# (the same Hermes that Hermes Desktop uses). Requires a personal activation
# key from https://cpaautomation.ai/dashboard/activation.
#
# Usage:
#   curl -fsSL https://cpaautomation.ai/install-legalclaw.sh | CPAA_ACTIVATION_KEY="cpaa_live_..." bash
#   # or download and run:
#   bash install-legalclaw.sh [--force] [cpaa_live_...]
#
# Environment overrides:
#   CPAA_ACTIVATION_KEY  your personal activation key (or pass as the first argument)
#   CPAA_API_BASE        activation API base (default https://api.cpaautomation.ai)
#   HERMES_HOME          Hermes home directory (default ~/.hermes)

set -euo pipefail

API_BASE="${CPAA_API_BASE:-https://api.cpaautomation.ai}"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
MARKER_FILE="$HERMES_HOME/.cpaa/legalclaw-installed"
HERMES_DESKTOP_URL="https://hermes-agent.nousresearch.com/desktop"

FORCE=false
if [ "${1:-}" = "--force" ]; then
  FORCE=true
  shift
fi

# 1. Hermes must already be installed (Hermes Desktop or CLI).
if [ ! -d "$HERMES_HOME" ] && ! command -v hermes >/dev/null 2>&1; then
  echo "Hermes Agent not found (looked for $HERMES_HOME and the hermes command)."
  echo
  echo "Install Hermes Desktop first: $HERMES_DESKTOP_URL"
  echo "  macOS/Windows: download the installer from the page above."
  echo "  Linux (CLI):   curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash"
  echo
  echo "Then re-run this installer."
  exit 64
fi

mkdir -p "$HERMES_HOME/.cpaa" "$HERMES_HOME/skills"

# 2. Idempotency: skip if already installed unless --force.
if [ -s "$MARKER_FILE" ] && [ "$FORCE" != true ]; then
  if grep -q '^# >>> cpaa-connector >>>$' "$HERMES_HOME/config.yaml" 2>/dev/null; then
    echo "LegalClaw is already installed (marker: $MARKER_FILE)."
    echo "Re-run with --force to reinstall."
    exit 0
  fi
  echo "Updating LegalClaw to enable CPAAutomation platform and integration access."
fi

# 3. Activation key from env, first argument, or interactive prompt.
KEY="${CPAA_ACTIVATION_KEY:-${1:-}}"
if [ -z "$KEY" ]; then
  if [ -t 0 ]; then
    read -r -p "Enter your LegalClaw activation key (cpaa_live_...): " KEY
  fi
fi
if [ -z "$KEY" ]; then
  echo "Activation key required."
  echo "Get yours at https://cpaautomation.ai/dashboard/activation, then run:"
  echo "  CPAA_ACTIVATION_KEY=\"cpaa_live_...\" bash install-legalclaw.sh"
  exit 64
fi

tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

# Minimal JSON field extractor: python3 when available (macOS + most Linux),
# sed fallback otherwise. Avoids requiring jq on end-user machines.
json_field() {
  local field="$1"
  if command -v python3 >/dev/null 2>&1; then
    python3 -c "import json,sys; v=json.load(sys.stdin).get('$field'); print(v if v is not None else '')" 2>/dev/null
  else
    sed -n "s/.*\"$field\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" | head -n 1
  fi
}

# 4. Exchange the activation key for a short-lived signed bundle URL.
fingerprint="$(hostname 2>/dev/null || echo unknown)"
payload="{\"activation_key\":\"$KEY\",\"fingerprint\":\"$fingerprint\",\"install_type\":\"desktop\",\"product\":\"legalclaw\"}"

echo "Activating with $API_BASE ..."
if ! response="$(curl -fsS -X POST "$API_BASE/api/activation/bundle" \
    -H 'Content-Type: application/json' \
    --data "$payload")"; then
  echo "Activation failed: invalid/revoked key, or the activation server is unreachable."
  echo "Check your key at https://cpaautomation.ai/dashboard/activation and try again."
  exit 77
fi

bundle_url="$(printf '%s' "$response" | json_field bundle_url)"
expected_sha="$(printf '%s' "$response" | json_field sha256)"
connector_url="$(printf '%s' "$response" | json_field connector_mcp_url)"
connector_token="$(printf '%s' "$response" | json_field connector_token)"
if [ -z "$bundle_url" ]; then
  echo "Activation failed: no bundle URL returned."
  exit 77
fi

# 5. Download and verify the bundle.
echo "Downloading the LegalClaw bundle ..."
curl -fsSL "$bundle_url" -o "$tmp_dir/legalclaw-profile.tar.gz"

if [ -n "$expected_sha" ]; then
  if command -v sha256sum >/dev/null 2>&1; then
    actual_sha="$(sha256sum "$tmp_dir/legalclaw-profile.tar.gz" | awk '{print $1}')"
  else
    actual_sha="$(shasum -a 256 "$tmp_dir/legalclaw-profile.tar.gz" | awk '{print $1}')"
  fi
  if [ "$actual_sha" != "$expected_sha" ]; then
    echo "Checksum mismatch: expected $expected_sha, got $actual_sha. Aborting."
    exit 65
  fi
fi

tar -tzf "$tmp_dir/legalclaw-profile.tar.gz" >/dev/null

# 6. Back up any existing top-level files the bundle would overwrite.
ts="$(date -u +%Y%m%d%H%M%S)"
for f in config.yaml SOUL.md distribution.yaml; do
  if [ -f "$HERMES_HOME/$f" ]; then
    cp "$HERMES_HOME/$f" "$HERMES_HOME/$f.backup-$ts"
    echo "Backed up existing $f to $f.backup-$ts"
  fi
done

# 7. Install into the Hermes home (same layout the Docker image installs into /opt/data).
tar -xzf "$tmp_dir/legalclaw-profile.tar.gz" -C "$HERMES_HOME"

# The bundle's config.yaml is the Docker profile config (runtime.data_dir:
# /opt/data); on desktop the Hermes app's own config.yaml is authoritative.
# Restore it so the connector block below is the only config change.
if [ -f "$HERMES_HOME/config.yaml.backup-$ts" ]; then
  cp "$HERMES_HOME/config.yaml.backup-$ts" "$HERMES_HOME/config.yaml"
fi

# Give Hermes live access to this user's CPAAutomation platform and integrations.
if [ -n "$connector_url" ] && [ -n "$connector_token" ]; then
  config_file="$HERMES_HOME/config.yaml"
  if [ -f "$config_file" ]; then
    awk '/# >>> cpaa-connector >>>/{skip=1; next} /# <<< cpaa-connector <<</{skip=0; next} !skip' \
      "$config_file" > "$config_file.tmp" && mv "$config_file.tmp" "$config_file"
  fi
  cat >> "$config_file" <<EOF
# >>> cpaa-connector >>>
# Managed by the LegalClaw desktop installer; do not edit.
mcp_servers:
  cpaa-connector:
    url: "$connector_url"
    headers:
      Authorization: "Bearer $connector_token"
# <<< cpaa-connector <<<
EOF
  chmod 600 "$config_file"
  echo "CPAAutomation platform and integrations enabled."
else
  echo "CPAAutomation platform and integrations are temporarily unavailable; the skills were still installed."
fi

date -u +%Y-%m-%dT%H:%M:%SZ > "$MARKER_FILE"

echo
echo "LegalClaw installed into $HERMES_HOME."
echo "Next steps:"
echo "  1. Launch Hermes Desktop (or run: hermes desktop)."
echo "  2. Open the Skills pane — the LegalClaw skills are ready to use."
echo "  3. CLI check: hermes skills list"
