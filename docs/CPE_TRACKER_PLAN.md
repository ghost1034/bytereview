# CPE Tracker Plan

## Goal
Add a new “CPE tracker” experience that feels like a single-page workflow (sheet list on the left, upload + spreadsheet on the right) while reusing the existing **job/run/task/results/export** pipeline. A “CPE sheet” is just an `extraction_jobs` row of a new type, and a “state” is a special public template whose `name` is the state name (e.g., “California”).

---

## Key design decisions
- **CPE sheet = extraction job**: add `job_type='cpe'` on `extraction_jobs`.
- **State = template**: add `template_type='cpe'` on `templates`; use `templates.name` as the state name.
- **CPE jobs must not appear in normal Jobs list**: filter `/api/jobs` to return only `job_type='extraction'` by default.
- **Seamless append**: each “Start” processes a run that already contains prior results via `append_results=true` run creation; UI renders a single continuous grid (ignore `result_set_index`).

---

## Phase 0: Inventory + correctness pre-reqs (small but important)
There are a couple of run-id plumbing gaps that matter for CPE:
- `backend/routes/jobs.py` `POST /api/jobs/{job_id}/files` currently does **not** accept `run_id`, but `JobService.add_files_to_job(...)` does. For CPE you need to upload to a specific run (especially when appending).
- `lib/api.ts` and components currently pass `runId` into methods whose signatures don’t accept it (e.g., `addFilesToJob`, `removeFileFromJob`). This will either be a TypeScript error or a runtime mismatch depending on local state.

**Plan work:**
- Add `run_id` query param to `POST /api/jobs/{job_id}/files` and forward it to `job_service.add_files_to_job(...)`.
- Add `run_id` query param support to `DELETE /api/jobs/{job_id}/files/{file_id}` similarly.
- Fix `lib/api.ts` method signatures and calls to align with actual usage.
- Ensure `EnhancedFileUpload` continues to use `runId` everywhere it needs it.

This makes the rest of the CPE “append” story reliable.

---

## Phase 1: Database + model changes (Alembic)
### 1.1 Add `job_type` to jobs
- Migration: add column `extraction_jobs.job_type`:
  - default `'extraction'`, non-null
  - (optional but recommended) check constraint restricting values to `('extraction','cpe')`
- Update SQLAlchemy model in `backend/models/db_models.py`.

### 1.2 Add `template_type` to templates
- Migration: add column `templates.template_type`:
  - default `'extraction'`, non-null
  - (optional but recommended) check constraint restricting values to `('extraction','cpe')`
- Update SQLAlchemy model in `backend/models/db_models.py`.

### 1.3 Seed California “state template”
- Add a seed/upsert step that ensures a single public template exists:
  - `Template(name='California', is_public=true, user_id=NULL, template_type='cpe')`
  - Create/update `template_fields` for the CA CPE extraction schema.
- Implementation location:
  - Either extend `backend/scripts/seed_initial_data.py` or add `backend/scripts/seed_cpe_templates.py`.
- Decide “source of truth” for CA fields:
  - Define the CA fields (column order + data types + prompts) in a small Python structure in the seed script (so it’s versioned and reproducible).

Deliverable: DB contains the “California” template and the platform understands job/template types.

---

## Phase 2: Backend API (CPE router) + Jobs filtering
### 2.1 Hide CPE jobs from `/api/jobs`
- Update `JobService.list_user_jobs(...)` (`backend/services/job_service.py`) to filter:
  - `ExtractionJob.user_id == user_id`
  - `ExtractionJob.job_type == 'extraction'`
- (Optional) Add a query param `job_type` to override filter later; don’t use it in the UI now.

### 2.2 Add `backend/routes/cpe.py`
Add router in `backend/main.py` (e.g., `app.include_router(cpe.router, prefix="/api/cpe", tags=["cpe"])`).

Endpoints (all require Firebase auth via `get_current_user_id`):

