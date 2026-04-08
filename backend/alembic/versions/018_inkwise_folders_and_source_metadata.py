"""Add Inkwise folders and source metadata

Revision ID: 018_inkwise_folders_and_source_metadata
Revises: 017_remove_inkwise_template_icons
Create Date: 2026-04-07
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "018_inkwise_folders_and_source_metadata"
down_revision: Union[str, Sequence[str], None] = "017_remove_inkwise_template_icons"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "inkwise_document_folders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(length=128), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("user_id", "name", name="uq_inkwise_document_folders_user_name"),
    )
    op.create_index("ix_inkwise_document_folders_user_id", "inkwise_document_folders", ["user_id"])

    op.add_column("inkwise_documents", sa.Column("folder_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index("ix_inkwise_documents_folder_id", "inkwise_documents", ["folder_id"])
    op.create_foreign_key(
        "fk_inkwise_documents_folder_id",
        "inkwise_documents",
        "inkwise_document_folders",
        ["folder_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column("inkwise_sources", sa.Column("original_path", sa.String(length=1024), nullable=True))
    op.add_column("inkwise_sources", sa.Column("external_source", sa.String(length=32), nullable=True))
    op.add_column("inkwise_sources", sa.Column("external_id", sa.String(length=512), nullable=True))
    op.add_column("inkwise_sources", sa.Column("external_meta", postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column("inkwise_sources", "external_meta")
    op.drop_column("inkwise_sources", "external_id")
    op.drop_column("inkwise_sources", "external_source")
    op.drop_column("inkwise_sources", "original_path")

    op.drop_constraint("fk_inkwise_documents_folder_id", "inkwise_documents", type_="foreignkey")
    op.drop_index("ix_inkwise_documents_folder_id", table_name="inkwise_documents")
    op.drop_column("inkwise_documents", "folder_id")

    op.drop_index("ix_inkwise_document_folders_user_id", table_name="inkwise_document_folders")
    op.drop_table("inkwise_document_folders")
