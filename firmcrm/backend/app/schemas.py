"""Pydantic request/response schemas."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.enums import (
    AccountType,
    ActivityKind,
    CampaignKind,
    CampaignStatus,
    CheckType,
    ClearanceType,
    ContactRole,
    Discipline,
    ELStatus,
    EngagementStatus,
    EntityKind,
    FeeType,
    LeadSource,
    LeadStatus,
    Lifecycle,
    LostReason,
    MemberStatus,
    Priority,
    ResolveStatus,
    Risk,
    Role,
)

T = TypeVar("T")

S = Annotated[str, Field(max_length=200)]  # short text
M = Annotated[str, Field(max_length=500)]  # medium text
L = Annotated[str, Field(max_length=5000)]  # long text / notes


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


# ---- auth / users
class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(ORM):
    id: int
    email: str
    full_name: str
    role: str
    title: str | None = None
    practice_area_id: int | None = None
    is_active: bool
    must_change_password: bool = False
    last_login_at: datetime | None = None


class UserCreate(BaseModel):
    email: EmailStr
    full_name: Annotated[str, Field(min_length=1, max_length=120)]
    password: str = Field(min_length=8, max_length=256)
    role: Role = "staff"
    title: Annotated[str, Field(max_length=120)] | None = None
    practice_area_id: int | None = None


class UserUpdate(BaseModel):
    full_name: Annotated[str, Field(min_length=1, max_length=120)] | None = None
    role: Role | None = None
    title: Annotated[str, Field(max_length=120)] | None = None
    practice_area_id: int | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=256)


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


# ---- reference data
class PracticeAreaIn(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=120)]
    discipline: Discipline = "other"
    clearance_type: ClearanceType | None = None
    is_active: bool = True


class PracticeAreaOut(PracticeAreaIn, ORM):
    id: int


class StageIn(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=80)]
    position: int = 0
    probability: int = Field(default=10, ge=0, le=100)
    is_won: bool = False
    is_lost: bool = False


class StageOut(StageIn, ORM):
    id: int
    pipeline_id: int


class PipelineOut(ORM):
    id: int
    name: str
    is_default: bool
    stages: list[StageOut]


class PipelineIn(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=120)]
    is_default: bool = False
    stages: list[StageIn]


# ---- accounts
class AccountBase(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=200)]
    aliases: M | None = None
    account_type: AccountType = "prospect"
    entity_kind: EntityKind = "company"
    industry: Annotated[str, Field(max_length=80)] | None = None
    website: Annotated[str, Field(max_length=255)] | None = None
    phone: Annotated[str, Field(max_length=40)] | None = None
    address: Annotated[str, Field(max_length=255)] | None = None
    city: Annotated[str, Field(max_length=80)] | None = None
    state: Annotated[str, Field(max_length=40)] | None = None
    country: Annotated[str, Field(max_length=40)] = "US"
    revenue_band: Annotated[str, Field(max_length=40)] | None = None
    employee_band: Annotated[str, Field(max_length=40)] | None = None
    owner_id: int | None = None
    originating_partner_id: int | None = None
    referral_account_id: int | None = None
    referral_contact_id: int | None = None
    client_since: date | None = None
    risk_rating: Risk | None = None
    is_public_company: bool = False
    tags: list[Annotated[str, Field(max_length=40)]] = Field(default_factory=list, max_length=30)
    description: L | None = None


class AccountCreate(AccountBase):
    allow_duplicate: bool = False  # override the duplicate-name guard


class AccountUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    aliases: M | None = None
    account_type: AccountType | None = None
    entity_kind: EntityKind | None = None
    industry: Annotated[str, Field(max_length=80)] | None = None
    website: Annotated[str, Field(max_length=255)] | None = None
    phone: Annotated[str, Field(max_length=40)] | None = None
    address: Annotated[str, Field(max_length=255)] | None = None
    city: Annotated[str, Field(max_length=80)] | None = None
    state: Annotated[str, Field(max_length=40)] | None = None
    country: Annotated[str, Field(max_length=40)] | None = None
    revenue_band: Annotated[str, Field(max_length=40)] | None = None
    employee_band: Annotated[str, Field(max_length=40)] | None = None
    owner_id: int | None = None
    originating_partner_id: int | None = None
    referral_account_id: int | None = None
    referral_contact_id: int | None = None
    client_since: date | None = None
    risk_rating: Risk | None = None
    is_public_company: bool | None = None
    tags: list[Annotated[str, Field(max_length=40)]] | None = Field(default=None, max_length=30)
    description: L | None = None


class AccountOut(AccountBase, ORM):
    id: int
    is_archived: bool = False
    archived_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    owner_name: str | None = None
    originating_partner_name: str | None = None
    open_pipeline: float = 0.0
    contact_count: int = 0
    engagement_count: int = 0
    last_activity_at: datetime | None = None


# ---- contacts
class ContactBase(BaseModel):
    first_name: Annotated[str, Field(min_length=1, max_length=80)]
    last_name: Annotated[str, Field(min_length=1, max_length=80)]
    email: EmailStr | None = None
    phone: Annotated[str, Field(max_length=40)] | None = None
    title: Annotated[str, Field(max_length=120)] | None = None
    account_id: int | None = None
    role: ContactRole | None = None
    owner_id: int | None = None
    lifecycle: Lifecycle = "lead"
    do_not_contact: bool = False
    linkedin: Annotated[str, Field(max_length=255)] | None = None
    notes: L | None = None


class ContactCreate(ContactBase):
    pass


class ContactUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    first_name: Annotated[str, Field(min_length=1, max_length=80)] | None = None
    last_name: Annotated[str, Field(min_length=1, max_length=80)] | None = None
    email: EmailStr | None = None
    phone: Annotated[str, Field(max_length=40)] | None = None
    title: Annotated[str, Field(max_length=120)] | None = None
    account_id: int | None = None
    role: ContactRole | None = None
    owner_id: int | None = None
    lifecycle: Lifecycle | None = None
    do_not_contact: bool | None = None
    linkedin: Annotated[str, Field(max_length=255)] | None = None
    notes: L | None = None


class ContactOut(ContactBase, ORM):
    id: int
    is_archived: bool = False
    full_name: str
    account_name: str | None = None
    owner_name: str | None = None
    last_activity_at: datetime | None = None
    created_at: datetime


# ---- leads
class LeadBase(BaseModel):
    first_name: Annotated[str, Field(min_length=1, max_length=80)]
    last_name: Annotated[str, Field(min_length=1, max_length=80)]
    company: S | None = None
    email: EmailStr | None = None
    phone: Annotated[str, Field(max_length=40)] | None = None
    title: Annotated[str, Field(max_length=120)] | None = None
    source: LeadSource = "web"
    status: LeadStatus = "new"
    practice_area_id: int | None = None
    owner_id: int | None = None
    campaign_id: int | None = None
    referral_contact_id: int | None = None
    estimated_value: Annotated[float, Field(ge=0)] | None = None
    need_summary: L | None = None
    score: Annotated[int, Field(ge=0, le=100)] = 0
    unqualified_reason: S | None = None


class LeadCreate(LeadBase):
    pass


class LeadUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    first_name: Annotated[str, Field(min_length=1, max_length=80)] | None = None
    last_name: Annotated[str, Field(min_length=1, max_length=80)] | None = None
    company: S | None = None
    email: EmailStr | None = None
    phone: Annotated[str, Field(max_length=40)] | None = None
    title: Annotated[str, Field(max_length=120)] | None = None
    source: LeadSource | None = None
    status: LeadStatus | None = None
    practice_area_id: int | None = None
    owner_id: int | None = None
    campaign_id: int | None = None
    referral_contact_id: int | None = None
    estimated_value: Annotated[float, Field(ge=0)] | None = None
    need_summary: L | None = None
    score: Annotated[int, Field(ge=0, le=100)] | None = None
    unqualified_reason: S | None = None


class LeadOut(LeadBase, ORM):
    id: int
    status: str  # may be "converted"
    is_archived: bool = False
    owner_name: str | None = None
    practice_area_name: str | None = None
    converted_account_id: int | None = None
    converted_contact_id: int | None = None
    converted_opportunity_id: int | None = None
    converted_at: datetime | None = None
    created_at: datetime


class LeadConvertIn(BaseModel):
    existing_account_id: int | None = None  # attach to existing account instead of creating
    create_opportunity: bool = True
    opportunity_name: S | None = None
    amount: Annotated[float, Field(ge=0)] | None = None
    pipeline_id: int | None = None
    expected_close: date | None = None


class LeadConvertOut(BaseModel):
    account_id: int
    contact_id: int
    opportunity_id: int | None


# ---- opportunities
class OpportunityBase(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=200)]
    account_id: int
    primary_contact_id: int | None = None
    pipeline_id: int | None = None
    stage_id: int | None = None
    practice_area_id: int | None = None
    owner_id: int | None = None
    originating_partner_id: int | None = None
    responsible_partner_id: int | None = None
    referral_contact_id: int | None = None
    referral_account_id: int | None = None
    campaign_id: int | None = None
    amount: Annotated[float, Field(ge=0)] = 0.0
    fee_type: FeeType = "hourly"
    is_recurring: bool = False
    probability: Annotated[int, Field(ge=0, le=100)] | None = None
    expected_close: date | None = None
    proposal_due: date | None = None
    engagement_letter_status: ELStatus = "not_started"
    competitor: Annotated[str, Field(max_length=120)] | None = None
    adverse_parties: list[S] = Field(default_factory=list, max_length=50)
    description: L | None = None
    next_step: Annotated[str, Field(max_length=255)] | None = None


class OpportunityCreate(OpportunityBase):
    pass


class OpportunityUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    primary_contact_id: int | None = None
    practice_area_id: int | None = None
    owner_id: int | None = None
    originating_partner_id: int | None = None
    responsible_partner_id: int | None = None
    referral_contact_id: int | None = None
    referral_account_id: int | None = None
    campaign_id: int | None = None
    amount: Annotated[float, Field(ge=0)] | None = None
    fee_type: FeeType | None = None
    is_recurring: bool | None = None
    probability: int | None = Field(default=None, ge=0, le=100)
    expected_close: date | None = None
    proposal_due: date | None = None
    engagement_letter_status: ELStatus | None = None
    competitor: Annotated[str, Field(max_length=120)] | None = None
    adverse_parties: list[S] | None = Field(default=None, max_length=50)
    description: L | None = None
    next_step: Annotated[str, Field(max_length=255)] | None = None


class StageChangeIn(BaseModel):
    stage_id: int
    lost_reason: LostReason | None = None
    competitor: Annotated[str, Field(max_length=120)] | None = None
    note: M | None = None


class OpportunityOut(OpportunityBase, ORM):
    id: int
    is_archived: bool = False
    status: str
    closed_at: datetime | None = None
    lost_reason: str | None = None
    last_activity_at: datetime | None = None
    stage_entered_at: datetime
    created_at: datetime
    updated_at: datetime
    account_name: str | None = None
    stage_name: str | None = None
    stage_position: int | None = None
    practice_area_name: str | None = None
    owner_name: str | None = None
    originating_partner_name: str | None = None
    primary_contact_name: str | None = None
    weighted_amount: float = 0.0
    days_in_stage: int = 0
    is_stale: bool = False
    clearance_type: str | None = None
    clearance_status: str | None = None  # none|pending|clear|conflict|waived


class StageHistoryOut(ORM):
    id: int
    from_stage_id: int | None
    to_stage_id: int
    changed_by_id: int | None
    changed_at: datetime
    days_in_previous: float | None
    from_stage_name: str | None = None
    to_stage_name: str | None = None
    changed_by_name: str | None = None


# ---- activities
class ActivityBase(BaseModel):
    kind: ActivityKind
    subject: Annotated[str, Field(min_length=1, max_length=200)]
    body: L | None = None
    owner_id: int | None = None
    account_id: int | None = None
    contact_id: int | None = None
    opportunity_id: int | None = None
    lead_id: int | None = None
    due_at: datetime | None = None
    occurred_at: datetime | None = None
    priority: Priority = "normal"


class ActivityCreate(ActivityBase):
    pass


class ActivityUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    subject: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    body: L | None = None
    owner_id: int | None = None
    due_at: datetime | None = None
    completed: bool | None = None
    priority: Priority | None = None


class ActivityOut(ActivityBase, ORM):
    id: int
    completed_at: datetime | None
    created_at: datetime
    owner_name: str | None = None
    account_name: str | None = None
    contact_name: str | None = None
    opportunity_name: str | None = None
    lead_name: str | None = None


# ---- conflict checks
class ConflictSearchIn(BaseModel):
    parties: list[S] = Field(min_length=1, max_length=100)


class ConflictMatch(BaseModel):
    party: str
    matched_name: str
    entity: str  # account|contact|adverse_party
    entity_id: int | None
    relationship: str
    context: str | None = None
    score: float
    source_type: str | None = None
    restricted: bool = False


class ConflictCheckCreate(BaseModel):
    check_type: CheckType = "conflict"
    opportunity_id: int | None = None
    account_id: int | None = None
    parties: list[S] = Field(min_length=1, max_length=100)
    independence_attestation: dict[str, bool] | None = None


class ConflictResolveIn(BaseModel):
    status: ResolveStatus
    resolution_note: L | None = None


class ConflictCheckOut(ORM):
    id: int
    check_type: str
    opportunity_id: int | None
    account_id: int | None
    requested_by_id: int | None
    parties: list[str]
    matches: list[dict[str, Any]]
    status: str
    resolution_note: str | None
    resolved_by_id: int | None
    resolved_at: datetime | None
    independence_attestation: dict[str, Any] | None
    created_at: datetime
    requested_by_name: str | None = None
    resolved_by_name: str | None = None
    opportunity_name: str | None = None
    account_name: str | None = None


# ---- engagements
class EngagementBase(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=200)]
    account_id: int
    opportunity_id: int | None = None
    practice_area_id: int | None = None
    responsible_partner_id: int | None = None
    originating_partner_id: int | None = None
    status: EngagementStatus = "active"
    fee_type: FeeType = "hourly"
    annual_value: Annotated[float, Field(ge=0)] = 0.0
    start_date: date | None = None
    end_date: date | None = None
    adverse_parties: list[S] = Field(default_factory=list, max_length=50)
    external_ref: Annotated[str, Field(max_length=80)] | None = None


class EngagementCreate(EngagementBase):
    pass


class EngagementUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    status: EngagementStatus | None = None
    responsible_partner_id: int | None = None
    fee_type: FeeType | None = None
    annual_value: Annotated[float, Field(ge=0)] | None = None
    start_date: date | None = None
    end_date: date | None = None
    adverse_parties: list[S] | None = Field(default=None, max_length=50)
    external_ref: Annotated[str, Field(max_length=80)] | None = None


class EngagementOut(EngagementBase, ORM):
    id: int
    created_at: datetime
    account_name: str | None = None
    practice_area_name: str | None = None
    responsible_partner_name: str | None = None


# ---- campaigns
class CampaignBase(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=200)]
    kind: CampaignKind = "event"
    status: CampaignStatus = "planned"
    start_date: date | None = None
    end_date: date | None = None
    budget: Annotated[float, Field(ge=0)] = 0.0
    actual_cost: Annotated[float, Field(ge=0)] = 0.0
    owner_id: int | None = None
    practice_area_id: int | None = None
    description: L | None = None


class CampaignCreate(CampaignBase):
    pass


class CampaignUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    kind: CampaignKind | None = None
    status: CampaignStatus | None = None
    start_date: date | None = None
    end_date: date | None = None
    budget: Annotated[float, Field(ge=0)] | None = None
    actual_cost: Annotated[float, Field(ge=0)] | None = None
    owner_id: int | None = None
    practice_area_id: int | None = None
    description: L | None = None


class CampaignOut(CampaignBase, ORM):
    id: int
    is_archived: bool = False
    created_at: datetime
    member_count: int = 0
    attended_count: int = 0
    leads_generated: int = 0
    influenced_pipeline: float = 0.0
    won_amount: float = 0.0


class CampaignMemberIn(BaseModel):
    contact_id: int
    status: MemberStatus = "invited"


class CampaignMemberOut(ORM):
    id: int
    contact_id: int
    status: str
    added_at: datetime
    contact_name: str | None = None
    contact_email: str | None = None
    account_name: str | None = None


class AuditOut(ORM):
    id: int
    at: datetime
    actor_id: int | None
    action: str
    entity_type: str
    entity_id: str | None
    before_json: str | None
    after_json: str | None
    note: str | None
    actor_name: str | None = None