1) `GET /api/cpe/states`
- Query DB for templates with `template_type='cpe'` and return:
  - `[{ template_id, name }]` (name is “California”)
- This drives the “Create CPE sheet” dropdown.

2) `GET /api/cpe/sheets`
- Query jobs where `job_type='cpe'` for the user.
- Include enough metadata to render the left list without extra calls:
  - `job_id`, `job.name`
  - latest run status/config_step/created_at (subquery like existing jobs listing)
  - (optional) the associated state name via latest run `template_id -> Template.name`

3) `POST /api/cpe/sheets`
- Body: `{ template_id, name? }`
- Validate:
  - template exists, is public or belongs to user (public for now), and `template_type='cpe'`
- Create:
  - `ExtractionJob(job_type='cpe', name=(name||"CPE Tracker - {template.name}"), user_id=user_id)`
  - initial `JobRun(job_id=..., config_step='upload', status='pending', template_id=template_id)`
- Return `{ job_id, run_id }`.

4) `DELETE /api/cpe/sheets/{job_id}`
- Verify `job_id` is owned by user and `job_type='cpe'`.
- Delete job via `JobService.delete_job(...)` (cascade cleans runs/files/results).

Recommended convenience (keeps frontend thin and ensures correct append behavior):

5) `POST /api/cpe/sheets/{job_id}/start`
- Goal: “Start” always appends results, always uses the correct template, always creates tasks for all folders.
- Steps:
  1. Load latest run for the job.
  2. If latest run is not editable (submitted/in_progress/completed), create a new run with `append_results=true` cloning from latest.
  3. Fetch CA template fields from the run’s `template_id` (the state template).
  4. Fetch processable files for the active run.
     - If none, return 400 (frontend should also disable Start).
  5. Build `processing_modes` covering every folder path present in `SourceFile.original_path`:
     - folder path rule should match existing backend grouping (`os.path.dirname(path) or "/"`)
     - set every folder to `'individual'`
  6. Call `JobService.update_job_fields(...)` with:
     - `fields` from template converted to the `{field_name,data_type_id,ai_prompt,display_order}` shape
     - `processing_modes` from above
     - `template_id` (same as state template id)
     - `description` optional (e.g., “CPE certificate extraction for California”)
  7. Call `JobService.submit_manual_job(...)` for that active run.
  8. Return `{ active_run_id }`.

### 2.3 OpenAPI + shared types
- Add Pydantic request/response models for CPE under something like `backend/models/cpe.py`.
- Ensure routes are typed so OpenAPI includes them cleanly.
- Regenerate frontend types via `npm run generate-types`.
  - Note: this repo’s OpenAPI generation imports `backend/main.py`, which requires `STRIPE_SECRET_KEY` to be present; plan includes documenting that as a dev prerequisite for type generation.

---

## Phase 3: Frontend (CPE tracker page)
### 3.1 Add navigation entry
- Update `components/layout/sidebar.tsx` to add:
  - name: “CPE Tracker”
  - href: `/dashboard/cpe-tracker`
  - choose an icon (e.g., `ClipboardList`/`GraduationCap` if available in lucide set).

### 3.2 New page: `app/dashboard/cpe-tracker/page.tsx`
Layout:
- Use `components/ui/resizable.tsx`:
  - Left panel: sheet list + create/delete
  - Right panel: selected sheet workspace
    - Inside: left upload panel + right results table panel

State management:
- Keep selected sheet in URL query params (recommended):
  - `?job_id=...`
- On page load:
  - Fetch sheets list.
  - Auto-select first sheet if none selected.

Data fetching hooks (new):
- `hooks/useCpeStates.ts`: wraps `GET /api/cpe/states`
- `hooks/useCpeSheets.ts`: wraps `GET /api/cpe/sheets` + create/delete mutations
- For sheet operations reuse existing job hooks where possible (job details/results).

