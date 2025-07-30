# ByteReview Integration Phase

### Specification Document #2 – Backend APIs (FastAPI)

---

## 1 · Scope & goals

- Provide authenticated routes for **linking external providers**, **importing files**, **running jobs**, **exporting results**, and **defining automations**.
    
- Keep contracts stable via OpenAPI and `openapi-typescript`-generated types.
    
- Ensure that long-running or third-party actions occur **asynchronously** (ARQ jobs or Pub/Sub callbacks) while the synchronous HTTP layer remains responsive.
    

---

## 2 · Conventions & baseline

| Convention         | Decision                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| **API prefix**     | `https://bytereview.ai/api` (all paths below are relative).                                            |
| **Auth**           | Firebase `ID token` in `Authorization: Bearer <token>`.                                                |
| **Error envelope** | `{"error": {"code": <int>, "message": <str>, "details": <object \| null>}}`                            |
| **Async workflow** | Endpoints that kick off background work respond `202 Accepted` with a pollable **operation** resource. |
| **Pagination**     | Standard `page`, `pageSize` (max 100) query params; responses carry `nextPageToken`.                   |
| **Idempotency**    | For mutating POSTs that could be retried by the client, accept optional `Idempotency-Key` header.      |

---

## 3 · Endpoint catalogue

### 3.1 Integration OAuth flow

|Verb|Path|Purpose|
|---|---|---|
|**GET**|`/integrations/google/auth-url`|Generate Google OAuth 2 URL with dynamic scope list.|
|**POST**|`/integrations/google/exchange`|Exchange `code` → tokens (for SPA flows).|
|**GET**|`/integrations/google/callback`|Server-side redirect URI (web flow).|
|**POST**|`/integrations/{provider}/disconnect`|Revoke & delete credential row.|

```http
GET /integrations/google/auth-url?scopes=drive.readonly,gmail.readonly HTTP/1.1
Authorization: Bearer <FirebaseID>

200 OK
{
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?..."
}
```

**Implementation notes**

- Use google-auth-lib’s `Flow` with `prompt=consent` (first time) or `prompt=select_account`.
    
- Persist encrypted tokens into `integration_accounts` on success.
    
- Token refresh handled by _single_ helper `get_google_session(user_id, scopes)` that transparently refreshes and re-encrypts.
    

---

### 3.2 Job file ingestion

|Verb|Path|Body|Purpose|
|---|---|---|---|
|**POST**|`/jobs/{jobId}/files:upload-url`|`{fileName, sizeBytes, mimeType}`|Returns signed-URL for direct GCS upload; creates `source_file` row with `status='uploading'`, `source_type='upload'`.|
|**POST**|`/jobs/{jobId}/files:confirm-upload`|`{sourceFileId}`|Client calls after PUT; sets `status='uploaded'`.|
|**POST**|`/jobs/{jobId}/files:gdrive`|`{driveIds: string[]}`|Enqueues `gdrive_import_worker`; each ID becomes `source_file` (`status='pending'`, `source_type='gdrive'`).|
|**POST**|`/jobs/{jobId}/files:gmail`|`{attachments:[{messageId, attachmentId}]}`|Enqueues `gmail_import_worker`.|
|**DELETE**|`/jobs/{jobId}/files/{sourceFileId}`|—|Soft-deletes file (marks `status='deleted'`).|

Synchronous response for import POSTs:

```jsonc
{
  "operationId": "op_58d7…",      // Poll below
  "accepted": 3                    // # of files queued
}
```

---

### 3.3 Operations polling

|Verb|Path|Purpose|
|---|---|---|
|**GET**|`/operations/{operationId}`|Returns `{done: bool, error?, metadata?}`. For file imports `metadata.progress` (0-100).|

Design option comparison

|Option|Pros|Cons|
|---|---|---|
|1. **Google-style operations resource** (chosen)|Standard, typed; `operationId` reused by exports & runs.|Extra GET for polling.|
|2. WebSocket push|Real-time.|More moving parts; Firebase App Check over WS harder.|

---

### 3.4 Job runs

| Verb      | Path                       | Body                   | Purpose                                          |
| --------- | -------------------------- | ---------------------- | ------------------------------------------------ |
| **POST**  | `/jobs/{jobId}/runs`       | `{forceRestart?:true}` | Create `job_run` and enqueue extraction tasks.   |
| **GET**   | `/jobs/{jobId}/runs`       | —                      | List with filters (`status`, `after`, `before`). |
| **GET**   | `/job-runs/{runId}`        | —                      | Details incl. progress %.                        |
| **PATCH** | `/job-runs/{runId}:cancel` | —                      | Cancels pending tasks & export queue.            |

`POST /runs` response: `202 Accepted {operationId}` referencing the run bootstrap worker.

---

### 3.5 Exports

|Verb|Path|Body|Purpose|
|---|---|---|---|
|**POST**|`/job-runs/{runId}/exports`|`{ destType: 'download' \| 'gdrive' \| 'gmail', fileType: 'csv' \| 'xlsx', destConfig?: { folderId?: string, email?: string } }`|Creates a `job_exports` row for the run and enqueues the export worker. Returns **`202 Accepted`** with an `operationId` for progress polling.|
|**GET**|`/job-exports/{exportId}/download`|—|If the export’s `destType` is **`download`**, returns a short-lived signed GCS URL that the browser can follow to fetch the generated file directly.|

