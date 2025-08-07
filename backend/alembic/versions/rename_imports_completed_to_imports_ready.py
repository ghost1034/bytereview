"""rename imports_completed to imports_ready

Revision ID: rename_imports_ready
Revises: add_import_tracking
Create Date: 2025-08-06

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'rename_imports_ready'
down_revision = 'add_import_tracking'
branch_labels = None
depends_on = None


def upgrade():
    # Rename imports_completed column to imports_ready
    op.alter_column('automation_runs', 'imports_completed', new_column_name='imports_ready')


def downgrade():
    # Rename imports_ready column back to imports_completed
    op.alter_column('automation_runs', 'imports_ready', new_column_name='imports_completed')