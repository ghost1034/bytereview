"""Pydantic schemas for the CPA Analytics feature set.

Every analytics route imports its request/response models from here. The
model groups follow the routers: firms, clients, projects, analyses
(variance + waterfall), reconciliations, amortizations, chat sessions
(IRS / GAAP research + AI assistant), and journal entries.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

UserRoleLiteral = Literal["admin", "manager", "analyst", "reviewer", "viewer"]
UserPersonaLiteral = Literal[
    "staff_accountant", "senior_accountant", "accounting_manager", "cpa_partner"
]
ProjectStatusLiteral = Literal[
    "draft", "in_progress", "in_review", "approved", "archived"
]
ProjectModuleLiteral = Literal[
    "variance", "reconciliation", "amortization", "waterfall", "irs", "gaap", "assistant", "other"
]
ReconciliationStatusLiteral = Literal["draft", "in_review", "approved", "finalized"]
ReconciliationGroupStatusLiteral = Literal["approved", "rejected"]
ReconciliationExceptionStatusLiteral = Literal["open", "investigating", "resolved", "waived"]


# ---------------------------------------------------------------------------
# Firms
# ---------------------------------------------------------------------------


class FirmResponse(BaseModel):
    id: str
    name: str
    created_at: datetime
    updated_at: datetime


class FirmMemberResponse(BaseModel):
    user_id: str
    email: str
    display_name: Optional[str] = None
    photo_url: Optional[str] = None
    role: UserRoleLiteral = "analyst"
    persona: Optional[UserPersonaLiteral] = None
    title: Optional[str] = None
    created_at: datetime


class FirmDetailResponse(BaseModel):
    firm: FirmResponse
    members: List[FirmMemberResponse] = Field(default_factory=list)


class FirmUpdateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class FirmInviteRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)


class MemberUpdateRequest(BaseModel):
    role: Optional[UserRoleLiteral] = None
    persona: Optional[UserPersonaLiteral] = None
    title: Optional[str] = Field(default=None, max_length=255)


# ---------------------------------------------------------------------------
# Settings: audit logs, firm-wide export, firm purge
# ---------------------------------------------------------------------------


class AuditLogEntry(BaseModel):
    id: str
    action: str
    details: Optional[Dict[str, Any]] = None
    user_id: Optional[str] = None
    user_email: Optional[str] = None
    user_display_name: Optional[str] = None
    created_at: datetime


class AuditLogsResponse(BaseModel):
    entries: List[AuditLogEntry] = Field(default_factory=list)


class FirmExportResponse(BaseModel):
    firm: FirmResponse
    members: List[FirmMemberResponse] = Field(default_factory=list)
    clients: List[Dict[str, Any]] = Field(default_factory=list)
    projects: List[Dict[str, Any]] = Field(default_factory=list)
    analyses: List[Dict[str, Any]] = Field(default_factory=list)
    reconciliations: List[Dict[str, Any]] = Field(default_factory=list)
    amortizations: List[Dict[str, Any]] = Field(default_factory=list)
    chat_sessions: List[Dict[str, Any]] = Field(default_factory=list)
    journal_entries: List[Dict[str, Any]] = Field(default_factory=list)
    audit_logs: List[Dict[str, Any]] = Field(default_factory=list)
    exported_at: datetime


class FirmPurgeResponse(BaseModel):
    success: bool = True


# ---------------------------------------------------------------------------
# Clients
# ---------------------------------------------------------------------------


class ClientBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    industry: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    fiscal_year_end: Optional[str] = None
    notes: Optional[str] = None


class ClientCreateRequest(ClientBase):
    pass


class ClientUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    industry: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    fiscal_year_end: Optional[str] = None
    notes: Optional[str] = None


class ClientResponse(ClientBase):
    id: str
    firm_id: str
    created_at: datetime
    updated_at: datetime


class ClientListResponse(BaseModel):
    clients: List[ClientResponse] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------


class ProjectBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    client_id: Optional[str] = None
    assigned_to_user_id: Optional[str] = None
    status: ProjectStatusLiteral = "draft"
    module: ProjectModuleLiteral = "other"
    due_date: Optional[date] = None
    description: Optional[str] = None


class ProjectCreateRequest(ProjectBase):
    pass


class ProjectUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    client_id: Optional[str] = None
    assigned_to_user_id: Optional[str] = None
    status: Optional[ProjectStatusLiteral] = None
    module: Optional[ProjectModuleLiteral] = None
    due_date: Optional[date] = None
    description: Optional[str] = None


class ProjectResponse(ProjectBase):
    id: str
    firm_id: str
    created_at: datetime
    updated_at: datetime


class ProjectListResponse(BaseModel):
    projects: List[ProjectResponse] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Shared LLM usage metadata
# ---------------------------------------------------------------------------


class UsageMetadata(BaseModel):
    """Token / page billing summary returned alongside LLM responses."""

    prompt_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    total_tokens: Optional[int] = None
    pages: Optional[int] = None


# ---------------------------------------------------------------------------
# Reconciliation
# ---------------------------------------------------------------------------


class ReconciliationRulesGenerateRequest(BaseModel):
    headers: List[str]
    available_rules: Dict[str, Any] = Field(default_factory=dict, alias="availableRules")

    model_config = {"populate_by_name": True}


class ReconciliationRulesGenerateResponse(BaseModel):
    passes: List[Dict[str, Any]] = Field(default_factory=list)
    usage: UsageMetadata = Field(default_factory=UsageMetadata)


class ReconciliationAdditionalPassRequest(BaseModel):
    instructions: str
    available_rules: Dict[str, Any] = Field(default_factory=dict, alias="availableRules")

    model_config = {"populate_by_name": True}


class ReconciliationAdditionalPassResponse(BaseModel):
    pass_: Dict[str, Any] = Field(default_factory=dict, alias="pass")
    usage: UsageMetadata = Field(default_factory=UsageMetadata)

    model_config = {"populate_by_name": True}


class ReconciliationMatchRequest(BaseModel):
    source_a: List[Dict[str, Any]] = Field(default_factory=list, alias="sourceA")
    source_b: List[Dict[str, Any]] = Field(default_factory=list, alias="sourceB")
    rules: List[Dict[str, Any]] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class ReconciliationMatchResponse(BaseModel):
    match_groups: List[Dict[str, Any]] = Field(default_factory=list, alias="matchGroups")
    unmatched_exceptions: List[Dict[str, Any]] = Field(
        default_factory=list, alias="unmatchedExceptions"
    )
    usage: UsageMetadata = Field(default_factory=UsageMetadata)

    model_config = {"populate_by_name": True}


class ReconciliationBasicRequest(BaseModel):
    source_a: List[Dict[str, Any]] = Field(default_factory=list, alias="sourceA")
    source_b: List[Dict[str, Any]] = Field(default_factory=list, alias="sourceB")

    model_config = {"populate_by_name": True}


class ReconciliationManualMatchRequest(BaseModel):
    source_a_ids: List[str] = Field(..., alias="sourceAIds", min_length=1)
    source_b_ids: List[str] = Field(..., alias="sourceBIds", min_length=1)
    explanation: Optional[str] = None

    model_config = {"populate_by_name": True}


class ReconciliationExceptionUpdateRequest(BaseModel):
    source: Literal["A", "B"]
    exception_status: Optional[ReconciliationExceptionStatusLiteral] = Field(
        default=None, alias="exceptionStatus"
    )
    exception_note: Optional[str] = Field(default=None, alias="exceptionNote", max_length=2000)

    model_config = {"populate_by_name": True}


class ReconciliationRecord(BaseModel):
    id: str
    firm_id: str
    client_id: Optional[str] = None
    created_by_user_id: str
    name: str
    status: ReconciliationStatusLiteral
    source_a: Optional[List[Dict[str, Any]]] = None
    source_b: Optional[List[Dict[str, Any]]] = None
    rules: Optional[List[Dict[str, Any]]] = None
    match_groups: Optional[List[Dict[str, Any]]] = None
    created_at: datetime
    updated_at: datetime


class ReconciliationListResponse(BaseModel):
    reconciliations: List[ReconciliationRecord] = Field(default_factory=list)


class ReconciliationCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    client_id: Optional[str] = None
    status: ReconciliationStatusLiteral = "draft"
    source_a: Optional[List[Dict[str, Any]]] = None
    source_b: Optional[List[Dict[str, Any]]] = None
    rules: Optional[List[Dict[str, Any]]] = None
    match_groups: Optional[List[Dict[str, Any]]] = None


class ReconciliationUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    client_id: Optional[str] = None
    status: Optional[ReconciliationStatusLiteral] = None
    source_a: Optional[List[Dict[str, Any]]] = None
    source_b: Optional[List[Dict[str, Any]]] = None
    rules: Optional[List[Dict[str, Any]]] = None
    match_groups: Optional[List[Dict[str, Any]]] = None


# ---------------------------------------------------------------------------
# Amortization
# ---------------------------------------------------------------------------


class AmortizationExtractRequest(BaseModel):
    document_text: str = Field(..., alias="documentText")

    model_config = {"populate_by_name": True}


class AmortizationExtractResponse(BaseModel):
    form: Dict[str, Any] = Field(default_factory=dict)
    confidence_scores: Dict[str, Any] = Field(default_factory=dict, alias="confidenceScores")
    usage: UsageMetadata = Field(default_factory=UsageMetadata)

    model_config = {"populate_by_name": True}


class AmortizationComplianceRequest(BaseModel):
    form: Dict[str, Any] = Field(default_factory=dict)


class AmortizationComplianceResponse(BaseModel):
    insight: str
    usage: UsageMetadata = Field(default_factory=UsageMetadata)


class AmortizationScheduleRequest(BaseModel):
    """Inputs to deterministic schedule generation (no LLM call)."""

    asset_type: str = Field(..., alias="assetType")
    method: str
    cost_basis: float = Field(0.0, alias="costBasis")
    salvage_value: float = Field(0.0, alias="salvageValue")
    useful_life_months: int = Field(0, alias="usefulLifeMonths")
    start_date: Optional[str] = Field(default=None, alias="startDate")
    # Optional method-specific fields
    declining_multiplier: Optional[float] = Field(default=None, alias="decliningMultiplier")
    annual_rate: Optional[float] = Field(default=None, alias="annualRate")
    payment_amount: Optional[float] = Field(default=None, alias="paymentAmount")
    ibr: Optional[float] = None
    direct_costs: Optional[float] = Field(default=None, alias="directCosts")
    prepaid: Optional[float] = None
    incentives: Optional[float] = None
    property_class: Optional[str] = Field(default=None, alias="propertyClass")
    bonus_percent: Optional[float] = Field(default=None, alias="bonusPercent")
    section179: Optional[float] = None
    start_year: Optional[int] = Field(default=None, alias="startYear")

    model_config = {"populate_by_name": True}


class AmortizationScheduleResponse(BaseModel):
    schedule: List[Dict[str, Any]] = Field(default_factory=list)


class AmortizationBase(BaseModel):
    asset_name: str = Field(..., min_length=1, max_length=255)
    asset_type: str = Field(..., min_length=1, max_length=64)
    client_id: Optional[str] = None
    cost_basis: Optional[float] = None
    salvage_value: Optional[float] = None
    useful_life_months: Optional[int] = None
    gaap_method: Optional[str] = None
    tax_method: Optional[str] = None
    start_date: Optional[date] = None
    vendor: Optional[str] = None
    status: str = "draft"
    approval_status: str = "pending"
    type_specific: Optional[Dict[str, Any]] = None
    schedule: Optional[List[Dict[str, Any]]] = None
    tax_schedule: Optional[List[Dict[str, Any]]] = None


class AmortizationCreateRequest(AmortizationBase):
    pass


class AmortizationUpdateRequest(BaseModel):
    asset_name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    asset_type: Optional[str] = Field(default=None, min_length=1, max_length=64)
    client_id: Optional[str] = None
    cost_basis: Optional[float] = None
    salvage_value: Optional[float] = None
    useful_life_months: Optional[int] = None
    gaap_method: Optional[str] = None
    tax_method: Optional[str] = None
    start_date: Optional[date] = None
    vendor: Optional[str] = None
    status: Optional[str] = None
    approval_status: Optional[str] = None
    type_specific: Optional[Dict[str, Any]] = None
    schedule: Optional[List[Dict[str, Any]]] = None
    tax_schedule: Optional[List[Dict[str, Any]]] = None


class AmortizationResponse(AmortizationBase):
    id: str
    firm_id: str
    created_by_user_id: str
    created_at: datetime
    updated_at: datetime


class AmortizationListResponse(BaseModel):
    amortizations: List[AmortizationResponse] = Field(default_factory=list)


class JournalEntryCreateRequest(BaseModel):
    amortization_id: Optional[str] = None
    client_id: Optional[str] = None
    period: str = Field(..., min_length=1, max_length=32)
    entries: List[Dict[str, Any]] = Field(default_factory=list)


class JournalEntryResponse(BaseModel):
    id: str
    firm_id: str
    client_id: Optional[str] = None
    amortization_id: Optional[str] = None
    period: str
    entries: List[Dict[str, Any]] = Field(default_factory=list)
    created_at: datetime


class JournalEntryListResponse(BaseModel):
    journal_entries: List[JournalEntryResponse] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Waterfall + Document extraction (research)
# ---------------------------------------------------------------------------


class DocumentExtractRequest(BaseModel):
    document_text: str = Field(..., alias="documentText")
    type: Literal["IRS", "GAAP", "Tax", "Financial"] = "Financial"

    model_config = {"populate_by_name": True}


class DocumentExtractResponse(BaseModel):
    summary: str = ""
    extracted_data: Dict[str, str] = Field(default_factory=dict, alias="extractedData")
    usage: UsageMetadata = Field(default_factory=UsageMetadata)

    model_config = {"populate_by_name": True}


class WaterfallExtractRequest(BaseModel):
    document_text: str = Field("", alias="documentText")

    model_config = {"populate_by_name": True}


class WaterfallExtractResponse(BaseModel):
    type: str
    name: str
    party_name: str = Field("", alias="partyName")
    total_amount: float = Field(0.0, alias="totalAmount")
    start_date: str = Field("", alias="startDate")
    end_date: str = Field("", alias="endDate")
    confidence_scores: Dict[str, Any] = Field(default_factory=dict, alias="confidenceScores")
    usage: UsageMetadata = Field(default_factory=UsageMetadata)

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Variance
# ---------------------------------------------------------------------------


class VarianceThresholdRequest(BaseModel):
    data: List[Dict[str, Any]] = Field(default_factory=list)


class VarianceThresholdResponse(BaseModel):
    threshold_dollar: float = Field(0.0, alias="thresholdDollar")
    threshold_percent: float = Field(0.0, alias="thresholdPercent")
    logic: Literal["Either", "Both"] = "Either"
    explanation: str = ""
    usage: UsageMetadata = Field(default_factory=UsageMetadata)

    model_config = {"populate_by_name": True}


class VarianceAnalyzeRequest(BaseModel):
    data: List[Dict[str, Any]] = Field(default_factory=list)


class VarianceAnalyzeResponse(BaseModel):
    explanations: List[Dict[str, Any]] = Field(default_factory=list)
    usage: UsageMetadata = Field(default_factory=UsageMetadata)


class VarianceMemoRequest(BaseModel):
    data: List[Dict[str, Any]] = Field(default_factory=list)
    config: Dict[str, Any] = Field(default_factory=dict)


class VarianceMemoResponse(BaseModel):
    text: str = ""
    usage: UsageMetadata = Field(default_factory=UsageMetadata)


# ---------------------------------------------------------------------------
# Analyses (variance + waterfall persistence)
# ---------------------------------------------------------------------------


AnalysisType = Literal["variance", "waterfall"]


class AnalysisBase(BaseModel):
    type: AnalysisType
    name: str = Field(..., min_length=1, max_length=255)
    client_id: Optional[str] = None
    status: str = "draft"
    config: Optional[Dict[str, Any]] = None
    data: Optional[Any] = None
    results: Optional[Any] = None
    memo_content: Optional[str] = None


class AnalysisCreateRequest(AnalysisBase):
    pass


class AnalysisUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    client_id: Optional[str] = None
    status: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    data: Optional[Any] = None
    results: Optional[Any] = None
    memo_content: Optional[str] = None


class AnalysisResponse(AnalysisBase):
    id: str
    firm_id: str
    created_by_user_id: str
    created_at: datetime
    updated_at: datetime


class AnalysisListResponse(BaseModel):
    analyses: List[AnalysisResponse] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Chat sessions (research + assistant)
# ---------------------------------------------------------------------------


BotType = Literal["irs", "gaap", "assistant"]


class ChatMessage(BaseModel):
    role: Literal["user", "model"]
    content: str


class UploadedDoc(BaseModel):
    """A document attached to a chat session, persisted so reloading the
    session restores both the document list and the combined LLM context."""

    id: str
    name: str
    text: str = ""
    summary: Optional[str] = None
    extracted_data: Optional[Dict[str, Any]] = Field(default=None, alias="extractedData")

    model_config = {"populate_by_name": True}


class ChatSessionCreateRequest(BaseModel):
    bot_type: BotType
    title: Optional[str] = None
    client_id: Optional[str] = None
    messages: List[ChatMessage] = Field(default_factory=list)
    uploaded_docs: List[UploadedDoc] = Field(default_factory=list, alias="uploadedDocs")

    model_config = {"populate_by_name": True}


class ChatSessionUpdateRequest(BaseModel):
    title: Optional[str] = None
    client_id: Optional[str] = None
    messages: Optional[List[ChatMessage]] = None
    uploaded_docs: Optional[List[UploadedDoc]] = Field(default=None, alias="uploadedDocs")

    model_config = {"populate_by_name": True}


class ChatSessionResponse(BaseModel):
    id: str
    firm_id: str
    user_id: str
    client_id: Optional[str] = None
    bot_type: BotType
    title: Optional[str] = None
    messages: List[ChatMessage] = Field(default_factory=list)
    uploaded_docs: List[UploadedDoc] = Field(default_factory=list, alias="uploadedDocs")
    created_at: datetime
    updated_at: datetime

    model_config = {"populate_by_name": True}


class ChatSessionListResponse(BaseModel):
    sessions: List[ChatSessionResponse] = Field(default_factory=list)


class ResearchStreamRequest(BaseModel):
    messages: List[ChatMessage] = Field(default_factory=list)
    output_style: str = Field("Q&A", alias="outputStyle")
    document_context: Optional[str] = Field(default=None, alias="documentContext")
    session_id: Optional[str] = Field(default=None, alias="sessionId")
    client_id: Optional[str] = Field(default=None, alias="clientId")
    title: Optional[str] = None
    uploaded_docs: List[UploadedDoc] = Field(default_factory=list, alias="uploadedDocs")

    model_config = {"populate_by_name": True}


class AssistantStreamRequest(BaseModel):
    messages: List[ChatMessage] = Field(default_factory=list)
    context: Optional[Dict[str, Any]] = None
    session_id: Optional[str] = Field(default=None, alias="sessionId")
    client_id: Optional[str] = Field(default=None, alias="clientId")
    title: Optional[str] = None
    uploaded_docs: List[UploadedDoc] = Field(default_factory=list, alias="uploadedDocs")

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Comments (generic per-entity threads with @mentions)
# ---------------------------------------------------------------------------


class CommentCreateRequest(BaseModel):
    entity_type: str = Field(..., min_length=1, max_length=48)
    entity_id: str = Field(..., min_length=1, max_length=128)
    body: str = Field(..., min_length=1)
    parent_comment_id: Optional[str] = None
    mentioned_user_ids: List[str] = Field(default_factory=list)


class CommentUpdateRequest(BaseModel):
    body: Optional[str] = Field(default=None, min_length=1)
    mentioned_user_ids: Optional[List[str]] = None


class CommentResponse(BaseModel):
    id: str
    firm_id: str
    entity_type: str
    entity_id: str
    parent_comment_id: Optional[str] = None
    author_user_id: str
    body: str
    mentioned_user_ids: List[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class CommentListResponse(BaseModel):
    comments: List[CommentResponse] = Field(default_factory=list)


class BasicChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(default_factory=list)
