"""E-signature advanced fields, metadata, and signer attachments.

Revision ID: 047_esign_field_parity
Revises: 046_esign_expiration_warning

Postgres enum values cannot be removed safely, so downgrade intentionally
leaves the five field-type values in place and removes the table/columns.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "047_esign_field_parity"
down_revision: Union[str, Sequence[str], None] = "046_esign_expiration_warning"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        for value in ("auto_fill", "attachment", "radio", "dropdown", "formula"):
            op.execute(f"ALTER TYPE esign_field_type ADD VALUE IF NOT EXISTS '{value}'")

    empty_json = sa.text("'{}'::jsonb")
    op.add_column(
        "esign_fields",
        sa.Column("properties", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=empty_json),
    )
    op.add_column(
        "esign_template_fields",
        sa.Column("properties", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=empty_json),
    )
    op.create_table(
        "esign_signer_attachments",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("envelope_id", sa.UUID(), nullable=False),
        sa.Column("recipient_id", sa.UUID(), nullable=False),
        sa.Column("field_id", sa.UUID(), nullable=False),
        sa.Column("gcs_object_name", sa.Text(), nullable=False),
        sa.Column("original_filename", sa.Text(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("uploaded_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["envelope_id"], ["esign_envelopes.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["recipient_id"], ["esign_recipients.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["field_id"], ["esign_fields.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_esign_signer_attachments_envelope", "esign_signer_attachments", ["envelope_id"])


def downgrade() -> None:
    op.drop_index("ix_esign_signer_attachments_envelope", table_name="esign_signer_attachments")
    op.drop_table("esign_signer_attachments")
    op.drop_column("esign_template_fields", "properties")
    op.drop_column("esign_fields", "properties")
