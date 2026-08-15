"""Relational security envelope for Tasklytic JSON records.

The TypeScript payloads deliberately remain schemaless JSON.  Tenancy,
membership and lifecycle state live in columns that clients cannot forge.
"""

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
    JSON,
    String,
    TIMESTAMP,
    Text,
    UniqueConstraint,
    false,
    func,
    true,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from models.db_models import Base


JSON_PAYLOAD = JSON().with_variant(JSONB, "postgresql")


class TasklyticWorkspace(Base):
    __tablename__ = "tasklytic_workspaces"

    id = Column(String(128), primary_key=True)
    firm_id = Column(
        UUID(as_uuid=True),
        ForeignKey("firms.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    payload = Column(JSON_PAYLOAD, nullable=False, default=dict)
    revision = Column(Integer, nullable=False, default=1, server_default="1")
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class TasklyticWorkspaceMember(Base):
    __tablename__ = "tasklytic_workspace_members"

    workspace_id = Column(
        String(128),
        ForeignKey("tasklytic_workspaces.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id = Column(String(128), primary_key=True)
    role = Column(String(16), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("role IN ('admin', 'member', 'guest')", name="ck_tasklytic_member_role"),
        Index("ix_tasklytic_members_user_workspace", "user_id", "workspace_id"),
    )


class TasklyticEntityRecord(Base):
    __tablename__ = "tasklytic_entity_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_kind = Column(String(64), nullable=False)
    record_id = Column(String(128), nullable=False)
    # Stable non-null discriminator makes uniqueness portable despite nullable
    # workspace_id/user_id columns ("w:<id>" or "u:<id>").
    scope_key = Column(String(132), nullable=False)
    workspace_id = Column(
        String(128),
        ForeignKey("tasklytic_workspaces.id", ondelete="CASCADE"),
        nullable=True,
    )
    user_id = Column(String(128), nullable=True)
    payload = Column(JSON_PAYLOAD, nullable=False)
    revision = Column(Integer, nullable=False, default=1, server_default="1")
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint(
            "(workspace_id IS NOT NULL AND user_id IS NULL) OR "
            "(workspace_id IS NULL AND user_id IS NOT NULL)",
            name="ck_tasklytic_entity_exactly_one_scope",
        ),
        UniqueConstraint("entity_kind", "record_id", "scope_key", name="uq_tasklytic_entity_scope"),
        Index("ix_tasklytic_entity_workspace_kind", "workspace_id", "entity_kind"),
        Index("ix_tasklytic_entity_user_kind", "user_id", "entity_kind"),
    )


class TasklyticWorkspaceEvent(Base):
    __tablename__ = "tasklytic_workspace_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(
        String(128),
        ForeignKey("tasklytic_workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    actor_id = Column(String(128), nullable=False)
    entity_kind = Column(String(64), nullable=False)
    record_id = Column(String(128), nullable=False)
    operation = Column(String(16), nullable=False)
    revision = Column(Integer, nullable=False)
    payload = Column(JSON_PAYLOAD, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        CheckConstraint(
            "operation IN ('created', 'updated', 'deleted')",
            name="ck_tasklytic_workspace_event_operation",
        ),
        Index("ix_tasklytic_workspace_events_workspace_id_id", "workspace_id", "id"),
    )


class TasklyticInvitation(Base):
    __tablename__ = "tasklytic_invitations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(
        String(128),
        ForeignKey("tasklytic_workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    email = Column(String(320), nullable=False)
    role = Column(String(16), nullable=False)
    team_id = Column(String(128), nullable=True)
    invited_by_id = Column(String(128), nullable=False)
    note = Column(Text, nullable=True)
    token_hash = Column(String(64), nullable=False, unique=True)
    status = Column(String(16), nullable=False, default="pending", server_default="pending")
    delivery_state = Column(String(16), nullable=False, default="pending", server_default="pending")
    delivery_error = Column(Text, nullable=True)
    revision = Column(Integer, nullable=False, default=1, server_default="1")
    expires_at = Column(TIMESTAMP(timezone=True), nullable=False)
    accepted_by_id = Column(String(128), nullable=True)
    accepted_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("role IN ('admin', 'member', 'guest')", name="ck_tasklytic_invitation_role"),
        CheckConstraint(
            "status IN ('pending', 'accepted', 'expired', 'revoked')",
            name="ck_tasklytic_invitation_status",
        ),
        CheckConstraint(
            "delivery_state IN ('pending', 'sent', 'failed')",
            name="ck_tasklytic_invitation_delivery",
        ),
        Index("ix_tasklytic_invitations_workspace_status", "workspace_id", "status"),
        Index("ix_tasklytic_invitations_email_status", "email", "status"),
    )


class TasklyticFileUpload(Base):
    __tablename__ = "tasklytic_file_uploads"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    object_name = Column(Text, nullable=False, unique=True)
    workspace_id = Column(
        String(128),
        ForeignKey("tasklytic_workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    uploader_id = Column(String(128), nullable=True)
    scope_type = Column(String(32), nullable=False)
    scope_id = Column(String(128), nullable=False)
    filename = Column(Text, nullable=False)
    mime_type = Column(String(255), nullable=False)
    size_bytes = Column(BigInteger, nullable=False)
    state = Column(String(16), nullable=False, default="initiated", server_default="initiated")
    public_token_hash = Column(String(64), nullable=True, unique=True)
    expires_at = Column(TIMESTAMP(timezone=True), nullable=False)
    completed_at = Column(TIMESTAMP(timezone=True), nullable=True)
    consumed_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("size_bytes >= 0 AND size_bytes <= 104857600", name="ck_tasklytic_file_size"),
        CheckConstraint(
            "state IN ('initiated', 'completed', 'consumed', 'deleted', 'abandoned')",
            name="ck_tasklytic_file_state",
        ),
        Index("ix_tasklytic_files_workspace_scope", "workspace_id", "scope_type", "scope_id"),
        Index("ix_tasklytic_files_state_expiry", "state", "expires_at"),
    )


class TasklyticCommand(Base):
    """Durable transactional command and background-job outbox entry."""

    __tablename__ = "tasklytic_commands"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(
        String(128),
        ForeignKey("tasklytic_workspaces.id", ondelete="CASCADE"),
        nullable=True,
    )
    scope_key = Column(String(132), nullable=False)
    actor_id = Column(String(128), nullable=False)
    command_type = Column(String(96), nullable=False)
    deduplication_key = Column(String(255), nullable=False)
    payload = Column(JSON_PAYLOAD, nullable=False, default=dict)
    result = Column(JSON_PAYLOAD, nullable=True)
    status = Column(String(16), nullable=False, default="pending", server_default="pending")
    attempt_count = Column(Integer, nullable=False, default=0, server_default="0")
    max_attempts = Column(Integer, nullable=False, default=5, server_default="5")
    retry_base_seconds = Column(Integer, nullable=False, default=30, server_default="30")
    retry_max_seconds = Column(Integer, nullable=False, default=86400, server_default="86400")
    available_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    lease_owner = Column(String(128), nullable=True)
    lease_expires_at = Column(TIMESTAMP(timezone=True), nullable=True)
    failure_code = Column(String(128), nullable=True)
    failure_detail = Column(Text, nullable=True)
    failure_details = Column(JSON_PAYLOAD, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    completed_at = Column(TIMESTAMP(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'leased', 'retry', 'succeeded', 'failed')",
            name="ck_tasklytic_command_status",
        ),
        CheckConstraint("attempt_count >= 0", name="ck_tasklytic_command_attempt_count"),
        CheckConstraint("max_attempts >= 1", name="ck_tasklytic_command_max_attempts"),
        CheckConstraint("retry_base_seconds >= 1", name="ck_tasklytic_command_retry_base"),
        CheckConstraint("retry_max_seconds >= retry_base_seconds", name="ck_tasklytic_command_retry_max"),
        UniqueConstraint(
            "scope_key",
            "command_type",
            "deduplication_key",
            name="uq_tasklytic_command_deduplication",
        ),
        Index(
            "ix_tasklytic_commands_dispatch",
            "status",
            "available_at",
            "lease_expires_at",
        ),
        Index("ix_tasklytic_commands_workspace_created", "workspace_id", "created_at"),
    )


class TasklyticCommandRun(Base):
    """Immutable attempt history for a Tasklytic command."""

    __tablename__ = "tasklytic_command_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    command_id = Column(
        UUID(as_uuid=True),
        ForeignKey("tasklytic_commands.id", ondelete="CASCADE"),
        nullable=False,
    )
    attempt = Column(Integer, nullable=False)
    worker_id = Column(String(128), nullable=False)
    status = Column(String(16), nullable=False, default="running", server_default="running")
    result = Column(JSON_PAYLOAD, nullable=True)
    failure_code = Column(String(128), nullable=True)
    failure_detail = Column(Text, nullable=True)
    failure_details = Column(JSON_PAYLOAD, nullable=True)
    started_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    finished_at = Column(TIMESTAMP(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint(
            "status IN ('running', 'succeeded', 'retry', 'failed')",
            name="ck_tasklytic_command_run_status",
        ),
        CheckConstraint("attempt >= 1", name="ck_tasklytic_command_run_attempt"),
        UniqueConstraint("command_id", "attempt", name="uq_tasklytic_command_run_attempt"),
        Index("ix_tasklytic_command_runs_command_started", "command_id", "started_at"),
    )


class TasklyticAiSettings(Base):
    """Per-user, per-workspace AI preferences and local migration marker."""

    __tablename__ = "tasklytic_ai_settings"

    workspace_id = Column(
        String(128), ForeignKey("tasklytic_workspaces.id", ondelete="CASCADE"), primary_key=True
    )
    user_id = Column(String(128), primary_key=True)
    enabled = Column(Boolean, nullable=False, default=True, server_default=true())
    paused = Column(Boolean, nullable=False, default=False, server_default=false())
    model = Column(String(64), nullable=False, default="gemini-2.5-flash", server_default="gemini-2.5-flash")
    migration_key = Column(String(128), nullable=True)
    migrated_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class TasklyticAiThread(Base):
    __tablename__ = "tasklytic_ai_threads"

    id = Column(String(128), primary_key=True)
    workspace_id = Column(
        String(128), ForeignKey("tasklytic_workspaces.id", ondelete="CASCADE"), nullable=False
    )
    user_id = Column(String(128), nullable=False)
    title = Column(String(160), nullable=False)
    context_scope = Column(JSON_PAYLOAD, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("ix_tasklytic_ai_threads_owner_updated", "workspace_id", "user_id", "updated_at"),
    )


class TasklyticAiMessage(Base):
    __tablename__ = "tasklytic_ai_messages"

    id = Column(String(128), primary_key=True)
    thread_id = Column(
        String(128), ForeignKey("tasklytic_ai_threads.id", ondelete="CASCADE"), nullable=False
    )
    role = Column(String(16), nullable=False)
    content = Column(Text, nullable=False)
    reasoning = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        CheckConstraint("role IN ('user', 'assistant')", name="ck_tasklytic_ai_message_role"),
        Index("ix_tasklytic_ai_messages_thread_created", "thread_id", "created_at"),
    )


class TasklyticAiProposal(Base):
    __tablename__ = "tasklytic_ai_proposals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(
        String(128), ForeignKey("tasklytic_workspaces.id", ondelete="CASCADE"), nullable=False
    )
    thread_id = Column(
        String(128), ForeignKey("tasklytic_ai_threads.id", ondelete="CASCADE"), nullable=True
    )
    message_id = Column(
        String(128), ForeignKey("tasklytic_ai_messages.id", ondelete="SET NULL"), nullable=True
    )
    created_by = Column(String(128), nullable=False)
    proposal_type = Column(String(48), nullable=False)
    title = Column(String(200), nullable=False)
    preview = Column(Text, nullable=False)
    reasoning = Column(Text, nullable=True)
    payload = Column(JSON_PAYLOAD, nullable=False)
    status = Column(String(16), nullable=False, default="pending", server_default="pending")
    revision = Column(Integer, nullable=False, default=1, server_default="1")
    accepted_result = Column(JSON_PAYLOAD, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    accepted_at = Column(TIMESTAMP(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'accepted', 'discarded')", name="ck_tasklytic_ai_proposal_status"
        ),
        Index("ix_tasklytic_ai_proposals_owner_status", "workspace_id", "created_by", "status"),
    )


class TasklyticAiTeammateJob(Base):
    __tablename__ = "tasklytic_ai_teammate_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(
        String(128), ForeignKey("tasklytic_workspaces.id", ondelete="CASCADE"), nullable=False
    )
    teammate = Column(String(16), nullable=False)
    enabled = Column(Boolean, nullable=False, default=True, server_default=true())
    scope_type = Column(String(16), nullable=False)
    scope_id = Column(String(128), nullable=False)
    cadence = Column(String(16), nullable=False)
    timezone = Column(String(64), nullable=False, default="UTC", server_default="UTC")
    next_run_at = Column(TIMESTAMP(timezone=True), nullable=False)
    daily_limit = Column(Integer, nullable=False, default=10, server_default="10")
    rate_window_date = Column(Date, nullable=True)
    runs_in_window = Column(Integer, nullable=False, default=0, server_default="0")
    config = Column(JSON_PAYLOAD, nullable=False, default=dict)
    created_by = Column(String(128), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    last_run_at = Column(TIMESTAMP(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint("teammate IN ('tria', 'summarie', 'statura')", name="ck_tasklytic_ai_teammate"),
        CheckConstraint("scope_type IN ('workspace', 'project', 'task')", name="ck_tasklytic_ai_job_scope"),
        CheckConstraint("cadence IN ('event', 'daily', 'weekly')", name="ck_tasklytic_ai_job_cadence"),
        CheckConstraint("daily_limit BETWEEN 1 AND 100", name="ck_tasklytic_ai_job_daily_limit"),
        UniqueConstraint("workspace_id", "teammate", "scope_type", "scope_id", name="uq_tasklytic_ai_job_scope"),
        Index("ix_tasklytic_ai_jobs_due", "enabled", "next_run_at"),
    )


class TasklyticAiAuditEvent(Base):
    __tablename__ = "tasklytic_ai_audit_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(
        String(128), ForeignKey("tasklytic_workspaces.id", ondelete="CASCADE"), nullable=False
    )
    actor_id = Column(String(128), nullable=False)
    event_type = Column(String(64), nullable=False)
    subject_type = Column(String(32), nullable=False)
    subject_id = Column(String(128), nullable=False)
    details = Column(JSON_PAYLOAD, nullable=False, default=dict)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        Index("ix_tasklytic_ai_audit_workspace_created", "workspace_id", "created_at"),
    )


class TasklyticAiUsageEvent(Base):
    __tablename__ = "tasklytic_ai_usage_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(
        String(128), ForeignKey("tasklytic_workspaces.id", ondelete="CASCADE"), nullable=False
    )
    user_id = Column(String(128), nullable=False)
    event_type = Column(String(32), nullable=False)
    model = Column(String(64), nullable=False)
    thread_id = Column(String(128), nullable=True)
    job_id = Column(UUID(as_uuid=True), nullable=True)
    prompt_tokens = Column(Integer, nullable=False, default=0, server_default="0")
    output_tokens = Column(Integer, nullable=False, default=0, server_default="0")
    total_tokens = Column(Integer, nullable=False, default=0, server_default="0")
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        CheckConstraint("prompt_tokens >= 0", name="ck_tasklytic_ai_usage_prompt"),
        CheckConstraint("output_tokens >= 0", name="ck_tasklytic_ai_usage_output"),
        CheckConstraint("total_tokens >= 0", name="ck_tasklytic_ai_usage_total"),
        Index("ix_tasklytic_ai_usage_workspace_created", "workspace_id", "created_at"),
    )


