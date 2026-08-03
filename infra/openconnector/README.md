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

## Shared-host provisioning

```bash
./scripts/setup-hosted-claw-pilot.sh
./scripts/migrate-openconnector-to-hosted-claw.sh prepare
./scripts/migrate-openconnector-to-hosted-claw.sh cutover
```

OpenConnector and Hosted Claw share the private, size-one Hosted Claw managed
instance group. The existing OpenConnector static IP belongs to a regional
passthrough load balancer that forwards only TCP 80/443 to the group; the VM
has no public NIC. OpenConnector retains its dedicated stateful disk at
`/mnt/openconnector-data`, including Caddy's ACME state.

The operator injects `/etc/openconnector/openconnector.env` from Secret Manager
(`OOMOL_CONNECT_ENCRYPTION_KEY`, `OPENCONNECTOR_ADMIN_TOKEN`, and
`OPENCONNECTOR_RUNTIME_TOKEN`). The file is root-owned with mode `0600` and is
never stored in instance metadata. `openconnector.service` starts the Compose
project after the disk and container-metadata firewall are ready.

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

`openconnector-backup.timer` snapshots `connect.sqlite` with `sqlite3 .backup`
at 03:17 UTC and copies it to
`gs://cpaautomation-openconnector-backups/` (30-day lifecycle).

Restore:

```bash
gsutil cp gs://cpaautomation-openconnector-backups/connect-<date>.sqlite /tmp/
systemctl stop openconnector
cp /tmp/connect-<date>.sqlite /mnt/openconnector-data/connect.sqlite
systemctl start openconnector
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
- OpenConnector and Hosted Claw now share a host-level trust and failure domain.
  Tenant containers remain isolated, but the trusted supervisor controls the
  Docker daemon and must be treated as capable of administering all containers.
- Recovery recreates the shared MIG with both stateful disks, reinjects
  `/etc/hosted-claw/worker.env` and `/etc/openconnector/openconnector.env`, and
  starts the Hosted Claw and OpenConnector systemd units.
