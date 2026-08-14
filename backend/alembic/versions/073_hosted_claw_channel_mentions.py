"""Add isolated Hosted Claw Slack channel sessions.

Revision ID: 073_hosted_claw_channels
Revises: 072_tasklytic_phase10
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "073_hosted_claw_channels"
down_revision = "072_tasklytic_phase10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "hosted_claw_channel_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product", sa.String(32), nullable=False),
        sa.Column("team_id", sa.String(64), nullable=False),
        sa.Column("channel_id", sa.String(64), nullable=False),
        sa.Column("thread_ts", sa.String(32), nullable=False),
        sa.Column("hermes_session_id", sa.String(128), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "product IN ('accountingclaw', 'legalclaw')",
            name="ck_hosted_claw_channel_session_product",
        ),
        sa.UniqueConstraint(
            "user_id",
            "product",
            "team_id",
            "channel_id",
            "thread_ts",
            name="uq_hosted_claw_channel_session_thread",
        ),
    )
    op.create_index(
        "ix_hosted_claw_channel_sessions_user_id",
        "hosted_claw_channel_sessions",
        ["user_id"],
    )
    op.add_column(
        "hosted_claw_jobs",
        sa.Column("channel_session_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_hosted_claw_jobs_channel_session_id",
        "hosted_claw_jobs",
        "hosted_claw_channel_sessions",
        ["channel_session_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_hosted_claw_jobs_channel_session_id",
        "hosted_claw_jobs",
        ["channel_session_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_hosted_claw_jobs_channel_session_id", table_name="hosted_claw_jobs")
    op.drop_constraint(
        "fk_hosted_claw_jobs_channel_session_id",
        "hosted_claw_jobs",
        type_="foreignkey",
    )
    op.drop_column("hosted_claw_jobs", "channel_session_id")
    op.drop_table("hosted_claw_channel_sessions")
