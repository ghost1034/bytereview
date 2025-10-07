"""Clean up job runs migration - remove old columns

Revision ID: 005_job_runs_cleanup
Revises: 004_job_runs_additive
Create Date: 2024-01-20 11:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '005_job_runs_cleanup'
down_revision = '004_job_runs_additive'
branch_labels = None
depends_on = None


def upgrade():
    # Remove moved columns from extraction_jobs table
    op.drop_column('extraction_jobs', 'template_id')
    op.drop_column('extraction_jobs', 'status')
    op.drop_column('extraction_jobs', 'config_step')
    op.drop_column('extraction_jobs', 'tasks_total')
    op.drop_column('extraction_jobs', 'tasks_completed')
    op.drop_column('extraction_jobs', 'tasks_failed')
    op.drop_column('extraction_jobs', 'persist_data')
    op.drop_column('extraction_jobs', 'completed_at')
    
    # Remove old job_id columns from child tables
    op.drop_column('job_fields', 'job_id')
    op.drop_column('source_files', 'job_id')
    op.drop_column('extraction_tasks', 'job_id')
    op.drop_column('job_exports', 'job_id')
    op.drop_column('automation_runs', 'job_id')
    
    # Add NOT NULL constraints to job_run_id columns
    op.alter_column('job_fields', 'job_run_id', nullable=False)
    op.alter_column('source_files', 'job_run_id', nullable=False)
    op.alter_column('extraction_tasks', 'job_run_id', nullable=False)
    op.alter_column('job_exports', 'job_run_id', nullable=False)
    op.alter_column('automation_runs', 'job_run_id', nullable=False)


def downgrade():
    # Make job_run_id columns nullable again
    op.alter_column('automation_runs', 'job_run_id', nullable=True)
    op.alter_column('job_exports', 'job_run_id', nullable=True)
    op.alter_column('extraction_tasks', 'job_run_id', nullable=True)
    op.alter_column('source_files', 'job_run_id', nullable=True)
    op.alter_column('job_fields', 'job_run_id', nullable=True)
    
    # Re-add old job_id columns to child tables
    op.add_column('automation_runs', sa.Column('job_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('job_exports', sa.Column('job_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('extraction_tasks', sa.Column('job_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('source_files', sa.Column('job_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('job_fields', sa.Column('job_id', postgresql.UUID(as_uuid=True), nullable=True))
    
    # Re-add moved columns to extraction_jobs table
    op.add_column('extraction_jobs', sa.Column('completed_at', sa.TIMESTAMP(timezone=True), nullable=True))
    op.add_column('extraction_jobs', sa.Column('persist_data', sa.Boolean, nullable=False, server_default='true'))
    op.add_column('extraction_jobs', sa.Column('tasks_failed', sa.Integer, nullable=False, server_default='0'))
    op.add_column('extraction_jobs', sa.Column('tasks_completed', sa.Integer, nullable=False, server_default='0'))
    op.add_column('extraction_jobs', sa.Column('tasks_total', sa.Integer, nullable=False, server_default='0'))
    op.add_column('extraction_jobs', sa.Column('config_step', sa.String(20), nullable=False, server_default='upload'))
    op.add_column('extraction_jobs', sa.Column('status', sa.String(50), nullable=False, server_default='pending'))
    op.add_column('extraction_jobs', sa.Column('template_id', postgresql.UUID(as_uuid=True), nullable=True))
    
    # Re-add foreign key constraints
    op.create_foreign_key('fk_extraction_jobs_template_id', 'extraction_jobs', 'templates', ['template_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key('fk_automation_runs_job_id', 'automation_runs', 'extraction_jobs', ['job_id'], ['id'], ondelete='CASCADE')
    op.create_foreign_key('fk_job_exports_job_id', 'job_exports', 'extraction_jobs', ['job_id'], ['id'], ondelete='CASCADE')
    op.create_foreign_key('fk_extraction_tasks_job_id', 'extraction_tasks', 'extraction_jobs', ['job_id'], ['id'], ondelete='CASCADE')
    op.create_foreign_key('fk_source_files_job_id', 'source_files', 'extraction_jobs', ['job_id'], ['id'], ondelete='CASCADE')
    op.create_foreign_key('fk_job_fields_job_id', 'job_fields', 'extraction_jobs', ['job_id'], ['id'], ondelete='CASCADE')