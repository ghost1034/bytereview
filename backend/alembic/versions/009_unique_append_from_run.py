"""
Add unique partial index on (job_id, append_from_run_id) to prevent duplicate append runs

Revision ID: 009_unique_append_from_run
Revises: 008_cpe_tracker_types
Create Date: 2025-01-08
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '009_unique_append_from_run'
down_revision = '008_cpe_tracker_types'
branch_labels = None
depends_on = None

def upgrade():
    # Create unique partial index: only one run can append from a given source run per job
    # This prevents duplicate "next runs" under concurrent task completions
    op.create_index(
        'ix_job_runs_unique_append_from',
        'job_runs',
        ['job_id', 'append_from_run_id'],
        unique=True,
        postgresql_where=sa.text('append_from_run_id IS NOT NULL')
    )

def downgrade():
    op.drop_index('ix_job_runs_unique_append_from', table_name='job_runs')