### 3.3 Left panel: Sheets list UI
Features:
- “Create sheet” button:
  - dropdown populated from CPE states (templates); display `template.name` (“California”)
  - on select → `POST /api/cpe/sheets` with `template_id`
  - navigate/select new `job_id`
- Each sheet row:
  - name (job.name)
  - latest status badge (from `/api/cpe/sheets` response)
  - delete action (confirm dialog) calling `DELETE /api/cpe/sheets/{job_id}`

### 3.4 Right panel: Sheet UI
#### Upload box
- Reuse `components/workflow/steps/EnhancedFileUpload.tsx` with small refactor so it can be embedded:
  - Accept props like:
    - `primaryActionLabel` (set to “Start”)
    - `onPrimaryAction` (call start endpoint)
    - `hideBackButton`, `hideContinueCopy` (so it doesn’t say “Continue to Configuration”)
- Ensure it targets the **active run id**:
  - When you create a new sheet you get `run_id`.
  - After “Start”, if backend creates a new append run, it returns `active_run_id` which the UI should store and then pass to upload.
  - Alternatively, after start, UI can refetch runs and use latest; but explicit `active_run_id` is cleaner.

#### Start behavior
- On “Start” click:
  - Call `POST /api/cpe/sheets/{job_id}/start`
  - Store returned `active_run_id`
  - Set a local “processing” state

#### Spinner + completion
- While processing:
  - Show spinner in the table panel.
  - Track status via:
    - Option A (simpler): poll `apiClient.getJobDetails(jobId, activeRunId)` until not `in_progress`
    - Option B (better UX): open SSE `GET /api/jobs/{jobId}/events` and update UI live; refetch results on `job_completed`
- When completed:
  - Fetch results and render table.

#### Results table (read-only, seamless)
- Create `components/cpe/CpeResultsTable.tsx`:
  - Input: `jobId`, `runId`
  - Fetch: `apiClient.getJobResults(jobId, { runId, limit/offset })`
  - Flatten task results into a single row set:
    - Each task returns `extracted_data: { columns: string[], results: any[][] }`
    - Produce one grid with unified columns (preserve first-seen order)
    - Add a first column “Source File Path(s)” using `result.source_files.join(", ")` (matches exporter)
  - Ignore `result_set_index` so appended batches appear as one continuous dataset.

#### Export (CSV/XLSX)
- Add buttons “Export CSV” / “Export XLSX” that call:
  - `apiClient.exportJobCSV(jobId, runId)`
  - `apiClient.exportJobExcel(jobId, runId)`
- Use existing download helper pattern (Blob → link click).

---

## Phase 4: Typed API client updates (`lib/api.ts`)
- Add typed wrappers for the new endpoints:
  - `getCpeStates()`
  - `listCpeSheets()`
  - `createCpeSheet(templateId, name?)`
  - `deleteCpeSheet(jobId)`
  - `startCpeSheet(jobId)`
- Fix/extend existing job helpers to fully support runs:
  - `addFilesToJob(jobId, files, onProgress, onFileComplete, runId?)` should append `?run_id=...`
  - `removeFileFromJob(jobId, fileId, runId?)` should append `?run_id=...`

---

## Phase 5: Manual verification checklist (no automated tests assumed)
- CPE jobs do not appear at `/dashboard/jobs` (verify `/api/jobs` excludes them).
- CPE tracker:
  - Create California sheet
  - Upload certificates → Start → spinner → results appear
  - Upload more → Start again → results append seamlessly
  - Export CSV/XLSX includes all rows and source paths
  - Delete sheet removes it and underlying data

---

## Implementation order (recommended)
1) Run-id upload/delete plumbing fixes (`backend/routes/jobs.py`, `lib/api.ts`) so CPE run handling works.
2) Migrations: `job_type`, `template_type`.
3) Seed California `cpe` template.
4) Add CPE router endpoints (+ OpenAPI models) and filter `/api/jobs`.
5) Generate types.
6) Build CPE tracker page + components.
7) Manual smoke test.
