"""E-Signature P0 record-integrity primitives.

Revision ID: 053_esign_p0_integrity
Revises: 052_esign_accountless_recipients
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "053_esign_p0_integrity"
down_revision: Union[str, Sequence[str], None] = "052_esign_accountless_recipients"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("esign_envelopes", sa.Column("template_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_esign_envelopes_template_id", "esign_envelopes", "esign_templates",
        ["template_id"], ["id"], ondelete="SET NULL",
    )
    op.execute("""
        UPDATE esign_envelopes e
        SET template_id = (ev.details ->> 'template_id')::uuid
        FROM esign_events ev
        WHERE ev.envelope_id = e.id
          AND ev.event_type = 'created'::esign_event_type
          AND ev.details ->> 'template_id' ~* '^[0-9a-f-]{36}$'
          AND EXISTS (SELECT 1 FROM esign_templates t WHERE t.id = (ev.details ->> 'template_id')::uuid)
    """)
    op.add_column("esign_envelopes", sa.Column("sealing_state", sa.String(24), nullable=False, server_default="not_ready"))
    op.add_column("esign_envelopes", sa.Column("sealing_last_error", sa.Text(), nullable=True))
    op.add_column("esign_envelopes", sa.Column("sealing_started_at", sa.TIMESTAMP(timezone=True), nullable=True))

    op.add_column("esign_recipients", sa.Column("template_role_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index("ix_esign_recipients_template_role", "esign_recipients", ["envelope_id", "template_role_id"])
    op.add_column("esign_template_fields", sa.Column("recipient_role_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index("ix_esign_template_fields_role", "esign_template_fields", ["template_id", "recipient_role_id"])

    # Stable IDs are added to mutable template roles. Published snapshots stay
    # immutable and are normalized by the compatibility adapter at read time.
    op.execute("""
        UPDATE esign_templates t
        SET recipient_roles = normalized.roles
        FROM (
          SELECT id, jsonb_agg(
            CASE WHEN role ? 'id' THEN role
                 ELSE jsonb_set(role, '{id}', to_jsonb(gen_random_uuid()::text), true)
            END ORDER BY ordinal
          ) AS roles
          FROM esign_templates, jsonb_array_elements(recipient_roles) WITH ORDINALITY AS r(role, ordinal)
          GROUP BY id
        ) normalized
        WHERE normalized.id = t.id
    """)
    op.execute("""
        UPDATE esign_template_fields f
        SET recipient_role_id = (t.recipient_roles -> f.recipient_index ->> 'id')::uuid
        FROM esign_templates t
        WHERE t.id = f.template_id
          AND f.recipient_role_id IS NULL
          AND jsonb_array_length(t.recipient_roles) > f.recipient_index
    """)

    op.create_table(
        "esign_work_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("firms.id", ondelete="CASCADE"), nullable=True),
        sa.Column("envelope_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("esign_envelopes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("idempotency_key", sa.String(255), nullable=False, unique=True),
        sa.Column("state", sa.String(24), nullable=False, server_default="queued"),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_attempt_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("claimed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.UniqueConstraint("envelope_id", "kind", name="uq_esign_work_items_envelope_kind"),
    )
    op.create_index("ix_esign_work_items_due", "esign_work_items", ["state", "next_attempt_at"])

    op.create_table(
        "esign_email_deliveries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("firms.id", ondelete="CASCADE"), nullable=True),
        sa.Column("envelope_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("esign_envelopes.id", ondelete="CASCADE"), nullable=True),
        sa.Column("recipient_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("kind", sa.String(48), nullable=False),
        sa.Column("to_email", sa.String(255), nullable=False),
        sa.Column("subject", sa.Text(), nullable=False),
        sa.Column("html_body", sa.Text(), nullable=False),
        sa.Column("text_body", sa.Text(), nullable=False),
        sa.Column("idempotency_key", sa.String(255), nullable=False, unique=True),
        sa.Column("state", sa.String(24), nullable=False, server_default="queued"),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_attempt_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("delivered_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.create_index("ix_esign_email_deliveries_due", "esign_email_deliveries", ["state", "next_attempt_at"])
    op.create_index("ix_esign_email_deliveries_envelope", "esign_email_deliveries", ["envelope_id", "created_at"])

    op.add_column("esign_powerform_submissions", sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("esign_powerform_submissions", sa.Column("last_error", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("esign_powerform_submissions", "last_error")
    op.drop_column("esign_powerform_submissions", "attempt_count")
    op.drop_index("ix_esign_email_deliveries_envelope", table_name="esign_email_deliveries")
    op.drop_index("ix_esign_email_deliveries_due", table_name="esign_email_deliveries")
    op.drop_table("esign_email_deliveries")
    op.drop_index("ix_esign_work_items_due", table_name="esign_work_items")
    op.drop_table("esign_work_items")
    op.drop_index("ix_esign_template_fields_role", table_name="esign_template_fields")
    op.drop_column("esign_template_fields", "recipient_role_id")
    op.drop_index("ix_esign_recipients_template_role", table_name="esign_recipients")
    op.drop_column("esign_recipients", "template_role_id")
    op.drop_column("esign_envelopes", "sealing_started_at")
    op.drop_column("esign_envelopes", "sealing_last_error")
    op.drop_column("esign_envelopes", "sealing_state")
    op.drop_constraint("fk_esign_envelopes_template_id", "esign_envelopes", type_="foreignkey")
    op.drop_column("esign_envelopes", "template_id")
