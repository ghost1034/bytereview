# Hermes Agent

## Goal

My platform, CPAAutomation.ai, offers an AI agent setup service. We set up Hermes Agent for businesses for a fee. On our advertisement page, we want to include a download link for a Docker image that already has skills included. But because we want to charge businesses a fee, we want the image to be unusable without an activation key. How do I include skills and implement an activation key? Search the web about Hermes Agent if you are unfamiliar.

Implementation note: the current AccountingClaw build uses Option B with encrypted bundled skills and a shared `CPAA_BUNDLE_SECRET`, without an activation API yet. See `docs/hermes/ACCOUNTINGCLAW.md`.

## Idea

Hermes Agent is a good fit for this, but the safest product design is **not “plaintext skills hidden by a startup check.”** A Docker image can always be inspected by a determined customer. Use **encrypted bundled skills** or **download skills only after activation**.

Hermes stores its persistent Docker data under `/opt/data`, including `config.yaml`, `.env`, sessions, memories, and `skills/`; the image itself is intended to be stateless. ([Hermes Agent][1]) Hermes skills live under `~/.hermes/skills/`, are automatically available as slash commands, and follow the `SKILL.md` structure. ([Hermes Agent][2]) Hermes also has an official “profile distribution” concept for shipping a whole agent with `SOUL.md`, `config.yaml`, `skills/`, cron jobs, and env-var requirements, including a commercial-product example with a license key env var. ([Hermes Agent][3])

## Recommended architecture

Use this model:

```text
Customer downloads Docker image
        ↓
Container starts activation wrapper
        ↓
Customer provides CPAA_ACTIVATION_KEY
        ↓
Wrapper calls your license API
        ↓
API validates purchase + machine/account
        ↓
API returns signed license token + decryption key or signed skill download URL
        ↓
Wrapper installs/decrypts skills into /opt/data/skills
        ↓
Hermes starts
```

There are two viable ways to package the skills.

## Option A — Better security: download skills after activation

Do **not** ship the paid skills in the image. Ship only Hermes plus your activation wrapper. After activation, your API returns a short-lived signed URL to a tarball or git repo containing the paid Hermes profile/skills.

This is strongest because there is nothing valuable to extract from the unauthenticated image.

```dockerfile
FROM nousresearch/hermes-agent:latest

USER root
RUN apt-get update && apt-get install -y curl jq ca-certificates && rm -rf /var/lib/apt/lists/*

COPY cpa-entrypoint.sh /usr/local/bin/cpa-entrypoint
RUN chmod +x /usr/local/bin/cpa-entrypoint

ENTRYPOINT ["/usr/local/bin/cpa-entrypoint"]
CMD ["gateway", "run"]
```

`cpa-entrypoint.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="${HERMES_DATA_DIR:-/opt/data}"
LICENSE_FILE="$DATA_DIR/.cpa/license.json"
SKILLS_DIR="$DATA_DIR/skills"
ACTIVATION_URL="${CPAA_ACTIVATION_URL:-https://api.cpaautomation.ai/v1/activate}"

mkdir -p "$DATA_DIR/.cpa" "$SKILLS_DIR"

fingerprint() {
  {
    cat /etc/machine-id 2>/dev/null || true
    hostname
    ip link 2>/dev/null | sha256sum | awk '{print $1}' || true
  } | sha256sum | awk '{print $1}'
}

if [ ! -s "$LICENSE_FILE" ]; then
  if [ -z "${CPAA_ACTIVATION_KEY:-}" ]; then
    echo "CPAAutomation.ai activation required."
    echo "Run with: -e CPAA_ACTIVATION_KEY=your-key"
    exit 64
  fi

  FP="$(fingerprint)"

  response="$(curl -fsS "$ACTIVATION_URL" \
    -H 'Content-Type: application/json' \
    -d "{\"activation_key\":\"$CPAA_ACTIVATION_KEY\",\"fingerprint\":\"$FP\"}")"

  echo "$response" | jq -e '.license_token and .skills_url' >/dev/null
  echo "$response" > "$LICENSE_FILE"

  skills_url="$(echo "$response" | jq -r '.skills_url')"

  tmp="$(mktemp -d)"
  curl -fsSL "$skills_url" -o "$tmp/skills.tar.gz"
  tar -xzf "$tmp/skills.tar.gz" -C "$DATA_DIR"
  rm -rf "$tmp"
fi

exec /opt/hermes/.venv/bin/hermes "$@"
```

Run command:

```bash
docker run -d \
  --name cpa-hermes \
  --restart unless-stopped \
  -v ~/.cpa-hermes:/opt/data \
  -e CPAA_ACTIVATION_KEY="cpaa_live_xxxxx" \
  -e OPENAI_API_KEY="sk-..." \
  -p 8642:8642 \
  cpaautomation/hermes-agent:latest gateway run
```

## Option B — “Skills included” marketing: encrypted skills inside the image

If your ad must say the Docker image “already includes skills,” include them as an **encrypted tarball**, not plaintext files. The image contains:

```text
/opt/cpa/premium-skills.enc
/usr/local/bin/cpa-entrypoint
```

The activation API returns the decryption key only after payment/validation. Without activation, the customer can see the encrypted blob but cannot use the skills.

Build the encrypted bundle locally:

```bash
tar -czf premium-skills.tar.gz skills/ SOUL.md config.yaml distribution.yaml

openssl enc -aes-256-gcm \
  -salt \
  -pbkdf2 \
  -iter 200000 \
  -in premium-skills.tar.gz \
  -out premium-skills.enc \
  -pass env:CPAA_BUNDLE_SECRET
```

Dockerfile:

