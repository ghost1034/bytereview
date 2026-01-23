# CPE Tracker (CPAAutomation / ByteReview)

CPE Tracker is a “single-page workflow” feature built on top of CPAAutomation’s existing job → run → files → tasks → results → export pipeline. It introduces:

- A new job type (job_type='cpe') representing a “CPE sheet”.
- A new template type (template_type='cpe') representing a “state” schema (e.g., “California”).
- An append-first UX: each extraction run processes only newly uploaded files, while prior results remain visible and exportable via append/cloning.

Relevant implementation entry points:

- Backend: backend/routes/cpe.py, backend/services/job_service.py, backend/alembic/versions/008_cpe_tracker_types.py, backend/alembic/versions/009_unique_append_from_run.py, backend/scripts/
  seed_cpe_templates.py
- Frontend: app/dashboard/cpe-tracker/page.tsx, components/results/EditableResultsTable.tsx, components/workflow/steps/EnhancedFileUpload.tsx, hooks/useCpe.ts, components/layout/sidebar.tsx, lib/api.ts

---

## Core Concepts

### “CPE Sheet” = Extraction Job (extraction_jobs)

A CPE sheet is just an extraction_jobs row with:

- job_type = 'cpe'
- Owned by a user (user_id)

CPE sheets should not appear in the normal Jobs list UI because the /api/jobs listing defaults to job_type='extraction'.

### “State” = Template (templates)

A state schema is a templates row with:

- template_type = 'cpe'
- Typically is_public = true
- name is the state display name (e.g., "California")

Its fields live in template_fields and are copied into each run’s job_fields when you start processing.

### Run lifecycle: editable vs submitted

CPE Tracker relies heavily on the run lifecycle:

- Editable run:
    - config_step='upload' | 'fields' | 'review'
    - Can upload/delete files; can update fields & tasks.
- Submitted run:
    - config_step='submitted'
    - Backend rejects uploads to prevent stale clients from uploading into completed/processing runs.

### “Append”

Append is how CPE Tracker feels continuous:

- A new run is created with append_results=true, cloning:
    - prior run’s field configuration (job_fields)
    - completed tasks + their results (and their file links)
- New uploads go to the latest run, and new tasks get created with a new result_set_index batch.

The CPE UI explicitly ignores result_set_index and shows everything as one continuous table.

Because results are editable, users can also correct extracted values, delete bad rows, and add manual rows; these changes persist in the run and are carried forward automatically in append runs (since completed tasks/results are cloned).

---

## Data Model & Migrations

### 1) extraction_jobs.job_type

Migration: backend/alembic/versions/008_cpe_tracker_types.py

- Adds extraction_jobs.job_type (default 'extraction', NOT NULL)
- Adds index ix_extraction_jobs_job_type
- Adds check constraint: job_type IN ('extraction', 'cpe')

SQLAlchemy model: backend/models/db_models.py

- ExtractionJob.job_type = Column(String(50), nullable=False, default='extraction')

### 2) templates.template_type

Migration: backend/alembic/versions/008_cpe_tracker_types.py

- Adds templates.template_type (default 'extraction', NOT NULL)
- Adds index ix_templates_template_type
- Adds check constraint: template_type IN ('extraction', 'cpe')

SQLAlchemy model: backend/models/db_models.py

- Template.template_type = Column(String(50), nullable=False, default='extraction')

### 3) Prevent duplicate “next runs” under concurrency

Migration: backend/alembic/versions/009_unique_append_from_run.py

- Adds unique partial index:
    - ix_job_runs_unique_append_from on job_runs(job_id, append_from_run_id)
    - only where append_from_run_id IS NOT NULL

This supports idempotent “create the next append run” behavior when multiple workers finish tasks concurrently.

---

## Seed Data: CPE State Templates

Script: backend/scripts/seed_cpe_templates.py

Currently seeds California as a public CPE template:

- Template(name="California", is_public=True, user_id=None, template_type="cpe")
- Fields seeded in CALIFORNIA_CPE_FIELDS (examples):
    - Course Title (text)
    - Provider/Sponsor (text)
    - Completion Date (date_mdy)
    - CPE Hours (number)
    - Field of Study (text)
    - Certificate Number (text)
    - Delivery Method (text)

Run it (local example):

python backend/scripts/seed_cpe_templates.py

Requirements:

