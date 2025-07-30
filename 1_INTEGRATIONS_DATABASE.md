# ByteReview Integration Phase

### Specification Document #1 – Data-Model & Storage Layer

---

## 1. Objective

Adapt the relational schema so that ByteReview can:

- **Ingest** files from Google Drive and Gmail (plus future providers) alongside traditional uploads.
    
- **Export** extraction results to multiple destinations (download, Drive, Gmail).
    
- **Run** the _same_ extraction job many times with evolving input files or field definitions while preserving historical results.
    
- **Register** reusable “Automations” that listen for triggers (first: Gmail attachment received) and launch job runs followed by an export.
    
- **Persist & refresh** third-party OAuth credentials securely.
    

All schema changes are additive and backward-compatible except where noted; existing jobs migrate seamlessly.

---

## 2. Entity-relationship overview

```text
users ─┐
       ├── integration_accounts
       ├── templates
       ├── extraction_jobs ─┐
       │                    ├── source_files
       │                    ├── job_fields
       │                    ├── job_runs ─┐
       │                    │             ├── extraction_tasks
       │                    │             ├── extraction_results
       │                    │             └── job_exports
       ├── automations ─┐
       │                └── automation_runs ─── job_runs (...)
       └── data_types (unchanged)
```

---

## 3. New & modified tables

### 3.1 `integration_accounts` (new)

|Column|Type|Constraints|Notes|
|---|---|---|---|
|`id`|`uuid`|PK||
|`user_id`|`varchar(128)`|FK → `users.id`, **ON DELETE CASCADE**||
|`provider`|`varchar(30)`|`CHECK (provider IN ('google','microsoft',...))`|Future-proof list.|
|`scopes`|`text[]`|not null|Full granted scope set.|
|`access_token`|`bytea`|nullable|AES-GCM encrypted.|
|`refresh_token`|`bytea`|nullable|AES-GCM encrypted (may be null for 3-legged flows).|
|`expires_at`|`timestamptz`|nullable||
|`created_at` / `updated_at`|`timestamptz`|defaults `now()`||

**Indexes**

```sql
CREATE INDEX idx_integration_accounts_user_provider
    ON integration_accounts (user_id, provider);
```

### 3.2 `source_files` (modified)

```diff
+ source_type   varchar(20) NOT NULL DEFAULT 'upload',
+ external_id   text,
```

- `source_type` enum values: **`upload`**, `gdrive`, `gmail` (more later).
    
- `external_id` stores the Drive file ID or the tuple `{msgId}:{attachId}` for Gmail.
    

### 3.3 `job_runs`  (new)

Represents one execution of an `extraction_job`.

| Column          | Type        | Notes                                  |
|-----------------|-------------|----------------------------------------|
| `id`            | `uuid` PK   |                                        |
| `job_id`        | `uuid` FK → `extraction_jobs.id` (**ON DELETE CASCADE**) |
| `run_number`    | `int`       | unique per job (starts at 1)           |
| `status`        | `varchar(50)` | `pending`, `in_progress`, …           |
| `tasks_total`   | `int`       |                                        |
| `tasks_completed` / `tasks_failed` | `int` |                            |
| `started_at` / `completed_at` | `timestamptz` |                        |

> **Note:** If later we decide we need to track edits to job configuration data like job fields, we can introduce a job_versions table without breaking the job_runs semantics above.

### 3.4 `extraction_tasks` (modified)

```diff
- job_id  uuid NOT NULL
+ run_id  uuid NOT NULL  -- FK → job_runs.id
```

(identical change for `extraction_results`).

### 3.5 `job_exports` (new)

|Column|Type|Constraints|Notes|
|---|---|---|---|
|`id`|`uuid`|PK||
|`run_id`|`uuid`|FK → `job_runs.id`, **ON DELETE CASCADE**||
|`dest_type`|`varchar(15)`|`CHECK (dest_type IN ('download','gdrive','gmail'))`||
|`file_type`|`varchar(10)`|`CHECK (file_type IN ('csv','xlsx'))`||
|`status`|`varchar(20)`|`pending` → `in_progress` → `completed`/`failed`||
|`external_id`|`text`|Drive file ID or Gmail msg ID||
|`error_message`|`text`|nullable||
|`created_at` / `updated_at`|`timestamptz`|||

### 3.6 `automations` (new)

|Column|Type|Notes|
|---|---|---|
|`id`|`uuid`|PK|
|`user_id`|`varchar(128)` FK → users||
|`name`|`varchar(255)`||
|`is_enabled`|`boolean` default true||
|`trigger_type`|`varchar(30)` (e.g. `gmail_attachment`)||
|`trigger_config`|`jsonb` — polymorphic:  `{"query":"from:vendor@example.com has:attachment", "mimeTypes":["application/pdf"]}`||
|`job_id`|`uuid` FK → extraction_jobs (acts as template)||
|`export_config`|`jsonb` — e.g. `{"dest":"gdrive","fileType":"csv","folderId":"abc"}`||
|`last_fired_at`|`timestamptz`||
|timestamps|||

