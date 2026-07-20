"""Accountless recipient ceremonies and completed-copy invitations.

Revision ID: 052_esign_accountless_recipients
Revises: 051_esign_administration_parity
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "052_esign_accountless_recipients"
down_revision: Union[str, Sequence[str], None] = "051_esign_administration_parity"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ACCOUNTLESS_DISCLOSURE = (
    "Consent to Use Electronic Records and Signatures\n\n"
    "By selecting \"I agree\", you consent to receive, review, and sign the documents in this "
    "envelope electronically, and you agree that your electronic signature is the legal equivalent "
    "of your handwritten signature, as provided by the U.S. Electronic Signatures in Global and "
    "National Commerce Act (ESIGN) and the Uniform Electronic Transactions Act (UETA).\n\n"
    "To access and retain these records you need a device with a current web browser, an internet "
    "connection, and either a printer or sufficient storage to keep copies. You may download and "
    "print the documents during signing and after completion.\n\n"
    "You may decline to sign electronically by choosing \"Decline\" and contacting the sender to "
    "arrange paper signing. Declining electronic signing will not prevent you from doing business "
    "with the sender on paper. You may also request paper copies of completed documents from the sender.\n\n"
    "Access to this envelope is provided through a secure link delivered to the recipient email "
    "address selected by the sender. Anyone with that link may be able to act as the recipient, so "
    "do not forward it. The date, time, network address, browser information, access method, and each "
    "action you take are recorded in a tamper-evident audit trail."
)


def upgrade() -> None:
    op.add_column(
        "esign_envelopes",
        sa.Column("recipient_access_mode", sa.String(length=32), nullable=False, server_default="account"),
    )
    op.execute(
        sa.text(
            "UPDATE esign_envelopes SET recipient_access_mode = 'email_link', "
            "consent_disclosure_text = :disclosure WHERE status = 'draft'::esign_envelope_status"
        ).bindparams(disclosure=ACCOUNTLESS_DISCLOSURE)
    )
    op.alter_column("esign_envelopes", "recipient_access_mode", server_default="email_link")

    op.add_column(
        "esign_guest_invitations",
        sa.Column("purpose", sa.String(length=32), nullable=False, server_default="ceremony"),
    )
    # Existing guest rows may include more than one unrevoked invitation per
    # recipient. Keep only the newest before enforcing one active token/purpose.
    op.execute("""
        UPDATE esign_guest_invitations older
        SET revoked_at = NOW()
        FROM esign_guest_invitations newer
        WHERE older.recipient_id = newer.recipient_id
          AND older.purpose = newer.purpose
          AND older.revoked_at IS NULL
          AND newer.revoked_at IS NULL
          AND (older.created_at, older.id) < (newer.created_at, newer.id)
    """)
    op.create_index(
        "uq_esign_guest_invitations_active_purpose",
        "esign_guest_invitations", ["recipient_id", "purpose"], unique=True,
        postgresql_where=sa.text("revoked_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_esign_guest_invitations_active_purpose", table_name="esign_guest_invitations")
    op.drop_column("esign_guest_invitations", "purpose")
    op.drop_column("esign_envelopes", "recipient_access_mode")
