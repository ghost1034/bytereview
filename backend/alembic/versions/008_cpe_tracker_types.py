"""
Add job_type to extraction_jobs and template_type to templates for CPE tracker

Revision ID: 008_cpe_tracker_types
Revises: 007_append_and_result_sets
Create Date: 2025-01-07
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '008_cpe_tracker_types'
down_revision = '007_append_and_result_sets'
branch_labels = None
depends_on = None


def upgrade():
    # 1) extraction_jobs: job_type column
    # Default 'extraction' for existing rows, nullable=False
    op.add_column(
        'extraction_jobs',
        sa.Column('job_type', sa.String(50), nullable=False, server_default='extraction')
    )
    # Create index for filtering by job_type
    op.create_index('ix_extraction_jobs_job_type', 'extraction_jobs', ['job_type'])
    # Optionally add a check constraint (comment out if DB doesn't support easily)
    op.create_check_constraint(
        'ck_extraction_jobs_job_type',
        'extraction_jobs',
        "job_type IN ('extraction', 'cpe')"
    )

    # 2) templates: template_type column
    # Default 'extraction' for existing rows, nullable=False
    op.add_column(
        'templates',
        sa.Column('template_type', sa.String(50), nullable=False, server_default='extraction')
    )
    # Create index for filtering by template_type
    op.create_index('ix_templates_template_type', 'templates', ['template_type'])
    # Optionally add a check constraint
    op.create_check_constraint(
        'ck_templates_template_type',
        'templates',
        "template_type IN ('extraction', 'cpe')"
    )


def downgrade():
    # templates: template_type
    op.drop_constraint('ck_templates_template_type', 'templates', type_='check')
    op.drop_index('ix_templates_template_type', table_name='templates')
    op.drop_column('templates', 'template_type')

    # extraction_jobs: job_type
    op.drop_constraint('ck_extraction_jobs_job_type', 'extraction_jobs', type_='check')
    op.drop_index('ix_extraction_jobs_job_type', table_name='extraction_jobs')
    op.drop_column('extraction_jobs', 'job_type')
