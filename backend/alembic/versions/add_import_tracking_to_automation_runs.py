"""add import tracking to automation runs

Revision ID: add_import_tracking
Revises: 
Create Date: 2025-01-08

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_import_tracking'
down_revision = 'd1988184ff7e'  # Update this to the latest migration
branch_labels = None
depends_on = None


def upgrade():
    # Add import tracking columns to automation_runs table
    op.add_column('automation_runs', sa.Column('imports_total', sa.Integer(), nullable=True))
    op.add_column('automation_runs', sa.Column('imports_completed', sa.Integer(), nullable=True))
    op.add_column('automation_runs', sa.Column('imports_failed', sa.Integer(), nullable=True))


def downgrade():
    # Remove import tracking columns from automation_runs table
    op.drop_column('automation_runs', 'imports_failed')
    op.drop_column('automation_runs', 'imports_completed')
    op.drop_column('automation_runs', 'imports_total')