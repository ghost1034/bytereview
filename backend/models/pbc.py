"""Relational models for the Prepared by Client (PBC) module."""

from __future__ import annotations

import uuid

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    Date,
    ForeignKey,
    Index,
    Integer,
    String,
    TIMESTAMP,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.ext.mutable import MutableDict, MutableList

from models.db_models import Base


class PbcFirmSettings(Base):
    __tablename__ = "pbc_firm_settings"

    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), primary_key=True)
    timezone = Column(String(64), nullable=False, server_default="America/Los_Angeles")
    portal_name = Column(String(255), nullable=True)
    logo_url = Column(Text, nullable=True)
    reminder_days_before = Column(Integer, nullable=False, server_default="3")
    overdue_interval_days = Column(Integer, nullable=False, server_default="3")
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class PbcEngagement(Base):
    __tablename__ = "pbc_engagements"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), nullable=False)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(255), nullable=False)
    client_name_snapshot = Column(String(255), nullable=False)
    engagement_type = Column(String(32), nullable=False, server_default="audit")
    period_start = Column(Date, nullable=True)
    period_end = Column(Date, nullable=True)
    due_date = Column(Date, nullable=True)
    owner_user_id = Column(String(128), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(16), nullable=False, server_default="draft")
    tasklytic_workspace_id = Column(String(128), nullable=True)
    tasklytic_project_id = Column(String(128), nullable=True)
    reminders_paused = Column(Boolean, nullable=False, server_default="false")
    revision = Column(Integer, nullable=False, server_default="1")
    published_at = Column(TIMESTAMP(timezone=True), nullable=True)
    completed_at = Column(TIMESTAMP(timezone=True), nullable=True)
    archived_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_by_user_id = Column(String(128), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("status IN ('draft','active','completed','archived')", name="ck_pbc_engagement_status"),
        CheckConstraint("engagement_type IN ('audit','tax','bookkeeping','advisory','other')", name="ck_pbc_engagement_type"),
        Index("ix_pbc_engagements_firm_status", "firm_id", "status"),
        Index("ix_pbc_engagements_client", "firm_id", "client_id"),
    )


