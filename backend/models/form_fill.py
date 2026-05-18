"""Pydantic models for the Form Fill feature."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class FormFillTemplateResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    original_filename: str
    file_type: str
    allow_docx_table_expansion: bool = False
    file_size_bytes: int
    page_count: Optional[int] = None
    created_at: datetime
    updated_at: datetime


class FormFillTemplateListResponse(BaseModel):
    templates: list[FormFillTemplateResponse] = Field(default_factory=list)


class FormFillSourceFileResponse(BaseModel):
    id: str
    original_filename: str
    file_type: str
    file_size_bytes: int
    display_order: int


class FormFillOutputResponse(BaseModel):
    id: str
    record_index: int
    record_label: str
    status: str
    warnings: list[str] = Field(default_factory=list)
    fill_plan: Optional[dict[str, Any]] = None
    result_filename: Optional[str] = None
    result_file_type: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None


class FormFillRunResponse(BaseModel):
    id: str
    status: str
    source_mode: str
    source_filename: Optional[str] = None
    source_file_type: Optional[str] = None
    source_files: list[FormFillSourceFileResponse] = Field(default_factory=list)
    source_payload: Optional[dict[str, Any]] = None
    source_job_id: Optional[str] = None
    source_run_id: Optional[str] = None
    source_task_id: Optional[str] = None
    target_mode: str
    target_template_id: Optional[str] = None
    target_filename: str
    target_file_type: str
    target_page_count: Optional[int] = None
    allow_docx_table_expansion: bool = False
    output_format: str
    repeat_mode: str = "all_sources"
    total_outputs: int = 1
    completed_outputs: int = 0
    failed_outputs: int = 0
    usage_basis: Optional[str] = None
    usage_pages: Optional[int] = None
    processing_strategy: Optional[str] = None
    warnings: list[str] = Field(default_factory=list)
    fill_plan: Optional[dict[str, Any]] = None
    outputs: list[FormFillOutputResponse] = Field(default_factory=list)
    result_filename: Optional[str] = None
    result_file_type: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None


class FormFillRunCreateResponse(BaseModel):
    run: FormFillRunResponse
    message: str


class FormFillRunListResponse(BaseModel):
    runs: list[FormFillRunResponse] = Field(default_factory=list)
    total: int = 0
    limit: int = 25
    offset: int = 0


class FormFillExtractionSourcePreviewResponse(BaseModel):
    job_id: str
    run_id: str
    task_id: Optional[str] = None
    source_scope: str = "task"
    source_files: list[str] = Field(default_factory=list)
    columns: list[str] = Field(default_factory=list)
    rows: list[list[Any]] = Field(default_factory=list)
