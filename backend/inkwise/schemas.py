"""Schemas for the Inkwise module."""

from datetime import datetime
import uuid
from typing import Literal

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


class InkwiseDocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: str
    title: str
    content_json: dict | None = None
    content_html: str | None = None
    init_prompt: str | None = None
    language: str | None = None
    version: int
    created_at: datetime
    updated_at: datetime


class InkwisePaginatedDocuments(BaseModel):
    items: list[InkwiseDocumentOut]
    page: int
    limit: int
    total: int


class InkwiseBoundSourceOut(BaseModel):
    binding_id: uuid.UUID
    source: InkwiseSourceOut
    is_active: bool
    grounded_chat_ready: bool
    grounded_chat_reason: str | None = None


class InkwiseDocumentBoundSourcesOut(BaseModel):
    document_id: uuid.UUID
    sources: list[InkwiseBoundSourceOut]


class InkwiseBindSourcesRequest(BaseModel):
    source_ids: list[uuid.UUID]


class InkwiseBindSourcesResponse(BaseModel):
    document_id: uuid.UUID
    bound_source_ids: list[uuid.UUID]


class InkwiseDocumentCreateRequest(BaseModel):
    title: str | None = None
    content_json: dict | None = None
    content_html: str | None = None
    init_prompt: str | None = None
    language: str | None = None


class InkwiseDocumentUpdateRequest(BaseModel):
    version: int
    title: str | None = None
    content_json: dict | None = None
    content_html: str | None = None
    init_prompt: str | None = None
    language: str | None = None


class InkwiseTemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: str
    title: str
    icon: str | None = None
    description: str | None = None
    content_json: dict
    created_at: datetime
    updated_at: datetime


class InkwisePaginatedTemplates(BaseModel):
    items: list[InkwiseTemplateOut]
    page: int
    limit: int
    total: int


class InkwiseTemplateCreateRequest(BaseModel):
    title: str
    icon: str | None = None
    description: str | None = None
    content_json: dict


class InkwiseTemplateUpdateRequest(BaseModel):
    title: str | None = None
    icon: str | None = None
    description: str | None = None
    content_json: dict | None = None


class InkwiseSystemTemplateCategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class InkwiseSystemTemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    category_id: int
    title: str
    icon: str | None = None
    description: str | None = None
    content_json: dict


class InkwiseSystemTemplateCategoryListResponse(BaseModel):
    items: list[InkwiseSystemTemplateCategoryOut]


class InkwiseSystemTemplateListResponse(BaseModel):
    items: list[InkwiseSystemTemplateOut]


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
    normalizer_version: str | None = None
    embedding_model: str | None = None
    embedding_dimension: int | None = None
    embedding_location: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    pageindex_doc_id: str | None = None
    page_count: int | None = None
    segment_count: int | None = None
    provider_document_name: str | None = None
    doc_description: str | None = None
    tree_gcs_bucket: str | None = None
    tree_gcs_object: str | None = None
    tree_cached_at: datetime | None = None
    preview_manifest_bucket: str | None = None
    preview_manifest_object: str | None = None
    error_json: dict | None = None
    created_at: datetime


class InkwiseSourceIngestionListResponse(BaseModel):
    source_id: uuid.UUID | None = None
    ingestions: list[InkwiseSourceIngestionOut]


class InkwiseRetrievalEvidenceOut(BaseModel):
    evidence_id: str
    source_id: uuid.UUID
    source_title: str
    page_number: int
    segment_id: uuid.UUID | None = None
    segment_title: str | None = None
    node_id: str | None = None
    node_title: str | None = None
    locator_json: dict | None = None
    preview_bucket: str | None = None
    preview_object: str | None = None
    excerpt: str
    score: float | None = None


class InkwiseRunRetrievalRequest(BaseModel):
    query: str
    source_ids: list[uuid.UUID] | None = None
    history_messages: list[dict[str, str]] | None = None
    draft_selection_text: str | None = None


class InkwiseRetrievalRunSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: str
    document_id: uuid.UUID
    thread_id: uuid.UUID | None = None
    query: str
    bound_source_ids: list[uuid.UUID]
    strategy_version: str
    meta: dict
    created_at: datetime


class InkwiseRetrievalRunDetailOut(BaseModel):
    run: InkwiseRetrievalRunSummaryOut
    evidence: list[InkwiseRetrievalEvidenceOut]
    evidence_pack: str


class InkwiseChatThreadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: str
    document_id: uuid.UUID
    mode: str | None = None
    title: str | None = None
    created_at: datetime


class InkwiseChatThreadsResponse(BaseModel):
    document_id: uuid.UUID | None = None
    threads: list[InkwiseChatThreadOut]


class InkwiseChatThreadCreateRequest(BaseModel):
    document_id: uuid.UUID
    title: str | None = None


class InkwiseChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    thread_id: uuid.UUID
    role: str
    content: str
    content_with_citations: str | None = None
    citations_json: dict | None = None
    provider: str
    provider_meta: dict | None = None
    created_at: datetime


class InkwisePaginatedChatMessages(BaseModel):
    items: list[InkwiseChatMessageOut]
    page: int
    limit: int
    total: int


class InkwiseChatSendRequest(BaseModel):
    content: str
    source_ids: list[uuid.UUID] | None = None
    draft_selection_text: str | None = None
    draft_selection_label: str | None = None


class InkwiseWritingToolRequest(BaseModel):
    action: Literal[
        "improve",
        "longer",
        "opposing_argument",
        "translate",
        "concise",
        "humanize",
        "other",
    ]
    document_id: uuid.UUID | None = None
    source_ids: list[uuid.UUID] | None = None
    selection_text: str
    surrounding_text: str | None = None
    instruction: str


class InkwisePredictionRequest(BaseModel):
    before_text: str = Field(min_length=1, max_length=12000)
    after_text: str | None = Field(default=None, max_length=4000)
    current_block_text: str | None = Field(default=None, max_length=4000)


class InkwisePredictionResponse(BaseModel):
    suggestion_text: str
    grounded: bool = False
    provider: str = "vertex_ai"
    model: str
