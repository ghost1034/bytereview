"""Durable single-request inference and recoverable local processing.

Revision ID: 082_esign_single_request
Revises: 081_esign_placement_diagnostics
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '082_esign_single_request'
down_revision = '081_esign_placement_diagnostics'
branch_labels = None
depends_on = None


def upgrade() -> None:
    for column in (
        sa.Column('inference_attempted_at', sa.TIMESTAMP(timezone=True)),
        sa.Column('model_response', postgresql.JSONB()),
        sa.Column('processing_token', postgresql.UUID(as_uuid=True)),
        sa.Column('processing_deadline', sa.TIMESTAMP(timezone=True)),
        sa.Column('processing_attempts', sa.Integer(), nullable=False, server_default='0'),
    ):
        op.add_column('esign_ai_field_placement_runs', column)


def downgrade() -> None:
    for name in ('processing_attempts', 'processing_deadline', 'processing_token', 'model_response', 'inference_attempted_at'):
        op.drop_column('esign_ai_field_placement_runs', name)
