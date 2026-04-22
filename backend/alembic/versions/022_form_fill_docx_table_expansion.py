"""Add DOCX table expansion setting to Form Fill

Revision ID: 022_form_fill_docx_table_expansion
Revises: 021_form_fill
Create Date: 2026-04-22
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "022_form_fill_docx_table_expansion"
down_revision: Union[str, Sequence[str], None] = "021_form_fill"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "form_fill_templates",
        sa.Column("allow_docx_table_expansion", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "form_fill_runs",
        sa.Column("allow_docx_table_expansion", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("form_fill_runs", "allow_docx_table_expansion")
    op.drop_column("form_fill_templates", "allow_docx_table_expansion")
