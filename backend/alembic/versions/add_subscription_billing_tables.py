"""Add subscription billing tables

Revision ID: add_subscription_billing_tables
Revises: rename_imports_completed_to_imports_ready
Create Date: 2024-01-15 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_subscription_billing_tables'
down_revision = 'rename_imports_ready'
branch_labels = None
depends_on = None


def upgrade():
    # Create subscription_plans table
    op.create_table('subscription_plans',
        sa.Column('code', sa.Text(), nullable=False),
        sa.Column('display_name', sa.Text(), nullable=False),
        sa.Column('pages_included', sa.Integer(), nullable=False),
        sa.Column('automations_limit', sa.Integer(), nullable=False),
        sa.Column('overage_cents', sa.Integer(), nullable=False),
        sa.Column('stripe_product_id', sa.Text(), nullable=True),
        sa.Column('stripe_price_recurring_id', sa.Text(), nullable=True),
        sa.Column('stripe_price_metered_id', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('code')
    )

    # Create billing_accounts table
    op.create_table('billing_accounts',
        sa.Column('user_id', sa.String(128), nullable=False),
        sa.Column('plan_code', sa.Text(), nullable=False),
        sa.Column('stripe_customer_id', sa.Text(), nullable=True),
        sa.Column('stripe_subscription_id', sa.Text(), nullable=True),
        sa.Column('current_period_start', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('current_period_end', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('status', sa.Text(), nullable=False, server_default=sa.text("'active'")),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['plan_code'], ['subscription_plans.code'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id')
    )

    # Create usage_events table
    op.create_table('usage_events',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', sa.String(128), nullable=False),
        sa.Column('occurred_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('source', sa.Text(), nullable=False),
        sa.Column('task_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('pages', sa.Integer(), nullable=False),
        sa.Column('stripe_reported', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('stripe_record_id', sa.Text(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.CheckConstraint('pages >= 0', name='check_pages_non_negative'),
        sa.ForeignKeyConstraint(['task_id'], ['extraction_tasks.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # Create usage_counters table
    op.create_table('usage_counters',
        sa.Column('user_id', sa.String(128), nullable=False),
        sa.Column('period_start', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('period_end', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('pages_total', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id', 'period_start')
    )

    # Create billing view
    op.execute("""
        CREATE VIEW v_billing_effective AS
        SELECT ba.user_id,
               ba.plan_code,
               ba.current_period_start,
               ba.current_period_end,
               ba.status,
               ba.stripe_customer_id,
               ba.stripe_subscription_id,
               sp.display_name as plan_display_name,
               sp.pages_included,
               sp.automations_limit,
               sp.overage_cents
          FROM billing_accounts ba
          JOIN subscription_plans sp ON sp.code = ba.plan_code;
    """)

    # Insert seed data for plans
    op.execute("""
        INSERT INTO subscription_plans
        (code, display_name, pages_included, automations_limit, overage_cents, sort_order)
        VALUES
        ('free', 'Free', 100, 0, 0, 1),
        ('basic', 'Basic', 500, 5, 50, 2),
        ('pro', 'Pro', 5000, 50, 20, 3);
    """)


def downgrade():
    # Drop view first
    op.execute("DROP VIEW IF EXISTS v_billing_effective;")
    
    # Drop tables in reverse order
    op.drop_table('usage_counters')
    op.drop_table('usage_events')
    op.drop_table('billing_accounts')
    op.drop_table('subscription_plans')