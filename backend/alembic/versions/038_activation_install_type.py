"""Add last_resolved_install_type to activation_keys.

Records which installation option (docker = cloud digital worker, desktop =
Hermes Desktop install) most recently exchanged the key, so the dashboard can
show "last used by your cloud/desktop install".

Revision ID: 038_activation_install_type
Revises: 037_chrona_devices
Create Date: 2026-06-06
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "038_activation_install_type"
down_revision: Union[str, Sequence[str], None] = "037_chrona_devices"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "activation_keys",
        sa.Column("last_resolved_install_type", sa.String(length=16), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("activation_keys", "last_resolved_install_type")
