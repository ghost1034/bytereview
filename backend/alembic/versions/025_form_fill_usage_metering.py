"""Add Form Fill usage metering

Revision ID: 025_form_fill_usage_metering
Revises: 024_form_fill_repeat_outputs
Create Date: 2026-05-04
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "025_form_fill_usage_metering"
down_revision: Union[str, Sequence[str], None] = "024_form_fill_repeat_outputs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("form_fill_templates", sa.Column("page_count", sa.Integer(), nullable=True))
    op.add_column("form_fill_runs", sa.Column("target_page_count", sa.Integer(), nullable=True))
    op.add_column("form_fill_runs", sa.Column("usage_basis", sa.String(length=32), nullable=True))
    op.add_column("form_fill_runs", sa.Column("usage_pages", sa.Integer(), nullable=True))
    op.add_column("usage_events", sa.Column("form_fill_run_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_usage_events_form_fill_run_id",
        "usage_events",
        "form_fill_runs",
        ["form_fill_run_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_usage_events_form_fill_run_id", "usage_events", ["form_fill_run_id"])


def downgrade() -> None:
    op.drop_index("ix_usage_events_form_fill_run_id", table_name="usage_events")
    op.drop_constraint("fk_usage_events_form_fill_run_id", "usage_events", type_="foreignkey")
    op.drop_column("usage_events", "form_fill_run_id")
    op.drop_column("form_fill_runs", "usage_pages")
    op.drop_column("form_fill_runs", "usage_basis")
    op.drop_column("form_fill_runs", "target_page_count")
    op.drop_column("form_fill_templates", "page_count")
