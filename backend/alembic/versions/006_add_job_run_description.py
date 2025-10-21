"""
Add description column to job_runs

Revision ID: 006_add_job_run_description
Revises: 005_job_runs_cleanup
Create Date: 2025-10-21
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '006_add_job_run_description'
down_revision = '005_job_runs_cleanup'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('job_runs', sa.Column('description', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('job_runs', 'description')
