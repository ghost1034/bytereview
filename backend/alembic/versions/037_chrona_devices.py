"""Add Chrona integration tables — devices, pairing codes, synced timeline cards.

A manager mints a short-lived pairing code in the dashboard; a Chrona desktop
install redeems it and is issued a long-lived scoped device token (only a
SHA-256 hash is stored, mirroring activation_keys). Paired devices push
timeline cards which are UPSERTed on (device_id, source_card_id) since Chrona
card ids are local autoincrement ints unique only per device.

Revision ID: 037_chrona_devices
Revises: 036_user_welcome_tour_seen
Create Date: 2026-06-03
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "037_chrona_devices"
down_revision: Union[str, Sequence[str], None] = "036_user_welcome_tour_seen"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "chrona_devices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("paired_by_user_id", sa.String(length=128), nullable=True),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("token_lookup", sa.String(length=16), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("token_prefix", sa.String(length=24), nullable=False),
        sa.Column("platform", sa.String(length=32), nullable=True),
        sa.Column("app_version", sa.String(length=32), nullable=True),
        sa.Column("revoked_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("last_seen_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("last_sync_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("sync_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["firm_id"], ["firms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["paired_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("token_lookup", name="uq_chrona_devices_token_lookup"),
    )
    op.create_index("ix_chrona_devices_firm_id", "chrona_devices", ["firm_id"])

    op.create_table(
        "chrona_pairing_codes",
        sa.Column("code", sa.String(length=8), primary_key=True),
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by_user_id", sa.String(length=128), nullable=True),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("consumed_device_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["firm_id"], ["firms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["consumed_device_id"], ["chrona_devices.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_chrona_pairing_codes_firm_id", "chrona_pairing_codes", ["firm_id"])

    op.create_table(
        "chrona_timeline_cards",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("device_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_card_id", sa.BigInteger(), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("detailed_summary", sa.Text(), nullable=True),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column("subcategory", sa.String(length=64), nullable=True),
        sa.Column("start_ts", sa.BigInteger(), nullable=False),
        sa.Column("end_ts", sa.BigInteger(), nullable=False),
        sa.Column("day_key", sa.Date(), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("source_created_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("synced_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["device_id"], ["chrona_devices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["firm_id"], ["firms.id"], ondelete="CASCADE"),
    )
    # Chrona card ids are unique only per device — this is the idempotency key.
    op.create_index(
        "uq_chrona_cards_device_source",
        "chrona_timeline_cards",
        ["device_id", "source_card_id"],
        unique=True,
    )
    op.create_index("ix_chrona_cards_firm_day", "chrona_timeline_cards", ["firm_id", "day_key"])
    op.create_index(
        "ix_chrona_cards_device_day_active",
        "chrona_timeline_cards",
        ["device_id", "day_key"],
        postgresql_where=sa.text("is_deleted = FALSE"),
    )
    op.create_index("ix_chrona_cards_firm_category", "chrona_timeline_cards", ["firm_id", "category"])


def downgrade() -> None:
    op.drop_index("ix_chrona_cards_firm_category", table_name="chrona_timeline_cards")
    op.drop_index("ix_chrona_cards_device_day_active", table_name="chrona_timeline_cards")
    op.drop_index("ix_chrona_cards_firm_day", table_name="chrona_timeline_cards")
    op.drop_index("uq_chrona_cards_device_source", table_name="chrona_timeline_cards")
    op.drop_table("chrona_timeline_cards")
    op.drop_index("ix_chrona_pairing_codes_firm_id", table_name="chrona_pairing_codes")
    op.drop_table("chrona_pairing_codes")
    op.drop_index("ix_chrona_devices_firm_id", table_name="chrona_devices")
    op.drop_table("chrona_devices")