**Alternative considered:** letting the frontend stream CSV directly after run ≈ simpler but fails for Drive/Gmail destination and large files; chosen design unifies.

---

### 3.6 Automations CRUD

|Verb|Path|Notes|
|---|---|---|
|**GET**|`/automations`|Paginated list.|
|**POST**|`/automations`|JSON body matches table schema; server validates Gmail query string via `gm-dash` grammar.|
|**GET**|`/automations/{automationId}`|—|
|**PATCH**|`/automations/{automationId}`|Partial update; may set `is_enabled=false`.|
|**DELETE**|`/automations/{automationId}`|Hard delete plus revoke Gmail watch channel if last automation using it.|

---

### 3.7 Webhook endpoints

|Verb|Path|Sec Header|Purpose|
|---|---|---|---|
|**POST**|`/webhooks/gmail/push`|`X-Goog-Channel-Token`|Receives Google Pub/Sub push message when new mail hits watch. Enqueues `automation_trigger_worker`.|
|**POST**|`/webhooks/arq/{queue}`|Internal (no auth, VPC only) – acknowledges ARQ task callbacks for reliable progress webhooks.||

Security: verify JWT audience if Pub/Sub push uses `OIDC` tokens _OR_ compare token to stored random secret.

---

## 4 · Pydantic models

```python
class GDriveImportRequest(BaseModel):
    driveIds: conlist(str, min_items=1, max_items=50)

class GmailAttachRef(BaseModel):
    messageId: constr(regex=r"^[a-fA-F0-9]{16,}$")
    attachmentId: str

class GmailImportRequest(BaseModel):
    attachments: conlist(GmailAttachRef, min_items=1, max_items=20)

class ExportCreate(BaseModel):
    destType: Literal['download','gdrive','gmail']
    fileType: Literal['csv','xlsx']
    destConfig: dict | None = None  # validated per destType
```

_All response models embed `operationId` when async, else resource DTO._

---

## 5 · Background integration with ARQ

FastAPI **does not** await Redis job; instead:

```python
operation_id = uuid4()
arq_redis.enqueue_job(
    "gdrive_import", drive_ids, job_id=str(job_id), operation_id=str(operation_id)
)
return OperationQueued(operationId=operation_id)
```

A generic **`progress_updater`** coroutine publishes `%` to Redis Stream keyed by `operation_id`; polling endpoint reads latest entry → O(1).

---

## 6 · OpenAPI & TS client generation

1. Annotate routes with `@router.post(response_model=OperationQueued, status_code=202)` etc.
    
2. Run:
    
    ```bash
    uvicorn app.main:app --port 9000 --reload
    poetry run python scripts/generate_openapi.py  \
           --save-path openapi.json
    npx openapi-typescript openapi.json \
           --output ../frontend/lib/api-types.ts
    ```
    
3. Frontend uses React-query wrapper factory:
    
    ```ts
    import { paths } from '@/lib/api-types';
    type CreateExportResponse = paths['/job-runs/{runId}/exports']['post']['responses']['202']['content']['application/json'];
    ```
    

---

## 7 · Cross-cutting concerns

### 7.1 Rate limiting

- Global default: 60 requests / min / user (Redis sliding window).
    
- Burst exceptions: `files:upload-url` – 300/min to allow multi-chunk uploads.
    

### 7.2 Audit logging

All mutating endpoints log to BigQuery table `api_audit` with request metadata, auth UID, and diff snapshot (redacting tokens).

### 7.3 Validation strategy

- Drive IDs validated with regex `^[a-zA-Z0-9_-]{20,}$`.
    
- Gmail search queries parsed by mini grammar – reject if unsupported operators (prevents expensive “OR” spam).
    

---

## 8 · Design choices & trade-offs

|Area|Option A (chosen)|Option B|Rationale|
|---|---|---|---|
|File uploads|GCS _signed URLs_ issued by backend|Pure multipart POST to FastAPI then upload|Minimises API pod RAM & egress; lets browser resume.|
|Long-running ops|Polling operations|WebSocket push|Easier to cache/proxy; avoids keep-alive issues on Cloud Run.|
|Exports|Dedicated `/job-exports` + worker|Inline after extraction|Keeps UI responsive; allows multiple export destinations w/o re-running extraction.|

---

## 9 · Test matrix

|Endpoint|Unit|Integration (staging)|Notes|
|---|---|---|---|
|`/integrations/google/exchange`|Mock Google token endpoint|Cypress flow w/ test GCP project|Token stored encrypted, `expires_at` populated|
|`/jobs/{id}/files:gdrive`|Ensure op queued|End-to-end: pick Drive file; results appear|Verify `source_type='gdrive'`|
|`/job-runs/{runId}/exports`|Validation failure (no destType) → 422|Full run + export → file appears in Drive||
|Gmail webhook|Signature fails → 401|Emulated Pub/Sub push triggers automation|Debounce duplicate pushes|

---

## 10 · Deployment sequence

1. Ship database migrations (from Spec #1).
    
2. Deploy backend with **feature-flag `INTEGRATIONS_PHASE`** off (routes behind flag).
    
3. Smoke test new routes in staging; enable flag → production.
    
4. Regenerate TS client & publish `@bytereview/sdk@0.6.0`.
    
5. Deploy updated frontend once backend flag is live.
    

---
