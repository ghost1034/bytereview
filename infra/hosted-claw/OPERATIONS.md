# Shared Hosted Claw and OpenConnector operations

The pilot is intentionally a size-one, stateful managed instance group named
`hosted-claw-pilot-lean` in `us-central1`, defaulting to `e2-standard-2`, a 30 GB standard persistent data
disk, daily encrypted snapshots, and seven-day snapshot retention. OpenConnector
uses a separate 10 GB standard stateful disk and keeps 30 days of application-consistent
SQLite backups in GCS. The worker
service account can consume Pub/Sub, pull private images, invoke the internal
Cloud Run API, and emit logs/metrics. It has no Cloud SQL, KMS decrypt, Slack
token, Secret Manager, or provider credential role.

After provisioning, copy `worker.env.example` to the VM as
`/etc/hosted-claw/worker.env`, replace every placeholder, and set mode `0600`.
All runtime, supervisor, proxy, LiteLLM, and PostgreSQL image references must be
resolved to immutable digests. Then start `hosted-claw-litellm` followed by
`hosted-claw-supervisor`. The environment file is the operator-injected secret
boundary; it is never mounted into a tenant container.

Routine image releases are one command from the repository root:

```sh
./scripts/build-hosted-claw-images.sh
```

This builds and pushes all four Hosted Claw images, resolves immutable digests,
drains the worker without accepting new turns, pre-pulls the release, creates a
root-only rollback copy of `worker.env`, switches image references, restarts the
supervisor, and runs service and tenant-policy smoke checks. `--build-only` and
`--deploy-only --image-tag TAG` remain available for recovery.

OpenConnector uses `/etc/openconnector/openconnector.env` (root `0600`) and the
`openconnector.service` unit. Its public IP is statefully assigned to the MIG
in a dedicated VPC. Firewall rules expose only TCP 80/443 and allow TCP 22 only
from IAP. `container-metadata-firewall.service` must be
active before any bridge-network container starts. It prevents OpenConnector,
LiteLLM, and tenant proxy containers from obtaining the worker service identity;
the host-network supervisor retains metadata access.

For Slack, replace `API_HOST` in `slack-app-manifest.yaml`, import the manifest
into the CPAAutomation Slack app, and enable unlisted distribution for the
pilot. Do not add channel scopes or channel event subscriptions; v1 intake is
DM-only. Marketplace publication is not required.

Alert when there is no unexpired worker lease, oldest queue age exceeds 60
seconds, disk reaches 80%, an entitlement budget is exhausted, a runtime
restarts repeatedly, Slack returns authorization failures, or the rolling turn
failure ratio exceeds 5%. Logs and metrics must include only job/runtime opaque
IDs, durations, queue/cold-start delays, token and cost totals, action IDs,
approval decisions, restart counts, rate-limit status, disk pressure, and error
codes. Never emit prompts, document content, credentials, or raw arguments.

Roll back by setting `HOSTED_CLAW_ENABLED=false`, waiting for claimed work to
finish or cancelling it through the user/admin endpoints, revoking all
`hosted_runtime` connector and LiteLLM virtual keys, and scaling the MIG to
zero. Desktop and self-hosted Claw are independent.

Recovery target for the pilot is 30 minutes RTO and 24 hours RPO. Recreate the
MIG from the approved shared template, attach both disks restored from their
newest snapshots, inject both root-owned environment files, and start the
metadata firewall, LiteLLM, supervisor, OpenConnector, and backup timer. Verify
the public OpenConnector health endpoint, a connector action, tenant-path isolation, metadata
denial from bridge containers, and a GCS backup before reopening intake.
Deleted blocks may remain only in snapshots until the seven-day policy expires.

For migration operations use
`scripts/migrate-openconnector-to-hosted-claw.sh`. `prepare` is non-disruptive;
`cutover` snapshots both disks and retains the old VM stopped; `rollback` moves
the disk and IP back; and `finalize` deletes the stopped legacy VM after the
48-hour observation period.

For cost migration use `scripts/migrate-hosted-claw-to-lean.sh`. Deploy a
supervisor image containing the three-turn capacity controls first, run `prepare`
to seed the smaller disks, then run `cutover` during a 15-minute maintenance
window. Do not run `finalize` until its seven-day guard passes. Rollback performs
a reverse sync before restoring the previous template and network edge. Until
finalization, `hosted-claw-pilot` remains at size zero as the rollback group.
