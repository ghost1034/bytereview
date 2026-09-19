"""Update the Tasklytic Flash model and existing saved selections.

Revision ID: 083_tasklytic_flash_model
Revises: 082_esign_single_request
"""

from alembic import op
import sqlalchemy as sa


revision = "083_tasklytic_flash_model"
down_revision = "082_esign_single_request"
branch_labels = None
depends_on = None

# The legacy ID is retained only to migrate existing saved settings.
LEGACY_MODEL = "gemini-2.5-flash"
MODEL = "gemini-3.8-flash"


def upgrade() -> None:
    settings = sa.table("tasklytic_ai_settings", sa.column("model", sa.String(64)))
    op.execute(settings.update().where(settings.c.model == LEGACY_MODEL).values(model=MODEL))
    op.alter_column(
        "tasklytic_ai_settings", "model", existing_type=sa.String(64),
        existing_nullable=False, server_default=MODEL,
    )


def downgrade() -> None:
    # Revision 071 also uses the new default; preserve explicit saved selections.
    pass
