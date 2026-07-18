"""Signature adoption parity: uploaded signature images + adopted initials.

Signers can now adopt a signature by uploading an image (alongside draw/type),
and adopt their initials explicitly (text or image) instead of having them
derived from the account name at sealing time.

The 'uploaded' enum value cannot be added inside a transaction, hence the
autocommit block. Postgres cannot drop enum values, so the downgrade leaves
'uploaded' in place (harmless) and only removes the columns.

Revision ID: 044_esign_adoption_parity
Revises: 043_esign_draft_deletion
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "044_esign_adoption_parity"
down_revision: Union[str, Sequence[str], None] = "043_esign_draft_deletion"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE esign_signature_type ADD VALUE IF NOT EXISTS 'uploaded'")
    op.add_column(
        "esign_signature_records",
        sa.Column("initials_text", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "esign_signature_records",
        sa.Column("initials_image_gcs_object_name", sa.Text(), nullable=True),
    )
    op.add_column(
        "esign_signature_records",
        sa.Column("initials_image_sha256", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("esign_signature_records", "initials_image_sha256")
    op.drop_column("esign_signature_records", "initials_image_gcs_object_name")
    op.drop_column("esign_signature_records", "initials_text")
