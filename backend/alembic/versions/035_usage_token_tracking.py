"""Track raw token usage on analytics usage events

Adds raw token columns to usage_events and a per-period token aggregate to
usage_counters. Billing remains page-based (pages are still derived from tokens
via ANALYTICS_TOKENS_PER_PAGE); these columns only make token consumption
durable and auditable. Non-analytics events (extraction, Form Fill, Inkwise)
leave the token columns NULL.

Revision ID: 035_usage_token_tracking
Revises: 034_firm_invite_codes
Create Date: 2026-05-30
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "035_usage_token_tracking"
down_revision: Union[str, Sequence[str], None] = "034_firm_invite_codes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("usage_events", sa.Column("prompt_tokens", sa.Integer(), nullable=True))
    op.add_column("usage_events", sa.Column("output_tokens", sa.Integer(), nullable=True))
    op.add_column("usage_events", sa.Column("total_tokens", sa.Integer(), nullable=True))
    op.add_column(
        "usage_counters",
        sa.Column("tokens_total", sa.BigInteger(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("usage_counters", "tokens_total")
    op.drop_column("usage_events", "total_tokens")
    op.drop_column("usage_events", "output_tokens")
    op.drop_column("usage_events", "prompt_tokens")
