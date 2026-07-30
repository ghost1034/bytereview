"""Relational security envelope for Tasklytic JSON records.

The TypeScript payloads deliberately remain schemaless JSON.  Tenancy,
membership and lifecycle state live in columns that clients cannot forge.
"""

from __future__ import annotations

import uuid

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Column,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    TIMESTAMP,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from models.db_models import Base


JSON_PAYLOAD = JSON().with_variant(JSONB, "postgresql")


class TasklyticWorkspace(Base):
    __tablename__ = "tasklytic_workspaces"

    id = Column(String(128), primary_key=True)
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
