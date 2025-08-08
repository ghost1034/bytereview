"""Add page_count column to source_files

Revision ID: add_page_count_to_source_files
Revises: add_subscription_billing_tables
Create Date: 2024-01-15 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_page_count_to_source_files'
down_revision = 'add_subscription_billing_tables'
branch_labels = None
depends_on = None


def upgrade():
    # Add page_count column to source_files table
    op.add_column('source_files', sa.Column('page_count', sa.Integer(), nullable=True))


def downgrade():
    # Remove page_count column from source_files table
    op.drop_column('source_files', 'page_count')