"""E-Signature P2 management workflows.

Revision ID: 055_esign_p2_management
Revises: 054_esign_p1_authoring
"""

from alembic import op
import sqlalchemy as sa


revision = "055_esign_p2_management"
down_revision = "054_esign_p1_authoring"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("esign_templates", sa.Column("archived_at", sa.TIMESTAMP(timezone=True), nullable=True))
    op.create_index("ix_esign_templates_firm_archived", "esign_templates", ["firm_id", "archived_at"])
    op.execute("""
        UPDATE esign_permission_profiles
        SET capabilities = capabilities || '{"exports": true}'::jsonb
        WHERE built_in_key = 'sender'
    """)


def downgrade() -> None:
    op.execute("""
        UPDATE esign_permission_profiles
        SET capabilities = capabilities - 'exports'
        WHERE built_in_key = 'sender'
    """)
    op.drop_index("ix_esign_templates_firm_archived", table_name="esign_templates")
    op.drop_column("esign_templates", "archived_at")
