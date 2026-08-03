#!/usr/bin/env bash
# OpenConnector no longer has a standalone VM. Keep this entrypoint only to
# direct operators to the shared Hosted Claw provisioning workflow.

set -euo pipefail

echo "Standalone OpenConnector provisioning has been retired." >&2
echo "Run scripts/setup-hosted-claw-pilot.sh for the shared one-VM data plane." >&2
exit 2
