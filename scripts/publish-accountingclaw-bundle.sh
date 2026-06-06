#!/usr/bin/env bash
# Publishes the PLAINTEXT AccountingClaw profile bundle for desktop installs.
#
# Builds the same tarball the Docker image's bundle stage builds
# (tar -C hermes/accountingclaw/profile .) and uploads it, unencrypted, to the
# private CPAA bundle bucket. The /api/activation/bundle endpoint gates access
# by returning short-lived signed GET URLs only for valid activation keys, so
# the object itself must NEVER be made public.
#
# The Docker (cloud) flow is unaffected: it still ships the bundle encrypted
# inside the image (see scripts/build-accountingclaw-image.sh).

set -euo pipefail

BUCKET="${CPAA_BUNDLE_GCS_BUCKET:-cpaa-accountingclaw-bundles}"
OBJECT="${CPAA_BUNDLE_GCS_OBJECT:-accountingclaw/accountingclaw-profile.tar.gz}"
PROFILE_DIR="${ACCOUNTINGCLAW_PROFILE_DIR:-hermes/accountingclaw/profile}"

if [ ! -d "$PROFILE_DIR" ]; then
  echo "Profile directory not found at $PROFILE_DIR (run from the repo root)."
  exit 66
fi

if ! command -v gsutil >/dev/null 2>&1; then
  echo "gsutil is required (install the Google Cloud SDK)."
  exit 69
fi

VERSION="$(awk '/^version:/ {print $2; exit}' "$PROFILE_DIR/distribution.yaml" 2>/dev/null || true)"
if [ -z "$VERSION" ]; then
  echo "Warning: could not read version from $PROFILE_DIR/distribution.yaml; publishing without one."
fi

tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

# Same tar invocation as the Dockerfile bundle stage, so cloud and desktop
# installs receive byte-identical profile contents.
tar -C "$PROFILE_DIR" -czf "$tmp_dir/accountingclaw-profile.tar.gz" .

if command -v sha256sum >/dev/null 2>&1; then
  SHA="$(sha256sum "$tmp_dir/accountingclaw-profile.tar.gz" | awk '{print $1}')"
else
  SHA="$(shasum -a 256 "$tmp_dir/accountingclaw-profile.tar.gz" | awk '{print $1}')"
fi

# Custom metadata is read back by the backend (services/gcs_service.py
# get_bundle_signed_url) to populate the /api/activation/bundle response.
headers=(-h "x-goog-meta-cpaa-sha256:$SHA")
if [ -n "$VERSION" ]; then
  headers+=(-h "x-goog-meta-cpaa-version:$VERSION")
fi

gsutil "${headers[@]}" cp "$tmp_dir/accountingclaw-profile.tar.gz" "gs://$BUCKET/$OBJECT"

# Sibling checksum object for manual verification / tooling.
printf '%s  %s\n' "$SHA" "$(basename "$OBJECT")" > "$tmp_dir/checksum.sha256"
gsutil cp "$tmp_dir/checksum.sha256" "gs://$BUCKET/$OBJECT.sha256"

echo "Published gs://$BUCKET/$OBJECT (sha256=$SHA version=${VERSION:-unknown})."