class PbcRequest(Base):
    __tablename__ = "pbc_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    engagement_id = Column(UUID(as_uuid=True), ForeignKey("pbc_engagements.id", ondelete="CASCADE"), nullable=False)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), nullable=False)
    request_number = Column(String(64), nullable=False)
    sort_order = Column(Integer, nullable=False, server_default="0")
    category = Column(String(128), nullable=True)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    period_end = Column(Date, nullable=True)
    priority = Column(String(16), nullable=False, server_default="normal")
    due_date = Column(Date, nullable=True)
    owner_user_id = Column(String(128), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    expected_filename = Column(String(500), nullable=True)
    expected_formats = Column(MutableList.as_mutable(JSONB), nullable=False, default=list)
    gl_account = Column(String(128), nullable=True)
    gl_balance = Column(String(64), nullable=True)
    sensitive = Column(Boolean, nullable=False, server_default="false")
    requires_redaction = Column(Boolean, nullable=False, server_default="false")
    dependency_ids = Column(MutableList.as_mutable(JSONB), nullable=False, default=list)
    status = Column(String(20), nullable=False, server_default="draft")
    status_reason = Column(Text, nullable=True)
    external_source_id = Column(String(255), nullable=True)
    revision = Column(Integer, nullable=False, server_default="1")
    submitted_at = Column(TIMESTAMP(timezone=True), nullable=True)
    accepted_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_by_user_id = Column(String(128), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("priority IN ('low','normal','high','urgent')", name="ck_pbc_request_priority"),
        CheckConstraint("status IN ('draft','open','submitted','needs_changes','accepted','waived')", name="ck_pbc_request_status"),
        UniqueConstraint("engagement_id", "request_number", name="uq_pbc_request_number"),
        Index("ix_pbc_requests_engagement_status", "engagement_id", "status"),
        Index("ix_pbc_requests_firm_due", "firm_id", "due_date", "status"),
    )


class PbcContact(Base):
    __tablename__ = "pbc_contacts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), nullable=False)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(255), nullable=False)
    email = Column(String(320), nullable=False)
    active = Column(Boolean, nullable=False, server_default="true")
    created_by_user_id = Column(String(128), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("firm_id", "email", name="uq_pbc_contact_firm_email"),
        Index("ix_pbc_contacts_client", "firm_id", "client_id"),
    )


class PbcEngagementContact(Base):
    __tablename__ = "pbc_engagement_contacts"

    engagement_id = Column(UUID(as_uuid=True), ForeignKey("pbc_engagements.id", ondelete="CASCADE"), primary_key=True)
    contact_id = Column(UUID(as_uuid=True), ForeignKey("pbc_contacts.id", ondelete="CASCADE"), primary_key=True)
    role = Column(String(16), nullable=False, server_default="contributor")
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (CheckConstraint("role IN ('coordinator','contributor')", name="ck_pbc_engagement_contact_role"),)


class PbcRequestAssignment(Base):
    __tablename__ = "pbc_request_assignments"

    request_id = Column(UUID(as_uuid=True), ForeignKey("pbc_requests.id", ondelete="CASCADE"), primary_key=True)
    contact_id = Column(UUID(as_uuid=True), ForeignKey("pbc_contacts.id", ondelete="CASCADE"), primary_key=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())


class PbcDocument(Base):
    __tablename__ = "pbc_documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id = Column(UUID(as_uuid=True), ForeignKey("pbc_requests.id", ondelete="CASCADE"), nullable=False)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), nullable=False)
    object_name = Column(Text, nullable=False, unique=True)
    filename = Column(String(512), nullable=False)
    mime_type = Column(String(255), nullable=False)
    size_bytes = Column(BigInteger, nullable=False)
    checksum_sha256 = Column(String(64), nullable=True)
    version = Column(Integer, nullable=False)
    state = Column(String(20), nullable=False, server_default="initiated")
    uploaded_by_kind = Column(String(16), nullable=False)
    uploaded_by_id = Column(String(128), nullable=True)
    ai_metadata = Column(MutableDict.as_mutable(JSONB), nullable=True)
    completed_at = Column(TIMESTAMP(timezone=True), nullable=True)
    deleted_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        CheckConstraint("size_bytes >= 0 AND size_bytes <= 104857600", name="ck_pbc_document_size"),
        CheckConstraint("state IN ('initiated','quarantined','available','rejected','deleted','abandoned')", name="ck_pbc_document_state"),
        CheckConstraint("uploaded_by_kind IN ('firm','client')", name="ck_pbc_document_actor_kind"),
        UniqueConstraint("request_id", "version", name="uq_pbc_document_request_version"),
        Index("ix_pbc_documents_request_state", "request_id", "state"),
    )


class PbcComment(Base):
    __tablename__ = "pbc_comments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id = Column(UUID(as_uuid=True), ForeignKey("pbc_requests.id", ondelete="CASCADE"), nullable=False)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), nullable=False)
    body = Column(Text, nullable=False)
    visibility = Column(String(16), nullable=False, server_default="client")
    actor_kind = Column(String(16), nullable=False)
    actor_id = Column(String(128), nullable=True)
    actor_name = Column(String(255), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        CheckConstraint("visibility IN ('client','internal')", name="ck_pbc_comment_visibility"),
        CheckConstraint("actor_kind IN ('firm','client','system')", name="ck_pbc_comment_actor_kind"),
        Index("ix_pbc_comments_request_created", "request_id", "created_at"),
    )


