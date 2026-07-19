"""Core field embedding types and envelope date format.

Revision ID: 048_esign_core_field_embedding
Revises: 047_esign_field_parity
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "048_esign_core_field_embedding"
down_revision: Union[str, Sequence[str], None] = "047_esign_field_parity"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        for value in (
            "stamp", "date", "number", "first_name", "last_name", "full_name",
            "email", "company", "title", "note",
        ):
            op.execute(f"ALTER TYPE esign_field_type ADD VALUE IF NOT EXISTS '{value}'")
    op.add_column(
        "esign_envelopes",
        sa.Column("date_format", sa.String(length=32), nullable=False, server_default="MM/DD/YYYY"),
    )
    op.add_column(
        "esign_templates",
        sa.Column("date_format", sa.String(length=32), nullable=False, server_default="MM/DD/YYYY"),
    )


def downgrade() -> None:
    op.drop_column("esign_templates", "date_format")
    op.drop_column("esign_envelopes", "date_format")
