#!/usr/bin/env bash
# Apply the shared Artifact Registry retention policy to Docker repositories.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-ace-rider-383100}"
REGION="${REGION:-us-central1}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
POLICY_FILE="${CLEANUP_POLICY_FILE:-${SCRIPT_DIR}/../infra/artifact-registry/cleanup-policies.json}"
CLEANUP_DRY_RUN="${CLEANUP_DRY_RUN:-false}"

if [[ ! -f "$POLICY_FILE" ]]; then
  echo "Artifact Registry cleanup policy not found: $POLICY_FILE" >&2
  exit 1
fi

if [[ "$#" -gt 0 ]]; then
  repositories=("$@")
else
  repositories=(cpa-docker hosted-claw)
fi

case "$CLEANUP_DRY_RUN" in
  true) dry_run_flag="--dry-run" ;;
  false) dry_run_flag="--no-dry-run" ;;
  *) echo "CLEANUP_DRY_RUN must be true or false" >&2; exit 2 ;;
esac

for repository in "${repositories[@]}"; do
  gcloud artifacts repositories describe "$repository" \
    --project="$PROJECT_ID" \
    --location="$REGION" >/dev/null

  gcloud artifacts repositories set-cleanup-policies "$repository" \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --policy="$POLICY_FILE" \
    "$dry_run_flag" \
    --quiet

  echo "Applied Artifact Registry cleanup policy to ${REGION}/${repository} (dry run: ${CLEANUP_DRY_RUN})."
done
