"""Add firm invitation codes for analytics onboarding

Revision ID: 034_firm_invite_codes
Revises: 033_form_fill_fill_chronologically
Create Date: 2026-05-30
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "034_firm_invite_codes"
down_revision: Union[str, Sequence[str], None] = "033_form_fill_fill_chronologically"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "firm_invite_codes",
        sa.Column("code", sa.String(length=6), nullable=False),
        sa.Column("firm_id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["firm_id"], ["firms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("code"),
    )
    op.create_index("ix_firm_invite_codes_firm_id", "firm_invite_codes", ["firm_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_firm_invite_codes_firm_id", table_name="firm_invite_codes")
    op.drop_table("firm_invite_codes")
