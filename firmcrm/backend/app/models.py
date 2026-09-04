"""CRM object model.

Salesforce/HubSpot analogues:  Lead -> (convert) -> Account + Contact + Opportunity.
Professional-services additions: PracticeArea, ConflictCheck (conflict / independence clearance that gates
Closed-Won), Engagement (the won deal as a matter/engagement), origination + referral attribution, Campaign.
"""

from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


class User(Base, TimestampMixin):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="staff")  # admin|partner|manager|staff|marketing
    title: Mapped[str | None] = mapped_column(String(120))
    practice_area_id: Mapped[int | None] = mapped_column(ForeignKey("practice_areas.id"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    failed_login_count: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime)
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)


class RefreshToken(Base):
    """Rotating refresh tokens. Only the SHA-256 hash is stored; raw token lives in the client."""

    __tablename__ = "refresh_tokens"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    family_id: Mapped[str] = mapped_column(String(32), index=True)  # rotation chain; reuse => revoke family
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime)
    user_agent: Mapped[str | None] = mapped_column(String(255))
    ip: Mapped[str | None] = mapped_column(String(64))


class ArchiveMixin:
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime)


class PracticeArea(Base):
    __tablename__ = "practice_areas"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    discipline: Mapped[str] = mapped_column(String(30))  # accounting|legal|advisory|other
    # Which clearance gate applies before an opportunity may be won.
    clearance_type: Mapped[str | None] = mapped_column(String(20))  # conflict|independence|None
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Pipeline(Base):
    __tablename__ = "pipelines"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    stages: Mapped[list[Stage]] = relationship(back_populates="pipeline", order_by="Stage.position",
                                               cascade="all, delete-orphan")


class Stage(Base):
    __tablename__ = "stages"
    __table_args__ = (UniqueConstraint("pipeline_id", "name"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    pipeline_id: Mapped[int] = mapped_column(ForeignKey("pipelines.id"))
    name: Mapped[str] = mapped_column(String(80))
    position: Mapped[int] = mapped_column(Integer, default=0)
    probability: Mapped[int] = mapped_column(Integer, default=10)  # default % when entering this stage
    is_won: Mapped[bool] = mapped_column(Boolean, default=False)
    is_lost: Mapped[bool] = mapped_column(Boolean, default=False)
    pipeline: Mapped[Pipeline] = relationship(back_populates="stages")


class Account(Base, TimestampMixin, ArchiveMixin):
    """Company or individual the firm serves / pursues (SFDC Account, HubSpot Company)."""

    __tablename__ = "accounts"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    aliases: Mapped[str | None] = mapped_column(String(500))  # comma-separated former names / DBAs
    account_type: Mapped[str] = mapped_column(String(30), default="prospect")
    # prospect|client|former_client|referral_source|adverse_party|vendor|other
    entity_kind: Mapped[str] = mapped_column(String(20), default="company")  # company|individual|trust|estate
    industry: Mapped[str | None] = mapped_column(String(80))
    website: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(40))
    address: Mapped[str | None] = mapped_column(String(255))
    city: Mapped[str | None] = mapped_column(String(80))
    state: Mapped[str | None] = mapped_column(String(40))
    country: Mapped[str] = mapped_column(String(40), default="US")
    revenue_band: Mapped[str | None] = mapped_column(String(40))
    employee_band: Mapped[str | None] = mapped_column(String(40))
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))  # relationship partner
    originating_partner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    referral_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"))
    referral_contact_id: Mapped[int | None] = mapped_column(ForeignKey("contacts.id", use_alter=True, name="fk_accounts_referral_contact_id_contacts"))
    client_since: Mapped[date | None] = mapped_column(Date)
    risk_rating: Mapped[str | None] = mapped_column(String(10))  # low|medium|high
    is_public_company: Mapped[bool] = mapped_column(Boolean, default=False)  # independence relevance
    tags: Mapped[list | None] = mapped_column(JSON, default=list)
    description: Mapped[str | None] = mapped_column(Text)

    owner: Mapped[User | None] = relationship(foreign_keys=[owner_id])
    originating_partner: Mapped[User | None] = relationship(foreign_keys=[originating_partner_id])
    contacts: Mapped[list[Contact]] = relationship(back_populates="account", foreign_keys="Contact.account_id")
    opportunities: Mapped[list[Opportunity]] = relationship(back_populates="account", foreign_keys="Opportunity.account_id")


