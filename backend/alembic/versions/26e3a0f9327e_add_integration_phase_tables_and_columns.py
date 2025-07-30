"""add_integration_phase_tables_and_columns

Revision ID: 26e3a0f9327e
Revises: 7292d6b295c6
Create Date: 2025-07-30 13:45:54.352444

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '26e3a0f9327e'
down_revision: Union[str, Sequence[str], None] = '7292d6b295c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create new integration tables
    op.create_table('integration_accounts',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.String(length=128), nullable=False),
        sa.Column('provider', sa.String(length=30), nullable=False),
        sa.Column('scopes', sa.ARRAY(sa.Text()), nullable=False),
        sa.Column('access_token', sa.LargeBinary(), nullable=True),
        sa.Column('refresh_token', sa.LargeBinary(), nullable=True),
        sa.Column('expires_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("provider IN ('google', 'microsoft')", name='check_provider'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    
    op.create_table('job_runs',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('job_id', sa.UUID(), nullable=False),
        sa.Column('run_number', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=50), server_default='pending', nullable=False),
        sa.Column('tasks_total', sa.Integer(), server_default='0', nullable=False),
        sa.Column('tasks_completed', sa.Integer(), server_default='0', nullable=False),
        sa.Column('tasks_failed', sa.Integer(), server_default='0', nullable=False),
        sa.Column('started_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('completed_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['job_id'], ['extraction_jobs.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    
    op.create_table('automations',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.String(length=128), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('is_enabled', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('trigger_type', sa.String(length=30), nullable=False),
        sa.Column('trigger_config', sa.JSON(), nullable=False),
        sa.Column('job_id', sa.UUID(), nullable=False),
        sa.Column('export_config', sa.JSON(), nullable=False),
        sa.Column('last_fired_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['job_id'], ['extraction_jobs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    
    op.create_table('job_exports',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('run_id', sa.UUID(), nullable=False),
        sa.Column('dest_type', sa.String(length=15), nullable=False),
        sa.Column('file_type', sa.String(length=10), nullable=False),
        sa.Column('status', sa.String(length=20), server_default='pending', nullable=False),
        sa.Column('external_id', sa.Text(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("dest_type IN ('download', 'gdrive', 'gmail')", name='check_dest_type'),
        sa.CheckConstraint("file_type IN ('csv', 'xlsx')", name='check_file_type'),
        sa.ForeignKeyConstraint(['run_id'], ['job_runs.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    
    op.create_table('automation_runs',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('automation_id', sa.UUID(), nullable=False),
        sa.Column('run_id', sa.UUID(), nullable=False),
        sa.Column('status', sa.String(length=20), server_default='pending', nullable=False),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('triggered_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('completed_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['automation_id'], ['automations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['run_id'], ['job_runs.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Add new columns to existing tables
    op.add_column('source_files', sa.Column('source_type', sa.String(length=20), server_default='upload', nullable=False))
    op.add_column('source_files', sa.Column('external_id', sa.Text(), nullable=True))
    op.add_column('extraction_tasks', sa.Column('run_id', sa.UUID(), nullable=True))
    
    # Add foreign key constraint for extraction_tasks.run_id
    op.create_foreign_key('fk_extraction_tasks_run_id', 'extraction_tasks', 'job_runs', ['run_id'], ['id'], ondelete='CASCADE')
    
    # Create indexes
    op.create_index('idx_integration_accounts_user_provider', 'integration_accounts', ['user_id', 'provider'])
    
    # Drop old indexes that are no longer needed
    op.drop_index(op.f('idx_extraction_jobs_cleanup'), table_name='extraction_jobs', postgresql_where="((status)::text <> 'cancelled'::text)")
    op.drop_index(op.f('idx_extraction_jobs_config_step'), table_name='extraction_jobs')
    op.drop_index(op.f('idx_extraction_jobs_resumable'), table_name='extraction_jobs', postgresql_where="(((config_step)::text <> 'submitted'::text) OR ((status)::text = ANY ((ARRAY['in_progress'::character varying, 'partially_completed'::character varying, 'failed'::character varying])::text[])))")
    op.drop_index(op.f('idx_extraction_jobs_user_status_activity'), table_name='extraction_jobs')


def downgrade() -> None:
    """Downgrade schema."""
    # Recreate old indexes
    op.create_index(op.f('idx_extraction_jobs_user_status_activity'), 'extraction_jobs', ['user_id', 'status', sa.literal_column('last_active_at DESC')], unique=False)
    op.create_index(op.f('idx_extraction_jobs_resumable'), 'extraction_jobs', ['user_id', 'config_step', 'status'], unique=False, postgresql_where="(((config_step)::text <> 'submitted'::text) OR ((status)::text = ANY ((ARRAY['in_progress'::character varying, 'partially_completed'::character varying, 'failed'::character varying])::text[])))")
    op.create_index(op.f('idx_extraction_jobs_config_step'), 'extraction_jobs', ['config_step'], unique=False)
    op.create_index(op.f('idx_extraction_jobs_cleanup'), 'extraction_jobs', ['last_active_at', 'status', 'persist_data'], unique=False, postgresql_where="((status)::text <> 'cancelled'::text)")
    
    # Drop new indexes
    op.drop_index('idx_integration_accounts_user_provider', table_name='integration_accounts')
    
    # Drop foreign key constraint and columns from existing tables
    op.drop_constraint('fk_extraction_tasks_run_id', 'extraction_tasks', type_='foreignkey')
    op.drop_column('extraction_tasks', 'run_id')
    op.drop_column('source_files', 'external_id')
    op.drop_column('source_files', 'source_type')
    
    # Drop new tables (in reverse dependency order)
    op.drop_table('automation_runs')
    op.drop_table('job_exports')
    op.drop_table('automations')
    op.drop_table('job_runs')
    op.drop_table('integration_accounts')
