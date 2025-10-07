"""Add job_runs table and prepare for transition

Revision ID: 004_job_runs_additive
Revises: 003_automation_processing
Create Date: 2024-01-20 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '004_job_runs_additive'
down_revision = '003_automation_processing'
branch_labels = None
depends_on = None




def backfill_job_runs():
    """Backfill job_runs table and update child table references"""
    # Get database connection
    connection = op.get_bind()
    
    # For each extraction job, create an initial job run and migrate data
    jobs_result = connection.execute(sa.text("""
        SELECT id, template_id, status, config_step, tasks_total, tasks_completed, tasks_failed, 
               persist_data, created_at, completed_at, last_active_at
        FROM extraction_jobs
        ORDER BY created_at
    """))
    
    for job_row in jobs_result:
        job_id = job_row.id
        
        # Create job run with migrated data
        run_result = connection.execute(sa.text("""
            INSERT INTO job_runs (job_id, template_id, status, config_step, tasks_total, 
                                tasks_completed, tasks_failed, persist_data, created_at, 
                                completed_at, last_active_at)
            VALUES (:job_id, :template_id, :status, :config_step, :tasks_total, 
                    :tasks_completed, :tasks_failed, :persist_data, :created_at, 
                    :completed_at, :last_active_at)
            RETURNING id
        """), {
            'job_id': job_id,
            'template_id': job_row.template_id,
            'status': job_row.status,
            'config_step': job_row.config_step,
            'tasks_total': job_row.tasks_total,
            'tasks_completed': job_row.tasks_completed,
            'tasks_failed': job_row.tasks_failed,
            'persist_data': job_row.persist_data,
            'created_at': job_row.created_at,
            'completed_at': job_row.completed_at,
            'last_active_at': job_row.last_active_at,
        })
        
        run_id = run_result.fetchone().id
        
        # Update child tables to reference the new job run
        connection.execute(sa.text("""
            UPDATE job_fields SET job_run_id = :run_id WHERE job_id = :job_id
        """), {'run_id': run_id, 'job_id': job_id})
        
        connection.execute(sa.text("""
            UPDATE source_files SET job_run_id = :run_id WHERE job_id = :job_id
        """), {'run_id': run_id, 'job_id': job_id})
        
        connection.execute(sa.text("""
            UPDATE extraction_tasks SET job_run_id = :run_id WHERE job_id = :job_id
        """), {'run_id': run_id, 'job_id': job_id})
        
        connection.execute(sa.text("""
            UPDATE job_exports SET job_run_id = :run_id WHERE job_id = :job_id
        """), {'run_id': run_id, 'job_id': job_id})
        
        connection.execute(sa.text("""
            UPDATE automation_runs SET job_run_id = :run_id WHERE job_id = :job_id
        """), {'run_id': run_id, 'job_id': job_id})


def upgrade():
    # Create tables and columns first
    create_job_runs_schema()
    
    # Then backfill data
    backfill_job_runs()


def create_job_runs_schema():
    """Create the schema changes without data migration"""
    # Create job_runs table
    op.create_table('job_runs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('job_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('extraction_jobs.id', ondelete='CASCADE'), nullable=False),
        sa.Column('template_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('templates.id', ondelete='SET NULL'), nullable=True),
        sa.Column('status', sa.String(50), nullable=False, server_default='pending'),
        sa.Column('config_step', sa.String(20), nullable=False, server_default='upload'),
        sa.Column('tasks_total', sa.Integer, nullable=False, server_default='0'),
        sa.Column('tasks_completed', sa.Integer, nullable=False, server_default='0'),
        sa.Column('tasks_failed', sa.Integer, nullable=False, server_default='0'),
        sa.Column('persist_data', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('last_active_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('completed_at', sa.TIMESTAMP(timezone=True), nullable=True),
    )
    
    # Add helpful indexes
    op.create_index('ix_job_runs_job_id_created_at', 'job_runs', ['job_id', sa.text('created_at DESC')])
    op.create_index('ix_job_runs_status', 'job_runs', ['status'])
    
    # Add nullable job_run_id columns to existing tables
    op.add_column('job_fields', sa.Column('job_run_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('source_files', sa.Column('job_run_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('extraction_tasks', sa.Column('job_run_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('job_exports', sa.Column('job_run_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('automation_runs', sa.Column('job_run_id', postgresql.UUID(as_uuid=True), nullable=True))
    
    # Add foreign key constraints
    op.create_foreign_key('fk_job_fields_job_run_id', 'job_fields', 'job_runs', ['job_run_id'], ['id'], ondelete='CASCADE')
    op.create_foreign_key('fk_source_files_job_run_id', 'source_files', 'job_runs', ['job_run_id'], ['id'], ondelete='CASCADE')
    op.create_foreign_key('fk_extraction_tasks_job_run_id', 'extraction_tasks', 'job_runs', ['job_run_id'], ['id'], ondelete='CASCADE')
    op.create_foreign_key('fk_job_exports_job_run_id', 'job_exports', 'job_runs', ['job_run_id'], ['id'], ondelete='CASCADE')
    op.create_foreign_key('fk_automation_runs_job_run_id', 'automation_runs', 'job_runs', ['job_run_id'], ['id'], ondelete='CASCADE')
    
    # Add indexes for the new foreign keys
    op.create_index('ix_job_fields_job_run_id', 'job_fields', ['job_run_id'])
    op.create_index('ix_source_files_job_run_id', 'source_files', ['job_run_id'])
    op.create_index('ix_extraction_tasks_job_run_id', 'extraction_tasks', ['job_run_id'])
    op.create_index('ix_job_exports_job_run_id', 'job_exports', ['job_run_id'])
    op.create_index('ix_automation_runs_job_run_id', 'automation_runs', ['job_run_id'])


def downgrade():
    # Drop indexes
    op.drop_index('ix_automation_runs_job_run_id', 'automation_runs')
    op.drop_index('ix_job_exports_job_run_id', 'job_exports')
    op.drop_index('ix_extraction_tasks_job_run_id', 'extraction_tasks')
    op.drop_index('ix_source_files_job_run_id', 'source_files')
    op.drop_index('ix_job_fields_job_run_id', 'job_fields')
    
    # Drop foreign key constraints
    op.drop_constraint('fk_automation_runs_job_run_id', 'automation_runs', type_='foreignkey')
    op.drop_constraint('fk_job_exports_job_run_id', 'job_exports', type_='foreignkey')
    op.drop_constraint('fk_extraction_tasks_job_run_id', 'extraction_tasks', type_='foreignkey')
    op.drop_constraint('fk_source_files_job_run_id', 'source_files', type_='foreignkey')
    op.drop_constraint('fk_job_fields_job_run_id', 'job_fields', type_='foreignkey')
    
    # Drop job_run_id columns
    op.drop_column('automation_runs', 'job_run_id')
    op.drop_column('job_exports', 'job_run_id')
    op.drop_column('extraction_tasks', 'job_run_id')
    op.drop_column('source_files', 'job_run_id')
    op.drop_column('job_fields', 'job_run_id')
    
    # Drop job_runs table
    op.drop_index('ix_job_runs_status', 'job_runs')
    op.drop_index('ix_job_runs_job_id_created_at', 'job_runs')
    op.drop_table('job_runs')