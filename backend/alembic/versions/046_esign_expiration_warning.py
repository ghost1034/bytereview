"""Expiration warnings: notify parties before an envelope expires.

Adds the 'expiration_warning' audit event type and a per-envelope marker so
the hourly maintenance sweep sends the warning exactly once.

The enum value cannot be added inside a transaction, hence the autocommit
block. Postgres cannot drop enum values, so the downgrade leaves the value in
place (harmless) and only removes the column.

Revision ID: 046_esign_expiration_warning
Revises: 045_esign_field_draft_values
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "046_esign_expiration_warning"
down_revision: Union[str, Sequence[str], None] = "045_esign_field_draft_values"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE esign_event_type ADD VALUE IF NOT EXISTS 'expiration_warning'")
    op.add_column(
        "esign_envelopes",
        sa.Column("expiration_warning_sent_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("esign_envelopes", "expiration_warning_sent_at")
