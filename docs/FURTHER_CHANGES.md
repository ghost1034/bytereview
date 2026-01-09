# Further Changes

What’s happening (current implementation)

- The “automatic next run” logic lives in the CPE tracker page polling effect (app/dashboard/cpe-tracker/page.tsx:90): it only runs while
isProcessing is true and the page is mounted, and it creates the next run client-side (app/dashboard/cpe-tracker/page.tsx:102).
- If you navigate away, that effect stops; when you return later, the latest run can still be the just-finished submitted run, and uploads
fail because the backend rejects uploads to submitted runs (backend/services/job_service.py:1556).

Fix plan (make “automatic” truly automatic, not page-dependent)

1. Move “create next CPE run” to the backend completion path

- Implement backend-owned “auto-create next append run” when a run transitions into a terminal state inside
JobService.increment_task_completion (backend/services/job_service.py:728).
- Logic:
    - Load the completed JobRun and its parent ExtractionJob; only apply when ExtractionJob.job_type == 'cpe'.
    - When the run becomes completed or partially_completed, create a new run for the same job with:
        - clone_from_run_id = completed_run_id
        - append_results = true
        - (template_id copied as current logic already does)
    - Make it idempotent so it’s safe under worker concurrency:
        - Before creating, check if a newer run already exists, or specifically if a run exists with append_from_run_id = completed_run_id.
        - Add a partial unique index/migration to enforce one append run per source run (e.g. unique (job_id, append_from_run_id) where
        append_from_run_id IS NOT NULL), and on conflict, fetch-and-return the existing run.

2. Adjust the CPE tracker page to treat the backend as source of truth

- Update app/dashboard/cpe-tracker/page.tsx so the page no longer needs to create the next run itself:
    - Remove (or gate off) the client-side apiClient.createJobRun(...) call in the polling completion handler (app/dashboard/cpe-tracker/
    page.tsx:102).
    - Instead, on completion detection, just refetchSheets() and let the existing “sync activeRunId from selectedSheet.latest_run_id” effect
    (app/dashboard/cpe-tracker/page.tsx:82) move the UI to the newly-created backend run.
- Fix the “leave during processing” re-entry UX:
    - Derive isProcessing/read-only state from server state (selectedSheet.status from backend/routes/cpe.py:65 or jobDetails.status) rather
    than local component state, so when you return mid-run you still see the spinner + disabled uploads.
    - While status is in_progress, poll refetchSheets() (or refetchJobDetails()) so the UI picks up the new latest_run_id once the backend
    creates it.

3. Add a defensive fallback for stale clients (optional but recommended)

- In the CPE tracker upload flow, if an upload attempt hits the existing 409 (“submitted/completed”) (backend/services/job_service.py:1558),
handle it gracefully:
    - refetchSheets(), switch activeRunId to selectedSheet.latest_run_id, and prompt the user to retry (or auto-retry once).
    - This makes the system resilient even if a user has multiple tabs open.

Verification checklist

- Start extraction → navigate away → wait for completion → return: sheet should now show a new latest run and uploads should work
immediately.
- Navigate away and return while still in_progress: uploads remain disabled and spinner shows; once finished, the UI flips to the new pending
run without manual reload.
- Confirm no duplicate “next runs” get created under concurrency (validate via DB or run list), especially when multiple tasks complete near-
simultaneously.