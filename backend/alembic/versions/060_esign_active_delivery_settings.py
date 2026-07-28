"""Audit post-send E-Signature delivery-setting changes.

Revision ID: 060_esign_active_delivery_settings
Revises: 059_system_admin_users
"""

from alembic import op


revision = "060_esign_active_delivery_settings"
down_revision = "059_system_admin_users"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE esign_event_type ADD VALUE IF NOT EXISTS 'settings_updated'")


def downgrade() -> None:
    # PostgreSQL enum values cannot be removed safely while audit rows may use
    # them. Retaining the value is the lossless downgrade behavior.
    pass
