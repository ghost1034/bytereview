"""Add Inkwise ingestion usage metering fields

Revision ID: 019_inkwise_ingestion_usage_metering
Revises: 018_inkwise_folders_and_source_metadata
Create Date: 2026-04-08
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "019_inkwise_ingestion_usage_metering"
down_revision: Union[str, Sequence[str], None] = "018_inkwise_folders_and_source_metadata"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("inkwise_source_ingestions", sa.Column("usage_basis", sa.String(length=32), nullable=True))
    op.add_column("inkwise_source_ingestions", sa.Column("usage_pages", sa.Integer(), nullable=True))
    op.add_column("inkwise_source_ingestions", sa.Column("usage_tokens", sa.Integer(), nullable=True))
    op.add_column("inkwise_source_ingestions", sa.Column("usage_tokens_per_page", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("inkwise_source_ingestions", "usage_tokens_per_page")
    op.drop_column("inkwise_source_ingestions", "usage_tokens")
    op.drop_column("inkwise_source_ingestions", "usage_pages")
    op.drop_column("inkwise_source_ingestions", "usage_basis")
