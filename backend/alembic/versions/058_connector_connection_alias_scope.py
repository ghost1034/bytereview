"""Allow per-user connector aliases to be reused across provider services.

Revision ID: 058_connector_connection_alias_scope
Revises: 057_esign_field_geometry_bounds
"""

from alembic import op


revision = "058_connector_connection_alias_scope"
down_revision = "057_esign_field_geometry_bounds"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # OpenConnector identifies credentials by (service, connectionName). The
    # existing user/service/coalesced-label index is the actual logical
    # uniqueness rule, so a global constraint on connection_name incorrectly
    # prevents one user from connecting two different providers.
    op.drop_constraint(
        "connector_connections_connection_name_key",
        "connector_connections",
        type_="unique",
    )


def downgrade() -> None:
    op.create_unique_constraint(
        "connector_connections_connection_name_key",
        "connector_connections",
        ["connection_name"],
    )
