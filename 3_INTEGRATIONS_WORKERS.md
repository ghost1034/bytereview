# ByteReview Integration Phase

### Specification Document #3 – Background Workers & Async Processing

---

## 1 · Objectives

- **Decouple** latency-sensitive HTTP layer from heavy or slow operations (API calls to Google, Vertex AI, large file streaming).
    
- **Unify** task orchestration behind **Redis ARQ** so that import, extraction, export, automations, and cleanup all share retry, scheduling, and observability patterns.
    
- **Remove** local file download in AI extraction by switching to Vertex AI Gemini with **GCS URIs**.
    
- **Scale-out** horizontally—each worker class can be deployed as a dedicated microservice or run together depending on traffic.
    

---

## 2 · ARQ topology

| Queue        | Purpose                        | Typical job duration    | Concurrency                   | Worker image        |
| ------------ | ------------------------------ | ----------------------- | ----------------------------- | ------------------- |
| `imports`    | Drive & Gmail file ingest      | 1-30 s per file         | 10                            | `worker-imports`    |
| `extract`    | AI extraction via Vertex       | 5-25 s per PDF (Gemini) | CPU-light; `4×tasks` per vCPU | `worker-extract`    |
| `exports`    | CSV/XLSX generation & delivery | 2-10 s                  | 8                             | `worker-exports`    |
| `automation` | Trigger handling, run, export  | < 5 s orchestration     | 4                             | `worker-automation` |
| `cleanup`    | Tombstone pruning, GCS GC      | sched.                  | 1                             | `worker-maint`      |

`arq.connections.RedisSettings` points to single-node Redis 6 (upgrade to cluster when required).

---

## 3 · Common task contract

```python
@dataclass
class TaskCtx:
    operation_id: UUID        # For progress updates
    user_id: str              # Firebase UID
```

All tasks accept a **pydantic payload** inheriting from `BaseTaskPayload` (includes `ctx: TaskCtx`).

### Progress pub/sub

Each worker publishes:

```python
await redis.xadd(
    f"progress:{ctx.operation_id}",
    {"pct": pct, "stage": stage},
    max_len=1000, approximate=True,
)
```

Polling endpoint reads the newest entry; no need for Noti.

---

## 4 · Worker implementation details

### 4.1 `gdrive_import_worker`

- **Input**: list of Drive file IDs, `job_id`.
    
- **Steps**
    
    1. Fetch OAuth credential via `google_oauth.get_session(user_id, 'drive.readonly')`.
        
    2. For each ID:
        
        - `files.get(fileId, fields="mimeType,name,size,id,parents")`
            
        - If `mimeType == 'application/vnd.google-apps.folder'`: recursively list children.
            
        - For native Google Docs/Sheets: export as PDF via `files.export`.
            
        - Stream binary to GCS with **resumable upload**: `blob.upload_from_file(io.BytesIO(chunk))`.
            
        - Insert or update `source_files` row (`status='uploaded'`, `source_type='gdrive'`, `external_id=id`).
            
    3. On error per-file: mark `status='failed'`, continue; aggregate errors in task error list.
        
- **Retry**: up to 3 attempts, exponential back-off 15 s → 60 s → 5 min. Skips files already `uploaded`.
    

### 4.2 `gmail_import_worker`

- **Input**: list of `{messageId, attachmentId}` + `job_id`.
    
- **Steps**
    
    1. Fetch Gmail session (`gmail.readonly` scope).
        
    2. `users.messages.attachments.get` returns base64; stream to GCS.
        
    3. MIME detection: if `application/zip` then **unpack logic lives here** (Appendix A—Upload System superseded).
        
        - Save each member file separately as new `source_files`; preserve original zip as `file_type='archive'`.
            
    4. Insert rows with `source_type='gmail'`, `external_id=f"{msgId}:{attId}"`.
        
- **Concurrency caveat**: Gmail API QPS limit 250; use **RateLimiter** decorator (ARQ 0.24).
    

### 4.3 `ai_extraction_worker`

> **Major change:** Vertex AI instead of client-side Gemini calls.

- **Input**: `task_id`, `run_id`, `gcs_uri`, `prompt`, optional field schema.
    
- **Vertex request**
    

```python
payload = {
    "contents": [{"role": "user", "parts": [
        {"text": prompt},
        {"fileData": {"mimeType": "application/pdf", "fileUri": gcs_uri}}
    ]}],
    "systemInstruction": system_prompt_text,
    "safetySettings": VERTEX_SAFETY,
}
resp = gemini.generate_content(**payload)
```

- **Quota management**:
    
    - Use **per-task model version** in DB (`system_prompts.version`) so future upgrades are idempotent.
        
    - Implement **token bucket** limiter (Cloud Monitoring metric driven).
        
- **Result parsing**: Vertex returns JSON string; validate against:
    

```jsonschema
{
  "type": "object",
  "properties": {
    "columns": {"type":"array","items":{"type":"string"}},
    "results": {"type":"array","items":{"type":"array"}}
  },
  "required":["columns","results"]
}
```

Errors raise `RetryTaskError` (max 2) else mark `status='failed'`.

### 4.4 `export_worker`

- **Input**: `export_id`, `run_id`.
    
