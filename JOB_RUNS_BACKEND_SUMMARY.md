# Job Runs Implementation - Summary of Backend Changes

## 🗄️ Database Schema Changes

### New Table: `job_runs`

```sql
CREATE TABLE job_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES extraction_jobs(id) ON DELETE CASCADE,
    template_id UUID REFERENCES templates(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    config_step VARCHAR(20) NOT NULL DEFAULT 'upload',
    tasks_total INTEGER NOT NULL DEFAULT 0,
    tasks_completed INTEGER NOT NULL DEFAULT 0,
    tasks_failed INTEGER NOT NULL DEFAULT 0,
    persist_data BOOLEAN NOT NULL DEFAULT true,
    last_active_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX ix_job_runs_job_id_created_at ON job_runs (job_id, created_at DESC);
CREATE INDEX ix_job_runs_status ON job_runs (status);
```

### Columns Moved from `extraction_jobs` to `job_runs`

- `template_id` - Template used for this specific run
- `status` - Current run status (pending, in_progress, completed, etc.)
- `config_step` - Wizard step (upload, fields, review, submitted)
- `tasks_total`, `tasks_completed`, `tasks_failed` - Progress tracking
- `persist_data` - Data retention setting
- `completed_at` - Run completion timestamp

### Foreign Key Changes

**Tables now reference `job_run_id` instead of `job_id`:**
- `job_fields` - Field configuration per run
- `source_files` - Files uploaded/imported per run
- `extraction_tasks` - Tasks created per run
- `job_exports` - Export records per run
- `automation_runs` - Links automation executions to specific runs

### Migration Strategy

**Two-Phase Migration for Zero Downtime:**

1. **Migration 004 (Additive)** - Applied ✅
   - Creates `job_runs` table
   - Adds nullable `job_run_id` columns to child tables
   - Backfills data: creates initial run for each existing job
   - Migrates all child records to reference the initial run

2. **Migration 005 (Cleanup)** - Applied ✅
   - Removes moved columns from `extraction_jobs` table
   - Drops old `job_id` columns from child tables
   - Makes `job_run_id` columns NOT NULL

## 🏗️ Backend Architecture Changes

### Database Models (SQLAlchemy)

**New Model: `JobRun`**
```python
class JobRun(Base):
    __tablename__ = "job_runs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey("extraction_jobs.id"), nullable=False)
    template_id = Column(UUID(as_uuid=True), ForeignKey("templates.id"))
    status = Column(String(50), nullable=False, default='pending')
    config_step = Column(String(20), nullable=False, default='upload')
    # ... progress tracking fields
    
    # Relationships
    job = relationship("ExtractionJob", back_populates="job_runs")
    job_fields = relationship("JobField", back_populates="job_run")
    source_files = relationship("SourceFile", back_populates="job_run")
    extraction_tasks = relationship("ExtractionTask", back_populates="job_run")
    job_exports = relationship("JobExport", back_populates="job_run")
```

**Updated Models:**
- `ExtractionJob` - Simplified to job metadata, delegates to latest run for status
- `JobField`, `SourceFile`, `ExtractionTask`, `JobExport` - Now reference `job_run_id`
- `AutomationRun` - Now references `job_run_id` instead of `job_id`
- `Template` - Now has `job_runs` relationship instead of `extraction_jobs`

### API Models (Pydantic)

**New Response Models:**
```python
class JobRunListItem(BaseModel):
    id: str
    status: JobStatus
    config_step: str
    tasks_total: int
    tasks_completed: int
    tasks_failed: int
    created_at: datetime
    completed_at: Optional[datetime]
    template_id: Optional[str]

class JobRunDetailsResponse(BaseModel):
    id: str
    job_id: str
    status: JobStatus
    config_step: str
    persist_data: bool
    # ... all run-specific fields
    job_fields: List[JobFieldInfo]
    template_id: Optional[str]

class JobRunCreateRequest(BaseModel):
    clone_from_run_id: Optional[str] = None
    template_id: Optional[str] = None

class JobRunCreateResponse(BaseModel):
    job_run_id: str
    message: str

class JobRunListResponse(BaseModel):
    runs: List[JobRunListItem]
    total: int
    latest_run_id: str
```

## 🔧 Service Layer Changes

### Job Service (Complete Rewrite)

**New Methods:**
- `create_job_run()` - Creates new runs with optional field cloning
- `get_latest_run()` - Gets most recent run for a job
- `get_job_run()` - Gets specific run by ID
- `get_job_runs()` - Lists all runs for a job
- `submit_automation_job_run()` - Submits automation-triggered runs

