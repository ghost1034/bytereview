"""Add processing_mode to automations table

Revision ID: 003_add_automation_processing_mode
Revises: 002_central_mailbox_support
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '003_automation_processing'
down_revision = '002_central_mailbox_support'
branch_labels = None
depends_on = None

def upgrade():
    # Add processing_mode column to automations table
    op.add_column('automations', sa.Column('processing_mode', sa.String(50), nullable=False, server_default='individual'))

def downgrade():
    # Remove the column
    op.drop_column('automations', 'processing_mode')