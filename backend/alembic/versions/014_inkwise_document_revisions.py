"""
Add Inkwise document revisions

Revision ID: 014_inkwise_document_revisions
Revises: 013_inkwise_generation_attempts
Create Date: 2026-03-17
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "014_inkwise_document_revisions"
down_revision = "013_inkwise_generation_attempts"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "inkwise_document_revisions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("inkwise_documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(length=128), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("revision_number", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("content_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("content_html", sa.Text(), nullable=True),
        sa.Column("init_prompt", sa.Text(), nullable=True),
        sa.Column("language", sa.String(length=50), nullable=True),
        sa.Column("document_version", sa.Integer(), nullable=False),
        sa.Column("source_kind", sa.String(length=32), nullable=False),
        sa.Column("source_meta", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("document_id", "revision_number", name="uq_inkwise_document_revisions_doc_revision"),
    )
    op.create_index("ix_inkwise_document_revisions_document_id", "inkwise_document_revisions", ["document_id"])
    op.create_index("ix_inkwise_document_revisions_user_id", "inkwise_document_revisions", ["user_id"])


def downgrade():
    op.drop_index("ix_inkwise_document_revisions_user_id", table_name="inkwise_document_revisions")
    op.drop_index("ix_inkwise_document_revisions_document_id", table_name="inkwise_document_revisions")
    op.drop_table("inkwise_document_revisions")
