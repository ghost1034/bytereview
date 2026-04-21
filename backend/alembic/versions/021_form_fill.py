"""Add Form Fill tables

Revision ID: 021_form_fill
Revises: 020_inkwise_citation_styles_and_bibliography
Create Date: 2026-04-20
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "021_form_fill"
down_revision: Union[str, Sequence[str], None] = "020_inkwise_citation_styles_and_bibliography"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "form_fill_templates",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.String(length=128), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("original_filename", sa.Text(), nullable=False),
        sa.Column("file_type", sa.String(length=100), nullable=False),
        sa.Column("gcs_object_name", sa.Text(), nullable=False),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("gcs_object_name"),
    )

    op.create_table(
        "form_fill_runs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="pending"),
        sa.Column("source_mode", sa.String(length=50), nullable=False),
        sa.Column("source_filename", sa.Text(), nullable=True),
        sa.Column("source_file_type", sa.String(length=100), nullable=True),
        sa.Column("source_gcs_object_name", sa.Text(), nullable=True),
        sa.Column("source_file_size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("source_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("source_job_id", sa.UUID(), nullable=True),
        sa.Column("source_run_id", sa.UUID(), nullable=True),
        sa.Column("source_task_id", sa.UUID(), nullable=True),
        sa.Column("target_mode", sa.String(length=50), nullable=False),
        sa.Column("target_template_id", sa.UUID(), nullable=True),
        sa.Column("target_filename", sa.Text(), nullable=False),
        sa.Column("target_file_type", sa.String(length=100), nullable=False),
        sa.Column("target_gcs_object_name", sa.Text(), nullable=False),
        sa.Column("target_file_size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("output_format", sa.String(length=20), nullable=False),
        sa.Column("processing_strategy", sa.String(length=50), nullable=True),
        sa.Column("warnings", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("fill_plan", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("result_gcs_object_name", sa.Text(), nullable=True),
        sa.Column("result_filename", sa.Text(), nullable=True),
        sa.Column("result_file_type", sa.String(length=100), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("completed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["source_job_id"], ["extraction_jobs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["source_run_id"], ["job_runs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["source_task_id"], ["extraction_tasks.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["target_template_id"], ["form_fill_templates.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index("ix_form_fill_runs_user_id_created_at", "form_fill_runs", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_form_fill_runs_user_id_created_at", table_name="form_fill_runs")
    op.drop_table("form_fill_runs")
    op.drop_table("form_fill_templates")