```dockerfile
FROM nousresearch/hermes-agent:latest

USER root
RUN apt-get update && apt-get install -y curl jq openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY premium-skills.enc /opt/cpa/premium-skills.enc
COPY cpa-entrypoint.sh /usr/local/bin/cpa-entrypoint
RUN chmod +x /usr/local/bin/cpa-entrypoint

ENTRYPOINT ["/usr/local/bin/cpa-entrypoint"]
CMD ["gateway", "run"]
```

Activation wrapper decrypt step:

```bash
bundle_secret="$(echo "$response" | jq -r '.bundle_secret')"

openssl enc -d -aes-256-gcm \
  -pbkdf2 \
  -iter 200000 \
  -in /opt/cpa/premium-skills.enc \
  -out "$tmp/premium-skills.tar.gz" \
  -pass pass:"$bundle_secret"

tar -xzf "$tmp/premium-skills.tar.gz" -C "$DATA_DIR"
```

For production, use a **unique encrypted bundle key per customer/license** when possible, or return a short-lived key wrapped by your license server. Do not hardcode any decryption secret in the Docker image.

## How to structure your Hermes skills

Inside the premium bundle, use Hermes’ expected layout:

```text
skills/
  tax-workflows/
    client-onboarding/
      SKILL.md
      templates/
      scripts/
    qbo-reconciliation/
      SKILL.md
      references/
SOUL.md
config.yaml
distribution.yaml
```

Example `SKILL.md`:

```markdown
---
name: qbo-reconciliation
description: Reconcile QuickBooks Online transactions using CPAAutomation.ai workflows
version: 1.0.0
platforms: [linux]
metadata:
  hermes:
    tags: [accounting, qbo, reconciliation]
    category: accounting
required_environment_variables:
  - name: CPAA_ACTIVATION_KEY
    prompt: CPAAutomation.ai activation key
    required_for: premium skill access
  - name: QBO_CLIENT_ID
    prompt: QuickBooks client ID
    required_for: QuickBooks API access
---

# QBO Reconciliation

## When to Use

Use this skill when the user asks Hermes to reconcile bank transactions, categorize uncategorized transactions, or prepare reconciliation exception reports.

## Procedure

1. Confirm the client entity and accounting period.
2. Load the configured QBO credentials.
3. Retrieve transactions for the target period.
4. Identify unmatched, duplicate, or suspicious entries.
5. Produce a reconciliation summary and exception report.

## Verification

Confirm beginning balance, ending balance, uncleared transactions, and unresolved exceptions.
```

Hermes supports required environment variables in skills and will prompt or direct users to configure missing values rather than exposing secrets through chat surfaces. ([Hermes Agent][2])

## License API design

Your activation key should be a **redemption credential**, not the runtime license itself.

A simple schema:

```text
Activation key:
  cpaa_live_abc123...

License record:
  customer_id
  plan
  allowed_seats
  allowed_domains
  expires_at
  revoked_at
  activated_fingerprints[]
```

Activation endpoint:

```http
POST /v1/activate
{
  "activation_key": "cpaa_live_abc123",
  "fingerprint": "sha256-machine-fingerprint",
  "image_version": "1.0.3"
}
```

Response:

```json
{
  "license_token": "signed.jwt.or.paseto",
  "expires_at": "2026-06-21T00:00:00Z",
  "skills_url": "https://signed-url.example.com/customer-bundle.tar.gz",
  "features": ["premium_skills", "gateway", "dashboard"]
}
```

Use a signed token such as JWT or PASETO with:

```json
{
  "iss": "cpaautomation.ai",
  "sub": "customer_123",
  "plan": "business",
  "fingerprint": "sha256-machine-fingerprint",
  "exp": 1782000000,
  "features": ["premium_skills"]
}
```

The container should periodically re-check the license, for example on startup and every 24 hours. Cache a signed token locally so short outages do not break customers, but enforce expiry and revocation after a grace period.

## Important security reality

You can make casual copying hard, but you cannot make a Docker image perfectly tamper-proof. A customer can:

```bash
docker save image
docker run --entrypoint sh image
docker cp container:/...
```

So the rules are:

1. **Never put plaintext paid skills in the image** unless you accept that they can be copied.
2. **Never put the activation validation secret in the image.**
3. **Do not rely only on an entrypoint check.** Users can bypass entrypoints.
4. **Keep premium value server-side when possible**, such as hosted workflows, updates, private skill downloads, support, and managed setup.
5. **Sign license tokens server-side** and verify them client-side with only a public key in the image.

## Practical recommendation for CPAAutomation.ai

For your business model, I would do this:

```text
Public Docker image:
  Hermes Agent
  CPAAutomation activation wrapper
  Public/free setup skill
  No paid skills in plaintext

After activation:
  Install CPAAutomation Hermes profile distribution
  Pull paid skills into /opt/data/skills
  Write license token to /opt/data/.cpa/license.json
  Start Hermes gateway
```

This aligns with Hermes’ own Docker model, where `/opt/data` is the persistent source of truth for skills/config, and with Hermes profile distributions, which are explicitly designed for shipping an opinionated commercial agent product with env-var/license requirements. ([Hermes Agent][1])

One more note: Hermes Agent’s GitHub page shows it under an MIT license, so you can generally build commercial services around it, but you should preserve license notices and review the licenses of any third-party skills you bundle. ([github.com][4])

[1]: https://hermes-agent.nousresearch.com/docs/user-guide/docker "Docker | Hermes Agent"
[2]: https://hermes-agent.nousresearch.com/docs/user-guide/features/skills "Skills System | Hermes Agent"
[3]: https://hermes-agent.nousresearch.com/docs/user-guide/profile-distributions "Profile Distributions: Share a Whole Agent | Hermes Agent"
[4]: https://github.com/NousResearch/hermes-agent "GitHub - NousResearch/hermes-agent: The agent that grows with you · GitHub"
