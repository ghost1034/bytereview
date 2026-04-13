"""Add Inkwise citation styles and bibliographic metadata

Revision ID: 020_inkwise_citation_styles_and_bibliography
Revises: 019_inkwise_ingestion_usage_metering
Create Date: 2026-04-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "020_inkwise_citation_styles_and_bibliography"
down_revision: Union[str, Sequence[str], None] = "019_inkwise_ingestion_usage_metering"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "inkwise_sources",
        sa.Column("bibliographic_metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "inkwise_documents",
        sa.Column("citation_style", sa.String(length=32), nullable=False, server_default="default"),
    )
    op.add_column(
        "inkwise_document_revisions",
        sa.Column("citation_style", sa.String(length=32), nullable=False, server_default="default"),
    )

    op.execute("update inkwise_documents set citation_style = 'default' where citation_style is null")
    op.execute("update inkwise_document_revisions set citation_style = 'default' where citation_style is null")

    op.alter_column("inkwise_documents", "citation_style", server_default=None)
    op.alter_column("inkwise_document_revisions", "citation_style", server_default=None)


def downgrade() -> None:
    op.drop_column("inkwise_document_revisions", "citation_style")
    op.drop_column("inkwise_documents", "citation_style")
    op.drop_column("inkwise_sources", "bibliographic_metadata")
