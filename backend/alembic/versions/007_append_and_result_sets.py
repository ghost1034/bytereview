"""
Add append references on job runs, result set indexing, and automation append flag

Revision ID: 007_append_and_result_sets
Revises: 006_add_job_run_description
Create Date: 2025-11-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '007_append_and_result_sets'
down_revision = '006_add_job_run_description'
branch_labels = None
depends_on = None

def upgrade():
    # 1) job_runs: append_from_run_id
    op.add_column('job_runs', sa.Column('append_from_run_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        'fk_job_runs_append_from_run_id_job_runs',
        'job_runs', 'job_runs',
        ['append_from_run_id'], ['id'],
        ondelete='SET NULL'
    )

    # 2) extraction_tasks: result_set_index (default 0, backfill, then not null)
    op.add_column('extraction_tasks', sa.Column('result_set_index', sa.Integer(), nullable=True))
    # backfill existing rows to 0
    op.execute('UPDATE extraction_tasks SET result_set_index = 0 WHERE result_set_index IS NULL')
    # set NOT NULL and default
    op.alter_column('extraction_tasks', 'result_set_index', existing_type=sa.Integer(), nullable=False)
    op.create_index('ix_extraction_tasks_result_set_index', 'extraction_tasks', ['result_set_index'])

    # 3) automations: append_results boolean default false
    op.add_column('automations', sa.Column('append_results', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    # drop server_default after set (optional)
    op.alter_column('automations', 'append_results', server_default=None)


def downgrade():
    # automations: append_results
    op.drop_column('automations', 'append_results')

    # extraction_tasks: result_set_index
    op.drop_index('ix_extraction_tasks_result_set_index', table_name='extraction_tasks')
    op.drop_column('extraction_tasks', 'result_set_index')

    # job_runs: append_from_run_id
    op.drop_constraint('fk_job_runs_append_from_run_id_job_runs', 'job_runs', type_='foreignkey')
    op.drop_column('job_runs', 'append_from_run_id')