### 3.7 `automation_runs` (new)

Keeps history & retry of each trigger fire.

|Column|Type|
|---|---|
|`id`|`uuid` PK|
|`automation_id`|`uuid` FK → automations|
|`run_id`|`uuid` FK → job_runs|
|`status`|`varchar(20)` (`pending`, `completed`, `failed`)|
|`error_message`|`text`|
|`triggered_at` / `completed_at`|`timestamptz`|

---

## 4. Migration plan

1. **DDL phase (zero-downtime)**  
    _Create all new tables and columns with defaults:_
    
    ```sql
    ALTER TABLE source_files
      ADD COLUMN source_type varchar(20) NOT NULL DEFAULT 'upload',
      ADD COLUMN external_id text,
    -- Create new tables above …
    ```
    
2. **Data back-fill**
    
    ```sql
    UPDATE source_files SET source_type = 'upload' WHERE source_type IS NULL;
    ```
    
3. **Job runs seeding**  
    For every existing `extraction_job` **J** that has at least one `extraction_result` or `extraction_task`, insert:
    
    ```sql
    INSERT INTO job_runs (id, job_id, run_number, status, tasks_total,
                          tasks_completed, tasks_failed, started_at, completed_at)
    SELECT gen_random_uuid(), J.id, 1, J.status, J.tasks_total,
           J.tasks_completed, J.tasks_failed,
           min(T.created_at), max(T.processed_at)
      FROM extraction_tasks T WHERE T.job_id = J.id
      GROUP BY J.id;
    ```
    
    _Then_ update the child tables:
    
    ```sql
    UPDATE extraction_tasks  SET run_id = JR.id
      FROM job_runs JR WHERE extraction_tasks.job_id = JR.job_id
                        AND JR.run_number = 1;
    
    UPDATE extraction_results SET run_id = extraction_tasks.run_id
      FROM extraction_tasks
      WHERE extraction_results.task_id = extraction_tasks.id;
    ```
    
4. **Schema-enforcement cut-over**  
    After code deploy:
    
    ```sql
    ALTER TABLE extraction_tasks  ALTER COLUMN job_id DROP NOT NULL;
    ALTER TABLE extraction_tasks  ADD CONSTRAINT fk_task_run
       FOREIGN KEY (run_id) REFERENCES job_runs(id) ON DELETE CASCADE;
    -- Same for extraction_results, plus DROP old fk on job_id if desired.
    ```
    
5. **Rollback strategy**  
    _Because new tables are additive and existing columns keep defaults, rollback simply involves reverting application code. No destructive migrations occur until verified in staging._
    

---

## 5. Token-storage security

|Option|Pros|Cons|Decision|
|---|---|---|---|
|**Encrypt tokens in-row with AES (encryption key in GCP KMS)**|Easy to rotate keys; single query fetch.|Slight latency for decrypt; must manage KMS IAM.|**Chosen** – fits current single-region Postgres and avoids extra infra.|
|Secrets Manager per-record|Central secrets audit.|1 API call per job run (slow); per-secret cost.|Rejected for now.|
|Hashicorp Vault|Powerful leasing, revocation.|New service to operate.|Post-MVP.|

Implementation:

```python
from cryptography.fernet import Fernet

cipher = Fernet(kms_key)  # kms_key fetched & cached at start-up
encrypted = cipher.encrypt(refresh_token.encode())
```

---

## 6. Design alternatives considered

### 6.1 Job run vs. job version columns

_We considered appending `version` columns directly onto existing tables instead of a separate `job_runs` table._

|Aspect|Column approach|`job_runs` table|
|---|---|---|
|**Query simplicity**|Each query needs `WHERE version = X` everywhere.|Natural FK hierarchy; no extra predicate.|
|**Historical size**|Saves one table.|Separate run metadata – easier to purge.|
|**Concurrency**|Risk of writers clobbering same row.|Isolate runs; safe parallelism.|

**`job_runs` chosen** – aligns with task granularity and isolates long-running runs from edits.

### 6.2 Storing file “location” metadata

_Option A_: keep `external_id` inside `source_files` (chosen).  
_Option B_: dedicated `external_files` table (PK = provider+ID).

Option A avoids joins; duplicates possible but harmless and simpler.

---

## 7. OpenAPI / typescript sync

After migrations land, regenerate:

```bash
poetry run python scripts/generate_openapi.py  # emits openapi.json
npx openapi-typescript openapi.json --output lib/api-types.ts
```

Add `runId` to responses where appropriate; deprecate `job.status` fields on GET endpoints but retain until next major version.

---

## 8. Test checklist

|Test|Success criteria|
|---|---|
|**Migrations**|Apply/rollback on staging without data loss; existing jobs show run #1.|
|**Token round-trip**|OAuth callback inserts row; `access_token` decrypts correctly; expiry refresh path updates.|
|**Mixed-source job**|Create job with local PDF + Drive doc + Gmail attach; all rows inserted with correct `source_type`.|
|**Historical retrieval**|Old job run reachable, tasks/results linked, exports table empty.|

---
