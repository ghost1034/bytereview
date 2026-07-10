"""E-Signature module: envelopes, documents, recipients, fields, signature/
consent records, append-only audit events, and reusable templates.

Legal-defensibility notes baked into the schema:
- esign_events is append-only: a trigger raises on any UPDATE or DELETE, and
  its envelope FK is ON DELETE RESTRICT, so envelopes with history can never
  be hard-deleted (void instead).
- Field coordinates are stored as fractions of page size (0..1), top-left
  origin, 0-based page index — resolution independent by convention.

Revision ID: 039_esign_envelopes
Revises: 038_activation_install_type
Create Date: 2026-07-09
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "039_esign_envelopes"
down_revision: Union[str, Sequence[str], None] = "038_activation_install_type"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ENVELOPE_STATUS_VALUES = (
    "draft", "sent", "in_progress", "completed", "declined", "voided", "expired",
)
SIGNING_TYPE_VALUES = ("sequential", "parallel")
RECIPIENT_ROLE_VALUES = ("signer", "cc")
RECIPIENT_STATUS_VALUES = (
    "pending", "notified", "viewed", "consented", "signed", "declined",
)
FIELD_TYPE_VALUES = ("signature", "initials", "date_signed", "text", "checkbox")
SIGNATURE_TYPE_VALUES = ("drawn", "typed")
EVENT_TYPE_VALUES = (
    "created", "sent", "viewed", "consent_given", "signed", "declined",
    "voided", "completed", "reminder_sent", "sealed", "expired",
)

_ENUMS = {
    "esign_envelope_status": ENVELOPE_STATUS_VALUES,
    "esign_signing_type": SIGNING_TYPE_VALUES,
    "esign_recipient_role": RECIPIENT_ROLE_VALUES,
    "esign_recipient_status": RECIPIENT_STATUS_VALUES,
    "esign_field_type": FIELD_TYPE_VALUES,
    "esign_signature_type": SIGNATURE_TYPE_VALUES,
    "esign_event_type": EVENT_TYPE_VALUES,
}


def _enum(name: str) -> postgresql.ENUM:
    return postgresql.ENUM(*_ENUMS[name], name=name, create_type=False)


def _fraction(name: str) -> sa.Column:
    return sa.Column(name, sa.Numeric(12, 10), nullable=False)


def upgrade() -> None:
    bind = op.get_bind()

    # ------------------------------------------------------------------
    # Enums
    # ------------------------------------------------------------------
    for enum_name, values in _ENUMS.items():
        postgresql.ENUM(*values, name=enum_name).create(bind, checkfirst=True)

    # ------------------------------------------------------------------
    # esign_envelopes
    # ------------------------------------------------------------------
    op.create_table(
        "esign_envelopes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(length=128),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column(
            "status",
            _enum("esign_envelope_status"),
            nullable=False,
            server_default=sa.text("'draft'::esign_envelope_status"),
        ),
        sa.Column(
            "signing_type",
            _enum("esign_signing_type"),
            nullable=False,
            server_default=sa.text("'sequential'::esign_signing_type"),
        ),
        sa.Column("current_routing_order", sa.Integer(), nullable=True),
        sa.Column("consent_disclosure_text", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("reminder_interval_hours", sa.Integer(), nullable=True),
        sa.Column("last_reminder_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("voided_reason", sa.Text(), nullable=True),
        sa.Column("sealed_gcs_object_name", sa.Text(), nullable=True),
        sa.Column("sealed_sha256", sa.String(length=64), nullable=True),
        sa.Column("certificate_gcs_object_name", sa.Text(), nullable=True),
        sa.Column("sent_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("completed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("voided_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_esign_envelopes_user_created", "esign_envelopes", ["user_id", "created_at"])

    # ------------------------------------------------------------------
    # esign_documents
    # ------------------------------------------------------------------
    op.create_table(
        "esign_documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "envelope_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("esign_envelopes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("original_filename", sa.Text(), nullable=False),
        sa.Column("gcs_object_name", sa.Text(), nullable=False, unique=True),
        sa.Column("original_sha256", sa.String(length=64), nullable=False),
        sa.Column("flattened_gcs_object_name", sa.Text(), nullable=True),
        sa.Column("flattened_sha256", sa.String(length=64), nullable=True),
        sa.Column("page_count", sa.Integer(), nullable=False),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_esign_documents_envelope", "esign_documents", ["envelope_id"])

    # ------------------------------------------------------------------
    # esign_recipients
    # ------------------------------------------------------------------
    op.create_table(
        "esign_recipients",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "envelope_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("esign_envelopes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column(
            "recipient_user_id",
            sa.String(length=128),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "role",
            _enum("esign_recipient_role"),
            nullable=False,
            server_default=sa.text("'signer'::esign_recipient_role"),
        ),
        sa.Column("routing_order", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "status",
            _enum("esign_recipient_status"),
            nullable=False,
            server_default=sa.text("'pending'::esign_recipient_status"),
        ),
        sa.Column("viewed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("consented_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("signed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("declined_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("declined_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "uq_esign_recipients_envelope_email", "esign_recipients", ["envelope_id", "email"], unique=True
    )
    op.create_index("ix_esign_recipients_email", "esign_recipients", ["email"])

    # ------------------------------------------------------------------
    # esign_fields
    # ------------------------------------------------------------------
    op.create_table(
        "esign_fields",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "envelope_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("esign_envelopes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("esign_documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "recipient_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("esign_recipients.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("field_type", _enum("esign_field_type"), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=False),
        _fraction("pos_x"),
        _fraction("pos_y"),
        _fraction("width"),
        _fraction("height"),
        sa.Column("required", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("label", sa.String(length=255), nullable=True),
        sa.Column("value", sa.Text(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("pos_x >= 0 AND pos_x <= 1", name="ck_esign_fields_pos_x"),
        sa.CheckConstraint("pos_y >= 0 AND pos_y <= 1", name="ck_esign_fields_pos_y"),
        sa.CheckConstraint("width > 0 AND width <= 1", name="ck_esign_fields_width"),
        sa.CheckConstraint("height > 0 AND height <= 1", name="ck_esign_fields_height"),
        sa.CheckConstraint("page_number >= 0", name="ck_esign_fields_page_number"),
    )
    op.create_index("ix_esign_fields_envelope", "esign_fields", ["envelope_id"])

    # ------------------------------------------------------------------
    # esign_signature_records / esign_consent_records (append-only by API)
    # ------------------------------------------------------------------
    op.create_table(
        "esign_signature_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "envelope_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("esign_envelopes.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "recipient_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("esign_recipients.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("signature_type", _enum("esign_signature_type"), nullable=False),
        sa.Column("image_gcs_object_name", sa.Text(), nullable=True),
        sa.Column("image_sha256", sa.String(length=64), nullable=True),
        sa.Column("typed_text", sa.Text(), nullable=True),
        sa.Column("typed_font", sa.String(length=100), nullable=True),
        sa.Column("adopted_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_esign_signature_records_envelope", "esign_signature_records", ["envelope_id"])

    op.create_table(
        "esign_consent_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "envelope_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("esign_envelopes.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "recipient_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("esign_recipients.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("consent_text_sha256", sa.String(length=64), nullable=False),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("consented_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_esign_consent_records_envelope", "esign_consent_records", ["envelope_id"])

    # ------------------------------------------------------------------
    # esign_events (append-only audit trail)
    # ------------------------------------------------------------------
    op.create_table(
        "esign_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "envelope_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("esign_envelopes.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("event_type", _enum("esign_event_type"), nullable=False),
        sa.Column(
            "actor_user_id",
            sa.String(length=128),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("actor_email", sa.String(length=255), nullable=True),
        sa.Column(
            "recipient_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("esign_recipients.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("mfa_verified", sa.Boolean(), nullable=True),
        sa.Column("mfa_method", sa.String(length=32), nullable=True),
        sa.Column("mfa_phone_last4", sa.String(length=4), nullable=True),
        sa.Column("details", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_esign_events_envelope_created", "esign_events", ["envelope_id", "created_at"])

    # Immutability: block UPDATE/DELETE at the database level. There is no
    # session-variable escape hatch on purpose — the audit trail is the product.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION esign_events_block_mutation()
        RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'esign_events is append-only: % not allowed', TG_OP;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_esign_events_append_only
        BEFORE UPDATE OR DELETE ON esign_events
        FOR EACH ROW EXECUTE FUNCTION esign_events_block_mutation();
        """
    )

    # ------------------------------------------------------------------
    # esign_templates / esign_template_documents / esign_template_fields
    # ------------------------------------------------------------------
    op.create_table(
        "esign_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(length=128),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column(
            "signing_type",
            _enum("esign_signing_type"),
            nullable=False,
            server_default=sa.text("'sequential'::esign_signing_type"),
        ),
        sa.Column(
            "recipient_roles",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_esign_templates_user", "esign_templates", ["user_id"])

    op.create_table(
        "esign_template_documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "template_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("esign_templates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("original_filename", sa.Text(), nullable=False),
        sa.Column("gcs_object_name", sa.Text(), nullable=False, unique=True),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("page_count", sa.Integer(), nullable=False),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "esign_template_fields",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "template_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("esign_templates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "template_document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("esign_template_documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("recipient_index", sa.Integer(), nullable=False),
        sa.Column("field_type", _enum("esign_field_type"), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=False),
        _fraction("pos_x"),
        _fraction("pos_y"),
        _fraction("width"),
        _fraction("height"),
        sa.Column("required", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("label", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("pos_x >= 0 AND pos_x <= 1", name="ck_esign_template_fields_pos_x"),
        sa.CheckConstraint("pos_y >= 0 AND pos_y <= 1", name="ck_esign_template_fields_pos_y"),
        sa.CheckConstraint("width > 0 AND width <= 1", name="ck_esign_template_fields_width"),
        sa.CheckConstraint("height > 0 AND height <= 1", name="ck_esign_template_fields_height"),
        sa.CheckConstraint("page_number >= 0", name="ck_esign_template_fields_page_number"),
        sa.CheckConstraint("recipient_index >= 0", name="ck_esign_template_fields_recipient_index"),
    )


def downgrade() -> None:
    bind = op.get_bind()

    op.execute("DROP TRIGGER IF EXISTS trg_esign_events_append_only ON esign_events")
    # CASCADE also removes any older trigger name still bound to the function.
    op.execute("DROP FUNCTION IF EXISTS esign_events_block_mutation() CASCADE")

    op.drop_table("esign_template_fields")
    op.drop_table("esign_template_documents")
    op.drop_table("esign_templates")
    op.drop_table("esign_events")
    op.drop_table("esign_consent_records")
    op.drop_table("esign_signature_records")
    op.drop_table("esign_fields")
    op.drop_table("esign_recipients")
    op.drop_table("esign_documents")
    op.drop_table("esign_envelopes")

    for enum_name in _ENUMS:
        sa.Enum(name=enum_name).drop(bind, checkfirst=True)
