"""Pydantic models for the E-Signature (esign) feature."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, EmailStr, Field


# ---------------------------------------------------------------------------
# Shared field/recipient shapes
# ---------------------------------------------------------------------------


class EsignFieldInput(BaseModel):
    document_id: str
    recipient_id: str
    field_type: str  # signature | initials | date_signed | text | checkbox
    page_number: int = Field(ge=0)  # 0-based page index
    pos_x: float = Field(ge=0, le=1)
    pos_y: float = Field(ge=0, le=1)
    width: float = Field(gt=0, le=1)
    height: float = Field(gt=0, le=1)
    required: bool = True
    label: Optional[str] = None


class EsignFieldResponse(BaseModel):
    id: str
    envelope_id: str
    document_id: str
    recipient_id: str
    field_type: str
    page_number: int
    pos_x: float
    pos_y: float
    width: float
    height: float
    required: bool
    label: Optional[str] = None
    value: Optional[str] = None
    draft_value: Optional[str] = None  # signer's saved in-progress entry


class EsignRecipientInput(BaseModel):
    email: EmailStr
    name: str
    role: str = "signer"  # signer | cc
    routing_order: int = Field(default=1, ge=1)


class EsignRecipientResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    routing_order: int
    status: str
    viewed_at: Optional[datetime] = None
    consented_at: Optional[datetime] = None
    signed_at: Optional[datetime] = None
    declined_at: Optional[datetime] = None
    declined_reason: Optional[str] = None


class EsignDocumentResponse(BaseModel):
    id: str
    display_order: int
    original_filename: str
    original_sha256: str
    flattened_sha256: Optional[str] = None
    page_count: int
    file_size_bytes: int
    download_url: Optional[str] = None  # short-lived signed GET URL when requested


# ---------------------------------------------------------------------------
# Envelopes
# ---------------------------------------------------------------------------


class EsignEnvelopeUpdateRequest(BaseModel):
    title: Optional[str] = None
    message: Optional[str] = None
    signing_type: Optional[str] = None  # sequential | parallel
    expires_at: Optional[datetime] = None
    reminder_interval_hours: Optional[int] = Field(default=None, ge=1, le=24 * 30)


class EsignRecipientsReplaceRequest(BaseModel):
    recipients: list[EsignRecipientInput]


class EsignFieldsReplaceRequest(BaseModel):
    fields: list[EsignFieldInput]


class EsignVoidRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)


class EsignEnvelopeResponse(BaseModel):
    id: str
    title: str
    message: Optional[str] = None
    status: str
    signing_type: str
    current_routing_order: Optional[int] = None
    consent_disclosure_text: Optional[str] = None
    expires_at: Optional[datetime] = None
    reminder_interval_hours: Optional[int] = None
    last_reminder_at: Optional[datetime] = None
    voided_reason: Optional[str] = None
    sealed_sha256: Optional[str] = None
    has_sealed_document: bool = False
    has_certificate: bool = False
    sent_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    voided_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    documents: list[EsignDocumentResponse] = Field(default_factory=list)
    recipients: list[EsignRecipientResponse] = Field(default_factory=list)
    fields: list[EsignFieldResponse] = Field(default_factory=list)


class EsignEnvelopeListItem(BaseModel):
    id: str
    title: str
    status: str
    signing_type: str
    recipient_count: int = 0
    signed_count: int = 0
    document_count: int = 0
    expires_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class EsignEnvelopeListResponse(BaseModel):
    envelopes: list[EsignEnvelopeListItem] = Field(default_factory=list)
    total: int = 0
    limit: int = 25
    offset: int = 0


class EsignEventResponse(BaseModel):
    id: str
    event_type: str
    actor_email: Optional[str] = None
    recipient_id: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    mfa_verified: Optional[bool] = None
    mfa_method: Optional[str] = None
    details: Optional[dict[str, Any]] = None
    created_at: datetime


class EsignAuditTrailResponse(BaseModel):
    envelope_id: str
    events: list[EsignEventResponse] = Field(default_factory=list)


class EsignDownloadResponse(BaseModel):
    url: str
    filename: str
    sha256: Optional[str] = None
    expires_in_minutes: int


# ---------------------------------------------------------------------------
# Signing ceremony
# ---------------------------------------------------------------------------


class EsignInboxItem(BaseModel):
    envelope_id: str
    recipient_id: str
    title: str
    message: Optional[str] = None
    sender_email: str
    status: str  # recipient status
    envelope_status: str
    role: str = "signer"  # signer | cc ("receives a copy")
    routing_order: int
    is_my_turn: bool
    expires_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime


class EsignInboxResponse(BaseModel):
    items: list[EsignInboxItem] = Field(default_factory=list)


class EsignSigningDocument(BaseModel):
    id: str
    display_order: int
    original_filename: str
    page_count: int
    download_url: str


class EsignSigningSessionResponse(BaseModel):
    envelope_id: str
    recipient_id: str
    title: str
    message: Optional[str] = None
    sender_email: str
    envelope_status: str
    recipient_status: str
    recipient_role: str = "signer"  # signer | cc (cc sessions are read-only)
    is_my_turn: bool
    consent_required: bool  # false once consent has been recorded
    consent_disclosure_text: str
    documents: list[EsignSigningDocument] = Field(default_factory=list)
    fields: list[EsignFieldResponse] = Field(default_factory=list)  # this signer's fields only
    expires_at: Optional[datetime] = None


class EsignConsentResponse(BaseModel):
    consented_at: datetime
    consent_text_sha256: str


class EsignSignatureInput(BaseModel):
    signature_type: str  # drawn | typed | uploaded
    image_data_url: Optional[str] = None  # base64 PNG data URL for drawn/uploaded
    typed_text: Optional[str] = None
    typed_font: Optional[str] = None
    initials_text: Optional[str] = Field(default=None, max_length=20)
    initials_image_data_url: Optional[str] = None  # base64 PNG data URL, optional


class EsignFieldValueInput(BaseModel):
    field_id: str
    value: Optional[str] = None  # text value / "true"|"false" for checkbox


class EsignSubmitRequest(BaseModel):
    signature: EsignSignatureInput
    field_values: list[EsignFieldValueInput] = Field(default_factory=list)


class EsignProgressRequest(BaseModel):
    """Finish Later: in-progress text/checkbox entries saved mid-ceremony."""

    field_values: list[EsignFieldValueInput] = Field(default_factory=list)


class EsignProgressResponse(BaseModel):
    saved_count: int = 0


class EsignSubmitResponse(BaseModel):
    envelope_status: str
    recipient_status: str
    sealing_enqueued: bool = False


class EsignDeclineRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)


# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------


class EsignVerifyResponse(BaseModel):
    envelope_id: Optional[str] = None
    envelope_status: Optional[str] = None
    hash_match: Optional[bool] = None
    signature_found: bool = False
    signature_valid: Optional[bool] = None
    modification_level: Optional[str] = None
    signer_subject: Optional[str] = None
    signed_at: Optional[datetime] = None
    sealed_sha256: Optional[str] = None
    computed_sha256: Optional[str] = None
    details: Optional[str] = None


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------


class EsignTemplateRoleInput(BaseModel):
    label: str
    role: str = "signer"
    routing_order: int = Field(default=1, ge=1)


class EsignTemplateFieldInput(BaseModel):
    template_document_id: str
    recipient_index: int = Field(ge=0)
    field_type: str
    page_number: int = Field(ge=0)
    pos_x: float = Field(ge=0, le=1)
    pos_y: float = Field(ge=0, le=1)
    width: float = Field(gt=0, le=1)
    height: float = Field(gt=0, le=1)
    required: bool = True
    label: Optional[str] = None


class EsignTemplateUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    title: Optional[str] = None
    message: Optional[str] = None
    signing_type: Optional[str] = None
    recipient_roles: Optional[list[EsignTemplateRoleInput]] = None
    fields: Optional[list[EsignTemplateFieldInput]] = None


class EsignTemplateDocumentResponse(BaseModel):
    id: str
    display_order: int
    original_filename: str
    sha256: str
    page_count: int
    file_size_bytes: int
    download_url: Optional[str] = None


class EsignTemplateFieldResponse(BaseModel):
    id: str
    template_document_id: str
    recipient_index: int
    field_type: str
    page_number: int
    pos_x: float
    pos_y: float
    width: float
    height: float
    required: bool
    label: Optional[str] = None


class EsignTemplateResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    title: Optional[str] = None
    message: Optional[str] = None
    signing_type: str
    recipient_roles: list[dict[str, Any]] = Field(default_factory=list)
    documents: list[EsignTemplateDocumentResponse] = Field(default_factory=list)
    fields: list[EsignTemplateFieldResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class EsignTemplateListResponse(BaseModel):
    templates: list[EsignTemplateResponse] = Field(default_factory=list)


class EsignEnvelopeCreateResponse(BaseModel):
    envelope: EsignEnvelopeResponse
    message: str = "Envelope created"
