"""
Job-related Pydantic models for ByteReview
New asynchronous job-based extraction workflow
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum

# Export the enums for OpenAPI generation
__all__ = ["JobStatus", "ProcessingMode", "FileStatus", "JobInitiateRequest", "JobInitiateResponse", "JobStartRequest", "JobStartResponse", "JobDetailsResponse", "JobListResponse", "JobProgressResponse", "JobResultsResponse", "JobRunListItem", "JobRunDetailsResponse", "JobRunCreateRequest", "JobRunCreateResponse", "JobRunListResponse"]

class JobStatus(str, Enum):
    """Job status enumeration"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    PARTIALLY_COMPLETED = "partially_completed"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class ProcessingMode(str, Enum):
    """File processing mode enumeration"""
    INDIVIDUAL = "individual"
    COMBINED = "combined"

class FileStatus(str, Enum):
    """File status enumeration"""
    UPLOADING = "uploading"
    UPLOADED = "uploaded"
    IMPORTING = "importing"  # Files being imported from Drive/Gmail
    UNPACKING = "unpacking"  # ZIP files being unpacked
    UNPACKED = "unpacked"    # ZIP files that have been unpacked
    FAILED = "failed"

class FileUploadInfo(BaseModel):
    """Information about a file to be uploaded"""
    filename: str = Field(..., description="Original filename")
    path: str = Field(..., description="Relative path within upload structure")
    size: int = Field(..., description="File size in bytes")
    type: str = Field(..., description="MIME type")

class FileUploadResponse(BaseModel):
    """Response for file upload preparation"""
    original_path: str = Field(..., description="Original file path")
    upload_url: str = Field(..., description="Pre-signed URL for upload")

class JobInitiateRequest(BaseModel):
    """Request to initiate a new job"""
    files: List[FileUploadInfo] = Field(..., description="List of files to upload")
    name: Optional[str] = Field(None, description="Job name")

class JobInitiateResponse(BaseModel):
    """Response for job initiation"""
    job_id: str = Field(..., description="Unique job identifier")
    files: List[FileUploadResponse] = Field(..., description="Upload URLs for each file")

class TaskDefinition(BaseModel):
    """Definition of how files should be processed"""
    path: str = Field(..., description="Folder path to process")
    mode: ProcessingMode = Field(..., description="Processing mode for this path")

class JobFieldConfig(BaseModel):
    """Field configuration for a job (snapshot from template)"""
    field_name: str = Field(..., description="Name of the field")
    data_type_id: str = Field(..., description="Data type identifier")
    ai_prompt: str = Field(..., description="AI extraction prompt")
    display_order: int = Field(default=0, description="Display order")

class JobStartRequest(BaseModel):
    """Request to start job processing"""
    template_id: Optional[str] = Field(None, description="Template ID to use")
    persist_data: bool = Field(default=True, description="Whether to persist data")
    fields: List[JobFieldConfig] = Field(..., description="Field configuration")
    task_definitions: List[TaskDefinition] = Field(..., description="Processing definitions")

class JobStartResponse(BaseModel):
    """Response for job start"""
    message: str = Field(..., description="Success message")
    job_id: str = Field(..., description="Job identifier")

class JobFileInfo(BaseModel):
    """Information about a file in a job"""
    id: str = Field(..., description="File identifier")
    original_path: str = Field(..., description="Original file path")
    original_filename: str = Field(..., description="Original filename")
    file_size_bytes: int = Field(..., description="File size")
    status: FileStatus = Field(..., description="File processing status")

class JobFieldInfo(BaseModel):
    """Information about a job field"""
    field_name: str = Field(..., description="Field name")
    data_type_id: str = Field(..., description="Data type")
    ai_prompt: str = Field(..., description="AI prompt")
    display_order: int = Field(..., description="Display order")

class JobDetailsResponse(BaseModel):
    """Detailed job information"""
    id: str = Field(..., description="Job identifier")
    name: Optional[str] = Field(None, description="Job name")
    status: JobStatus = Field(..., description="Current job status")
    persist_data: bool = Field(..., description="Data persistence setting")
    created_at: datetime = Field(..., description="Creation timestamp")
    completed_at: Optional[datetime] = Field(None, description="Completion timestamp")
    job_fields: List[JobFieldInfo] = Field(..., description="Field configuration")
    template_id: Optional[str] = Field(None, description="Template ID used for this job")
    description: Optional[str] = Field(None, description="Run description explaining the extraction purpose")
    extraction_tasks: List[dict] = Field(default_factory=list, description="Task definitions for processing modes")