**Updated Methods (Now Run-Aware):**
- `create_job()` - Auto-creates initial job run
- `get_job_details()` - Shows details for specific run (defaults to latest)
- `get_job_progress()` - Progress for specific run
- `get_job_results()` - Results from specific run
- `get_job_files()` - Files in specific run
- `add_files_to_job()` - Uploads to specific run
- `remove_file_from_job()` - Removes from specific run
- `update_job_fields()` - Updates fields for specific run
- `advance_config_step()` - Advances specific run's step
- `submit_manual_job()` - Submits specific run
- `increment_task_completion()` - Updates run progress
- `list_user_jobs()` - Shows jobs with latest run status

### Automation Service

**Updated Methods:**
- `create_automation_run()` - Creates job run when automation triggers
  - No longer clears existing data
  - Creates new isolated run for each trigger
  - Links `AutomationRun` to `job_run_id`

### Google Service

**Updated Import Functions:**
- `import_gmail_attachments()` - Imports to specific job run
- `import_drive_files()` - Imports to specific job run
- `_import_single_drive_file()` - Helper updated for runs

**Key Changes:**
- All functions now take `job_run_id` parameter
- Files created with `job_run_id` foreign key
- GCS object naming includes run isolation
- SSE events use parent job ID for UI compatibility

### SSE Service

**Updated Methods:**
- `listen_for_job_events()` - Shows latest run tasks and progress
- `broadcast_workflow_progress()` - Broadcasts latest run state

## 🛣️ API Routes Changes

### New Job Run Endpoints

```http
GET    /api/jobs/{job_id}/runs                    # List all runs
POST   /api/jobs/{job_id}/runs                    # Create new run
GET    /api/jobs/{job_id}/runs/{run_id}           # Get run details
```

### Updated Endpoints (Now Run-Aware)

**All endpoints accept optional `?run_id=` parameter (defaults to latest run):**

```http
GET    /api/jobs/{job_id}/progress?run_id=...     # Run-specific progress
GET    /api/jobs/{job_id}/files?run_id=...        # Run-specific files
GET    /api/jobs/{job_id}/results?run_id=...      # Run-specific results
GET    /api/jobs/{job_id}/export/csv?run_id=...   # Export from specific run
GET    /api/jobs/{job_id}/export/excel?run_id=... # Export from specific run
POST   /api/jobs/{job_id}/submit?run_id=...       # Submit specific run
PUT    /api/jobs/{job_id}/config-step?run_id=...  # Update run config step
```

**Response Changes:**
- Export filenames now include run ID: `job_{job_id}_run_{run_id}_results.csv`
- All responses include `job_run_id` when applicable
- Job submission returns specific run ID that was submitted

## ⚙️ Worker System Changes

### Updated Worker Functions

**Task Processing:**
- `process_extraction_task()` - Uses `task.job_run_id` for all operations
- `unpack_zip_file_task()` - Creates extracted files with `job_run_id`
- `_handle_zip_file()` - ZIP extraction scoped to job runs
- `_record_usage_for_task()` - Billing tracked via job run → job relationship

**Import/Export Operations:**
- `import_drive_files()` - Accepts `run_id` parameter, imports to specific run
- `import_gmail_attachments()` - Imports to specific run or automation run
- `export_job_to_google_drive()` - Exports from specific run

**Automation Processing:**
- `automation_trigger_worker()` - No longer clears job data (removed function)
- `run_initializer_worker()` - Gets job run from automation run, initializes specific run

### GCS Object Naming Changes

**Run-Aware Storage Paths:**
```
# Before:
jobs/{job_id}/uploads/{file_id}
jobs/{job_id}/gmail_imports/{file_id}
imports/{job_id}/extracted_{file_id}

# After:
jobs/{job_id}/runs/{run_id}/uploads/{file_id}
jobs/{job_id}/runs/{run_id}/gmail_imports/{file_id}  
imports/{run_id}/extracted_{file_id}
```

## 🔄 Data Flow Changes

### Job Creation Flow

**Before:**
1. Create `ExtractionJob` with status, config_step, etc.
2. Upload files directly to job
3. Configure fields directly on job
4. Submit job for processing

**After:**
1. Create `ExtractionJob` (metadata only)
2. Auto-create initial `JobRun` with status, config_step, etc.
3. Upload files to job run
4. Configure fields on job run
5. Submit job run for processing

### Automation Flow

**Before (Data Loss Issue):**
1. Email trigger detected
2. Clear all existing job data (files, tasks, results)
3. Import new files
4. Create tasks and process
5. Export results

**After (No Data Loss):**
1. Email trigger detected
2. Create new `JobRun` for the automation's job
3. Import files to new job run
4. Create tasks for new job run
5. Process and export from new job run
6. Previous runs remain untouched
