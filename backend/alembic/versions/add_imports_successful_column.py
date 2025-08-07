"""add imports_successful column

Revision ID: add_imports_successful
Revises: rename_imports_ready
Create Date: 2025-08-06

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_imports_successful'
down_revision = 'rename_imports_ready'
branch_labels = None
depends_on = None


def upgrade():
    # Add imports_successful column to automation_runs table
    op.add_column('automation_runs', sa.Column('imports_successful', sa.Integer(), nullable=True))


def downgrade():
    # Remove imports_successful column from automation_runs table
    op.drop_column('automation_runs', 'imports_successful')