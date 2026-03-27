"""Add Inkwise ingestion reference to usage events

Revision ID: 016_usage_events_add_inkwise_ingestion
Revises: 015_add_user_phone_verification
Create Date: 2026-03-27
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "016_usage_events_add_inkwise_ingestion"
down_revision: Union[str, Sequence[str], None] = "015_add_user_phone_verification"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(64)")
    op.add_column(
        "usage_events",
        sa.Column(
            "inkwise_ingestion_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("inkwise_source_ingestions.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_usage_events_inkwise_ingestion_id", "usage_events", ["inkwise_ingestion_id"])


def downgrade() -> None:
    op.drop_index("ix_usage_events_inkwise_ingestion_id", table_name="usage_events")
    op.drop_column("usage_events", "inkwise_ingestion_id")
