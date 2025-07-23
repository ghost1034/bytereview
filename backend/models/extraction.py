"""
Data models for PDF extraction functionality
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict
from datetime import datetime

class FieldConfig(BaseModel):
    name: str = Field(..., description="Name of the field to extract")
    data_type: str = Field(..., description="Expected data type (Text, Number, Date, etc.)")
    prompt: str = Field(..., description="Instruction for AI on what to extract")

class ExtractionRequest(BaseModel):
    fields: List[FieldConfig] = Field(..., description="List of fields to extract")
    extract_multiple_rows: bool = Field(default=False, description="Whether to extract multiple rows/records")
    template_name: Optional[str] = Field(None, description="Optional template name to save")

class ExtractionResult(BaseModel):
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None
    rows_extracted: Optional[int] = None
    ai_model: Optional[str] = None
    raw_response: Optional[str] = None
    processing_time: Optional[float] = None
    by_document: Optional[List[Dict]] = None  # Results grouped by document

class ProcessedFile(BaseModel):
    filename: str
    size_bytes: int
    num_pages: int
    metadata: Optional[Dict] = None

class ExtractionResponse(BaseModel):
    success: bool
    files_processed: List[ProcessedFile]
    extraction_result: ExtractionResult
    pages_used: int
    total_processing_time: float
    error: Optional[str] = None

class ExtractionTemplate(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    fields: List[FieldConfig]
    created_by: Optional[str] = None  # None for public templates
    created_at: datetime
    updated_at: datetime
    is_public: bool = False

class TemplateCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    fields: List[FieldConfig]
    is_public: bool = False

class TemplateUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    fields: Optional[List[FieldConfig]] = None
    is_public: Optional[bool] = None