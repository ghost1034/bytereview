"""Add Tasklytic transactional commands and background job runs.

Revision ID: 070_tasklytic_phase3_commands
Revises: 069_tasklytic_phase2_contracts
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "070_tasklytic_phase3_commands"
down_revision = "069_tasklytic_phase2_contracts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tasklytic_commands",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("workspace_id", sa.String(length=128), nullable=True),
        sa.Column("scope_key", sa.String(length=132), nullable=False),
        sa.Column("actor_id", sa.String(length=128), nullable=False),
        sa.Column("command_type", sa.String(length=96), nullable=False),
        sa.Column("deduplication_key", sa.String(length=255), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("result", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("status", sa.String(length=16), server_default="pending", nullable=False),
        sa.Column("attempt_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("max_attempts", sa.Integer(), server_default="5", nullable=False),
        sa.Column("retry_base_seconds", sa.Integer(), server_default="30", nullable=False),
        sa.Column("retry_max_seconds", sa.Integer(), server_default="86400", nullable=False),
        sa.Column("available_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("lease_owner", sa.String(length=128), nullable=True),
        sa.Column("lease_expires_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("failure_code", sa.String(length=128), nullable=True),
        sa.Column("failure_detail", sa.Text(), nullable=True),
        sa.Column("failure_details", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("completed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('pending', 'leased', 'retry', 'succeeded', 'failed')", name="ck_tasklytic_command_status"),
        sa.CheckConstraint("attempt_count >= 0", name="ck_tasklytic_command_attempt_count"),
        sa.CheckConstraint("max_attempts >= 1", name="ck_tasklytic_command_max_attempts"),
        sa.CheckConstraint("retry_base_seconds >= 1", name="ck_tasklytic_command_retry_base"),
        sa.CheckConstraint("retry_max_seconds >= retry_base_seconds", name="ck_tasklytic_command_retry_max"),
        sa.ForeignKeyConstraint(["workspace_id"], ["tasklytic_workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("scope_key", "command_type", "deduplication_key", name="uq_tasklytic_command_deduplication"),
    )
    op.create_index("ix_tasklytic_commands_dispatch", "tasklytic_commands", ["status", "available_at", "lease_expires_at"])
    op.create_index("ix_tasklytic_commands_workspace_created", "tasklytic_commands", ["workspace_id", "created_at"])
    op.create_table(
        "tasklytic_command_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("command_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("attempt", sa.Integer(), nullable=False),
        sa.Column("worker_id", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="running", nullable=False),
        sa.Column("result", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("failure_code", sa.String(length=128), nullable=True),
        sa.Column("failure_detail", sa.Text(), nullable=True),
        sa.Column("failure_details", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("started_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("finished_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('running', 'succeeded', 'retry', 'failed')", name="ck_tasklytic_command_run_status"),
        sa.CheckConstraint("attempt >= 1", name="ck_tasklytic_command_run_attempt"),
        sa.ForeignKeyConstraint(["command_id"], ["tasklytic_commands.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("command_id", "attempt", name="uq_tasklytic_command_run_attempt"),
    )
    op.create_index("ix_tasklytic_command_runs_command_started", "tasklytic_command_runs", ["command_id", "started_at"])


def downgrade() -> None:
    op.drop_index("ix_tasklytic_command_runs_command_started", table_name="tasklytic_command_runs")
    op.drop_table("tasklytic_command_runs")
    op.drop_index("ix_tasklytic_commands_workspace_created", table_name="tasklytic_commands")
    op.drop_index("ix_tasklytic_commands_dispatch", table_name="tasklytic_commands")
    op.drop_table("tasklytic_commands")
