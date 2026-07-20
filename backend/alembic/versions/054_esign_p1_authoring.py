"""E-Signature P1 authoring concurrency and witness mode.

Revision ID: 054_esign_p1_authoring
Revises: 053_esign_p0_integrity
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "054_esign_p1_authoring"
down_revision: Union[str, Sequence[str], None] = "053_esign_p0_integrity"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("esign_envelopes", sa.Column("draft_revision", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("esign_templates", sa.Column("draft_revision", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("esign_recipients", sa.Column("witness_mode", sa.String(16), nullable=True))
    op.execute("UPDATE esign_recipients SET witness_mode = CASE WHEN email IS NULL THEN 'in_person' ELSE 'remote' END WHERE role = 'witness'")
    op.create_check_constraint(
        "ck_esign_recipients_witness_mode",
        "esign_recipients",
        "witness_mode IS NULL OR witness_mode IN ('remote', 'in_person')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_esign_recipients_witness_mode", "esign_recipients", type_="check")
    op.drop_column("esign_recipients", "witness_mode")
    op.drop_column("esign_templates", "draft_revision")
    op.drop_column("esign_envelopes", "draft_revision")
