"""Add the Tasklytic project-management persistence envelope.

Revision ID: 060_tasklytic_backend
Revises: 059_system_admin_users
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "060_tasklytic_backend"
down_revision = "059_system_admin_users"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tasklytic_workspaces",
        sa.Column("id", sa.String(length=128), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("revision", sa.Integer(), server_default="1", nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "tasklytic_workspace_members",
        sa.Column("workspace_id", sa.String(length=128), nullable=False),
        sa.Column("user_id", sa.String(length=128), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("role IN ('admin', 'member', 'guest')", name="ck_tasklytic_member_role"),
        sa.ForeignKeyConstraint(["workspace_id"], ["tasklytic_workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("workspace_id", "user_id"),
    )
    op.create_index("ix_tasklytic_members_user_workspace", "tasklytic_workspace_members", ["user_id", "workspace_id"])
    op.create_table(
        "tasklytic_entity_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entity_kind", sa.String(length=64), nullable=False),
        sa.Column("record_id", sa.String(length=128), nullable=False),
        sa.Column("scope_key", sa.String(length=132), nullable=False),
        sa.Column("workspace_id", sa.String(length=128), nullable=True),
        sa.Column("user_id", sa.String(length=128), nullable=True),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("revision", sa.Integer(), server_default="1", nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("(workspace_id IS NOT NULL AND user_id IS NULL) OR (workspace_id IS NULL AND user_id IS NOT NULL)", name="ck_tasklytic_entity_exactly_one_scope"),
        sa.ForeignKeyConstraint(["workspace_id"], ["tasklytic_workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("entity_kind", "record_id", "scope_key", name="uq_tasklytic_entity_scope"),
    )
    op.create_index("ix_tasklytic_entity_workspace_kind", "tasklytic_entity_records", ["workspace_id", "entity_kind"])
    op.create_index("ix_tasklytic_entity_user_kind", "tasklytic_entity_records", ["user_id", "entity_kind"])
    op.create_table(
        "tasklytic_invitations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("workspace_id", sa.String(length=128), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("team_id", sa.String(length=128), nullable=True),
        sa.Column("invited_by_id", sa.String(length=128), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="pending", nullable=False),
        sa.Column("delivery_state", sa.String(length=16), server_default="pending", nullable=False),
        sa.Column("delivery_error", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("accepted_by_id", sa.String(length=128), nullable=True),
        sa.Column("accepted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("role IN ('admin', 'member', 'guest')", name="ck_tasklytic_invitation_role"),
        sa.CheckConstraint("status IN ('pending', 'accepted', 'expired', 'revoked')", name="ck_tasklytic_invitation_status"),
        sa.CheckConstraint("delivery_state IN ('pending', 'sent', 'failed')", name="ck_tasklytic_invitation_delivery"),
        sa.ForeignKeyConstraint(["workspace_id"], ["tasklytic_workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_tasklytic_invitations_workspace_status", "tasklytic_invitations", ["workspace_id", "status"])
    op.create_index("ix_tasklytic_invitations_email_status", "tasklytic_invitations", ["email", "status"])
    op.create_table(
        "tasklytic_file_uploads",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("object_name", sa.Text(), nullable=False),
        sa.Column("workspace_id", sa.String(length=128), nullable=False),
        sa.Column("uploader_id", sa.String(length=128), nullable=True),
        sa.Column("scope_type", sa.String(length=32), nullable=False),
        sa.Column("scope_id", sa.String(length=128), nullable=False),
        sa.Column("filename", sa.Text(), nullable=False),
        sa.Column("mime_type", sa.String(length=255), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("state", sa.String(length=16), server_default="initiated", nullable=False),
        sa.Column("public_token_hash", sa.String(length=64), nullable=True),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("completed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("consumed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("size_bytes >= 0 AND size_bytes <= 104857600", name="ck_tasklytic_file_size"),
        sa.CheckConstraint("state IN ('initiated', 'completed', 'consumed', 'deleted', 'abandoned')", name="ck_tasklytic_file_state"),
        sa.ForeignKeyConstraint(["workspace_id"], ["tasklytic_workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("object_name"),
        sa.UniqueConstraint("public_token_hash"),
    )
    op.create_index("ix_tasklytic_files_workspace_scope", "tasklytic_file_uploads", ["workspace_id", "scope_type", "scope_id"])
    op.create_index("ix_tasklytic_files_state_expiry", "tasklytic_file_uploads", ["state", "expires_at"])


def downgrade() -> None:
    op.drop_table("tasklytic_file_uploads")
    op.drop_table("tasklytic_invitations")
    op.drop_table("tasklytic_entity_records")
    op.drop_table("tasklytic_workspace_members")
    op.drop_table("tasklytic_workspaces")
