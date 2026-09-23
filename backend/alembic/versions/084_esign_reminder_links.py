"""Keep existing guest invitation links usable after reminders.

Revision ID: 084_esign_reminder_links
Revises: 083_tasklytic_flash_model
"""

from alembic import op
import sqlalchemy as sa


revision = "084_esign_reminder_links"
down_revision = "083_tasklytic_flash_model"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index(
        "uq_esign_guest_invitations_active_purpose",
        table_name="esign_guest_invitations",
    )


def downgrade() -> None:
    # Refuse to silently invalidate delivered links during rollback. Restoring
    # this index fails transactionally if multiple active invitations exist.
    op.create_index(
        "uq_esign_guest_invitations_active_purpose",
        "esign_guest_invitations", ["recipient_id", "purpose"], unique=True,
        postgresql_where=sa.text("revoked_at IS NULL"),
    )
