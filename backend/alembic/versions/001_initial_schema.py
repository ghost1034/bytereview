"""Initial schema - all tables

Revision ID: 001_initial_schema
Revises: 
Create Date: 2025-08-16

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '001_initial_schema'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create all database tables."""

    # users
    op.create_table(
        'users',
        sa.Column('id', sa.String(length=128), primary_key=True),
        sa.Column('email', sa.String(length=255), nullable=False, unique=True),
        sa.Column('display_name', sa.String(length=255), nullable=True),
        sa.Column('photo_url', sa.Text(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
    )

    # data_types
    op.create_table(
        'data_types',
        sa.Column('id', sa.String(length=50), primary_key=True),
        sa.Column('display_name', sa.String(length=100), nullable=False),
        sa.Column('base_json_type', sa.String(length=20), nullable=False),
        sa.Column('json_format', sa.String(length=50), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('display_order', sa.Integer(), nullable=False, server_default=sa.text('0')),
    )

    # system_prompts
    op.create_table(
        'system_prompts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(length=255), nullable=False, unique=True),
        sa.Column('template_text', sa.Text(), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False, server_default=sa.text('1')),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
    )

    # templates
    op.create_table(
        'templates',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', sa.String(length=128), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_public', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
    )

    # template_fields
    op.create_table(
        'template_fields',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('template_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('templates.id', ondelete='CASCADE'), nullable=False),
        sa.Column('field_name', sa.String(length=100), nullable=False),
        sa.Column('data_type_id', sa.String(length=50), sa.ForeignKey('data_types.id'), nullable=False),
        sa.Column('ai_prompt', sa.Text(), nullable=False),
        sa.Column('display_order', sa.Integer(), nullable=False, server_default=sa.text('0')),
    )

    # extraction_jobs
    op.create_table(
        'extraction_jobs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(length=255), nullable=True),
        sa.Column('user_id', sa.String(length=128), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('template_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('templates.id', ondelete='SET NULL'), nullable=True),
        sa.Column('config_step', sa.String(length=20), nullable=False, server_default=sa.text("'upload'")),
        sa.Column('status', sa.String(length=50), nullable=False, server_default=sa.text("'pending'")),
        sa.Column('tasks_total', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('tasks_completed', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('tasks_failed', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('last_active_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('version', sa.Integer(), nullable=False, server_default=sa.text('1')),
        sa.Column('persist_data', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('completed_at', sa.TIMESTAMP(timezone=True), nullable=True),
    )

    # job_fields
    op.create_table(
        'job_fields',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('job_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('extraction_jobs.id', ondelete='CASCADE'), nullable=False),
        sa.Column('field_name', sa.String(length=100), nullable=False),
        sa.Column('data_type_id', sa.String(length=50), sa.ForeignKey('data_types.id'), nullable=False),
        sa.Column('ai_prompt', sa.Text(), nullable=False),
        sa.Column('display_order', sa.Integer(), nullable=False, server_default=sa.text('0')),
    )

    # source_files
    op.create_table(
        'source_files',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('job_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('extraction_jobs.id', ondelete='CASCADE'), nullable=False),
        sa.Column('original_filename', sa.Text(), nullable=False),
        sa.Column('original_path', sa.Text(), nullable=False),
        sa.Column('gcs_object_name', sa.Text(), nullable=False, unique=True),
        sa.Column('file_type', sa.String(length=100), nullable=False),
        sa.Column('file_size_bytes', sa.BigInteger(), nullable=False),
        sa.Column('page_count', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False, server_default=sa.text("'uploading'")),
        sa.Column('source_type', sa.String(length=20), nullable=False, server_default=sa.text("'upload'")),
        sa.Column('external_id', sa.Text(), nullable=True),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
    )

    # extraction_tasks
    op.create_table(
        'extraction_tasks',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('job_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('extraction_jobs.id', ondelete='CASCADE'), nullable=False),
        sa.Column('processing_mode', sa.String(length=50), nullable=False, server_default=sa.text("'individual'")),
        sa.Column('status', sa.String(length=50), nullable=False, server_default=sa.text("'pending'")),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('processed_at', sa.TIMESTAMP(timezone=True), nullable=True),
    )

    # source_files_to_tasks (association)
    op.create_table(
        'source_files_to_tasks',
        sa.Column('source_file_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('source_files.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('task_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('extraction_tasks.id', ondelete='CASCADE'), primary_key=True),
    )

    # extraction_results
    op.create_table(
        'extraction_results',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('task_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('extraction_tasks.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('extracted_data', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('processed_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
    )

    # integration_accounts
    op.create_table(
        'integration_accounts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', sa.String(length=128), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('provider', sa.String(length=30), nullable=False),
        sa.Column('scopes', postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column('access_token', sa.LargeBinary(), nullable=True),
        sa.Column('refresh_token', sa.LargeBinary(), nullable=True),
        sa.Column('expires_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('last_history_id', sa.String(length=50), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.CheckConstraint("provider IN ('google', 'microsoft')", name='check_provider'),
    )

    # job_exports
    op.create_table(
        'job_exports',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('job_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('extraction_jobs.id', ondelete='CASCADE'), nullable=False),
        sa.Column('dest_type', sa.String(length=15), nullable=False),
        sa.Column('file_type', sa.String(length=10), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, server_default=sa.text("'pending'")),
        sa.Column('external_id', sa.Text(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.CheckConstraint("dest_type IN ('download', 'gdrive', 'gmail')", name='check_dest_type'),
        sa.CheckConstraint("file_type IN ('csv', 'xlsx')", name='check_file_type'),
    )

    # automations
    op.create_table(
        'automations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', sa.String(length=128), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('is_enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('trigger_type', sa.String(length=30), nullable=False),
        sa.Column('trigger_config', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('job_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('extraction_jobs.id', ondelete='CASCADE'), nullable=False),
        sa.Column('dest_type', sa.String(length=30), nullable=True),
        sa.Column('export_config', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
    )

    # automation_runs
    op.create_table(
        'automation_runs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('automation_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('automations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('job_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('extraction_jobs.id', ondelete='CASCADE'), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, server_default=sa.text("'pending'")),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('imports_total', sa.Integer(), nullable=True),
        sa.Column('imports_successful', sa.Integer(), nullable=True),
        sa.Column('imports_failed', sa.Integer(), nullable=True),
        sa.Column('imports_processed', sa.Integer(), nullable=True),
        sa.Column('imports_processing_failed', sa.Integer(), nullable=True),
        sa.Column('triggered_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('completed_at', sa.TIMESTAMP(timezone=True), nullable=True),
    )

    # automation_processed_messages
    op.create_table(
        'automation_processed_messages',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('automation_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('automations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('message_id', sa.String(length=255), nullable=False),
        sa.Column('processed_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.CheckConstraint(
            "automation_id IS NOT NULL AND message_id IS NOT NULL",
            name='check_automation_message_required'
        ),
    )

    # subscription_plans
    op.create_table(
        'subscription_plans',
        sa.Column('code', sa.Text(), primary_key=True),
        sa.Column('display_name', sa.Text(), nullable=False),
        sa.Column('pages_included', sa.Integer(), nullable=False),
        sa.Column('automations_limit', sa.Integer(), nullable=False),
        sa.Column('overage_cents', sa.Integer(), nullable=False),
        sa.Column('stripe_product_id', sa.Text(), nullable=True),
        sa.Column('stripe_price_recurring_id', sa.Text(), nullable=True),
        sa.Column('stripe_price_metered_id', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
    )

    # billing_accounts
    op.create_table(
        'billing_accounts',
        sa.Column('user_id', sa.String(length=128), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('plan_code', sa.Text(), sa.ForeignKey('subscription_plans.code'), nullable=False),
        sa.Column('stripe_customer_id', sa.Text(), nullable=True),
        sa.Column('stripe_subscription_id', sa.Text(), nullable=True),
        sa.Column('current_period_start', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('current_period_end', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('status', sa.Text(), nullable=False, server_default=sa.text("'active'")),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
    )

    # usage_events
    op.create_table(
        'usage_events',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', sa.String(length=128), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('occurred_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('source', sa.Text(), nullable=False),
        sa.Column('task_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('extraction_tasks.id', ondelete='SET NULL'), nullable=True),
        sa.Column('pages', sa.Integer(), nullable=False),
        sa.Column('stripe_reported', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('stripe_record_id', sa.Text(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.CheckConstraint('pages >= 0', name='check_pages_non_negative'),
    )

    # usage_counters
    op.create_table(
        'usage_counters',
        sa.Column('user_id', sa.String(length=128), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('period_start', sa.TIMESTAMP(timezone=True), primary_key=True),
        sa.Column('period_end', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('pages_total', sa.Integer(), nullable=False, server_default=sa.text('0')),
    )


def downgrade() -> None:
    """Drop all database tables (reverse dependency order)."""

    op.drop_table('usage_counters')
    op.drop_table('usage_events')
    op.drop_table('billing_accounts')
    op.drop_table('subscription_plans')
    op.drop_table('automation_processed_messages')
    op.drop_table('automation_runs')
    op.drop_table('automations')
    op.drop_table('job_exports')
    op.drop_table('integration_accounts')
    op.drop_table('extraction_results')
    op.drop_table('source_files_to_tasks')
    op.drop_table('extraction_tasks')
    op.drop_table('source_files')
    op.drop_table('job_fields')
    op.drop_table('extraction_jobs')
    op.drop_table('template_fields')
    op.drop_table('templates')
    op.drop_table('system_prompts')
    op.drop_table('data_types')
    op.drop_table('users')
