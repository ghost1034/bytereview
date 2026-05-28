"""Add activation_keys table — per-user AccountingClaw activation keys.

A user redeems an activation code in the web app and is issued a personal,
revocable key. The AccountingClaw container exchanges the key at startup for the
real build-time CPAA_BUNDLE_SECRET. Only a SHA-256 hash of the key is stored.

Revision ID: 031_activation_keys
Revises: 030_analytics_comments
Create Date: 2026-05-28
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "031_activation_keys"
down_revision: Union[str, Sequence[str], None] = "030_analytics_comments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "activation_keys",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(length=128), nullable=False),
        sa.Column("key_lookup", sa.String(length=16), nullable=False),
        sa.Column("key_hash", sa.String(length=64), nullable=False),
        sa.Column("key_prefix", sa.String(length=24), nullable=False),
        sa.Column("revoked_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("last_resolved_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("last_resolved_fingerprint", sa.String(length=128), nullable=True),
        sa.Column("resolve_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("key_lookup", name="uq_activation_keys_key_lookup"),
    )
    op.create_index("ix_activation_keys_user_id", "activation_keys", ["user_id"])
    # A user may hold at most one active (non-revoked) key; revoked rows are kept.
    op.create_index(
        "uq_activation_keys_active_user",
        "activation_keys",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("revoked_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_activation_keys_active_user", table_name="activation_keys")
    op.drop_index("ix_activation_keys_user_id", table_name="activation_keys")
    op.drop_table("activation_keys")
