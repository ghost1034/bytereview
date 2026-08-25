"""Update Basic and Pro overage rates.

Token overage values remain 25 and 10 cents, but application and Stripe
pricing now interpret them per 10,000 tokens instead of per 1,000 tokens.

Revision ID: 076_update_plan_overage_rates
Revises: 075_per_user_unit_billing
"""

from alembic import op


revision = "076_update_plan_overage_rates"
down_revision = "075_per_user_unit_billing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE subscription_plans
        SET overage_cents = CASE code
                WHEN 'basic' THEN 15
                WHEN 'pro' THEN 5
                ELSE overage_cents
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE code IN ('basic', 'pro')
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE subscription_plans
        SET overage_cents = CASE code
                WHEN 'basic' THEN 50
                WHEN 'pro' THEN 20
                ELSE overage_cents
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE code IN ('basic', 'pro')
        """
    )
