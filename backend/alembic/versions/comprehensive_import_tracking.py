"""comprehensive import tracking

Revision ID: comprehensive_tracking
Revises: add_imports_successful
Create Date: 2025-08-06

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'comprehensive_tracking'
down_revision = 'add_imports_successful'
branch_labels = None
depends_on = None


def upgrade():
    # Rename imports_ready to imports_processed
    op.alter_column('automation_runs', 'imports_ready', new_column_name='imports_processed')
    
    # Add imports_processing_failed column
    op.add_column('automation_runs', sa.Column('imports_processing_failed', sa.Integer(), nullable=True))


def downgrade():
    # Remove imports_processing_failed column
    op.drop_column('automation_runs', 'imports_processing_failed')
    
    # Rename imports_processed back to imports_ready
    op.alter_column('automation_runs', 'imports_processed', new_column_name='imports_ready')