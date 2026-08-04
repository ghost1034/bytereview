# Hosted Claw pilot supervisor

This directory contains the shared single-VM pilot data plane. The size-one
Hosted Claw MIG also runs OpenConnector. The lean pilot assigns OpenConnector's
static IP directly to the MIG in a dedicated VPC; only TCP 80/443 is public and
SSH is IAP-only. The Cloud Run API is
the control plane; the supervisor has no database, KMS, Slack-token, or
provider-key access. It authenticates to `/api/internal/hosted-claw` with its
GCE service identity and receives only one claimed tenant job at a time.

Tenant containers are one CPAAutomation user plus one product, use opaque Docker
volumes, and are attached only to the internal hosted network. The supervisor
starts them with a read-only root filesystem, non-root UID, all capabilities
dropped, `no-new-privileges`, one CPU, 2 GiB memory, and 256 PIDs. The pilot
admits three concurrent turns and retains at most three warm tenant runtimes for five minutes.
It never mounts the Docker socket into a tenant.

Hosted Claw tool calls run without interactive approval. The runtime policy
allows read, write, terminal, connector, and newly added tools, and any native
Hermes approval event is approved immediately. Tenant authentication,
isolation, resource limits, and audit logging remain enforced.

Set `HOSTED_CLAW_API_URL`, `HOSTED_CLAW_INTERNAL_AUDIENCE`, the two private image
references, `LITELLM_TENANT_ORIGIN`, and `LITELLM_MASTER_KEY`. The VM startup
process provides the LiteLLM master key without putting it in tenant
containers. A per-tenant proxy injects the revocable virtual model key and
hosted connector token, so neither credential appears in the tenant process.

Hosted turns default to a 10-minute hard deadline and a two-minute meaningful
event inactivity deadline. Override them with
`HOSTED_CLAW_TURN_TIMEOUT_SECONDS` and
`HOSTED_CLAW_EVENT_INACTIVITY_SECONDS`; the inactivity limit must not exceed
the hard deadline. A timeout stops Hermes, records `turn_timeout`, and replaces
the Slack progress placeholder with a retryable final message.

Conversation continuity uses Hermes's native session resource API. The control
plane assigns one active transcript per CPAAutomation user and Claw product;
the supervisor creates or resumes that transcript through `/api/sessions` and
submits turns through `/api/sessions/{id}/chat/stream`. A runtime that does not
advertise the required session endpoints fails closed instead of falling back
to a stateless turn. New-session commands rotate the transcript while retaining
the product's separately scoped long-term memory.

`HOSTED_CLAW_PROXY_IMAGE` must also be a digest-pinned Caddy image. The
supervisor creates a private network and a credential-injecting proxy sidecar
per tenant. Tenant containers receive neither connector nor LiteLLM keys and
cannot join the shared outbound network.

Build and deploy all Hosted Claw images with one command:

```sh
./scripts/build-hosted-claw-images.sh
```

The script uses source-controlled, digest-pinned production bases, publishes
AccountingClaw, LegalClaw, the supervisor, and the proxy, resolves their
immutable registry digests, discovers the live MIG worker, drains active turns,
updates its root-owned environment atomically, restarts the supervisor, and
verifies the release. Use `--build-only` or `--deploy-only --image-tag TAG` for
recovery workflows. A failed remote deployment automatically restores the
previous worker environment and supervisor image.

`setup-hosted-claw-pilot.sh` provisions the lean `e2-standard-2` defaults,
30/30/10 GiB standard disks, least-privilege service account roles, seven-day
daily snapshots, Pub/Sub subscription, dedicated VPC, and direct stateful IP.
The live managed group defaults to `hosted-claw-pilot-lean`; the cost-migration
workflow keeps `hosted-claw-pilot` scaled to zero only for rollback.
Set `EDGE_MODE=private` to retain Cloud NAT and the passthrough load balancer. It is
intentionally opt-in and does not run from the normal Cloud Run deployment.

Use `scripts/migrate-hosted-claw-to-lean.sh` for the guarded `prepare`,
`cutover`, `rollback`, and seven-day `finalize` workflow. Preparation creates
and seeds the smaller disks without changing the live MIG.
