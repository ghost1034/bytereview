## Plan: show all files across runs for CPE only (uploads still go to latest/new run)

### 1) Backend: add an “all runs files” listing endpoint

Goal: CPE upload UI can fetch a single list of SourceFiles across all JobRuns for a given job, with enough metadata to support safe deletion/UI decisions.

- Add new endpoint in backend/routes/jobs.py (keeps it reusable, CPE-only usage is a frontend choice):
    - GET /api/jobs/{job_id}/files:all
    - Query params:
        - processable: bool = false (match existing /files)
    - Returns: JobFilesAllRunsResponse with files: JobFileAllRunsInfo[]
- Implement a service method in backend/services/job_service.py:
    - get_job_files_all_runs(job_id, user_id, processable_only=False) -> list[...]
    - Query:
        - JobRun filtered by job_id + ownership check via ExtractionJob.user_id
        - join SourceFile on SourceFile.job_run_id == JobRun.id
        - order by (JobRun.created_at desc, SourceFile.original_path asc, SourceFile.id)
        - apply _filter_processable_files(...) when processable_only=true
- Add Pydantic models in backend/models/job.py (or a small new models file referenced by jobs router):
    - JobFileAllRunsInfo: existing file fields + job_run_id, plus optional run_created_at/run_status (handy for UI badges or debugging)
    - JobFilesAllRunsResponse: { files: JobFileAllRunsInfo[] }
- Ensure OpenAPI includes the new endpoint and types (so openapi-typescript can generate them).

### 2) Frontend API client: add a typed call for “files across runs”

- In lib/api.ts, add getJobFilesAllRuns(jobId: string, options?: { processable?: boolean }).
- Add a frontend type (or reuse generated OpenAPI type if you wire it fully through lib/api-types.ts):
    - JobFileAllRunsInfo includes job_run_id at minimum.

### 3) Enhance EnhancedFileUpload to support two display scopes

Requirement: normal job upload page stays run-scoped; CPE upload page is job-scoped.

Modify components/workflow/steps/EnhancedFileUpload.tsx:

- Add prop:
    - fileListScope?: 'run' | 'allRuns' (default 'run')
- Fetching behavior:
    - If fileListScope === 'run': current behavior (apiClient.getJobFiles(jobId, { runId }))
    - If fileListScope === 'allRuns': call apiClient.getJobFilesAllRuns(jobId, { processable: false })
- Query invalidation keys:
    - Keep existing ['job-files', jobId, runId] for run-scope
    - Introduce ['job-files-all', jobId] for all-runs scope
    - Update invalidateJobFiles() to invalidate the correct key based on scope
- Deletion UI behavior (important):
    - Only show the delete “X” for files that belong to the current upload run (file.job_run_id === runId).
    - For other runs’ files, either hide delete or show disabled (recommended: hide to keep it simple).
    - When calling removeFileFromJob, pass runId so deletion targets the correct run.
- Local upload “temp file → real file” replacement:
    - In all-runs mode, when you replace a temp entry after upload, stamp job_run_id = runId on the new file entry (since the upload response doesn’t include run id).
    - After imports/ZIP events, if run attribution is unclear from events, schedule a getJobFilesAllRuns refetch after import_batch_completed/files_extracted.

### 4) CPE tracker page: use all-runs scope for display, latest/new run for uploads

Update app/dashboard/cpe-tracker/page.tsx:

- Pass fileListScope="allRuns" to EnhancedFileUpload.
- Keep runId={activeRunId} as the upload target run (latest/new run per your current automatic approach).
- Keep “Start Extraction” using the run returned by POST /api/cpe/sheets/{job_id}/start (already returns active_run_id).

### 5) Normal jobs: keep run-scoped upload list

No behavioral change needed in normal jobs pages:

- app/dashboard/jobs/[jobId]/upload/page.tsx continues passing the selected run id.
- EnhancedFileUpload defaults to fileListScope='run', so it continues showing only the selected run’s files.

### 6) Follow-ups / edge cases to explicitly decide

- Should CPE all-runs view include ZIP archives and unpacked children? Default plan: yes (matches current upload list behavior); add a toggle later if it’s noisy.
- Should CPE all-runs view show which run a file came from? Not required, but if you include run_created_at/run_status you can add a subtle badge later without new backend work.

### 7) Verification checklist

- Normal job upload page: switching run selector changes file list; only that run’s files show.
- CPE tracker upload panel: shows files from completed runs + current run together; deleting only works for current run’s files.
- After a run completes and a new run is created automatically, the upload panel still shows prior files (so it doesn’t look like data disappeared), and new uploads go to the latest/new run as before.