"""Share generated Form Fill transform code across per-row outputs

Adds a JSONB column to form_fill_runs that caches the AI-generated transform
code (keyed by a hash of the fill inputs) so every output of a per-row run is
filled by the same code instead of each output regenerating its own mapping.

Revision ID: 040_form_fill_generated_transforms
Revises: 039_esign_envelopes
Create Date: 2026-07-13
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "040_form_fill_generated_transforms"
down_revision: Union[str, Sequence[str], None] = "039_esign_envelopes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "form_fill_runs",
        sa.Column("generated_transforms", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("form_fill_runs", "generated_transforms")
