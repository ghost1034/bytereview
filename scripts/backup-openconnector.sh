#!/bin/bash
# Nightly OpenConnector SQLite backup (runs on the openconnector VM via
# /etc/cron.d/openconnector-backup, installed by setup-openconnector-vm.sh).
#
# Uses sqlite's online .backup through the runtime container so the snapshot
# is consistent while the runtime keeps serving, then ships it to GCS. The
# bucket has a 30-day delete lifecycle. Credentials inside the file stay
# encrypted with OOMOL_CONNECT_ENCRYPTION_KEY.

set -euo pipefail

BUCKET="${BACKUP_BUCKET:-gs://cpaautomation-openconnector-backups}"
DATA_DIR="${DATA_DIR:-/mnt/openconnector-data}"
STAMP="$(date -u +%F)"
SNAPSHOT="/tmp/connect-${STAMP}.sqlite"

# The official image ships node, not the sqlite3 CLI, so run the backup with a
# throwaway alpine container sharing the data volume.
docker run --rm --network openconnector_default \
  -v "${DATA_DIR}:/data" -v /tmp:/backup alpine:3 sh -c \
  "apk add --no-cache sqlite >/dev/null && sqlite3 /data/connect.sqlite \".backup '/backup/connect-${STAMP}.sqlite'\""

gsutil cp "$SNAPSHOT" "${BUCKET}/connect-${STAMP}.sqlite"
rm -f "$SNAPSHOT"

echo "$(date -u +%FT%TZ) backup ok: ${BUCKET}/connect-${STAMP}.sqlite"