- DB connectivity/env set up (see README “Backend setup” section).
- Migrations applied (cd backend && alembic upgrade head).

---

## Backend API

### Authentication

All CPE Tracker endpoints require Firebase auth:

- Backend uses dependencies.auth.get_current_user_id.
- Frontend apiClient attaches Firebase ID token automatically.

### CPE Router: /api/cpe (backend/routes/cpe.py)

#### GET /api/cpe/states

Returns public CPE templates (template_type='cpe' AND is_public=true) as selectable “states”.

Response shape:

{
  "states": [
    { "template_id": "…", "name": "California" }
  ]
}

#### GET /api/cpe/sheets

Lists user-owned CPE sheets (jobs with job_type='cpe'), including latest run metadata for UI display.

Response shape:

{
  "sheets": [
    {
      "job_id": "…",
      "name": "California",
      "state_name": "California",
      "status": "pending|in_progress|completed|partially_completed|failed|…",
      "config_step": "upload|fields|review|submitted",
      "created_at": "…",
      "latest_run_id": "…"
    }
  ],
  "total": 1
}

#### POST /api/cpe/sheets

Creates a new CPE sheet (job) and an initial run.

Request body:

{ "template_id": "…", "name": "optional custom sheet name" }

Behavior:

- Validates template exists and has template_type='cpe'.
- Creates ExtractionJob(job_type='cpe').
- Job name defaults to the selected template name (unless `name` is provided).
- Creates initial JobRun(config_step='upload', status='pending', template_id=<state template>).

Response:

{ "job_id": "…", "run_id": "…", "message": "CPE sheet created for California" }

#### DELETE /api/cpe/sheets/{job_id}

Deletes the CPE sheet via JobService.delete_job.

Important current behavior:

- JobService.delete_job deletes DB records (cascade), but does not currently clean up GCS objects (explicit TODO). This can leave orphaned blobs in GCS.

Response:

{ "message": "CPE sheet deleted successfully" }

#### POST /api/cpe/sheets/{job_id}/start

Starts extraction for the CPE sheet.

Key behavior:

1. Loads the latest run for the job.
2. If the latest run is not editable (e.g., config_step='submitted' or status in ('in_progress','completed','failed')), it creates a new append run using:
    - JobService.create_job_run(... append_results=True, clone_from_run_id=<latest>)
3. Loads the run’s associated template (template_id) and its template_fields.
4. Copies template fields into run’s job_fields via JobService.update_job_fields.
    - CPE forces all folders to processing_mode='individual'.
5. Requires at least one processable file in the active run (processable_only=True).
6. Submits the run for processing via JobService.submit_manual_job(...).

Response:

{ "active_run_id": "…", "message": "CPE sheet processing started" }

Common errors:

- 404 if sheet not found / not owned / not job_type='cpe'
- 400 "No files uploaded. Please upload CPE certificates before starting."
- Plan limits can prevent start (page-based billing checks occur in submit_manual_job).

---

## Job API Changes Used by CPE Tracker (backend/routes/jobs.py + backend/services/job_service.py)

### Run-scoped upload/delete (new/updated query param support)

#### POST /api/jobs/{job_id}/files?run_id=<run_id>

Uploads files into a specific run (or latest if omitted).

Backend behavior (JobService.add_files_to_job):

- Resolves target_run (by run_id or latest).
- Rejects if target_run.config_step == 'submitted' with HTTP 409:
    - "This run is already submitted/completed. Create a new run to upload more files."
- Writes file bytes to GCS under:
    - jobs/{job_id}/runs/{run_id}/{uuid}{ext}
- Creates a SourceFile row with status uploaded
- If ZIP detected, marks unpacking and enqueues ZIP unpack task (Cloud Run Tasks).

#### DELETE /api/jobs/{job_id}/files/{file_id}?run_id=<run_id>

Deletes a file from a specific run (or latest if omitted).

Backend behavior (JobService.remove_file_from_job):

- Enforces run/job-type rules:
  - Normal jobs (job_type='extraction'): only the latest run is editable; deleting files from previous runs is rejected.
  - CPE jobs (job_type='cpe'): files may be deleted from any run (this powers the CPE tracker “all runs” file list).
  - Deletions are rejected while extraction is in progress.
