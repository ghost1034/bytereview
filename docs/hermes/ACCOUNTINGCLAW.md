# AccountingClaw Hermes Image

AccountingClaw is the first Claw Series Hermes profile for CPAAutomation.ai. It bundles accounting-focused Hermes skills into a Docker image while keeping the profile encrypted until runtime.

This implementation intentionally uses Option B from `docs/hermes/HERMES_AGENT.md`:

- Encrypted skills are included inside the image.
- One shared decryption key is used for all customers for now.
- No activation API is implemented yet.
- The bundled product is AccountingClaw only.

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

```bash
export CPAA_BUNDLE_SECRET="same-secret-used-at-build-time"
export OPENAI_API_KEY="sk-..."
./scripts/run-accountingclaw-local.sh
```

The run script mounts local persistent Hermes data at `.accountingclaw-data` by default and exposes port `8642`.

Optional environment variables:

- `ACCOUNTINGCLAW_DATA_DIR`, default `$PWD/.accountingclaw-data`.
- `ACCOUNTINGCLAW_PORT`, default `8642`.
- `ACCOUNTINGCLAW_CONTAINER_NAME`, default `accountingclaw-hermes`.

You can pass a specific image and Hermes command:

```bash
./scripts/run-accountingclaw-local.sh cpaautomation/accountingclaw-hermes:latest gateway run
```

## Runtime Install Flow

On container startup, `accountingclaw-entrypoint`:

1. Creates `/opt/data/.cpaa` and `/opt/data/skills`.
2. Checks `/opt/data/.cpaa/accountingclaw-installed`.
3. If not installed, requires `CPAA_BUNDLE_SECRET`.
4. Decrypts `/opt/cpaa/accountingclaw-profile.tar.gz.enc` into a temp directory.
5. Validates the decrypted archive with `tar -tzf`.
6. Extracts the profile into `/opt/data`.
7. Writes the install marker.
8. Starts Hermes with the original container command.

If the same `/opt/data` volume is reused, the container does not reinstall the bundle on later starts.

## Shared-Key Limitation

This is intentionally not full licensing. Every customer uses the same `CPAA_BUNDLE_SECRET` for now. If that value leaks, anyone with the image can decrypt the included AccountingClaw skills.

This still prevents casual use of the image without the secret, but it does not provide customer-specific revocation, activation tracking, seat limits, or usage enforcement.

## Key Rotation

To rotate the shared key:

1. Generate a new `CPAA_BUNDLE_SECRET`.
2. Rebuild and republish the AccountingClaw image.
3. Distribute the new runtime secret to customers.
4. Ask customers to restart with the new image and secret.
5. If a customer already installed the old bundle into `/opt/data`, remove `/opt/data/.cpaa/accountingclaw-installed` and the old profile files before reinstalling.

## Later Activation API Upgrade

When CPAAutomation.ai is ready for customer-specific licensing, replace the shared runtime secret with this flow:

1. Customer provides `CPAA_ACTIVATION_KEY`.
2. Entry point calls a FastAPI activation endpoint.
3. Backend validates the customer in PostgreSQL.
4. Backend returns a signed license token and customer-specific bundle secret.
5. Container decrypts/install skills and caches the license token in `/opt/data/.cpaa`.

That future version should support per-customer revocation, expiry, seat limits, and periodic license refresh.