class Contact(Base, TimestampMixin, ArchiveMixin):
    __tablename__ = "contacts"
    __table_args__ = (Index("uq_contacts_email_active", "email", unique=True,
                            postgresql_where=text("email IS NOT NULL AND is_archived = false"),
                            sqlite_where=text("email IS NOT NULL AND is_archived = 0")),)
    id: Mapped[int] = mapped_column(primary_key=True)
    first_name: Mapped[str] = mapped_column(String(80))
    last_name: Mapped[str] = mapped_column(String(80), index=True)
    email: Mapped[str | None] = mapped_column(String(255), index=True)
    phone: Mapped[str | None] = mapped_column(String(40))
    title: Mapped[str | None] = mapped_column(String(120))
    account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"))
    role: Mapped[str | None] = mapped_column(String(40))  # decision_maker|influencer|champion|gatekeeper|referral_source|other
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    lifecycle: Mapped[str] = mapped_column(String(20), default="lead")  # lead|prospect|client|referral_source|other
    do_not_contact: Mapped[bool] = mapped_column(Boolean, default=False)
    linkedin: Mapped[str | None] = mapped_column(String(255))
    notes: Mapped[str | None] = mapped_column(Text)
    last_activity_at: Mapped[datetime | None] = mapped_column(DateTime)

    account: Mapped[Account | None] = relationship(back_populates="contacts", foreign_keys=[account_id])
    owner: Mapped[User | None] = relationship(foreign_keys=[owner_id])

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()


class Lead(Base, TimestampMixin, ArchiveMixin):
    """Unqualified inbound interest. Converting creates Account + Contact (+ optional Opportunity)."""

    __tablename__ = "leads"
    id: Mapped[int] = mapped_column(primary_key=True)
    first_name: Mapped[str] = mapped_column(String(80))
    last_name: Mapped[str] = mapped_column(String(80))
    company: Mapped[str | None] = mapped_column(String(200))
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(40))
    title: Mapped[str | None] = mapped_column(String(120))
    source: Mapped[str] = mapped_column(String(40), default="web")  # web|referral|event|webinar|cold|partner|other
    status: Mapped[str] = mapped_column(String(20), default="new")  # new|contacted|qualified|unqualified|converted
    practice_area_id: Mapped[int | None] = mapped_column(ForeignKey("practice_areas.id"))
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    campaign_id: Mapped[int | None] = mapped_column(ForeignKey("campaigns.id"))
    referral_contact_id: Mapped[int | None] = mapped_column(ForeignKey("contacts.id"))
    estimated_value: Mapped[float | None] = mapped_column(Float)
    need_summary: Mapped[str | None] = mapped_column(Text)
    score: Mapped[int] = mapped_column(Integer, default=0)
    unqualified_reason: Mapped[str | None] = mapped_column(String(200))
    converted_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"))
    converted_contact_id: Mapped[int | None] = mapped_column(ForeignKey("contacts.id"))
    converted_opportunity_id: Mapped[int | None] = mapped_column(ForeignKey("opportunities.id", use_alter=True, name="fk_leads_converted_opportunity_id_opportunities"))
    converted_at: Mapped[datetime | None] = mapped_column(DateTime)

    owner: Mapped[User | None] = relationship(foreign_keys=[owner_id])