- Deletes the GCS object for that file (best-effort).
- Deletes the DB SourceFile row.
- Task-coupled semantics (no per-row provenance):
  - Deleting a file never deletes extracted rows unless the affected task becomes fileless (i.e., that task now has zero remaining linked files).
  - When a task becomes fileless, the task and its results are deleted.
- If the file is a ZIP: extracted children are not deleted (explicit TODO); they may remain as orphaned files.

### All-runs file listing (CPE display scope)

#### GET /api/jobs/{job_id}/files:all?processable=true|false

Returns a flat list of SourceFiles across all runs for the job.

Response model: JobFilesAllRunsResponse (see backend/models/job.py)

- Includes job_run_id plus optional run metadata (run_created_at, run_status)

Example shape:

{
  "files": [
    {
      "id": "…",
      "original_path": "…",
      "original_filename": "…",
      "file_size_bytes": 12345,
      "status": "uploaded|unpacking|unpacked|failed|…",
      "job_run_id": "…",
      "run_created_at": "…",
      "run_status": "pending|in_progress|…"
    }
  ]
}

This exists specifically to support the CPE Tracker UI requirement:

- Display files across prior runs (so the upload panel doesn’t “empty out” after a run completes),
- while uploads still target the latest run.

---

## Append + “Automatic Next Run” (Backend-Owned)

### Why it exists

Without automatic next-run creation, users can return to a completed/submitted run and uploads would fail (because the backend correctly rejects uploads to submitted runs).

### How it works

When background workers finish extraction tasks, they call:

- JobService.increment_task_completion(run_id, success=…)

When the run becomes terminal (completed or partially_completed), it:

1. Sets final status on the run
2. If the parent job is job_type='cpe', calls:
    - JobService._create_next_cpe_run_if_needed(db, completed_run)
3. Commits the status change and the new run atomically
4. Sends SSE “job completed” event

_create_next_cpe_run_if_needed creates a new run that:

- is editable (config_step='upload', status='pending')
- has template_id copied
- clones completed tasks + results into the new run (append_results=True)
- sets append_from_run_id = completed_run.id
- does not copy export references (CPE-specific choice)

Idempotency is enforced by:

- pre-checking for an existing run with the same (job_id, append_from_run_id)
- and the DB unique partial index (ix_job_runs_unique_append_from)

---

## Frontend: UX + State Management

### Navigation

Sidebar entry added in components/layout/sidebar.tsx:

- “CPE Tracker” → /dashboard/cpe-tracker

### CPE Tracker page

File: app/dashboard/cpe-tracker/page.tsx

Layout:

- Resizable split view:
    - Left: CPE Sheets list (create/delete/select)
    - Right: Upload panel + Results panel

State model:

- Selected sheet is stored in the URL: ?job_id=<job_id>
- activeRunId is synced from the server’s selectedSheet.latest_run_id
- Processing state is derived from server state:
    - isProcessing = selectedSheet?.status === 'in_progress'

Polling behavior:

- While isProcessing:
    - refetchSheets() (to pick up status changes + backend-created next run)
    - refetchJobDetails() (to keep results view fresh)
    - invalidates ['job-results', selectedJobId]

Actions:

- Create sheet: useCreateCpeSheet() → selects it and sets activeRunId
- Delete sheet: useDeleteCpeSheet() → removes it; clears selection if needed
- Start extraction: useStartCpeSheet() → sets activeRunId = active_run_id, refetches sheets

Exports:

- “CSV” and “Excel” buttons call existing job export endpoints:
    - apiClient.exportJobCSV(jobId, runId)
    - apiClient.exportJobExcel(jobId, runId)

### Hooks

File: hooks/useCpe.ts

- useCpeStates → GET /api/cpe/states
- useCpeSheets → GET /api/cpe/sheets
- useCreateCpeSheet → POST /api/cpe/sheets
- useDeleteCpeSheet → DELETE /api/cpe/sheets/{job_id}
- useStartCpeSheet → POST /api/cpe/sheets/{job_id}/start

### Upload panel: all-runs display + latest-run upload target

Component: components/workflow/steps/EnhancedFileUpload.tsx

CPE Tracker uses:

- fileListScope="allRuns": show files from all runs (via /files:all)
- runId={activeRunId}: upload target run
- readOnly={isProcessing}: block uploads during processing
- onUploadConflict: invoked when an upload fails due to run being submitted/completed (409-ish)

Key behaviors in all-runs mode:

