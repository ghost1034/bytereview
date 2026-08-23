"""Add independent per-user page and token billing units.

Historical usage stays classified as pages, including Analytics rows that
stored provider token metadata. This intentionally prevents re-billing old
token activity under the new token meter.

Revision ID: 075_per_user_unit_billing
Revises: 074_shared_firm_clients
"""

from alembic import op
import sqlalchemy as sa


revision = "075_per_user_unit_billing"
down_revision = "074_shared_firm_clients"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("subscription_plans", sa.Column("tokens_included", sa.BigInteger(), nullable=False, server_default="0"))
    op.add_column("subscription_plans", sa.Column("token_overage_cents", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("subscription_plans", sa.Column("stripe_price_token_metered_id", sa.Text(), nullable=True))
    op.add_column("billing_accounts", sa.Column("token_billing_effective_at", sa.TIMESTAMP(timezone=True), nullable=True))

    op.execute("UPDATE subscription_plans SET tokens_included = CASE code WHEN 'free' THEN 200000 WHEN 'basic' THEN 1000000 WHEN 'pro' THEN 10000000 ELSE 0 END")
    op.execute("UPDATE subscription_plans SET token_overage_cents = CASE code WHEN 'basic' THEN 25 WHEN 'pro' THEN 10 ELSE 0 END")
    # Accounts present at rollout shadow-track until their next period. New
    # accounts are initialized as effective immediately by BillingService.
    op.execute("UPDATE billing_accounts SET token_billing_effective_at = COALESCE(current_period_end, CURRENT_TIMESTAMP)")

    op.add_column("usage_events", sa.Column("product", sa.Text(), nullable=False, server_default="uda"))
    op.add_column("usage_events", sa.Column("unit", sa.Text(), nullable=False, server_default="page"))
    op.add_column("usage_events", sa.Column("quantity", sa.BigInteger(), nullable=False, server_default="0"))
    op.add_column("usage_events", sa.Column("operation_id", sa.Text(), nullable=True))
    op.add_column("usage_events", sa.Column("stripe_status", sa.Text(), nullable=False, server_default="non_billable"))
    op.add_column("usage_events", sa.Column("stripe_last_error", sa.Text(), nullable=True))

    op.execute(
        """
        UPDATE usage_events
        SET product = CASE
                WHEN source LIKE 'analytics_%' THEN 'analytics'
                WHEN source LIKE 'pbc_%' THEN 'pbc'
                WHEN source LIKE 'tasklytic_%' THEN 'tasklytic'
                WHEN source LIKE 'inkwise_%' THEN 'inkwise'
                WHEN source LIKE 'form_fill%' THEN 'form_fill'
                WHEN source LIKE 'esign_%' THEN 'esign'
                ELSE 'uda'
            END,
            unit = 'page',
            quantity = pages,
            operation_id = COALESCE(
                task_id::text,
                inkwise_ingestion_id::text,
                form_fill_run_id::text,
                esign_ai_field_placement_run_id::text,
                id::text
            ),
            stripe_status = CASE WHEN stripe_reported THEN 'reported' ELSE 'non_billable' END
        """
    )
    # Preserve every legacy row even if an old race created duplicate events.
    # The first row keeps the canonical operation key so future retries remain
    # idempotent; later historical duplicates receive stable unique suffixes.
    op.execute(
        """
        WITH ranked AS (
            SELECT
                id,
                COALESCE(
                    task_id::text,
                    inkwise_ingestion_id::text,
                    form_fill_run_id::text,
                    esign_ai_field_placement_run_id::text,
                    id::text
                ) AS base_operation_id,
                ROW_NUMBER() OVER (
                    PARTITION BY
                        user_id,
                        product,
                        source,
                        unit,
                        COALESCE(
                            task_id::text,
                            inkwise_ingestion_id::text,
                            form_fill_run_id::text,
                            esign_ai_field_placement_run_id::text,
                            id::text
                        )
                    ORDER BY occurred_at, id
                ) AS duplicate_number
            FROM usage_events
        )
        UPDATE usage_events AS event
        SET operation_id = CASE
            WHEN ranked.duplicate_number = 1 THEN ranked.base_operation_id
            ELSE ranked.base_operation_id || ':historical:' || event.id::text
        END
        FROM ranked
        WHERE event.id = ranked.id
        """
    )
    op.alter_column("usage_events", "operation_id", nullable=False)
    op.create_check_constraint("check_usage_quantity_non_negative", "usage_events", "quantity >= 0")
    op.create_check_constraint("check_usage_unit", "usage_events", "unit IN ('page', 'token')")
    op.create_check_constraint(
        "check_usage_stripe_status",
        "usage_events",
        "stripe_status IN ('non_billable', 'shadow', 'pending', 'reported', 'failed')",
    )
    op.create_index(
        "uq_usage_events_operation_unit",
        "usage_events",
        ["user_id", "product", "source", "operation_id", "unit"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_usage_events_operation_unit", table_name="usage_events")
    op.drop_constraint("check_usage_stripe_status", "usage_events", type_="check")
    op.drop_constraint("check_usage_unit", "usage_events", type_="check")
    op.drop_constraint("check_usage_quantity_non_negative", "usage_events", type_="check")
    op.drop_column("usage_events", "stripe_last_error")
    op.drop_column("usage_events", "stripe_status")
    op.drop_column("usage_events", "operation_id")
    op.drop_column("usage_events", "quantity")
    op.drop_column("usage_events", "unit")
    op.drop_column("usage_events", "product")
    op.drop_column("billing_accounts", "token_billing_effective_at")
    op.drop_column("subscription_plans", "stripe_price_token_metered_id")
    op.drop_column("subscription_plans", "token_overage_cents")
    op.drop_column("subscription_plans", "tokens_included")
