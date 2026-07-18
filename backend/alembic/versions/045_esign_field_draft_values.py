"""Finish Later: persist a signer's in-progress field entries.

draft_value holds text/checkbox values saved mid-ceremony so a signer can
leave and resume without losing work. It is deliberately separate from
`value`, which is only written at submit and is part of the sealed evidence.

Revision ID: 045_esign_field_draft_values
Revises: 044_esign_adoption_parity
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "045_esign_field_draft_values"
down_revision: Union[str, Sequence[str], None] = "044_esign_adoption_parity"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("esign_fields", sa.Column("draft_value", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("esign_fields", "draft_value")
