# ByteReview Integration Phase

### Specification Document #5 – Authentication & Security

---

## 1 · Threat model & guiding principles

|Layer|Primary threats|
|---|---|
|**Client**|XSS, CSRF, token leakage, OAuth “mix-up” attacks|
|**API & workers**|Privilege escalation, ID-spoofing, SQL injection, insecure deserialisation|
|**Third-party integrations**|Stolen refresh tokens, over-scoped OAuth grants, replayed Google webhook|
|**Infra**|Key exposure (KMS), mis-configured IAM, credential stuffing, DoS|

**Principles**

- Zero-trust: every request must carry verifiable credentials; workers re-validate where feasible.
    
- Least privilege: scopes, IAM roles, KMS keys, service accounts narrowed to _minimum_ necessary.
    
- Defence-in-depth: layered controls (JWT auth **and** row-level checks, CORS **and** CSRF token, KMS **and** network egress restriction).
    

---

## 2 · Authentication flow

### 2.1 End-user identity

- **Firebase Auth** (Google, Microsoft, email-link) – issued **ID token (JWT)** → `Authorization: Bearer <token>`.
    
- Backend validates via `google-auth-id-token` verifier with _public certificates_ cache.
    
- UID maps 1-to-1 to `users.id` (FK char(128)).
    
- **Custom claims**:
    
    - `plan: 'free' | 'pro' | 'enterprise'` – used by rate limiter & worker quotas.
        
    - `admin: true` – elevated routes.
        

**Token lifetime**: 1 h; client SDK auto-refreshes. Backend accepts `max_age` 2 h to allow skew.

### 2.2 Server-to-server auth

- Workers call internal FastAPI endpoints **without** Firebase; instead they present a short-lived **signed service JWT** (`aud="bytereview-api"`) minted by Cloud Run IAM.
    
- API inspects `X-Internal-Auth: <jwt>` header and validates with Google service account certs.
    

---

## 3 · Integration account security

### 3.1 Storage

|Decision|Detail|
|---|---|
|Encryption|**AES-256-GCM** using **Google Cloud KMS** key _bytereview/integration-tokens_.|
|Format|`EncryptedBlob = b64(IV|
|Key rotation|Automatic KMS rotation every 90 days; app decrypts with _primary_ then re-encrypts with _latest_ if version mismatch (lazy rotation).|
|Secrets distribution|Workers & API run with GCP IAM role **`roles/cloudkms.cryptoKeyDecrypter`** (no encrypt) for runtime decryption; encryption via envelope (KMS `Encrypt`).|

#### Implementation snippet

```python
from google.cloud import kms
import base64, os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def encrypt(clear: bytes) -> bytes:
    iv = os.urandom(12)
    dek = kms_client.generate_random_bytes(name=RNG_LOCATION, length_bytes=32)
    aesgcm = AESGCM(dek)
    ct = aesgcm.encrypt(iv, clear, None)
    return base64.urlsafe_b64encode(iv + ct)
```

### 3.2 OAuth scope strategy

- Default minimal scopes:
    
    - **Drive import** – `https://www.googleapis.com/auth/drive.readonly`.
        
    - **Drive export** – additional `drive.file` (allows create/manage _own_ files only).
        
    - **Gmail import** – `gmail.readonly`.
        
    - **Gmail export / trigger** – add `gmail.send`, `gmail.modify`.
        
- **Incremental consent**: first connect uses `drive.readonly` + `gmail.readonly`; when user chooses export-to-Drive/Gmail, we prompt for extra scope via _OAuth Re-Consent_ flow.
    
- Scopes stored per `integration_account.scopes` array so backend can refuse unsupported actions (“Re-connect to add _gmail.send_ scope”).
    

### 3.3 Refresh token handling

- Google issues **“Limited-input device”** flow tokens that do _not_ expire; still honour `expires_at` to know when access token needs refresh.
    
- Refresh tokens **never** returned to browser; only backend stores encrypted blob.
    
- Workers needing provider API call use helper `get_google_session()` which:
    
    1. Decrypts refresh token.
        
    2. Requests new access token with audience-restricted refresh.
        
    3. Updates `expires_at`.
        
    4. If refresh fails with `invalid_grant` → mark account `needs_reconnect` and emit Sentry event; UI banner shows “Reconnect”.
        

---

## 4 · API & transport security

|Vector|Mitigation|
|---|---|
|**CORS**|`Access-Control-Allow-Origin: https://app.bytereview.ai` (production) and `http://localhost:3000` (dev); `Vary: Origin`; credentials **true**.|
|**CSRF**|API only accepts **Bearer tokens** in **Authorization** header – protects against browser-initiated XHR with cookies; no double-submit needed.|
|**Clickjacking**|`X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`.|
|**XSS**|Next.js defaults + Strict CSP: `script-src 'self' 'nonce-<nonce>'; object-src 'none';`. No dangerouslySetInnerHTML except sanitized Markdown viewer.|
|**Rate limiting**|Redis sliding window (`uid + path`) → 60 r/m default; 1000 r/m for upload signed-URL issuance. Exceed → HTTP 429 w/ `Retry-After`.|
|**SQL injection**|SQLAlchemy ORM param binding only; raw SQL uses `text()` with `:bind`.|
|**Deserialisation**|All JSON parsed via Pydantic; unknown keys rejected (`extra="forbid"`).|
|**File uploads**|MIME sniff server-side; rejects >100 MB unless plan=enterprise. Signed-URL limited to 15 min.|
|**Downloads**|Signed URL TTL 7 days; `Content-Disposition: attachment`.|

