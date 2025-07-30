Below is a **work-breakdown structure (WBS)** mapped into six, two-week **Sprints** (≈ 12 weeks total). Each work-item lists _owner_, _dependency_, and an **ideal-day estimate** (≈ one uninterrupted eight-hour day).

> **Legend**  
> • **BE** = Backend (Python/FastAPI) • **FE** = Frontend (Next.js) • **OPS** = Dev Ops / IaC  
> • **SEC** = Security & Compliance • **QA** = Quality Eng / Test

---

## Epic 1 – Data-model foundation & migrations

|ID| Task                                                                                                                 |Owner|Depends on|Est|
|---|---|---|---|---|
|1.1| Create SQLAlchemy models + Alembic for **integration_accounts, job_runs, job_exports, automations, automation_runs** |BE|—|3|
|1.2| Add `source_type`, `external_id` columns to **source_files**                                                         |BE|—|1|
|1.3| Back-fill existing data into `job_runs` (# 1.1) migration script                                                     |BE|1.1|2|
|1.4| Write migration replay tests (dev & staging snapshots)                                                               |BE|1.1|1|
|1.5| Regenerate OpenAPI & `api-types.ts`; fix downstream type errors                                                      |BE/FE|1.1|1|

**Total Epic 1 = 8 ideal-days**

---

## Epic 2 – Google OAuth & integration plumbing

|ID|Task|Owner|Depends|Est|
|---|---|---|---|---|
|2.1|Implement `/integrations/google/auth-url`, `/exchange`, `/callback`, `/disconnect` routes|BE|1.1|3|
|2.2|Cipher helpers using Cloud KMS + Fernet wrapper|BE/SEC|2.1|2|
|2.3|Terraform: Google OAuth client creds & secret manager wiring|OPS|2.1|2|
|2.4|React **IntegrationBanner** component + `useGoogleSession()` hook|FE|2.1|3|
|2.5|Cypress flow covering “connect / refresh / disconnect”|QA|2.4|1|

**Total Epic 2 = 11**

---

## Epic 3 – File ingestion workers (Drive, Gmail, ZIP unpack)

|ID|Task|Owner|Depends|Est|
|---|---|---|---|---|
|3.1|Drive import ARQ worker (`imports` queue)|BE|2.2|4|
|3.2|Gmail import ARQ worker (base64 attach → GCS)|BE|2.2|4|
|3.3|ZIP unpack logic inside worker, incl. virus scan placeholder hook|BE|3.1/3.2|2|
|3.4|`/jobs/{id}/files:gdrive` & `files:gmail` endpoints + op-status API|BE|1.1, 3.1|2|
|3.5|Front-end **DrivePicker** (Google Picker SDK)|FE|2.4|3|
|3.6|Front-end **GmailPicker** (recent list UI)|FE|2.4|3|
|3.7|`useOperationPoll()` hook + UploadList status integration|FE|3.4|2|
|3.8|Worker unit tests (fixtures) & staging end-to-end with 50-file folder|QA|3.1-3.4|2|

**Total Epic 3 = 22**

---

## Epic 4 – Extraction re-work + Vertex AI switch

|ID|Task|Owner|Depends|Est|
|---|---|---|---|---|
|4.1|Modify `ai_extraction_worker` to send `gcsUri` to Vertex Gemini|BE|3.3|3|
|4.2|Add system-prompt versioning + JSON-schema validation step|BE|4.1|2|
|4.3|Token-bucket limiter & retry/back-off policy|BE|4.1|2|
|4.4|Terraform enable Vertex API, set regional endpoint|OPS|4.1|1|
|4.5|Load test 100 × 25-page PDFs, capture latency/throughput|QA|4.1|2|

**Total Epic 4 = 10**

---

## Epic 5 – Exports & Results page enhancements

|ID|Task|Owner|Depends|Est|
|---|---|---|---|---|
|5.1|`/job-runs/{runId}/exports` endpoint & `job_exports` polling|BE|1.1|2|
|5.2|Export ARQ worker (CSV/XLSX build + Drive/Gmail/dl)|BE|2.2, 5.1|3|
|5.3|Results-page **ExportDialog** & success/download flows|FE|5.1|4|
|5.4|Signed-URL creation (download) helper in backend|BE|5.1|1|
|5.5|Cypress scenario: extract → export to Drive → verify file exists|QA|5.2-5.3|2|

**Total Epic 5 = 12**

---

## Epic 6 – Automations (Gmail trigger → Job run → Export)

| ID  | Task                                                                              | Owner | Depends            | Est |
| --- | --------------------------------------------------------------------------------- | ----- | ------------------ | --- |
| 6.1 | `/automations` CRUD endpoints & schema validation                                 | BE    | 1.1, 2.2           | 3   |
| 6.2 | Gmail watch registration helper + token store                                     | BE    | 6.1                | 3   |
| 6.3 | `automation_trigger_worker` + `run_initializer_worker` + `export_worker` chaining | BE    | 6.2, 3.x, 4.x, 5.x | 4   |
| 6.4 | Automations wizard (3-step) + list page                                           | FE    | 6.1                | 4   |
| 6.5 | E2E test: send test email → automation fires → export file in Drive               | QA    | 6.3-6.4            | 2   |

**Total Epic 6 = 16**

---

## Epic 7 – Security hardening & SSE gateway (optional push upgrade)

|ID|Task|Owner|Depends|Est|
|---|---|---|---|---|
|7.1|Middleware: RateLimit, Audit, Service-JWT auth|SEC/BE|1.1|3|
|7.2|SSE `/events` endpoint & Redis Stream fan-out|BE|3.7|3|
|7.3|`useEventStream()` React hook + fallback to polling|FE|7.2|2|
|7.4|Threat-model review & pentest fixes|SEC|all|3|

**Total Epic 7 = 11**

---

## Epic 8 – Dev Ops & CI/CD rollout

|ID|Task|Owner|Depends|Est|
|---|---|---|---|---|
|8.1|Terraform modules (Run, SQL, Redis, KMS, Pub/Sub)|OPS|1.1|4|
|8.2|GitHub Actions: build matrix, canary deploy, DB gate|OPS|8.1|3|
|8.3|Binary-Authorization & cosign image signing|OPS/SEC|8.2|2|
|8.4|Monitoring dashboards + alert policies (API, workers)|OPS|4.4, 5.2|2|
|8.5|Cost budget alerts & nightly IAM / tfsec scan|OPS|8.1|2|

**Total Epic 8 = 13**

---

## Sprint allocation (40 ideal-days capacity each)

|Sprint|Focus|Items / Points|Slack*|
|---|---|---|---|
|**0** (1 wk)|Kick-off & environment bootstrap|_Create dev GCP project, secrets, branch strategy_ (OPS, 5 pts)|—|
|**1**|_Data-model + OAuth_ foundation|Epic 1 (8) + Epic 2 tasks 2.1 – 2.3 (7) + 2 buffer = **17**|23|
|**2**|File ingestion & pickers|Remaining Epic 2 (4) + Epic 3 (22) + 4 buffer = **30**|10|
|**3**|Vertex extraction & exports|Epic 4 (10) + Epic 5 (12) + 4 buffer = **26**|14|
|**4**|Automations MVP|Epic 6 (16) + start Epic 7 tasks 7.1–7.2 (6) + 2 buffer = **24**|16|
|**5**|Security polish, SSE, Dev Ops hardening|Remaining Epic 7 (5) + Epic 8 (13) + 6 buffer = **24**|16|

> _“Slack” is planned spare capacity for bug-fixes, unplanned work, team PTO, or stretch items like SSE if earlier Sprints run long._

---

## Milestones & release points

| Date (tentative) | Deliverable                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **End Sprint 2** | Users can upload Drive/Gmail files; extraction still local-Gemini.                                                           |
| **End Sprint 3** | Full pipeline: Drive/Gmail import ➜ Vertex extraction ➜ CSV/XLSX download / Drive export / Gmail export. Public beta begins. |
| **End Sprint 4** | Automations (Gmail trigger) live for beta users.                                                                             |
| **End Sprint 5** | Production GA, SLA & monitoring in place, security review signed off.                                                        |

---