class Opportunity(Base, TimestampMixin, ArchiveMixin):
    """A pursuit for a new engagement (SFDC Opportunity / HubSpot Deal)."""

    __tablename__ = "opportunities"
    __table_args__ = (Index("ix_opportunities_status_stage", "status", "stage_id"),
                      Index("ix_opportunities_owner_status", "owner_id", "status"))
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"))
    primary_contact_id: Mapped[int | None] = mapped_column(ForeignKey("contacts.id"))
    pipeline_id: Mapped[int] = mapped_column(ForeignKey("pipelines.id"))
    stage_id: Mapped[int] = mapped_column(ForeignKey("stages.id"))
    practice_area_id: Mapped[int | None] = mapped_column(ForeignKey("practice_areas.id"))
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))  # pursuit lead
    originating_partner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))  # origination credit
    responsible_partner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))  # will run the work
    referral_contact_id: Mapped[int | None] = mapped_column(ForeignKey("contacts.id"))
    referral_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"))
    campaign_id: Mapped[int | None] = mapped_column(ForeignKey("campaigns.id"))
    amount: Mapped[float] = mapped_column(Float, default=0.0)  # estimated first-year fees
    fee_type: Mapped[str] = mapped_column(String(20), default="hourly")  # hourly|fixed|retainer|recurring|contingency|value
    is_recurring: Mapped[bool] = mapped_column(Boolean, default=False)
    probability: Mapped[int] = mapped_column(Integer, default=10)
    expected_close: Mapped[date | None] = mapped_column(Date)
    proposal_due: Mapped[date | None] = mapped_column(Date)
    engagement_letter_status: Mapped[str] = mapped_column(String(20), default="not_started")
    # not_started|drafted|sent|signed
    status: Mapped[str] = mapped_column(String(10), default="open")  # open|won|lost
    closed_at: Mapped[datetime | None] = mapped_column(DateTime)
    lost_reason: Mapped[str | None] = mapped_column(String(60))
    competitor: Mapped[str | None] = mapped_column(String(120))
    adverse_parties: Mapped[list | None] = mapped_column(JSON, default=list)  # names; feeds conflict search
    description: Mapped[str | None] = mapped_column(Text)
    next_step: Mapped[str | None] = mapped_column(String(255))
    last_activity_at: Mapped[datetime | None] = mapped_column(DateTime)
    stage_entered_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    account: Mapped[Account] = relationship(back_populates="opportunities", foreign_keys=[account_id])
    stage: Mapped[Stage] = relationship()
    practice_area: Mapped[PracticeArea | None] = relationship()
    owner: Mapped[User | None] = relationship(foreign_keys=[owner_id])
    originating_partner: Mapped[User | None] = relationship(foreign_keys=[originating_partner_id])
    stage_history: Mapped[list[StageHistory]] = relationship(back_populates="opportunity", cascade="all, delete-orphan")


class StageHistory(Base):
    __tablename__ = "stage_history"
    id: Mapped[int] = mapped_column(primary_key=True)
    opportunity_id: Mapped[int] = mapped_column(ForeignKey("opportunities.id"))
    from_stage_id: Mapped[int | None] = mapped_column(ForeignKey("stages.id"))
    to_stage_id: Mapped[int] = mapped_column(ForeignKey("stages.id"))
    changed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    changed_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    days_in_previous: Mapped[float | None] = mapped_column(Float)
    opportunity: Mapped[Opportunity] = relationship(back_populates="stage_history")


class Activity(Base, TimestampMixin):
    """Calls, emails, meetings, notes, tasks. Polymorphic via nullable FKs."""

    __tablename__ = "activities"
    __table_args__ = (Index("ix_activities_owner_kind_completed", "owner_id", "kind", "completed_at"),
                      Index("ix_activities_occurred", "occurred_at"))
    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(20))  # call|email|meeting|note|task
    subject: Mapped[str] = mapped_column(String(200))
    body: Mapped[str | None] = mapped_column(Text)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"), index=True)
    contact_id: Mapped[int | None] = mapped_column(ForeignKey("contacts.id"), index=True)
    opportunity_id: Mapped[int | None] = mapped_column(ForeignKey("opportunities.id"), index=True)
    lead_id: Mapped[int | None] = mapped_column(ForeignKey("leads.id"), index=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime)
    occurred_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    priority: Mapped[str] = mapped_column(String(10), default="normal")  # low|normal|high
    owner: Mapped[User | None] = relationship(foreign_keys=[owner_id])


class ConflictCheck(Base, TimestampMixin):
    """Clearance before accepting work. check_type=conflict (legal) | independence (attest/accounting)."""

    __tablename__ = "conflict_checks"
    id: Mapped[int] = mapped_column(primary_key=True)
    check_type: Mapped[str] = mapped_column(String(20), default="conflict")
    opportunity_id: Mapped[int | None] = mapped_column(ForeignKey("opportunities.id"), index=True)
    account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"), index=True)
    requested_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    parties: Mapped[list] = mapped_column(JSON, default=list)  # names searched (client, affiliates, adverse)
    matches: Mapped[list] = mapped_column(JSON, default=list)  # [{party, matched_name, entity, id, relationship, score}]
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|clear|conflict|waived
    resolution_note: Mapped[str | None] = mapped_column(Text)
    resolved_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime)
    # Independence-specific attributes
    independence_attestation: Mapped[dict | None] = mapped_column(JSON)  # {financial_interest: bool, ...}


