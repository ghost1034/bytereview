#!/usr/bin/env bash
# Prevent bridge-network containers from obtaining the VM service identity.
# The Hosted Claw supervisor uses host networking and therefore remains able to
# use Application Default Credentials from the metadata server.

set -euo pipefail

METADATA_IP="169.254.169.254/32"

if ! iptables -C DOCKER-USER -d "$METADATA_IP" -j REJECT >/dev/null 2>&1; then
  iptables -I DOCKER-USER 1 -d "$METADATA_IP" -j REJECT
fi
