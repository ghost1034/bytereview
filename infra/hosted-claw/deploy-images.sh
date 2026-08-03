#!/usr/bin/env bash
# Runs on the Hosted Claw worker. Invoked by build-hosted-claw-images.sh.

set -euo pipefail

if [ "$#" -ne 6 ]; then
  echo "Usage: $0 RELEASE_TAG SUPERVISOR_IMAGE ACCOUNTING_IMAGE LEGAL_IMAGE PROXY_IMAGE DRAIN_TIMEOUT" >&2
  exit 2
fi

release_tag="$1"
supervisor_image="$2"
accounting_image="$3"
legal_image="$4"
proxy_image="$5"
drain_timeout="$6"
env_file="${HOSTED_CLAW_ENV_FILE:-/etc/hosted-claw/worker.env}"
control_root="${HOSTED_CLAW_CONTROL_ROOT:-/run/hosted-claw}"
drain_file="${control_root}/deploy-drain"
active_turns_file="${control_root}/active-turns"
docker_bin="${DOCKER_BIN:-docker}"
systemctl_bin="${SYSTEMCTL_BIN:-systemctl}"
if [[ ! "$release_tag" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
  echo "Invalid release tag: $release_tag" >&2
  exit 2
fi
backup_file="${env_file}.pre-${release_tag}-$(date -u +%Y%m%dT%H%M%SZ)"
rollback_needed=false
replacement_file=""

for image in "$supervisor_image" "$accounting_image" "$legal_image" "$proxy_image"; do
  if [[ ! "$image" =~ @sha256:[0-9a-f]{64}$ ]]; then
    echo "Refusing mutable or invalid image reference: $image" >&2
    exit 2
  fi
done
if [[ ! "$drain_timeout" =~ ^[1-9][0-9]*$ ]]; then
  echo "DRAIN_TIMEOUT must be a positive integer" >&2
  exit 2
fi
if [ ! -f "$env_file" ]; then
  echo "Missing Hosted Claw worker environment: $env_file" >&2
  exit 1
fi

cleanup() {
  status=$?
  set +e
  if [ -n "$replacement_file" ]; then
    rm -f "$replacement_file"
  fi
  if [ "$status" -ne 0 ] && [ "$rollback_needed" = true ] && [ -f "$backup_file" ]; then
    echo "Deployment failed; restoring $backup_file" >&2
    cp "$backup_file" "$env_file"
    chmod 0600 "$env_file"
    rm -f "$drain_file"
    "$systemctl_bin" restart hosted-claw-supervisor || true
  else
    rm -f "$drain_file"
  fi
  exit "$status"
}
trap cleanup EXIT

if ! "$systemctl_bin" is-active --quiet hosted-claw-supervisor; then
  echo "Hosted Claw supervisor must be active before a drained deployment" >&2
  exit 1
fi
if [ ! -f "$active_turns_file" ]; then
  echo "Supervisor does not expose active-turn state: $active_turns_file" >&2
  exit 1
fi

echo "Pre-pulling immutable Hosted Claw images..."
"$docker_bin" pull "$supervisor_image"
"$docker_bin" pull "$accounting_image"
"$docker_bin" pull "$legal_image"
"$docker_bin" pull "$proxy_image"

mkdir -p "$(dirname "$drain_file")"
touch "$drain_file"
deadline=$(( $(date +%s) + drain_timeout ))
while true; do
  active_turns="$(cat "$active_turns_file" 2>/dev/null || echo 0)"
  if [[ "$active_turns" =~ ^[0-9]+$ ]] && [ "$active_turns" -eq 0 ]; then
    break
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "Timed out waiting for Hosted Claw to drain (${active_turns} active turns)" >&2
    exit 1
  fi
  echo "Waiting for ${active_turns} active Hosted Claw turn(s) to finish..."
  sleep 2
done

for key in HOSTED_CLAW_SUPERVISOR_IMAGE HOSTED_ACCOUNTINGCLAW_IMAGE HOSTED_LEGALCLAW_IMAGE HOSTED_CLAW_PROXY_IMAGE; do
  if ! grep -q "^${key}=" "$env_file"; then
    echo "Missing $key in $env_file" >&2
    exit 1
  fi
done

cp "$env_file" "$backup_file"
chmod 0600 "$backup_file"
rollback_needed=true
replacement_file="$(mktemp "${env_file}.deploy.XXXXXX")"
awk \
  -v supervisor="$supervisor_image" \
  -v accounting="$accounting_image" \
  -v legal="$legal_image" \
  -v proxy="$proxy_image" '
    /^HOSTED_CLAW_SUPERVISOR_IMAGE=/ { print "HOSTED_CLAW_SUPERVISOR_IMAGE=" supervisor; next }
    /^HOSTED_ACCOUNTINGCLAW_IMAGE=/ { print "HOSTED_ACCOUNTINGCLAW_IMAGE=" accounting; next }
    /^HOSTED_LEGALCLAW_IMAGE=/ { print "HOSTED_LEGALCLAW_IMAGE=" legal; next }
    /^HOSTED_CLAW_PROXY_IMAGE=/ { print "HOSTED_CLAW_PROXY_IMAGE=" proxy; next }
    { print }
  ' "$env_file" > "$replacement_file"
chmod 0600 "$replacement_file"
mv "$replacement_file" "$env_file"
replacement_file=""

"$systemctl_bin" restart hosted-claw-supervisor
for _ in $(seq 1 30); do
  if "$systemctl_bin" is-active --quiet hosted-claw-supervisor; then
    running_image="$("$docker_bin" inspect hosted-claw-supervisor --format '{{.Config.Image}}' 2>/dev/null || true)"
    if [ "$running_image" = "$supervisor_image" ]; then
      break
    fi
  fi
  sleep 1
done

if ! "$systemctl_bin" is-active --quiet hosted-claw-supervisor; then
  echo "Hosted Claw supervisor did not become active" >&2
  exit 1
fi
running_image="$("$docker_bin" inspect hosted-claw-supervisor --format '{{.Config.Image}}')"
if [ "$running_image" != "$supervisor_image" ]; then
  echo "Supervisor is running the wrong image: $running_image" >&2
  exit 1
fi
"$systemctl_bin" is-active --quiet hosted-claw-litellm
"$systemctl_bin" is-active --quiet openconnector

smoke_policy() {
  image="$1"
  "$docker_bin" run --rm --entrypoint /opt/hermes/.venv/bin/python "$image" -c \
    "import importlib.util;s=importlib.util.spec_from_file_location('hosted_policy','/opt/cpaa/plugin/__init__.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);assert m.pre_tool_call('terminal',{},'deploy-smoke') is None"
}
smoke_policy "$accounting_image"
smoke_policy "$legal_image"

rm -f "$drain_file"
rollback_needed=false
trap - EXIT
echo "Hosted Claw ${release_tag} deployed successfully. Rollback environment: ${backup_file}"
