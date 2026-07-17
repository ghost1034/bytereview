# OpenConnector Runtime (connect.cpaautomation.ai)

Self-hosted [OpenConnector](https://github.com/oomol-lab/open-connector) runtime
powering CPAAutomation integrations. One shared single-tenant runtime; the CPAA
FastAPI backend is the multi-tenancy broker (see `backend/services/connector_service.py`)
and is the only holder of the runtime's admin/runtime tokens. Users and Claw
containers never talk to this host directly except for the OAuth browser
callback at `https://connect.cpaautomation.ai/oauth/callback`.

Per-user tenancy is a naming convention enforced by the broker: every runtime
connection is named `u_{user_id}` (or `u_{user_id}__{label}`), and every
execution call carries `x-oo-connector-alias` derived server-side from the
authenticated CPAA user.

## Provisioning

```bash
./scripts/setup-openconnector-vm.sh          # creates VM + data disk + firewall, seeds /opt/openconnector
# then point DNS: connect.cpaautomation.ai A <printed static IP>
```

The script copies this directory to `/opt/openconnector` on the VM, writes
`.env` from Secret Manager (`OOMOL_CONNECT_ENCRYPTION_KEY`,
`OOMOL_CONNECT_ADMIN_TOKEN`, `OOMOL_CONNECT_RUNTIME_TOKEN`), and starts
`docker compose up -d`. Caddy obtains TLS automatically once DNS resolves.

## Registering a provider OAuth app (admin)

OAuth providers are unusable until CPAAutomation registers its own OAuth app
with that provider and stores the client credentials in the runtime. Do this
through the CPAA backend (it mirrors the registration for the website's
availability badges):

```bash
curl -sS -X PUT "https://api.cpaautomation.ai/api/admin/connector/oauth-configs/github?admin_token=$ADMIN_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"client_id":"<provider client id>","client_secret":"<provider client secret>"}'
```

When creating the app on the provider's side, set the callback/redirect URL to
`https://connect.cpaautomation.ai/oauth/callback`.

Check runtime health and registered configs:

```bash
curl -sS "https://api.cpaautomation.ai/api/admin/connector/health?admin_token=$ADMIN_TOKEN"
curl -sS "https://api.cpaautomation.ai/api/admin/connector/oauth-configs?admin_token=$ADMIN_TOKEN"
```

## Backups & restore

`scripts/backup-openconnector.sh` (installed as a nightly cron by the setup
script) snapshots `connect.sqlite` with `sqlite3 .backup` and copies it to
`gs://cpaautomation-openconnector-backups/` (30-day lifecycle).

Restore:

```bash
gsutil cp gs://cpaautomation-openconnector-backups/connect-<date>.sqlite /tmp/
docker compose -f /opt/openconnector/docker-compose.yml stop open-connector
cp /tmp/connect-<date>.sqlite /mnt/openconnector-data/connect.sqlite
docker compose -f /opt/openconnector/docker-compose.yml start open-connector
```

Credentials decrypt only with the same `OOMOL_CONNECT_ENCRYPTION_KEY`, so the
Secret Manager secret is part of the backup story — never rotate it without
running the runtime's key-rotation flow (`OOMOL_CONNECT_NEW_ENCRYPTION_KEY` +
`runtime:data rotate-key`).

## Notes

- The runtime web console and `/docs` are blocked at Caddy in production; all
  administration goes through the CPAA backend admin routes.
- The runtime's `/mcp` endpoint ignores connection aliases (always uses the
  default connection), so it is NOT used: Claw MCP traffic terminates at the
  CPAA backend's `/api/connector/mcp`, which translates tool calls into
  per-user `/v1/actions/:id` executions.
- Single-VM deployment is a known SPOF, accepted for v1. Recovery = new VM via
  the setup script + restore from GCS.
