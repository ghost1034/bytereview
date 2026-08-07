"""Make Hosted Claw available to every user by default.

Revision ID: 067_hosted_claw_public_access
Revises: 066_pbc_module
"""

from alembic import op
import sqlalchemy as sa


revision = "067_hosted_claw_public_access"
down_revision = "066_pbc_module"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "hosted_claw_entitlements",
        "enabled",
        existing_type=sa.Boolean(),
        server_default=sa.true(),
        existing_nullable=False,
    )
    op.execute(
        """
        INSERT INTO hosted_claw_entitlements (
            user_id,
            enabled,
            allowed_products,
            allowed_model_aliases,
            monthly_budget_usd
        )
        SELECT
            users.id,
            true,
            '["accountingclaw"]'::jsonb,
            '["claw-default"]'::jsonb,
            0
        FROM users
        WHERE NOT EXISTS (
            SELECT 1
            FROM hosted_claw_entitlements
            WHERE hosted_claw_entitlements.user_id = users.id
        )
        """
    )
    op.execute(
        """
        UPDATE hosted_claw_entitlements
        SET
            enabled = true,
            revoked_at = NULL,
            allowed_products = CASE
                WHEN jsonb_array_length(allowed_products) = 0 THEN '["accountingclaw"]'::jsonb
                ELSE allowed_products
            END,
            allowed_model_aliases = CASE
                WHEN jsonb_array_length(allowed_model_aliases) = 0 THEN '["claw-default"]'::jsonb
                ELSE allowed_model_aliases
            END
        """
    )


def downgrade() -> None:
    op.alter_column(
        "hosted_claw_entitlements",
        "enabled",
        existing_type=sa.Boolean(),
        server_default=sa.false(),
        existing_nullable=False,
    )
