"""Merge the E-Signature and Tasklytic migration branches.

Revision ID: 061_merge_esign_tasklytic_heads
Revises: 060_esign_active_delivery_settings, 060_tasklytic_backend
"""


revision = "061_merge_esign_tasklytic_heads"
down_revision = (
    "060_esign_active_delivery_settings",
    "060_tasklytic_backend",
)
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
