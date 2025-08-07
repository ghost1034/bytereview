"""Add last_history_id to integration_accounts

Revision ID: f1a2b3c4d5e6
Revises: 5389ca72eb8a
Create Date: 2025-08-04 11:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f1a2b3c4d5e6'
down_revision = '5389ca72eb8a'
branch_labels = None
depends_on = None


def upgrade():
    # Add last_history_id column to integration_accounts table
    op.add_column('integration_accounts', sa.Column('last_history_id', sa.String(50), nullable=True))


def downgrade():
    # Remove last_history_id column from integration_accounts table
    op.drop_column('integration_accounts', 'last_history_id')