class PbcTemplate(Base):
    __tablename__ = "pbc_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    engagement_type = Column(String(32), nullable=False, server_default="audit")
    items = Column(MutableList.as_mutable(JSONB), nullable=False, default=list)
    created_by_user_id = Column(String(128), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (Index("ix_pbc_templates_firm", "firm_id", "name"),)


class PbcAccessToken(Base):
    __tablename__ = "pbc_access_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    engagement_id = Column(UUID(as_uuid=True), ForeignKey("pbc_engagements.id", ondelete="CASCADE"), nullable=False)
    contact_id = Column(UUID(as_uuid=True), ForeignKey("pbc_contacts.id", ondelete="CASCADE"), nullable=False)
    token_hash = Column(String(64), nullable=False, unique=True)
    purpose = Column(String(16), nullable=False)
    request_ids = Column(MutableList.as_mutable(JSONB), nullable=False, default=list)
    expires_at = Column(TIMESTAMP(timezone=True), nullable=False)
    one_time = Column(Boolean, nullable=False, server_default="true")
    used_at = Column(TIMESTAMP(timezone=True), nullable=True)
    revoked_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_by_user_id = Column(String(128), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        CheckConstraint("purpose IN ('portal_login','scoped_link')", name="ck_pbc_access_token_purpose"),
        Index("ix_pbc_access_tokens_contact", "contact_id", "expires_at"),
    )


class PbcPortalSession(Base):
    __tablename__ = "pbc_portal_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    engagement_id = Column(UUID(as_uuid=True), ForeignKey("pbc_engagements.id", ondelete="CASCADE"), nullable=False)
    contact_id = Column(UUID(as_uuid=True), ForeignKey("pbc_contacts.id", ondelete="CASCADE"), nullable=False)
    session_hash = Column(String(64), nullable=False, unique=True)
    csrf_hash = Column(String(64), nullable=False)
    request_ids = Column(MutableList.as_mutable(JSONB), nullable=False, default=list)
    expires_at = Column(TIMESTAMP(timezone=True), nullable=False)
    revoked_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    last_seen_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (Index("ix_pbc_sessions_expiry", "expires_at", "revoked_at"),)


class PbcAuditEvent(Base):
    __tablename__ = "pbc_audit_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), nullable=False)
    engagement_id = Column(UUID(as_uuid=True), ForeignKey("pbc_engagements.id", ondelete="CASCADE"), nullable=False)
    request_id = Column(UUID(as_uuid=True), ForeignKey("pbc_requests.id", ondelete="SET NULL"), nullable=True)
    actor_kind = Column(String(16), nullable=False)
    actor_id = Column(String(128), nullable=True)
    event_type = Column(String(64), nullable=False)
    details = Column(MutableDict.as_mutable(JSONB), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (Index("ix_pbc_audit_engagement_created", "engagement_id", "created_at"),)


class PbcNotificationOutbox(Base):
    __tablename__ = "pbc_notification_outbox"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    engagement_id = Column(UUID(as_uuid=True), ForeignKey("pbc_engagements.id", ondelete="CASCADE"), nullable=False)
    request_id = Column(UUID(as_uuid=True), ForeignKey("pbc_requests.id", ondelete="CASCADE"), nullable=True)
    contact_id = Column(UUID(as_uuid=True), ForeignKey("pbc_contacts.id", ondelete="CASCADE"), nullable=False)
    dedupe_key = Column(String(255), nullable=False, unique=True)
    kind = Column(String(32), nullable=False)
    recipient_email = Column(String(320), nullable=False)
    payload = Column(MutableDict.as_mutable(JSONB), nullable=False, default=dict)
    status = Column(String(16), nullable=False, server_default="pending")
    attempt_count = Column(Integer, nullable=False, server_default="0")
    next_attempt_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    sent_at = Column(TIMESTAMP(timezone=True), nullable=True)
    last_error = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        CheckConstraint("status IN ('pending','sending','sent','failed')", name="ck_pbc_notification_status"),
        Index("ix_pbc_notification_due", "status", "next_attempt_at"),
    )
