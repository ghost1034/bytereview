"""Pydantic models for the E-Signature (esign) feature."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

EsignRecipientRoleName = Literal[
    "signer", "cc", "approver", "certified_delivery", "agent", "editor",
    "witness", "in_person_signer",
]


# ---------------------------------------------------------------------------
# Shared field/recipient shapes
# ---------------------------------------------------------------------------


class RadioGroupProps(BaseModel):
    id: str
    label: Optional[str] = None


class DropdownOption(BaseModel):
    value: str
    label: str


class ConditionalRule(BaseModel):
    parent_field_id: str
    operator: Literal["equals", "not_equals", "any_of", "checked", "unchecked", "not_empty"]
    values: list[str] = Field(default_factory=list)
    action: Literal["show", "require"] = "show"


class FormulaProps(BaseModel):
    expression: str = Field(min_length=1, max_length=4_000)
    decimal_places: int = Field(default=2, ge=0, le=10)


class AutoFillProps(BaseModel):
    auto_source: Literal["recipient_name", "recipient_email", "company", "date_sent"]


class AttachmentProps(BaseModel):
    allowed_types: list[str] = Field(default_factory=lambda: ["application/pdf", "image/png", "image/jpeg"])


class AnchorProps(BaseModel):
    # ``text`` is retained for envelopes authored by the browser-only anchor tool.
    text: Optional[str] = None
    anchor: Optional[str] = Field(default=None, max_length=500)
    rule_id: Optional[str] = None
    match_index: Optional[int] = Field(default=None, ge=0)
    case_sensitive: bool = False
    whole_word: bool = False
    document_ids: Optional[list[str]] = None
    page_numbers: Optional[list[int]] = None
    horizontal_alignment: Literal["left", "center", "right", "after"] = "after"
    offset_x: float = 0
    offset_y: float = 0
    offset_unit: Literal["point", "mm", "inch"] = "point"
    match_mode: Literal["first", "all"] = "all"
    missing_policy: Literal["fail", "ignore"] = "fail"


class TextValidation(BaseModel):
    max_length: Optional[int] = Field(default=None, ge=1, le=100_000)
    regex: Optional[str] = Field(default=None, max_length=2_000)

    @model_validator(mode="after")
    def valid_regex(self):
        if self.regex:
            import re
            try:
                re.compile(self.regex)
            except re.error as exc:
                raise ValueError(f"invalid validation regex: {exc}") from exc
        return self


class NumberValidation(BaseModel):
    minimum: Optional[float] = None
    maximum: Optional[float] = None
    decimal_places: Optional[int] = Field(default=None, ge=0, le=10)
    allow_negative: bool = True

    @model_validator(mode="after")
    def valid_range(self):
        if self.minimum is not None and self.maximum is not None and self.minimum > self.maximum:
            raise ValueError("number minimum cannot exceed maximum")
        return self


class DateValidation(BaseModel):
    minimum: Optional[date] = None
    maximum: Optional[date] = None

    @model_validator(mode="after")
    def valid_range(self):
        if self.minimum and self.maximum and self.minimum > self.maximum:
            raise ValueError("date minimum cannot exceed maximum")
        return self


class SelectionValidation(BaseModel):
    minimum_selected: int = Field(default=0, ge=0)
    maximum_selected: Optional[int] = Field(default=None, ge=1)

    @model_validator(mode="after")
    def valid_range(self):
        if self.maximum_selected is not None and self.minimum_selected > self.maximum_selected:
            raise ValueError("minimum_selected cannot exceed maximum_selected")
        return self


class FieldAppearance(BaseModel):
    font: str = Field(default="Helvetica", max_length=100)
    font_size: Optional[float] = Field(default=None, ge=4, le=144)
    color: str = Field(default="#000000", pattern=r"^#[0-9a-fA-F]{6}$")
    alignment: Literal["left", "center", "right"] = "left"
    bold: bool = False
    italic: bool = False
    underline: bool = False


class EsignFieldProperties(BaseModel):
    model_config = ConfigDict(extra="allow")

    group: Optional[RadioGroupProps] = None
    option_value: Optional[str] = None
    options: Optional[list[DropdownOption]] = None
    conditional: Optional[ConditionalRule] = None
    formula: Optional[FormulaProps] = None
    auto_source: Optional[Literal["recipient_name", "recipient_email", "company", "date_sent"]] = None
    allowed_types: Optional[list[str]] = None
    anchor: Optional[AnchorProps] = None
    data_label: Optional[str] = Field(default=None, min_length=1, max_length=255)
    tooltip: Optional[str] = Field(default=None, max_length=2_000)
    sender_prefill: Optional[str] = None
    read_only: bool = False
    shared_value: bool = False
    text_validation: Optional[TextValidation] = None
    number_validation: Optional[NumberValidation] = None
    date_validation: Optional[DateValidation] = None
    selection_validation: Optional[SelectionValidation] = None
    appearance: Optional[FieldAppearance] = None


def _validated_properties(field_type: str, value: Any) -> EsignFieldProperties:
    props = value.model_dump(exclude_none=True) if isinstance(value, BaseModel) else dict(value or {})
    if "conditional" in props and props["conditional"] is not None:
        props["conditional"] = ConditionalRule.model_validate(props["conditional"]).model_dump()
    for key, model in (
        ("text_validation", TextValidation), ("number_validation", NumberValidation),
        ("date_validation", DateValidation), ("selection_validation", SelectionValidation),
        ("appearance", FieldAppearance), ("anchor", AnchorProps),
    ):
        if props.get(key) is not None:
            props[key] = model.model_validate(props[key]).model_dump(exclude_none=True, mode="json")
    if field_type == "radio":
        props["group"] = RadioGroupProps.model_validate(props.get("group")).model_dump()
        option = str(props.get("option_value", "")).strip()
        if not option:
            raise ValueError("radio fields require option_value")
        props["option_value"] = option
    elif field_type == "dropdown":
        options = [DropdownOption.model_validate(item).model_dump() for item in props.get("options", [])]
        if not options:
            raise ValueError("dropdown fields require at least one option")
        if len({o["value"] for o in options}) != len(options):
            raise ValueError("dropdown option values must be unique")
        props["options"] = options
    elif field_type == "formula":
        props["formula"] = FormulaProps.model_validate(props.get("formula")).model_dump()
    elif field_type == "auto_fill":
        props.update(AutoFillProps.model_validate(props).model_dump())
    elif field_type == "attachment":
        props.update(AttachmentProps.model_validate(props).model_dump())
    return EsignFieldProperties.model_validate(props)


class EsignFieldInput(BaseModel):
    id: Optional[str] = None
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
    properties: EsignFieldProperties = Field(default_factory=EsignFieldProperties)

    @model_validator(mode="after")
    def validate_properties(self):
        self.properties = _validated_properties(self.field_type, self.properties)
        if self.field_type == "formula":
            self.required = False
        return self


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
    properties: EsignFieldProperties = Field(default_factory=EsignFieldProperties)


class EsignRecipientInput(BaseModel):
    id: Optional[str] = None
    email: Optional[EmailStr] = None
    name: Optional[str] = None
    role: EsignRecipientRoleName = "signer"
    routing_order: int = Field(default=1, ge=1)
    role_label: Optional[str] = Field(default=None, max_length=255)
    private_message: Optional[str] = Field(default=None, max_length=4_000)
    managed_by_recipient_id: Optional[str] = None
    witness_for_recipient_id: Optional[str] = None
    host_name: Optional[str] = Field(default=None, max_length=255)
    host_email: Optional[EmailStr] = None
    allow_reassignment: bool = False

    @model_validator(mode="after")
    def validate_identity_shape(self):
        if self.role in ("agent", "editor", "approver", "certified_delivery", "signer", "cc"):
            if not self.name or not self.email:
                raise ValueError(f"{self.role} recipients require a name and email")
        if self.role == "witness" and not self.witness_for_recipient_id:
            raise ValueError("witness recipients must identify the signer they witness")
        if self.role == "in_person_signer" and (not self.host_name or not self.host_email):
            raise ValueError("in-person signers require host name and email")
        if self.role in ("witness", "in_person_signer"):
            return self
        if bool(self.managed_by_recipient_id) != (not self.name and not self.email):
            if self.managed_by_recipient_id and (self.name or self.email):
                # A manager may also be recorded after resolving the placeholder.
                return self
            if not self.name and not self.email:
                raise ValueError("unresolved recipients must identify their manager")
        return self


class EsignRecipientResponse(BaseModel):
    id: str
    email: Optional[str] = None
    name: Optional[str] = None
    role: str
    routing_order: int
    status: str
    role_label: Optional[str] = None
    private_message: Optional[str] = None
    managed_by_recipient_id: Optional[str] = None
    witness_for_recipient_id: Optional[str] = None
    host_name: Optional[str] = None
    host_email: Optional[str] = None
    allow_reassignment: bool = False
    action_completed_at: Optional[datetime] = None
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
    date_format: Optional[Literal["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD", "MMM D, YYYY"]] = None
    allow_reassignment: Optional[bool] = None


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
    date_format: str = "MM/DD/YYYY"
    current_routing_order: Optional[int] = None
    routing_version: int = 1
    allow_reassignment: bool = False
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
    documents: list[EsignDocumentResponse]
    recipients: list[EsignRecipientResponse]
    fields: list[EsignFieldResponse]


class EsignEnvelopeListItem(BaseModel):
    id: str
    title: str
    status: str
    signing_type: str
    recipient_count: int = 0
    signed_count: int = 0
    document_count: int = 0
    recipient_preview: list[EsignRecipientResponse]
    expires_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class EsignEnvelopeListResponse(BaseModel):
    envelopes: list[EsignEnvelopeListItem]
    total: int = 0
    limit: int = 25
    offset: int = 0
    status_counts: dict[str, int]


class EsignDocumentOrderRequest(BaseModel):
    document_ids: list[str]


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
    recipient_changes: list["EsignRecipientChangeResponse"] = Field(default_factory=list)


class EsignRecipientChangeResponse(BaseModel):
    id: str
    recipient_id: Optional[str] = None
    envelope_version: int
    change_type: str
    actor_email: Optional[str] = None
    reason: str
    before_snapshot: Optional[dict[str, Any]] = None
    after_snapshot: Optional[dict[str, Any]] = None
    created_at: datetime


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
    items: list[EsignInboxItem]


class EsignSigningDocument(BaseModel):
    id: str
    display_order: int
    original_filename: str
    page_count: int
    download_url: str


class EsignContextField(BaseModel):
    id: str
    field_type: str
    value: Optional[str] = None
    properties: EsignFieldProperties = Field(default_factory=EsignFieldProperties)


class EsignSigningSessionResponse(BaseModel):
    envelope_id: str
    recipient_id: str
    title: str
    message: Optional[str] = None
    sender_email: str
    envelope_status: str
    recipient_status: str
    recipient_role: str = "signer"  # signer | cc (cc sessions are read-only)
    routing_version: int = 1
    private_message: Optional[str] = None
    available_actions: list[str] = Field(default_factory=list)
    managed_recipients: list[EsignRecipientResponse] = Field(default_factory=list)
    is_my_turn: bool
    consent_required: bool  # false once consent has been recorded
    consent_disclosure_text: str
    documents: list[EsignSigningDocument]
    fields: list[EsignFieldResponse] = Field(default_factory=list)  # this signer's fields only
    context_fields: list[EsignContextField] = Field(default_factory=list)
    recipient_name: str = ""
    recipient_email: str = ""
    recipient_company: Optional[str] = None
    date_format: str = "MM/DD/YYYY"
    attachments: list["EsignSignerAttachmentResponse"] = Field(default_factory=list)
    sent_at: Optional[datetime] = None
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
    # None is the legacy-client compatibility path (signature-like fields were
    # previously completed by adoption); current clients always send a boolean.
    completed: Optional[bool] = None


class EsignSubmitRequest(BaseModel):
    expected_routing_version: int = Field(ge=1)
    signature: EsignSignatureInput
    field_values: list[EsignFieldValueInput] = Field(default_factory=list)


class EsignProgressRequest(BaseModel):
    """Finish Later: in-progress text/checkbox entries saved mid-ceremony."""

    expected_routing_version: int = Field(ge=1)
    field_values: list[EsignFieldValueInput] = Field(default_factory=list)


class EsignProgressResponse(BaseModel):
    saved_count: int = 0


class EsignSignerAttachmentResponse(BaseModel):
    id: str
    field_id: str
    original_filename: str
    sha256: str
    file_size_bytes: int
    content_type: str
    uploaded_at: datetime


class EsignSubmitResponse(BaseModel):
    envelope_status: str
    recipient_status: str
    sealing_enqueued: bool = False


class EsignDeclineRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)
    expected_routing_version: int = Field(ge=1)


class EsignVersionedActionRequest(BaseModel):
    expected_routing_version: int = Field(ge=1)


class EsignConsentRequest(EsignVersionedActionRequest):
    pass


class EsignApproveRequest(EsignVersionedActionRequest):
    pass


class EsignCorrectionRequest(BaseModel):
    recipients: list[EsignRecipientInput]
    reason: str = Field(min_length=1, max_length=2_000)
    expected_routing_version: int = Field(ge=1)


class EsignReassignRequest(BaseModel):
    replacement_name: str = Field(min_length=1, max_length=255)
    replacement_email: EmailStr
    reason: str = Field(min_length=1, max_length=2_000)
    expected_routing_version: int = Field(ge=1)


class EsignManagedRecipientUpdate(BaseModel):
    recipient_id: str
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr


class EsignManagedRecipientsRequest(EsignVersionedActionRequest):
    recipients: list[EsignManagedRecipientUpdate]


class EsignManagedRecipientsResponse(BaseModel):
    routing_version: int
    recipients: list[EsignRecipientResponse] = Field(default_factory=list)


class EsignWitnessRequest(EsignVersionedActionRequest):
    name: str = Field(min_length=1, max_length=255)
    email: Optional[EmailStr] = None


class EsignInPersonStartRequest(EsignVersionedActionRequest):
    signer_name: str = Field(min_length=1, max_length=255)


class EsignGuestInvitationResponse(BaseModel):
    invitation_token: str
    guest_url: str
    expires_at: datetime


class EsignGuestExchangeRequest(BaseModel):
    invitation_token: str = Field(min_length=20, max_length=500)


class EsignGuestExchangeResponse(BaseModel):
    envelope_id: str
    recipient_id: str
    csrf_token: str
    routing_version: int


class EsignGuestSessionResponse(BaseModel):
    envelope_id: str
    recipient_id: str
    title: str
    recipient_name: Optional[str] = None
    recipient_role: str
    routing_version: int
    consent_required: bool
    consent_disclosure_text: str
    available_actions: list[str] = Field(default_factory=list)
    documents: list[EsignSigningDocument] = Field(default_factory=list)
    fields: list[EsignFieldResponse] = Field(default_factory=list)


class EsignGuestSubmitRequest(EsignSubmitRequest):
    occupation: Optional[str] = Field(default=None, max_length=255)
    address: Optional[str] = Field(default=None, max_length=2_000)


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
    role: EsignRecipientRoleName = "signer"
    routing_order: int = Field(default=1, ge=1)
    private_message: Optional[str] = Field(default=None, max_length=4_000)
    managed_by_recipient_index: Optional[int] = Field(default=None, ge=0)
    witness_for_recipient_index: Optional[int] = Field(default=None, ge=0)
    host_name: Optional[str] = Field(default=None, max_length=255)
    host_email: Optional[EmailStr] = None
    allow_reassignment: bool = False


class EsignTemplateFieldInput(BaseModel):
    id: Optional[str] = None
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
    properties: EsignFieldProperties = Field(default_factory=EsignFieldProperties)

    @model_validator(mode="after")
    def validate_properties(self):
        self.properties = _validated_properties(self.field_type, self.properties)
        if self.field_type == "formula":
            self.required = False
        return self


class EsignTemplateUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    title: Optional[str] = None
    message: Optional[str] = None
    signing_type: Optional[str] = None
    date_format: Optional[Literal["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD", "MMM D, YYYY"]] = None
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
    properties: EsignFieldProperties = Field(default_factory=EsignFieldProperties)


class EsignAnchorSearchRequest(BaseModel):
    anchor: str = Field(min_length=1, max_length=500)
    case_sensitive: bool = False
    whole_word: bool = False
    document_ids: Optional[list[str]] = None
    page_numbers: Optional[list[int]] = None
    match_mode: Literal["first", "all"] = "all"
    horizontal_alignment: Literal["left", "center", "right", "after"] = "after"
    offset_x: float = 0
    offset_y: float = 0
    offset_unit: Literal["point", "mm", "inch"] = "point"


class EsignAnchorMatch(BaseModel):
    document_id: str
    page_number: int
    x: float
    y: float
    width: float
    height: float


class EsignAnchorSearchResponse(BaseModel):
    matches: list[EsignAnchorMatch] = Field(default_factory=list)


class EsignPdfWidget(BaseModel):
    widget_id: str
    name: str
    tooltip: Optional[str] = None
    suggested_field_type: Optional[str] = None
    page_number: int
    x: float
    y: float
    width: float
    height: float
    required: bool = False
    default_value: Optional[str] = None
    max_length: Optional[int] = None
    choices: list[str] = Field(default_factory=list)
    supported: bool = True


class EsignPdfWidgetInspectionResponse(BaseModel):
    document_id: str
    widgets: list[EsignPdfWidget] = Field(default_factory=list)


class EsignPdfWidgetMapping(BaseModel):
    widget_id: str
    recipient_id: str
    field_type: Literal["text", "signature", "checkbox", "radio", "dropdown", "number", "date"]
    required: Optional[bool] = None
    data_label: Optional[str] = Field(default=None, max_length=255)


class EsignPdfWidgetConversionRequest(BaseModel):
    mappings: list[EsignPdfWidgetMapping]


class EsignTemplateResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    title: Optional[str] = None
    message: Optional[str] = None
    signing_type: str
    date_format: str = "MM/DD/YYYY"
    recipient_roles: list[dict[str, Any]]
    documents: list[EsignTemplateDocumentResponse]
    fields: list[EsignTemplateFieldResponse]
    created_at: datetime
    updated_at: datetime


class EsignTemplateListResponse(BaseModel):
    templates: list[EsignTemplateResponse]


class EsignEnvelopeCreateResponse(BaseModel):
    envelope: EsignEnvelopeResponse
    message: str = "Envelope created"
