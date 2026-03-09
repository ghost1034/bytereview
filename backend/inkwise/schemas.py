"""Schemas for the Inkwise module."""

from datetime import datetime
import uuid

from pydantic import BaseModel, ConfigDict, Field


class InkwisePlaceholderResponse(BaseModel):
    phase: int = Field(default=2)
    status: str = Field(default="placeholder")
    area: str
    action: str
    message: str
    user_id: str


class InkwisePlaceholderListResponse(BaseModel):
    phase: int = Field(default=2)
    status: str = Field(default="placeholder")
    area: str
    action: str
    message: str
    user_id: str
    items: list[dict] = Field(default_factory=list)


def build_placeholder_response(*, area: str, action: str, message: str, user_id: str) -> InkwisePlaceholderResponse:
    return InkwisePlaceholderResponse(
        area=area,
        action=action,
        message=message,
        user_id=user_id,
    )


def build_placeholder_list_response(*, area: str, action: str, message: str, user_id: str) -> InkwisePlaceholderListResponse:
    return InkwisePlaceholderListResponse(
        area=area,
        action=action,
        message=message,
        user_id=user_id,
    )


class InkwiseSourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: str
    title: str
    original_filename: str | None = None
    content_type: str
    size_bytes: int
    checksum_sha256: str | None = None
    status: str
    failure_code: str | None = None
    failure_detail: str | None = None
    created_at: datetime
    updated_at: datetime


class InkwisePaginatedSources(BaseModel):
    items: list[InkwiseSourceOut]
    page: int
    limit: int
    total: int


class InkwiseSourceCreateRequest(BaseModel):
    title: str
    original_filename: str | None = None
    content_type: str = "application/pdf"
    size_bytes: int = 0
    source_url: str | None = None
    type: str = "upload"


class InkwiseSourceUploadInitRequest(BaseModel):
    original_filename: str
    content_type: str
    size_bytes: int
    title: str | None = None


class InkwiseUploadInfo(BaseModel):
    method: str
    url: str
    headers: dict[str, str]
    expires_at: str


class InkwiseSourceUploadInitResponse(BaseModel):
    source: InkwiseSourceOut
    upload: InkwiseUploadInfo


class InkwiseSourceUploadCompleteRequest(BaseModel):
    checksum_sha256: str | None = None


class InkwiseSignedUrlResponse(BaseModel):
    url: str
    expires_at: str


class InkwiseMessageResponse(BaseModel):
    message: str


class InkwiseSourceIngestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    source_id: uuid.UUID
    pipeline: str
    status: str
    treegen_engine: str | None = None
    treegen_version: str | None = None
    extraction_engine: str | None = None
    canonical_pdf_gcs_bucket: str | None = None
    canonical_pdf_gcs_object: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    pageindex_doc_id: str | None = None
    page_count: int | None = None
    provider_document_name: str | None = None
    doc_description: str | None = None
    tree_gcs_bucket: str | None = None
    tree_gcs_object: str | None = None
    tree_cached_at: datetime | None = None
    error_json: dict | None = None
    created_at: datetime


class InkwiseSourceIngestionListResponse(BaseModel):
    source_id: uuid.UUID | None = None
    ingestions: list[InkwiseSourceIngestionOut]
