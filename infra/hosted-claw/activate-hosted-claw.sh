#!/usr/bin/env bash
# Activate Hosted Claw after an operator injects /etc/hosted-claw/worker.env.

set -euo pipefail

ENV_FILE=/etc/hosted-claw/worker.env
if [ ! -f "$ENV_FILE" ]; then
  echo "$ENV_FILE is required" >&2
  exit 1
fi
chmod 0600 "$ENV_FILE"

supervisor_image="$(sed -n 's/^HOSTED_CLAW_SUPERVISOR_IMAGE=//p' "$ENV_FILE")"
registry_host="${supervisor_image%%/*}"
if [ -n "$registry_host" ] && command -v gcloud >/dev/null 2>&1; then
  gcloud auth configure-docker "$registry_host" --quiet >/dev/null
fi

for image_key in HOSTED_CLAW_SUPERVISOR_IMAGE HOSTED_CLAW_PROXY_IMAGE HOSTED_ACCOUNTINGCLAW_IMAGE HOSTED_LEGALCLAW_IMAGE; do
  image_ref="$(sed -n "s/^${image_key}=//p" "$ENV_FILE")"
  if [ -z "$image_ref" ] || [[ "$image_ref" != *@sha256:* ]]; then
    echo "${image_key} must be set to an immutable digest" >&2
    exit 1
  fi
  docker pull "$image_ref" >/dev/null
done

systemctl start hosted-claw-litellm hosted-claw-supervisor