---

## 5 · Row-level authorization

Every SELECT/UPDATE/DELETE query includes **`WHERE table.user_id = :uid`** (or join through job → user).  
_Alembic_ migration adds **policy test harness**: if accidental query misses filter, test fails (empty row set expected vs fixture).

---

## 6 · Google webhook / Pub Sub validation

1. **Watch registration** – each `integration_account` creates Gmail watch with a **random 128-bit token** stored `watch_token`.
    
2. **Push endpoint** `/webhooks/gmail/push` checks header:
    
    ```python
    token = headers["X-Goog-Channel-Token"]
    if token not in valid_watch_tokens:
        raise HTTPException(401)
    ```
    
3. Additionally, if Pub/Sub push uses **OIDC token**, verify JWT (`aud=apiUrl`, `iss=accounts.google.com`).
    

Replay prevention: message contains monotonically increasing `historyId`; store last processed ID per integration and discard lower IDs.

---

## 7 · Cloud IAM & networking

|Resource|Principle|Role|
|---|---|---|
|**Cloud Run API service**|`bytereview-api@` SA|`roles/cloudsql.client`, `roles/secretmanager.secretAccessor`, `roles/cloudkms.cryptoKeyDecrypter`, `roles/pubsub.publisher` (progress streams)|
|**Workers** (`imports`,`extract`,…)|separate SA per worker|Same as API plus _scoped_ Google API role (via workload identity federation)|
|**GCS buckets**|uniform bucket-level access, **private**|Signed URLs only; no public ACL.|
|**Redis (Cloud Memorystore)**|VPC-only|Access whitelisted to Cloud Run subnet.|

**Egress firewall** restricts outbound IPs – allowlist Google APIs (`*.googleapis.com`) and Vertex; blocks arbitrary internet.

---

## 8 · Key & secret management

|Secret|Location|Rotation|
|---|---|---|
|`GOOGLE_CLIENT_SECRET`|**Secret Manager** versioned|Manual rotate 6 months|
|`POSTGRES_PASSWORD`|Secret Manager|Auto rotate via Cloud SQL “automatic rotation” 90 days|
|KMS **crypto key**|Cloud KMS|Automatic 90 day rotation|
|JWT signing key for internal tokens|KMS **bytereview/internal-jwt**|30 day rotation; JWK served at `/.well-known/jwks.json` for pods|

---

## 9 · Application-level event logging & audit

- **BigQuery table `api_audit`** – columns: `timestamp`, `uid`, `ip`, `route`, `verb`, `status`, `payload_hash`, `diff`.
    
- Mutating routes insert row via FastAPI middleware.
    
- Background tasks also log under `uid=<system>` but include `impersonated_uid` field.
    
- Retention 2 years, partitioned by day; export to GCS for cold storage after 365 days.
    

---

## 10 · Security testing & compliance

|Activity|Tool / Service|Frequency|
|---|---|---|
|**SCA**|GitHub Dependabot + Snyk|CI / each PR|
|**SAST**|`bandit`, `semgrep`|PR gate|
|**DAST**|OWASP ZAP against staging|weekly|
|**Pentest**|External vendor|pre-GA + annually|
|**CSP / headers**|`securityheaders.com` monitor|nightly|
|**Secrets scan**|GitGuardian|on push|

All critical findings create Jira ticket under “Security” component; SLA 14 days.

---

## 11 · Incident response & monitoring

- **Alerts** via Cloud Monitoring:
    
    - > 10 token refresh failures/min (possible integration outage).
        
    - > 30 5xx responses/min API (DoS or bug).
        
    - Any KMS key disable/rotation event not initiated by CI system.
        
- **Runbooks** stored in Google Docs; shortcut `/IR` in Slack.
    
- **PagerDuty** escalation policy: On-call engineer → Eng Mgr → CTO.
    

---

## 12 · Alternative approaches considered

|Topic|Chosen (A)|Alternative (B)|Rationale|
|---|---|---|---|
|Token encryption|Cloud KMS + AES-GCM in-row|Store tokens in Secret Manager|KMS cheaper (1 API call per decrypt vs secret read), easier bulk rotation.|
|Auth for internal services|Service JWT signed by KMS|mTLS between Cloud Run services|JWT simpler in serverless; Cloud Run mTLS limited.|
|CSRF mitigation|Bearer-token only APIs|Double-submit anti-CSRF token|Simpler; bearer header not sent by browsers cross-site.|

---

## 13 · Implementation checklist

1. **Encrypt/decrypt helpers** implemented (`lib/security/crypto.py`).
    
2. Middleware chain order:
    
    1. `AuthMiddleware` → verify Firebase or Service JWT
        
    2. `RateLimitMiddleware`
        
    3. `AuditMiddleware` (after body parsed)
        
3. Cloud Build steps create/ensure KMS key, IAM bindings.
    
4. Terraform updates for bucket uniform access & egress firewall rules.
    
5. Security section added to README with **curl** snippets for penetration testers.
    

---
