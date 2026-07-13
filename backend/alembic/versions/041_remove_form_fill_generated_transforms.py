"""Remove generated Form Fill transform storage

Revision ID: 041_remove_form_fill_generated_transforms
Revises: 040_form_fill_generated_transforms
Create Date: 2026-07-13
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "041_remove_form_fill_generated_transforms"
down_revision: Union[str, Sequence[str], None] = "040_form_fill_generated_transforms"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("form_fill_runs", "generated_transforms")


def downgrade() -> None:
    op.add_column(
        "form_fill_runs",
        sa.Column("generated_transforms", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
