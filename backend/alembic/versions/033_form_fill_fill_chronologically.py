"""Add chronological fill setting to Form Fill

Revision ID: 033_form_fill_fill_chronologically
Revises: 032_activation_codes
Create Date: 2026-05-29
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "033_form_fill_fill_chronologically"
down_revision: Union[str, Sequence[str], None] = "032_activation_codes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "form_fill_templates",
        sa.Column("fill_chronologically", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "form_fill_runs",
        sa.Column("fill_chronologically", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column("form_fill_runs", "fill_chronologically")
    op.drop_column("form_fill_templates", "fill_chronologically")
