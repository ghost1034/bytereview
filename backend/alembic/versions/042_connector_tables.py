"""OpenConnector integration broker tables

Revision ID: 042_connector_tables
Revises: 041_remove_form_fill_generated_transforms
Create Date: 2026-07-16
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "042_connector_tables"
down_revision: Union[str, Sequence[str], None] = "041_remove_form_fill_generated_transforms"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "connector_connections",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(128),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("service", sa.String(100), nullable=False),
        sa.Column("connection_name", sa.String(200), nullable=False, unique=True),
        sa.Column("label", sa.String(100), nullable=True),
        sa.Column("auth_type", sa.String(30), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("last_verified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "auth_type IN ('oauth2', 'api_key', 'custom_credential', 'no_auth')",
            name="ck_connector_connections_auth_type",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'active', 'error', 'revoked')",
            name="ck_connector_connections_status",
        ),
    )
    op.create_index("ix_connector_connections_user_id", "connector_connections", ["user_id"])
    op.create_index(
        "uq_connector_connections_user_service_label",
        "connector_connections",
        ["user_id", "service", sa.text("coalesce(label, '')")],
        unique=True,
    )

    op.create_table(
        "connector_oauth_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("service", sa.String(100), nullable=False, unique=True),
        sa.Column("client_id_hint", sa.String(64), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("configured_by", sa.String(128), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "connector_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(128),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_lookup", sa.String(16), nullable=False, unique=True),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("token_prefix", sa.String(24), nullable=False),
        sa.Column("name", sa.String(128), nullable=True),
        sa.Column("last_used_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_connector_tokens_user_id", "connector_tokens", ["user_id"])

    op.create_table(
        "connector_action_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(128),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("service", sa.String(100), nullable=False),
        sa.Column("action_id", sa.String(200), nullable=False),
        sa.Column("connection_name", sa.String(200), nullable=True),
        sa.Column("success", sa.Boolean(), nullable=True),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("source IN ('web', 'platform', 'mcp')", name="ck_connector_action_logs_source"),
    )
    op.create_index(
        "ix_connector_action_logs_user_created",
        "connector_action_logs",
        ["user_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_table("connector_action_logs")
    op.drop_table("connector_tokens")
    op.drop_table("connector_oauth_configs")
    op.drop_table("connector_connections")
