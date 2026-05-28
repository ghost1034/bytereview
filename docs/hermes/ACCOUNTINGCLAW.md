# AccountingClaw Hermes Image

AccountingClaw is the first Claw Series Hermes profile for CPAAutomation.ai. It bundles accounting-focused Hermes skills into a Docker image while keeping the profile encrypted until runtime.

This implementation uses Option B from `docs/hermes/HERMES_AGENT.md`:

- Encrypted skills are included inside the image.
- The image is encrypted at build time with a single `CPAA_BUNDLE_SECRET`.
- At runtime, each customer activates with a **personal, revocable key** that the
  container exchanges with the CPAAutomation backend for the bundle secret. The
  shared secret is never distributed to customers.
- A dev escape hatch (`CPAA_BUNDLE_SECRET`) still decrypts directly for local builds/tests.
- The bundled product is AccountingClaw only.

> Temporary gate: today the web activation page requires a universal six-digit code
> (backend `CPAA_ACTIVATION_CODE`). This is throwaway — the permanent design replaces
> the code with a payment step. The per-customer key mechanism below stays.

## Files

```text
hermes/accountingclaw/
  Dockerfile
  .dockerignore
  bin/accountingclaw-entrypoint
  profile/
    SOUL.md
    config.yaml
    distribution.yaml
    skills/
      client-onboarding/SKILL.md
      month-end-close/SKILL.md
      qbo-reconciliation/SKILL.md
      ap-ar-review/SKILL.md
      sales-tax-review/SKILL.md
      payroll-journal-review/SKILL.md
```

## Bundled Skills

- `client-onboarding`: accounting client onboarding checklist and kickoff planning.
- `month-end-close`: month-end close planning, review, and open-item tracking.
- `qbo-reconciliation`: QuickBooks Online reconciliation workflow and exception reporting.
- `ap-ar-review`: AP/AR aging cleanup and exception schedule.
- `sales-tax-review`: sales tax filing support review and exception summary.
- `payroll-journal-review`: payroll journal and payroll liability review.

## How Encryption Works

The Dockerfile uses a multi-stage build:

1. The `bundle` stage copies the plaintext AccountingClaw profile.
2. The `bundle` stage creates `accountingclaw-profile.tar.gz`.
3. The archive is encrypted with `openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -md sha256` using the BuildKit secret `cpaa_bundle_secret`.
4. The final Hermes image receives only:
   - `/opt/cpaa/accountingclaw-profile.tar.gz.enc`
   - `/opt/cpaa/accountingclaw-profile.tar.gz.enc.sha256`
   - `/usr/local/bin/accountingclaw-entrypoint`

The plaintext `profile/`, `skills/`, `SOUL.md`, and `config.yaml` are not copied into the final image.

## Build Locally

Set a shared bundle secret locally. Use a strong generated value and store the production value in Secret Manager or another secure password manager.

```bash
export CPAA_BUNDLE_SECRET="replace-with-a-long-random-secret"
./scripts/build-accountingclaw-image.sh
```

The default local tags are:

```text
cpaautomation/accountingclaw-hermes:<git-sha>
cpaautomation/accountingclaw-hermes:latest
```

To push to Artifact Registry:

```bash
export CPAA_BUNDLE_SECRET="replace-with-a-long-random-secret"
PUSH=true ./scripts/build-accountingclaw-image.sh
```

Optional environment variables:

- `PROJECT_ID`, default `ace-rider-383100`.
- `REGION`, default `us-central1`.
- `ARTIFACT_REGISTRY_REPO`, default `cpa-docker`.
- `ARTIFACT_REGISTRY_URL`, overrides the full registry URL.
- `ACCOUNTINGCLAW_IMAGE_NAME`, default `accountingclaw-hermes`.
- `ACCOUNTINGCLAW_PLATFORM`, default `linux/amd64`.

## Run Locally

Activate against a backend with a personal key (production-like):

```bash
export CPAA_ACTIVATION_KEY="cpaa_live_..."          # issued at /dashboard/activation
export CPAA_ACTIVATION_URL="http://host.docker.internal:8000/api/activation/resolve"  # local backend
export OPENROUTER_API_KEY="sk-or-..."
./scripts/run-accountingclaw-local.sh
```

Or use the dev escape hatch to decrypt directly without a backend:

```bash
export CPAA_BUNDLE_SECRET="same-secret-used-at-build-time"
export OPENROUTER_API_KEY="sk-or-..."
./scripts/run-accountingclaw-local.sh
```

The run script mounts local persistent Hermes data at `.accountingclaw-data` by default and exposes port `8642`.

Optional environment variables:

- `ACCOUNTINGCLAW_DATA_DIR`, default `$PWD/.accountingclaw-data`.
- `ACCOUNTINGCLAW_PORT`, default `8642`.
- `ACCOUNTINGCLAW_CONTAINER_NAME`, default `accountingclaw-hermes`.
- `API_SERVER_ENABLED`, `API_SERVER_HOST`, `API_SERVER_KEY`, and `API_SERVER_CORS_ORIGINS`, forwarded to Hermes when set.