- **Steps**
    
    1. Query consolidated dataframe:
        
        ```sql
        SELECT extracted_data
          FROM extraction_results
         WHERE run_id = :run
        ```
        
        Build Pandas DF from each `columns/results`.
        
    2. Serialize: `df.to_csv()` or `df.to_excel(engine='xlsxwriter')` writing to `/tmp/export.<ext>`.
        
    3. Destinations:
        
        - **download**: upload to `gcs://exports/{export_id}` public-signed URL (1 week).
            
        - **gdrive**: POST resumable upload using user's `drive.file` scope; set parent `folderId` if provided.
            
        - **gmail**: build MIME multipart & `users.messages.send` with `raw` base64url encoded; subject includes job name.
            
    4. Update `job_exports.status`, record `external_id`.
        
- **Parallel write**: CPU heavy only during DataFrame build; run with `--max-jobs 4` per pod.
    

### 4.5 `automation_trigger_worker`

- **Input**: Pub/Sub push payload containing Gmail history ID.
    
- **Steps**
    
    1. Map push to `integration_account` via watch label.
        
    2. Call `users.history.list` to fetch new messages.
        
    3. For each `automation` row with `trigger_type='gmail_attachment'` & `is_enabled`:
        
        - Evaluate `trigger_config.query` via Gmail `users.messages.list(q=…)`.
            
        - For matched attachments, enqueue `gmail_import_worker` **chained** with:
            
            - `run_initializer_worker` (creates new `job_run` from template).
                
            - `export_worker` with `export_config`.
                
    4. Insert `automation_runs` rows for audit; retries 3 times if Gmail 5xx.
        

### 4.6 `run_initializer_worker`

*Input*: `job_id`

1. Insert a new row in `job_runs` (`status='pending'`, increment
   `run_number`).
2. Read the **current** `job_fields` and `source_files`; generate
   `extraction_tasks` that reference the new `run_id`.
3. Enqueue those tasks in the `extract` queue and mark run
   `status='in_progress'`.

### 4.7 `cleanup_worker`

Runs hourly (ARQ cron):

```python
cron(
   cron_expression="0 * * * *",  # top of hour
   queue_name="cleanup",
)
```

Jobs:

- Delete `job_exports` older than 30 days with `dest_type='download'` and remove GCS objects.
    
- Prune `progress:*` Redis streams > 24 h.
    
- Revoke Google tokens where `refresh_token` revoked (detected via refresh failure counter).
    

---

## 5 · Error & retry policy

|Error class|Retry?|Timeout|Notes|
|---|---|---|---|
|Network (5xx, read-timeout)|yes|3 attempts|exponential 2× delay|
|Invalid credentials (401/403)|refresh token then retry (once)||if still 401 → fail|
|Vertex quota / Rate limit|yes|up to 5 min back-off|respect `Retry-After` header|
|User-data error (malformed PDF)|no|—|mark task `failed`|

Workers raise `RetryTaskError(delay=X)` to reschedule. Final failure logs to Sentry + DB `error_message`.

---

## 6 · Deployment & scaling

- Each worker type packaged as separate **Docker** image (`Dockerfile.worker`) inheriting from project base image.
    
- Deploy to **Cloud Run jobs** with min instances = 0, max defined per queue.
    
- Use **Cloud Run CPU-always-allocated** _disabled_ to save cost; workers finish and scale to 0.
    
- Horizontal scale triggered by Redis Stream length via **Cloud Monitoring alert → Cloud Run Revisions API** (simple for MVP; later KEDA).
    

---

## 7 · Observability

|Metric|Source|Dashboard Widget|
|---|---|---|
|`arq_job_runtime_seconds{queue}`|ARQ’s Prometheus hook|P95 runtime|
|`arq_job_failures_total{queue}`|same|Bar per queue|
|`vertex_tokens_consumed`|Vertex usage API|Daily stacked area|
|`gdrive_api_qps`|Google Admin quota|Line with limit overlay|

Error logs forwarded to **Cloud Logging**; `trace_id` is `ctx.operation_id`.

---

## 8 · Design alternatives & rationale

|Concern|Option A (chosen)|Option B|Reason|
|---|---|---|---|
|**Queue tech**|Redis ARQ|Google Cloud Tasks|Already in code-base, supports cron & retries; avoids extra GCP cost.|
|**Vertex integration**|Direct REST from worker|Cloud Functions wrapper|Less hop latency; easier to stream output.|
|**ZIP unpack**|Do inside Gmail/Drive import worker|Separate “analysis” worker (legacy)|Keeps single pass over bytes; the analysis phase was removed per new UX.|
|**Progress tracking**|Redis Streams|Postgres notifications|Stream semantics align with polling; no extra DB load.|

---

## 9 · Test plan

|Level|Scenario|Expected|
|---|---|---|
|Unit|`ai_extraction_worker` with mocked Vertex 429|Retries 2× then `failed` status|
|Integration|200-file Drive folder upload|All files appear, 0 duplicates, op progress hits 100 %.|
|Stress|500 concurrent extraction tasks|Worker autoscaled pods; average runtime ≤ 30 s.|
|Fault-inject|Expire Google refresh token|Automatic refresh; if revoked, user sees “Re-connect” banner.|

---
