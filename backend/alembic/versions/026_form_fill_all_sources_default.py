"""Default Form Fill to all sources

Revision ID: 026_form_fill_all_sources_default
Revises: 025_form_fill_usage_metering
Create Date: 2026-05-18
"""

from typing import Sequence, Union

from alembic import op


revision: str = "026_form_fill_all_sources_default"
down_revision: Union[str, Sequence[str], None] = "025_form_fill_usage_metering"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("form_fill_runs", "repeat_mode", server_default="all_sources")


def downgrade() -> None:
    op.alter_column("form_fill_runs", "repeat_mode", server_default="single")
