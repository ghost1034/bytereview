"""
File upload and processing models
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from .common import FileMetadata

class UploadedFileInfo(BaseModel):
    """Information about an uploaded file"""
    file_id: str
    filename: str
    size_bytes: int
    is_zip: bool = False
    extracted_count: int = 1
    upload_time: float
    extracted_files: List[Dict[str, Any]] = Field(default_factory=list)

class FileUploadResponse(BaseModel):
    """Response from file upload endpoint"""
    success: bool
    uploaded_files: List[UploadedFileInfo]
    total_files: int
    message: str
    error: Optional[str] = None

class ExtractedFileInfo(BaseModel):
    """Information about a file extracted from ZIP"""
    file_id: str
    filename: str
    size_bytes: int
    original_path: str

class CleanupResponse(BaseModel):
    """Response from cleanup operations"""
    success: bool
    deleted_count: int
    message: str
    note: Optional[str] = None