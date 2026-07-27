"""Add the platform-wide system administrator permission to users.

Revision ID: 059_system_admin_users
Revises: 058_connector_connection_alias_scope
"""

from alembic import op
import sqlalchemy as sa


revision = "059_system_admin_users"
down_revision = "058_connector_connection_alias_scope"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "is_system_admin",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "is_system_admin")
