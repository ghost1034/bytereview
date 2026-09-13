"""Add private replay evidence and public placement issues.

Revision ID: 081_esign_placement_diagnostics
Revises: 080_feedback_rewards
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '081_esign_placement_diagnostics'
down_revision = '080_feedback_rewards'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('esign_ai_field_placement_runs', sa.Column('issues', postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")))
    op.add_column('esign_ai_field_placement_runs', sa.Column('analysis_diagnostics', postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")))


def downgrade() -> None:
    op.drop_column('esign_ai_field_placement_runs', 'analysis_diagnostics')
    op.drop_column('esign_ai_field_placement_runs', 'issues')
