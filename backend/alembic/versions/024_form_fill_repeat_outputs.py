"""Add Form Fill repeat outputs

Revision ID: 024_form_fill_repeat_outputs
Revises: 023_form_fill_source_files
Create Date: 2026-05-04
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "024_form_fill_repeat_outputs"
down_revision: Union[str, Sequence[str], None] = "023_form_fill_source_files"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("form_fill_runs", sa.Column("repeat_mode", sa.String(length=50), nullable=False, server_default="single"))
    op.add_column("form_fill_runs", sa.Column("total_outputs", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("form_fill_runs", sa.Column("completed_outputs", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("form_fill_runs", sa.Column("failed_outputs", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("form_fill_runs", sa.Column("source_record_config", postgresql.JSONB(astext_type=sa.Text()), nullable=True))

    op.create_table(
        "form_fill_outputs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("run_id", sa.UUID(), nullable=False),
        sa.Column("record_index", sa.Integer(), nullable=False),
        sa.Column("record_label", sa.Text(), nullable=False),
        sa.Column("record_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="pending"),
        sa.Column("warnings", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("fill_plan", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("result_gcs_object_name", sa.Text(), nullable=True),
        sa.Column("result_filename", sa.Text(), nullable=True),
        sa.Column("result_file_type", sa.String(length=100), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("completed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["run_id"], ["form_fill_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_form_fill_outputs_run_id_record_index", "form_fill_outputs", ["run_id", "record_index"])


def downgrade() -> None:
    op.drop_index("ix_form_fill_outputs_run_id_record_index", table_name="form_fill_outputs")
    op.drop_table("form_fill_outputs")
    op.drop_column("form_fill_runs", "source_record_config")
    op.drop_column("form_fill_runs", "failed_outputs")
    op.drop_column("form_fill_runs", "completed_outputs")
    op.drop_column("form_fill_runs", "total_outputs")
    op.drop_column("form_fill_runs", "repeat_mode")