class JobListItem(BaseModel):
    """Job list item for job listing"""
    id: str = Field(..., description="Job identifier")
    name: Optional[str] = Field(None, description="Job name")
    status: JobStatus = Field(..., description="Job status")
    config_step: str = Field(..., description="Current configuration step")
    created_at: datetime = Field(..., description="Creation timestamp")
    latest_run_created_at: datetime = Field(..., description="Creation timestamp of the latest job run")
    latest_run_completed_at: Optional[datetime] = Field(None, description="Completion timestamp of the latest job run (if completed)")
    has_configured_fields: Optional[bool] = Field(None, description="Whether the job has configured fields (for automation selection)")

class JobListResponse(BaseModel):
    """Response for job listing"""
    jobs: List[JobListItem] = Field(..., description="List of jobs")
    total: int = Field(..., description="Total number of jobs")

class TaskInfo(BaseModel):
    """Information about a single extraction task"""
    id: str = Field(..., description="Task identifier")
    status: str = Field(..., description="Task status")

class JobProgressResponse(BaseModel):
    """Job progress information"""
    total_tasks: int = Field(..., description="Total number of tasks")
    completed: int = Field(..., description="Completed tasks")
    failed: int = Field(..., description="Failed tasks")
    status: JobStatus = Field(..., description="Overall job status")
    tasks: List[TaskInfo] = Field(default_factory=list, description="List of all tasks with their status")

class ExtractionTaskResult(BaseModel):
    """Result from a single extraction task"""
    task_id: str = Field(..., description="Task identifier")
    source_files: List[str] = Field(..., description="Source file names")
    extracted_data: Dict[str, Any] = Field(..., description="Extracted data")
    processing_mode: ProcessingMode = Field(..., description="Processing mode used")

class JobResultsResponse(BaseModel):
    """Job results with pagination"""
    total: int = Field(..., description="Total number of results")
    files_processed_count: int = Field(..., description="Total number of unique files processed")
    results: List[ExtractionTaskResult] = Field(..., description="Extraction results")

class JobFilesResponse(BaseModel):
    """Response for job files listing"""
    files: List[JobFileInfo] = Field(..., description="List of files in the job")

# ===================================================================
# Job Run Models
# ===================================================================

class JobRunListItem(BaseModel):
    """Job run list item for run listing"""
    id: str = Field(..., description="Job run identifier")
    status: JobStatus = Field(..., description="Run status")
    config_step: str = Field(..., description="Current configuration step")
    tasks_total: int = Field(..., description="Total number of tasks")
    tasks_completed: int = Field(..., description="Completed tasks")
    tasks_failed: int = Field(..., description="Failed tasks")
    created_at: datetime = Field(..., description="Creation timestamp")
    completed_at: Optional[datetime] = Field(None, description="Completion timestamp")
    template_id: Optional[str] = Field(None, description="Template ID used for this run")

class JobRunDetailsResponse(BaseModel):
    """Detailed job run information"""
    id: str = Field(..., description="Job run identifier")
    job_id: str = Field(..., description="Parent job identifier")
    status: JobStatus = Field(..., description="Current run status")
    config_step: str = Field(..., description="Current configuration step")
    persist_data: bool = Field(..., description="Data persistence setting")
    tasks_total: int = Field(..., description="Total number of tasks")
    tasks_completed: int = Field(..., description="Completed tasks")
    tasks_failed: int = Field(..., description="Failed tasks")
    created_at: datetime = Field(..., description="Creation timestamp")
    completed_at: Optional[datetime] = Field(None, description="Completion timestamp")
    job_fields: List[JobFieldInfo] = Field(..., description="Field configuration")
    template_id: Optional[str] = Field(None, description="Template ID used for this run")
    description: Optional[str] = Field(None, description="Run description explaining the extraction purpose")
    extraction_tasks: List[dict] = Field(default_factory=list, description="Task definitions for processing modes")

class JobRunCreateRequest(BaseModel):
    """Request to create a new job run"""
    clone_from_run_id: Optional[str] = Field(None, description="Run ID to clone field configuration from (defaults to latest)")
    template_id: Optional[str] = Field(None, description="Template ID to use for field configuration")

class JobRunCreateResponse(BaseModel):
    """Response for job run creation"""
    job_run_id: str = Field(..., description="Created job run identifier")
    message: str = Field(..., description="Success message")

class JobRunListResponse(BaseModel):
    """Response for job run listing"""
    runs: List[JobRunListItem] = Field(..., description="List of job runs")
    total: int = Field(..., description="Total number of runs")
    latest_run_id: str = Field(..., description="ID of the latest run")