"""Remove virus-scanning metadata from PBC documents.

Revision ID: 068_remove_pbc_virus_scanning
Revises: 067_hosted_claw_public_access
"""

from alembic import op
import sqlalchemy as sa


revision = "068_remove_pbc_virus_scanning"
down_revision = "067_hosted_claw_public_access"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_pbc_document_scan_status", "pbc_documents", type_="check")
    op.drop_column("pbc_documents", "scan_detail")
    op.drop_column("pbc_documents", "scan_status")


def downgrade() -> None:
    op.add_column(
        "pbc_documents",
        sa.Column("scan_status", sa.String(length=20), server_default="skipped", nullable=False),
    )
    op.add_column("pbc_documents", sa.Column("scan_detail", sa.Text(), nullable=True))
    op.create_check_constraint(
        "ck_pbc_document_scan_status",
        "pbc_documents",
        "scan_status IN ('pending','clean','infected','failed','skipped')",
    )
