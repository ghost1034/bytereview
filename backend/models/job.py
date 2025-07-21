"""
Job-related Pydantic models for ByteReview
New asynchronous job-based extraction workflow
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum

# Export the enums for OpenAPI generation
__all__ = ["JobStatus", "ProcessingMode", "FileStatus", "JobInitiateRequest", "JobInitiateResponse", "JobStartRequest", "JobStartResponse", "JobDetailsResponse", "JobListResponse", "JobProgressResponse", "JobResultsResponse"]

class JobStatus(str, Enum):
    """Job status enumeration"""
    PENDING_CONFIGURATION = "pending_configuration"
    PROCESSING = "processing"
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
    READY = "ready"
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

class JobListItem(BaseModel):
    """Job list item for job listing"""
    id: str = Field(..., description="Job identifier")
    name: Optional[str] = Field(None, description="Job name")
    status: JobStatus = Field(..., description="Job status")
    created_at: datetime = Field(..., description="Creation timestamp")
    file_count: int = Field(..., description="Number of files")

class JobListResponse(BaseModel):
    """Response for job listing"""
    jobs: List[JobListItem] = Field(..., description="List of jobs")
    total: int = Field(..., description="Total number of jobs")

class JobProgressResponse(BaseModel):
    """Job progress information"""
    total_tasks: int = Field(..., description="Total number of tasks")
    completed: int = Field(..., description="Completed tasks")
    failed: int = Field(..., description="Failed tasks")
    status: JobStatus = Field(..., description="Overall job status")

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