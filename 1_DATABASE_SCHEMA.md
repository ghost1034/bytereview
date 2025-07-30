### **Part 1: Full Database Schema (PostgreSQL)**

This schema includes:
*   A user-friendly `name` for jobs.
*   The `job_fields` table to "snapshot" a job's configuration, ensuring immutability.
*   Correct handling of template deletion.
*   Refined `data_types` and `system_prompts` tables.

#### **The SQL Script**

```sql
-- Ensure the UUID extension is enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =================================================================
-- Core Content & Configuration Tables
-- =================================================================

-- This table stores app-specific user profile data and is linked to Firebase Auth.
CREATE TABLE users (
    id VARCHAR(128) PRIMARY KEY, -- Firebase UID. This is NOT a UUID.
    email VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    photo_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A canonical, managed list of supported data types for extraction
CREATE TABLE data_types (
    id VARCHAR(50) PRIMARY KEY, -- e.g., 'date_ymd', 'currency'
    display_name VARCHAR(100) NOT NULL, -- e.g., 'Date (YYYY-MM-DD)'
    base_json_type VARCHAR(20) NOT NULL, -- 'string', 'number', 'integer', 'boolean'
    json_format VARCHAR(50), -- Optional: 'date', 'email', 'uri' for JSON Schema validation
    description TEXT, -- For UI tooltips
    display_order INT NOT NULL DEFAULT 0
);

-- Stores system-level prompt templates for AI interaction
CREATE TABLE system_prompts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) UNIQUE NOT NULL, -- e.g., 'default_extraction_v2'
    template_text TEXT NOT NULL,
    version INT NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =================================================================
-- User-Defined Template Tables
-- =================================================================

-- A user-created template for a specific kind of extraction
CREATE TABLE templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, name)
);

-- The specific fields defined within a user's template
CREATE TABLE template_fields (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    field_name VARCHAR(100) NOT NULL,
    data_type_id VARCHAR(50) NOT NULL REFERENCES data_types(id),
    ai_prompt TEXT NOT NULL,
    display_order INT NOT NULL DEFAULT 0
);

-- =================================================================
-- Job, File, and Result Tables (The Core Workflow)
-- =================================================================

-- A single extraction job, representing one user session
CREATE TABLE extraction_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255), -- User-friendly, nullable name
    user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- The template_id is now nullable and the foreign key is set to ON DELETE SET NULL.
    -- This means if a template is deleted, this job's reference to it becomes NULL,
    -- but the job itself IS NOT deleted. This is crucial.
    template_id UUID REFERENCES templates(id) ON DELETE SET NULL,
    
    status VARCHAR(50) NOT NULL DEFAULT 'pending_configuration',
    persist_data BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- A snapshot of the fields used for a specific job, ensuring immutability.
-- This is the source of truth for processing.
CREATE TABLE job_fields (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES extraction_jobs(id) ON DELETE CASCADE,
    field_name VARCHAR(100) NOT NULL,
    data_type_id VARCHAR(50) NOT NULL REFERENCES data_types(id),
    ai_prompt TEXT NOT NULL,
    display_order INT NOT NULL DEFAULT 0
);

-- A single source file uploaded by the user
CREATE TABLE source_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES extraction_jobs(id) ON DELETE CASCADE,
    original_filename TEXT NOT NULL,
    original_path TEXT NOT NULL,
    gcs_object_name TEXT UNIQUE NOT NULL,
    file_type VARCHAR(100) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'uploading',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A single unit of work to be sent to the AI
CREATE TABLE extraction_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES extraction_jobs(id) ON DELETE CASCADE,
    processing_mode VARCHAR(50) NOT NULL DEFAULT 'individual', -- 'individual' or 'combined'
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

-- Many-to-many link table between files and tasks
CREATE TABLE source_files_to_tasks (
    source_file_id UUID NOT NULL REFERENCES source_files(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES extraction_tasks(id) ON DELETE CASCADE,
    document_order INT NOT NULL DEFAULT 0,
    PRIMARY KEY (source_file_id, task_id)
);

-- The structured data extracted from a single task
CREATE TABLE extraction_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID UNIQUE NOT NULL REFERENCES extraction_tasks(id) ON DELETE CASCADE,
    extracted_data JSONB NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### **Key Changes and Rationale**

1.  **`data_types` Table:**
    *   `ai_prompt_hint` has been removed as requested. The prompt generation will now rely solely on the field's `description` (which can be built from the user's prompt) and the `base_json_type`/`json_format`.

2.  **`extraction_jobs` Table:**
    *   `name`: A nullable `VARCHAR` has been added to store a user-friendly job name. It's nullable because the name is often provided after the initial job record is created.
    *   **Handling Deleted Templates:** The foreign key for `template_id` has been modified:
        *   It is now **nullable** (`ALTER COLUMN template_id DROP NOT NULL`).
        *   The constraint is now `REFERENCES templates(id) ON DELETE SET NULL`. This is the crucial part. It means: "If the template with this ID is deleted, don't delete this job. Instead, just set this `template_id` field to `NULL`."
        *   This perfectly preserves the integrity of past jobs. A job record will persist forever, but it may lose its "link" to a template that no longer exists. This is the correct behavior because the *actual* configuration for the job is safely stored in the `job_fields` table.

3.  **`job_fields` Table (New):**
    *   This is the most important addition for ensuring robustness. It acts as an **immutable snapshot** of the field configuration at the moment a job is started.
    *   It decouples the job's execution from the `templates` table, solving both the "custom configuration" and "template was edited/deleted" problems in one elegant solution.
    *   All processing logic (e.g., the ARQ worker building the JSON schema for Gemini) will now read from this table, using the `job_id`.