You can pass a specific image and Hermes command:

```bash
./scripts/run-accountingclaw-local.sh cpaautomation/accountingclaw-hermes:latest gateway run
```

## Use Hermes After Startup

When the container is running in gateway mode, the `hermes` command is inside the container, not on the host machine. Use `docker exec` for local CLI access:

```bash
docker logs -f accountingclaw-hermes
docker exec -it accountingclaw-hermes hermes status
docker exec -it accountingclaw-hermes hermes skills list
docker exec -it accountingclaw-hermes hermes chat
```

If you used the public Claw page command, the container name is `accountingclaw` instead:

```bash
docker logs -f accountingclaw
docker exec -it accountingclaw hermes status
docker exec -it accountingclaw hermes skills list
docker exec -it accountingclaw hermes chat
```

Optional host shortcut:

```bash
alias hermes='docker exec -it accountingclaw-hermes hermes'
```

If `docker exec ... hermes` fails on an older image, use the full venv path or rebuild/pull the latest image:

```bash
docker exec -it accountingclaw-hermes /opt/hermes/.venv/bin/hermes status
```

To use the OpenAI-compatible API on port `8642`, run the container with API server settings:

```bash
-e API_SERVER_ENABLED=true \
-e API_SERVER_HOST=0.0.0.0 \
-e API_SERVER_KEY="change-this-api-key" \
-p 127.0.0.1:8642:8642
```

Without those `API_SERVER_*` variables, exposing port `8642` alone is not enough to enable the local API server.

## Runtime Install Flow

On container startup, `accountingclaw-entrypoint`:

1. Creates `/opt/data/.cpaa` and `/opt/data/skills`.
2. Checks `/opt/data/.cpaa/accountingclaw-installed`. If present, skips straight to Hermes.
3. Acquires the bundle decryption secret:
   - If `CPAA_BUNDLE_SECRET` is set, uses it directly (dev / back-compat escape hatch); or
   - Otherwise requires `CPAA_ACTIVATION_KEY` and `POST`s it (with a machine fingerprint) to
     `CPAA_ACTIVATION_URL` (default `https://api.cpaautomation.ai/api/activation/resolve`).
     The backend validates the key and returns the real bundle secret.
4. Writes the secret to a root-only temp file and decrypts `/opt/cpaa/accountingclaw-profile.tar.gz.enc`
   with `openssl ... -pass file:` (the secret never appears in the process arg list).
5. Validates the decrypted archive with `tar -tzf`.
6. Extracts the profile into `/opt/data`.
7. Writes the install marker.
8. Starts Hermes with the original container command.

Exit codes: `64` no key/secret provided, `66` bundle missing, `75` activation server unreachable,
`77` invalid or revoked key.

Because the network exchange only happens when the marker is absent, an already-installed
container (same `/opt/data` volume) never contacts the backend on later starts.

## Activation API

The bundle is still encrypted at build time with a single `CPAA_BUNDLE_SECRET`, but that
secret is **never** distributed to customers. Instead the backend holds it and hands it out
only to holders of a valid per-customer activation key. Endpoints (`backend/routes/activation.py`):

- `POST /api/activation/activate` (Firebase-authed) — the signed-in user enters the universal
  six-digit code (`CPAA_ACTIVATION_CODE`) and is issued a personal key `cpaa_live_<random>`,
  shown exactly once. Only a SHA-256 hash is stored (`activation_keys` table).
- `GET /api/activation/me` (Firebase-authed) — activation status for the dashboard (never the
  full key).
- `POST /api/activation/resolve` (key-authed, not Firebase) — the container exchanges its key
  for the real `CPAA_BUNDLE_SECRET`. Revoked keys (`revoked_at`) are rejected.

This provides per-customer revocation and activation tracking. Out of scope for now (future
hooks): seat limits, expiry, signed license tokens, and periodic re-check.

### Secret consistency

The build-time `CPAA_BUNDLE_SECRET` (used by `scripts/build-accountingclaw-image.sh`) and the
backend env `CPAA_BUNDLE_SECRET` (returned by `/resolve`) **must be identical**, or activated
containers cannot decrypt the image.

### Key Rotation

To rotate the bundle secret:

1. Generate a new `CPAA_BUNDLE_SECRET`.
2. Rebuild and republish the AccountingClaw image with it.
3. Update the backend env `CPAA_BUNDLE_SECRET` to the same value, in lockstep.
4. Already-installed containers (marker present) are unaffected — they decrypted once and
   cached the result. Only fresh installs use the new secret.

To revoke a single customer, set `revoked_at` on their `activation_keys` row; their next
fresh install fails at `/resolve`.
