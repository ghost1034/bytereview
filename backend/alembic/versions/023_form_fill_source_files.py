"""Add Form Fill source files

Revision ID: 023_form_fill_source_files
Revises: 022_form_fill_docx_table_expansion
Create Date: 2026-05-04
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "023_form_fill_source_files"
down_revision: Union[str, Sequence[str], None] = "022_form_fill_docx_table_expansion"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "form_fill_source_files",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("run_id", sa.UUID(), nullable=False),
        sa.Column("original_filename", sa.Text(), nullable=False),
        sa.Column("file_type", sa.String(length=100), nullable=False),
        sa.Column("gcs_object_name", sa.Text(), nullable=False),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["form_fill_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("gcs_object_name"),
    )
    op.create_index(
        "ix_form_fill_source_files_run_id_display_order",
        "form_fill_source_files",
        ["run_id", "display_order"],
    )


def downgrade() -> None:
    op.drop_index("ix_form_fill_source_files_run_id_display_order", table_name="form_fill_source_files")
    op.drop_table("form_fill_source_files")
