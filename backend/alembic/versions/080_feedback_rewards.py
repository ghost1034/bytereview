"""Add feedback submissions, monthly rewards, and Stripe usage credits.

Revision ID: 080_feedback_rewards
Revises: 079_firmcrm_module
"""
from alembic import op
import sqlalchemy as sa

revision = "080_feedback_rewards"
down_revision = "079_firmcrm_module"
branch_labels = None
depends_on = None


def upgrade():
    for name in ("feedback_basic_until", "feedback_reward_available_at", "usage_reset_at"):
        op.add_column("billing_accounts", sa.Column(name, sa.TIMESTAMP(timezone=True), nullable=True))
    op.add_column("usage_events", sa.Column("stripe_quantity", sa.BigInteger(), nullable=True))
    op.create_table(
        "feedback_submissions",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("request_id", sa.UUID(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("page_path", sa.String(500), nullable=True),
        sa.Column("reward", sa.String(30), nullable=False),
        sa.Column("basic_until", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("next_reward_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("pages_reset", sa.Integer(), nullable=False),
        sa.Column("tokens_reset", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "request_id", name="uq_feedback_user_request"),
    )
    op.create_index("ix_feedback_submissions_user_id", "feedback_submissions", ["user_id"])


def downgrade():
    op.drop_table("feedback_submissions")
    op.drop_column("usage_events", "stripe_quantity")
    for name in ("usage_reset_at", "feedback_reward_available_at", "feedback_basic_until"):
        op.drop_column("billing_accounts", name)
