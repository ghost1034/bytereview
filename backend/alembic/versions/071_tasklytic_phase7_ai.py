"""Persist Tasklytic AI threads, proposals, teammates, audit, and usage.

Revision ID: 071_tasklytic_phase7_ai
Revises: 070_tasklytic_phase3_commands
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "071_tasklytic_phase7_ai"
down_revision = "070_tasklytic_phase3_commands"
branch_labels = None
depends_on = None


JSON_PAYLOAD = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def upgrade() -> None:
    op.create_table(
        "tasklytic_ai_settings",
        sa.Column("workspace_id", sa.String(128), sa.ForeignKey("tasklytic_workspaces.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", sa.String(128), primary_key=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("paused", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("model", sa.String(64), nullable=False, server_default="gemini-2.5-flash"),
        sa.Column("migration_key", sa.String(128)),
        sa.Column("migrated_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "tasklytic_ai_threads",
        sa.Column("id", sa.String(128), primary_key=True),
        sa.Column("workspace_id", sa.String(128), sa.ForeignKey("tasklytic_workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(128), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("context_scope", JSON_PAYLOAD),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_tasklytic_ai_threads_owner_updated", "tasklytic_ai_threads", ["workspace_id", "user_id", "updated_at"])
    op.create_table(
        "tasklytic_ai_messages",
        sa.Column("id", sa.String(128), primary_key=True),
        sa.Column("thread_id", sa.String(128), sa.ForeignKey("tasklytic_ai_threads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("reasoning", sa.Text()),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("role IN ('user', 'assistant')", name="ck_tasklytic_ai_message_role"),
    )
    op.create_index("ix_tasklytic_ai_messages_thread_created", "tasklytic_ai_messages", ["thread_id", "created_at"])
    op.create_table(
        "tasklytic_ai_proposals",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", sa.String(128), sa.ForeignKey("tasklytic_workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("thread_id", sa.String(128), sa.ForeignKey("tasklytic_ai_threads.id", ondelete="CASCADE")),
        sa.Column("message_id", sa.String(128), sa.ForeignKey("tasklytic_ai_messages.id", ondelete="SET NULL")),
        sa.Column("created_by", sa.String(128), nullable=False),
        sa.Column("proposal_type", sa.String(48), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("preview", sa.Text(), nullable=False),
        sa.Column("reasoning", sa.Text()),
        sa.Column("payload", JSON_PAYLOAD, nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("accepted_result", JSON_PAYLOAD),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("accepted_at", sa.TIMESTAMP(timezone=True)),
        sa.CheckConstraint("status IN ('pending', 'accepted', 'discarded')", name="ck_tasklytic_ai_proposal_status"),
    )
    op.create_index("ix_tasklytic_ai_proposals_owner_status", "tasklytic_ai_proposals", ["workspace_id", "created_by", "status"])
    op.create_table(
        "tasklytic_ai_teammate_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", sa.String(128), sa.ForeignKey("tasklytic_workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("teammate", sa.String(16), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("scope_type", sa.String(16), nullable=False),
        sa.Column("scope_id", sa.String(128), nullable=False),
        sa.Column("cadence", sa.String(16), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False, server_default="UTC"),
        sa.Column("next_run_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("daily_limit", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("rate_window_date", sa.Date()),
        sa.Column("runs_in_window", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("config", JSON_PAYLOAD, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_by", sa.String(128), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_run_at", sa.TIMESTAMP(timezone=True)),
        sa.CheckConstraint("teammate IN ('tria', 'summarie', 'statura')", name="ck_tasklytic_ai_teammate"),
        sa.CheckConstraint("scope_type IN ('workspace', 'project', 'task')", name="ck_tasklytic_ai_job_scope"),
        sa.CheckConstraint("cadence IN ('event', 'daily', 'weekly')", name="ck_tasklytic_ai_job_cadence"),
        sa.CheckConstraint("daily_limit BETWEEN 1 AND 100", name="ck_tasklytic_ai_job_daily_limit"),
        sa.UniqueConstraint("workspace_id", "teammate", "scope_type", "scope_id", name="uq_tasklytic_ai_job_scope"),
    )
    op.create_index("ix_tasklytic_ai_jobs_due", "tasklytic_ai_teammate_jobs", ["enabled", "next_run_at"])
    op.create_table(
        "tasklytic_ai_audit_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", sa.String(128), sa.ForeignKey("tasklytic_workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actor_id", sa.String(128), nullable=False),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("subject_type", sa.String(32), nullable=False),
        sa.Column("subject_id", sa.String(128), nullable=False),
        sa.Column("details", JSON_PAYLOAD, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_tasklytic_ai_audit_workspace_created", "tasklytic_ai_audit_events", ["workspace_id", "created_at"])
    op.create_table(
        "tasklytic_ai_usage_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", sa.String(128), sa.ForeignKey("tasklytic_workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(128), nullable=False),
        sa.Column("event_type", sa.String(32), nullable=False),
        sa.Column("model", sa.String(64), nullable=False),
        sa.Column("thread_id", sa.String(128)),
        sa.Column("job_id", postgresql.UUID(as_uuid=True)),
        sa.Column("prompt_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("prompt_tokens >= 0", name="ck_tasklytic_ai_usage_prompt"),
        sa.CheckConstraint("output_tokens >= 0", name="ck_tasklytic_ai_usage_output"),
        sa.CheckConstraint("total_tokens >= 0", name="ck_tasklytic_ai_usage_total"),
    )
    op.create_index("ix_tasklytic_ai_usage_workspace_created", "tasklytic_ai_usage_events", ["workspace_id", "created_at"])


def downgrade() -> None:
    for table in (
        "tasklytic_ai_usage_events",
        "tasklytic_ai_audit_events",
        "tasklytic_ai_teammate_jobs",
        "tasklytic_ai_proposals",
        "tasklytic_ai_messages",
        "tasklytic_ai_threads",
        "tasklytic_ai_settings",
    ):
        op.drop_table(table)
