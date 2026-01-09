## Automatic approach fix plan (create the next append run as soon as a CPE run finishes)

### 0) Confirm current failure mode (what we’re fixing)

- Uploads target runId={activeRunId} in EnhancedFileUpload (app/dashboard/cpe-tracker/page.tsx).
- After a run completes, activeRunId still points to the just-finished run.
- POST /api/cpe/sheets/{job_id}/start (backend/routes/cpe.py) will create a new append run if the latest run is not editable, then checks for files in that new run and errors with “No files uploaded” if none.

Automatic approach means: when the run finishes, immediately create the next append run and switch the UI to it before the user can upload again.

———

## 1) Frontend: track the “processing run” and create the “next upload run” on completion

### 1.1 Add an explicit “processingRunId” + “isPreparingNextRun”

In app/dashboard/cpe-tracker/page.tsx:

- Add state:
    - processingRunId: string | undefined (run currently submitted/processing)
    - isPreparingNextRun: boolean (blocks uploads briefly while creating the next run)

### 1.2 On Start, record the processing run id

In handleStart() (app/dashboard/cpe-tracker/page.tsx):

- After startSheet.mutateAsync(jobId) returns active_run_id:
    - setProcessingRunId(active_run_id)
    - keep setActiveRunId(active_run_id) as today (so polling and results are tied to the processing run until it finishes)

### 1.3 Fix polling to use the refetch result (avoid stale jobDetails)

Right now the polling interval calls await refetchJobDetails() but then reads jobDetails?.status from a stale closure. This makes timing/races much worse.

Update the polling effect in app/dashboard/cpe-tracker/page.tsx:

- Use the return value from refetchJobDetails() (React Query returns { data }) and read data?.status from that.

### 1.4 When completion is detected, automatically create the next append run before re-enabling uploads

In the polling effect, when the status becomes terminal (completed, failed, or partially_completed):

1. Set isPreparingNextRun=true (keep uploads blocked).
2. Create the next run (append mode) using the existing jobs runs API:
    - Call apiClient.createJobRun(selectedJobId, { clone_from_run_id: processingRunId ?? activeRunId, append_results: true })
    - This leverages the existing backend behavior in backend/services/job_service.py:create_job_run which copies completed tasks/results into the new run (so results remain visible even after switching).
3. Set activeRunId = newRunId immediately after the call succeeds.
4. Clear processing state:
    - setIsProcessing(false)
    - setProcessingRunId(undefined)
    - setIsPreparingNextRun(false)
5. Refresh UI data:
    - await refetchSheets()

- Do not set isProcessing=false until after activeRunId is switched (otherwise the user can upload into the completed run during the brief window).

In app/dashboard/cpe-tracker/page.tsx:

- Pass readOnly={isProcessing || isPreparingNextRun} into EnhancedFileUpload
- Disable the “Start Extraction” button when isProcessing || isPreparingNextRun || startSheet.isPending

———

## 2) Frontend: avoid overwriting activeRunId mid-processing from sheet list updates

There’s a useEffect that does:

if (selectedSheet?.latest_run_id) setActiveRunId(selectedSheet.latest_run_id)

in app/dashboard/cpe-tracker/page.tsx.

With automatic next-run creation, this can race with processing/polling and flip the UI unexpectedly.

Update that effect to:

- Only sync activeRunId from selectedSheet.latest_run_id when not processing and not preparing:
    - if (!isProcessing && !isPreparingNextRun && selectedSheet?.latest_run_id) setActiveRunId(...)

This keeps the UI pinned to the processing run until it finishes, then switches cleanly.

———

## 3) Backend (recommended safety net): reject uploads to submitted runs

Even with the automatic approach, add a guard so stale clients or multi-tab scenarios don’t silently upload into an unprocessable run.

In backend/services/job_service.py:add_files_to_job:

- If target_run.config_step == 'submitted' (or status in_progress/completed/failed/partially_completed), raise a 409 with a clear message like:
    - “This run is already submitted/completed. Create a new run to upload more files.”

———

## 5) Manual verification checklist (covers the reported bug)

1. Create sheet → upload → Start Extraction → completes.
2. Immediately after completion, verify:
    - upload panel is enabled
    - activeRunId has switched to a new run (upload list initially empty)
3. Upload more files → they appear in the upload list (new run).
4. Click Start Extraction → no “No files uploaded”; processing starts.
5. Export CSV/XLSX still includes previous results (new run has copied results via append).