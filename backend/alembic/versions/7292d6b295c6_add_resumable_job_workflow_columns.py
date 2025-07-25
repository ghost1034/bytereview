"""Add resumable job workflow columns

Revision ID: 7292d6b295c6
Revises: b1626becc820
Create Date: 2025-07-23 11:26:54.472335

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7292d6b295c6'
down_revision: Union[str, Sequence[str], None] = 'b1626becc820'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add new columns for resumable workflow
    op.add_column('extraction_jobs', sa.Column('config_step', sa.String(20), nullable=False, server_default='upload'))
    op.add_column('extraction_jobs', sa.Column('tasks_total', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('extraction_jobs', sa.Column('tasks_completed', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('extraction_jobs', sa.Column('tasks_failed', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('extraction_jobs', sa.Column('last_active_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()))
    op.add_column('extraction_jobs', sa.Column('version', sa.Integer(), nullable=False, server_default='1'))
    
    # Migrate existing data
    # Update config_step based on current status
    op.execute("""
        UPDATE extraction_jobs 
        SET config_step = CASE 
            WHEN status = 'pending_configuration' THEN 'upload'
            ELSE 'submitted'
        END
    """)
    
    # Update status to new processing lifecycle values
    op.execute("""
        UPDATE extraction_jobs 
        SET status = CASE 
            WHEN status = 'pending_configuration' THEN 'pending'
            WHEN status = 'processing' THEN 'in_progress'
            ELSE status
        END
    """)
    
    # Add check constraints
    op.create_check_constraint(
        'chk_config_step',
        'extraction_jobs',
        "config_step IN ('upload', 'fields', 'review', 'submitted')"
    )
    
    op.create_check_constraint(
        'chk_status',
        'extraction_jobs', 
        "status IN ('pending', 'in_progress', 'partially_completed', 'completed', 'failed', 'cancelled')"
    )
    
    op.create_check_constraint(
        'chk_task_counts',
        'extraction_jobs',
        """tasks_completed >= 0 AND 
           tasks_failed >= 0 AND 
           tasks_total >= 0 AND
           (tasks_total = 0 OR tasks_completed + tasks_failed <= tasks_total + 5)"""
    )
    
    # Add optimized indexes
    op.create_index(
        'idx_extraction_jobs_user_status_activity',
        'extraction_jobs',
        ['user_id', 'status', 'last_active_at'],
        postgresql_ops={'last_active_at': 'DESC'}
    )
    
    op.create_index(
        'idx_extraction_jobs_config_step',
        'extraction_jobs',
        ['config_step']
    )
    
    op.create_index(
        'idx_extraction_jobs_resumable',
        'extraction_jobs',
        ['user_id', 'config_step', 'status'],
        postgresql_where="config_step != 'submitted' OR status IN ('in_progress', 'partially_completed', 'failed')"
    )
    
    op.create_index(
        'idx_extraction_jobs_cleanup',
        'extraction_jobs',
        ['last_active_at', 'status', 'persist_data'],
        postgresql_where="status != 'cancelled'"
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Drop indexes
    op.drop_index('idx_extraction_jobs_cleanup', 'extraction_jobs')
    op.drop_index('idx_extraction_jobs_resumable', 'extraction_jobs')
    op.drop_index('idx_extraction_jobs_config_step', 'extraction_jobs')
    op.drop_index('idx_extraction_jobs_user_status_activity', 'extraction_jobs')
    
    # Drop check constraints
    op.drop_constraint('chk_task_counts', 'extraction_jobs')
    op.drop_constraint('chk_status', 'extraction_jobs')
    op.drop_constraint('chk_config_step', 'extraction_jobs')
    
    # Revert status values
    op.execute("""
        UPDATE extraction_jobs 
        SET status = CASE 
            WHEN status = 'pending' AND config_step != 'submitted' THEN 'pending_configuration'
            WHEN status = 'in_progress' THEN 'processing'
            ELSE status
        END
    """)
    
    # Drop new columns
    op.drop_column('extraction_jobs', 'version')
    op.drop_column('extraction_jobs', 'last_active_at')
    op.drop_column('extraction_jobs', 'tasks_failed')
    op.drop_column('extraction_jobs', 'tasks_completed')
    op.drop_column('extraction_jobs', 'tasks_total')
    op.drop_column('extraction_jobs', 'config_step')