class TasklyticIntegrationConnection(Base):
    """Workspace-visible integration state without provider secrets."""

    __tablename__ = "tasklytic_integration_connections"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(
        String(128), ForeignKey("tasklytic_workspaces.id", ondelete="CASCADE"), nullable=False
    )
    provider = Column(String(32), nullable=False)
    owner_user_id = Column(String(128), nullable=True)
    external_account_id = Column(String(255), nullable=True)
    status = Column(String(16), nullable=False, default="active", server_default="active")
    capability = Column(JSON_PAYLOAD, nullable=False, default=dict)
    last_error_code = Column(String(128), nullable=True)
    last_error_detail = Column(Text, nullable=True)
    revision = Column(Integer, nullable=False, default=1, server_default="1")
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    revoked_at = Column(TIMESTAMP(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint(
            "provider IN ('google_drive', 'vertex_receipts', 'gmail', 'gcs', 'stripe_connect')",
            name="ck_tasklytic_integration_provider",
        ),
        CheckConstraint(
            "status IN ('active', 'degraded', 'revoked', 'disabled')",
            name="ck_tasklytic_integration_status",
        ),
        UniqueConstraint("workspace_id", "provider", name="uq_tasklytic_integration_workspace_provider"),
        Index("ix_tasklytic_integrations_workspace_status", "workspace_id", "status"),
    )


class TasklyticExternalReference(Base):
    """Conflict-safe mapping between local accounting/files and provider IDs."""

    __tablename__ = "tasklytic_external_references"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(
        String(128), ForeignKey("tasklytic_workspaces.id", ondelete="CASCADE"), nullable=False
    )
    provider = Column(String(32), nullable=False)
    resource_type = Column(String(64), nullable=False)
    external_id = Column(String(255), nullable=False)
    local_kind = Column(String(64), nullable=False)
    local_id = Column(String(128), nullable=False)
    sync_status = Column(String(24), nullable=False, default="synchronized", server_default="synchronized")
    external_version = Column(String(255), nullable=True)
    metadata_json = Column(JSON_PAYLOAD, nullable=False, default=dict)
    last_error_code = Column(String(128), nullable=True)
    last_error_detail = Column(Text, nullable=True)
    revision = Column(Integer, nullable=False, default=1, server_default="1")
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint(
            "sync_status IN ('pending', 'synchronized', 'partial', 'failed', 'conflict')",
            name="ck_tasklytic_external_reference_status",
        ),
        UniqueConstraint(
            "workspace_id", "provider", "resource_type", "external_id",
            name="uq_tasklytic_external_provider_id",
        ),
        UniqueConstraint(
            "workspace_id", "provider", "local_kind", "local_id",
            name="uq_tasklytic_external_local_id",
        ),
        Index("ix_tasklytic_external_reference_local", "workspace_id", "local_kind", "local_id"),
    )