- File list loads from apiClient.getJobFilesAllRuns(jobId)
- Delete button is shown only if:
    - file is uploaded or unpacked
    - not readOnly
- In all-runs mode, deletes are run-scoped to the file’s owning run (file.job_run_id), which enables deleting files from prior runs.
- Upload errors:
    - detects 409/submitted/completed errors
    - calls onUploadConflict() so the page can refetch sheets and move to the latest run

### Results panel: seamless table

Component: components/results/EditableResultsTable.tsx

Behavior:

- Fetches apiClient.getJobResults(jobId, { runId, limit: 1000 })
- Flattens extracted_data (array-based { columns, results }) into a table:
    - adds a first column: “Source File Path(s)”
    - unifies all columns seen across tasks
- Ignores result_set_index in the UI (no per-batch grouping) so appended batches appear as one continuous dataset.

Editing behavior:

- Users can edit cells in-place, delete rows, and add manual rows.
- Manual rows can be:
  - Unattached (shown/exported as “(manual)” in Source File Path(s))
  - Attached to an existing extraction task (keeps file/folder provenance)
- While a run is processing (status=in_progress), the UI disables editing.

Task-coupled deletion semantics:

- Row deletion never deletes files unless the task becomes rowless.
  - When the last row is removed for a task, the backend deletes that task’s linked files.
- File deletion never deletes rows unless the task becomes fileless.
  - Deleting one file in a combined/folder task will not remove rows until the last linked file for that task is deleted.

---

## Type Sharing / OpenAPI Notes (openapi-typescript)

- Backend OpenAPI: /api/openapi.json (see README “Types and OpenAPI” section)
- Generated types: lib/api-types.ts
- Typed client + wrappers: lib/api.ts

CPE Tracker adds new API surface area (/api/cpe/*, /api/jobs/{job_id}/files:all) that ideally should flow through OpenAPI and be generated into lib/api-types.ts.

Current state in lib/api.ts:

- CPE types and JobFileAllRunsInfo are defined manually (“manual type until OpenAPI is regenerated”).

Regenerating types (per README):

- npm run generate-types
- Ensure backend is running and env is set; notably STRIPE_SECRET_KEY must be present or the backend may fail early during import/startup.

---

## How the CPE Tracker “Append” UX Actually Works (End-to-End)

### First-time sheet

1. User creates sheet (job + initial run).
2. User uploads PDFs into that run.
3. User clicks “Start Extraction”:
    - backend copies state template fields into run
    - creates individual tasks per file
    - submits run (status becomes in_progress)
4. Workers finish tasks; backend marks run complete and creates the next pending append run.
5. UI sees latest run changed to the new pending run; table still shows old results because they were cloned into the pending run.

### Next batch

1. User uploads more PDFs (into the newest pending run).
2. User clicks “Start Extraction” again:
    - new tasks are created with a new result_set_index batch
    - completed prior tasks/results remain (append mode preserves them)
3. On completion, backend creates the next pending run again.

Important implication:

- Each “Start” processes only the files present in the current pending run.
- Previously processed files are not automatically reprocessed; their results persist via cloning.

---

## Known Limitations / Operational Notes

- Deleting a CPE sheet does not delete GCS objects yet:
    - JobService.delete_job currently deletes DB records only; GCS cleanup is a TODO.
- Deleting a ZIP file does not delete extracted children:
    - remove_file_from_job logs that extracted files remain orphaned (no parent_zip_file_id relationship today).
- Results pagination:
    - Results tables request up to 1000 results; very large datasets may need pagination/virtualization work.
- Start without new uploads:
    - After completion, the UI switches to a new pending run that already contains cloned results.
    - Clicking “Start Extraction” without uploading new files will fail with “No files uploaded…” (because there are no new tasks/files to process).

---

## Extending CPE Tracker (Typical Changes)

### Add a new state

- Add a new public template with:
    - template_type='cpe'
    - name='<StateName>'
    - template_fields representing that state’s extraction schema
- Preferred approach: extend backend/scripts/seed_cpe_templates.py with additional seed functions.

### Change the extraction schema

- Update the seeded template fields (data types, prompts, order).
- Re-run seed script to upsert fields.

### Improve UI signal for cross-run files

The all-runs file API already provides run_created_at and run_status; you can display subtle badges for “from prior run” files without additional backend work.
