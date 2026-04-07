"""Remove Inkwise template icon columns

Revision ID: 017_remove_inkwise_template_icons
Revises: 016_usage_events_add_inkwise_ingestion
Create Date: 2026-04-07
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "017_remove_inkwise_template_icons"
down_revision: Union[str, Sequence[str], None] = "016_usage_events_add_inkwise_ingestion"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("inkwise_templates", "icon")
    op.drop_column("inkwise_system_templates", "icon")


def downgrade() -> None:
    op.add_column("inkwise_system_templates", sa.Column("icon", sa.String(length=200), nullable=True))
    op.add_column("inkwise_templates", sa.Column("icon", sa.String(length=200), nullable=True))