class TasklyticWebhookReceipt(Base):
    """Durable idempotency receipt for external webhook deliveries."""

    __tablename__ = "tasklytic_webhook_receipts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    provider = Column(String(32), nullable=False)
    event_id = Column(String(255), nullable=False)
    payload_digest = Column(String(64), nullable=False)
    workspace_id = Column(
        String(128), ForeignKey("tasklytic_workspaces.id", ondelete="CASCADE"), nullable=True
    )
    status = Column(String(16), nullable=False, default="received", server_default="received")
    local_kind = Column(String(64), nullable=True)
    local_id = Column(String(128), nullable=True)
    failure_detail = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    processed_at = Column(TIMESTAMP(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint(
            "status IN ('received', 'processed', 'ignored', 'failed')",
            name="ck_tasklytic_webhook_receipt_status",
        ),
        UniqueConstraint("provider", "event_id", name="uq_tasklytic_webhook_provider_event"),
        Index("ix_tasklytic_webhooks_workspace_created", "workspace_id", "created_at"),
    )


class TasklyticUsageEvent(Base):
    """First-party product event with a bounded, non-secret property bag."""

    __tablename__ = "tasklytic_usage_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(
        String(128), ForeignKey("tasklytic_workspaces.id", ondelete="CASCADE"), nullable=False
    )
    actor_id = Column(String(128), nullable=False)
    event_name = Column(String(96), nullable=False)
    properties = Column(JSON_PAYLOAD, nullable=False, default=dict)
    occurred_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        Index("ix_tasklytic_usage_workspace_occurred", "workspace_id", "occurred_at"),
    )
