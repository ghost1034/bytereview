"""Add metadata-only Hosted Claw native cron registration and occurrence ledgers.

Revision ID: 065_hosted_claw_native_cron
Revises: 064_hosted_claw_single_slack_response
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "065_hosted_claw_native_cron"
down_revision = "064_hosted_claw_single_slack_response"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "hosted_claw_cron_schedules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product", sa.String(32), nullable=False),
        sa.Column("native_job_id", sa.String(128), nullable=False),
        sa.Column("state", sa.String(20), nullable=False),
        sa.Column("next_fire_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("last_synced_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("product IN ('accountingclaw', 'legalclaw')", name="ck_hosted_claw_cron_schedule_product"),
        sa.CheckConstraint("state IN ('scheduled', 'paused', 'completed', 'removed')", name="ck_hosted_claw_cron_schedule_state"),
        sa.UniqueConstraint("user_id", "product", "native_job_id", name="uq_hosted_claw_cron_native_job"),
    )
    op.create_index("ix_hosted_claw_cron_schedules_user_id", "hosted_claw_cron_schedules", ["user_id"])
    op.create_index("ix_hosted_claw_cron_due", "hosted_claw_cron_schedules", ["state", "next_fire_at"])

    op.create_table(
        "hosted_claw_cron_occurrences",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("schedule_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("hosted_claw_cron_schedules.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product", sa.String(32), nullable=False),
        sa.Column("native_job_id", sa.String(128), nullable=False),
        sa.Column("fire_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("trigger_kind", sa.String(16), server_default="scheduled", nullable=False),
        sa.Column("request_key", sa.String(128), nullable=True, unique=True),
        sa.Column("status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("worker_id", sa.String(128), nullable=True),
        sa.Column("runtime_id", sa.String(128), nullable=True),
        sa.Column("lease_expires_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("claimed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("ready_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("provider_claimed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("heartbeat_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("completed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("error_code", sa.String(64), nullable=True),
        sa.Column("delivery_status", sa.String(16), server_default="pending", nullable=False),
        sa.Column("delivery_attempted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("delivered_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("usage_accounted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("cost_usd", sa.Numeric(12, 6), server_default="0", nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("product IN ('accountingclaw', 'legalclaw')", name="ck_hosted_claw_cron_occurrence_product"),
        sa.CheckConstraint("trigger_kind IN ('scheduled', 'manual')", name="ck_hosted_claw_cron_trigger_kind"),
        sa.CheckConstraint("status IN ('pending', 'claimed', 'ready', 'running', 'completed', 'failed', 'unknown', 'cancelled', 'rejected')", name="ck_hosted_claw_cron_occurrence_status"),
        sa.CheckConstraint("delivery_status IN ('pending', 'delivered', 'failed', 'skipped')", name="ck_hosted_claw_cron_delivery_status"),
        sa.UniqueConstraint("schedule_id", "fire_at", name="uq_hosted_claw_cron_occurrence_fire"),
    )
    op.create_index("ix_hosted_claw_cron_occurrences_schedule_id", "hosted_claw_cron_occurrences", ["schedule_id"])
    op.create_index("ix_hosted_claw_cron_occurrences_user_id", "hosted_claw_cron_occurrences", ["user_id"])
    op.create_index("ix_hosted_claw_cron_occurrence_claim", "hosted_claw_cron_occurrences", ["status", "fire_at", "created_at"])
    op.create_index(
        "uq_hosted_claw_active_cron_per_user",
        "hosted_claw_cron_occurrences",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('claimed', 'ready', 'running')"),
    )


def downgrade() -> None:
    op.drop_table("hosted_claw_cron_occurrences")
    op.drop_table("hosted_claw_cron_schedules")