class Engagement(Base, TimestampMixin):
    """Won work: the matter / engagement. Hand-off point to PSA / practice management."""

    __tablename__ = "engagements"
    __table_args__ = (Index("uq_engagements_opportunity", "opportunity_id", unique=True),)
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"))
    opportunity_id: Mapped[int | None] = mapped_column(ForeignKey("opportunities.id"))
    practice_area_id: Mapped[int | None] = mapped_column(ForeignKey("practice_areas.id"))
    responsible_partner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    originating_partner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(20), default="active")  # active|completed|on_hold|terminated
    fee_type: Mapped[str] = mapped_column(String(20), default="hourly")
    annual_value: Mapped[float] = mapped_column(Float, default=0.0)
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    adverse_parties: Mapped[list | None] = mapped_column(JSON, default=list)
    external_ref: Mapped[str | None] = mapped_column(String(80))  # PSA / matter number
    account: Mapped[Account] = relationship(foreign_keys=[account_id])


class Campaign(Base, TimestampMixin, ArchiveMixin):
    __tablename__ = "campaigns"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(30), default="event")  # event|webinar|newsletter|seminar|sponsorship|content|other
    status: Mapped[str] = mapped_column(String(20), default="planned")  # planned|active|completed
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    budget: Mapped[float] = mapped_column(Float, default=0.0)
    actual_cost: Mapped[float] = mapped_column(Float, default=0.0)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    practice_area_id: Mapped[int | None] = mapped_column(ForeignKey("practice_areas.id"))
    description: Mapped[str | None] = mapped_column(Text)
    members: Mapped[list[CampaignMember]] = relationship(back_populates="campaign", cascade="all, delete-orphan")


class CampaignMember(Base):
    __tablename__ = "campaign_members"
    __table_args__ = (UniqueConstraint("campaign_id", "contact_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"))
    contact_id: Mapped[int] = mapped_column(ForeignKey("contacts.id"))
    status: Mapped[str] = mapped_column(String(20), default="invited")  # invited|registered|attended|responded|no_show
    added_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    campaign: Mapped[Campaign] = relationship(back_populates="members")
    contact: Mapped[Contact] = relationship()


class EthicalWall(Base, TimestampMixin):
    """Record-level restriction. While active, the walled account/opportunity (and everything hanging off it) is
    visible only to members (and admins when ADMIN_BYPASSES_WALLS is true). Conflict search still matches the
    walled parties but redacts matter context for non-members."""

    __tablename__ = "ethical_walls"
    __table_args__ = (Index("ix_ethical_walls_entity", "entity_type", "entity_id", "is_active"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(20))  # account|opportunity
    entity_id: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(Text)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    deactivated_at: Mapped[datetime | None] = mapped_column(DateTime)
    deactivated_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    members: Mapped[list[EthicalWallMember]] = relationship(back_populates="wall", cascade="all, delete-orphan")


class EthicalWallMember(Base):
    __tablename__ = "ethical_wall_members"
    __table_args__ = (UniqueConstraint("wall_id", "user_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    wall_id: Mapped[int] = mapped_column(ForeignKey("ethical_walls.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    added_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    added_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    wall: Mapped[EthicalWall] = relationship(back_populates="members")
    user: Mapped[User] = relationship(foreign_keys=[user_id])


class ImportJob(Base):
    """CSV import run. Source file is never modified; row-level exceptions are retained for review."""

    __tablename__ = "import_jobs"
    id: Mapped[int] = mapped_column(primary_key=True)
    entity: Mapped[str] = mapped_column(String(30))  # accounts|contacts|leads
    filename: Mapped[str] = mapped_column(String(255))
    dry_run: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(String(20), default="completed")  # completed|failed
    total_rows: Mapped[int] = mapped_column(Integer, default=0)
    created_rows: Mapped[int] = mapped_column(Integer, default=0)
    updated_rows: Mapped[int] = mapped_column(Integer, default=0)
    skipped_rows: Mapped[int] = mapped_column(Integer, default=0)
    exceptions: Mapped[list] = mapped_column(JSON, default=list)  # [{row, field, message, data}]
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(60))
    entity_type: Mapped[str] = mapped_column(String(40), index=True)
    entity_id: Mapped[str | None] = mapped_column(String(40), index=True)
    before_json: Mapped[str | None] = mapped_column(Text)
    after_json: Mapped[str | None] = mapped_column(Text)
    note: Mapped[str | None] = mapped_column(String(255))
