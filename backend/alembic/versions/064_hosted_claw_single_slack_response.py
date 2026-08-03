"""Track the single Slack response for each Hosted Claw turn.

Revision ID: 064_hosted_claw_single_slack_response
Revises: 063_esign_ai_field_placement
"""

from alembic import op
import sqlalchemy as sa


revision = "064_hosted_claw_single_slack_response"
down_revision = "063_esign_ai_field_placement"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "hosted_claw_jobs",
        sa.Column("slack_response_ts", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "hosted_claw_jobs",
        sa.Column("slack_response_finalized_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("hosted_claw_jobs", "slack_response_finalized_at")
    op.drop_column("hosted_claw_jobs", "slack_response_ts")
