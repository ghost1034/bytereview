"""Add lifetime PBC evidence-storage allowances to subscription plans.

Revision ID: 077_pbc_storage_quotas
Revises: 076_update_plan_overage_rates
"""

from alembic import op
import sqlalchemy as sa


revision = "077_pbc_storage_quotas"
down_revision = "076_update_plan_overage_rates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "subscription_plans",
        sa.Column("pbc_storage_bytes_included", sa.BigInteger(), nullable=False, server_default="0"),
    )
    op.execute(
        """
        UPDATE subscription_plans
        SET pbc_storage_bytes_included = CASE code
                WHEN 'free' THEN 20 * 1024 * 1024
                WHEN 'basic' THEN 100 * 1024 * 1024
                WHEN 'pro' THEN 1024 * 1024 * 1024
                ELSE 0
            END,
            updated_at = CURRENT_TIMESTAMP
        """
    )


def downgrade() -> None:
    op.drop_column("subscription_plans", "pbc_storage_bytes_included")
