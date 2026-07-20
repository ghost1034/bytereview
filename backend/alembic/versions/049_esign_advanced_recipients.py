"""Role-aware e-sign recipients, routing versions, and guest ceremonies.

Revision ID: 049_esign_advanced_recipients
Revises: 048_esign_core_field_embedding
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "049_esign_advanced_recipients"
down_revision: Union[str, Sequence[str], None] = "048_esign_core_field_embedding"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        for value in (
            "approver", "certified_delivery", "agent", "editor", "witness", "in_person_signer",
        ):
            op.execute(f"ALTER TYPE esign_recipient_role ADD VALUE IF NOT EXISTS '{value}'")
        for value in ("approved", "delivered", "managed"):
            op.execute(f"ALTER TYPE esign_recipient_status ADD VALUE IF NOT EXISTS '{value}'")
        for value in (
            "corrected", "reassigned", "approved", "delivered", "manager_action",
            "witness_configured", "host_handoff", "guest_invitation_exchanged",
            "guest_consent_given", "routing_advanced",
        ):
            op.execute(f"ALTER TYPE esign_event_type ADD VALUE IF NOT EXISTS '{value}'")

    op.add_column("esign_envelopes", sa.Column("routing_version", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("esign_envelopes", sa.Column("allow_reassignment", sa.Boolean(), nullable=False, server_default=sa.false()))

    # Audit events retain recipient UUIDs even if an outstanding recipient is
    # removed by correction. An ON DELETE action would violate append-only.
    op.drop_constraint("esign_events_recipient_id_fkey", "esign_events", type_="foreignkey")

    op.drop_index("uq_esign_recipients_envelope_email", table_name="esign_recipients")
    op.alter_column("esign_recipients", "email", existing_type=sa.String(length=255), nullable=True)
    op.alter_column("esign_recipients", "name", existing_type=sa.String(length=255), nullable=True)
    op.add_column("esign_recipients", sa.Column("role_label", sa.String(length=255), nullable=True))
    op.add_column("esign_recipients", sa.Column("private_message", sa.Text(), nullable=True))
    op.add_column("esign_recipients", sa.Column("managed_by_recipient_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("esign_recipients", sa.Column("witness_for_recipient_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("esign_recipients", sa.Column("host_name", sa.String(length=255), nullable=True))
    op.add_column("esign_recipients", sa.Column("host_email", sa.String(length=255), nullable=True))
    op.add_column("esign_recipients", sa.Column("host_user_id", sa.String(length=128), nullable=True))
    op.add_column("esign_recipients", sa.Column("allow_reassignment", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("esign_recipients", sa.Column("action_completed_at", sa.TIMESTAMP(timezone=True), nullable=True))
    op.add_column("esign_recipients", sa.Column("identity_changed_at", sa.TIMESTAMP(timezone=True), nullable=True))
    op.create_foreign_key(
        "fk_esign_recipients_managed_by", "esign_recipients", "esign_recipients",
        ["managed_by_recipient_id"], ["id"], ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_esign_recipients_witness_for", "esign_recipients", "esign_recipients",
        ["witness_for_recipient_id"], ["id"], ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_esign_recipients_host_user", "esign_recipients", "users",
        ["host_user_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index(
        "uq_esign_recipients_envelope_email", "esign_recipients", ["envelope_id", "email"],
        unique=True, postgresql_where=sa.text("email IS NOT NULL"),
    )
    op.execute(
        "UPDATE esign_recipients SET action_completed_at = signed_at "
        "WHERE status = 'signed'::esign_recipient_status AND signed_at IS NOT NULL"
    )

    op.create_table(
        "esign_recipient_changes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("envelope_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("esign_envelopes.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("recipient_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("envelope_version", sa.Integer(), nullable=False),
        sa.Column("change_type", sa.String(length=64), nullable=False),
        sa.Column("actor_user_id", sa.String(length=128), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("actor_email", sa.String(length=255), nullable=True),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("before_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("after_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_esign_recipient_changes_envelope", "esign_recipient_changes", ["envelope_id", "created_at"])

    op.create_table(
        "esign_guest_invitations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("envelope_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("esign_envelopes.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("recipient_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token_sha256", sa.String(length=64), nullable=False, unique=True),
        sa.Column("routing_version", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("exchanged_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_esign_guest_invitations_recipient", "esign_guest_invitations", ["recipient_id"])
    op.create_table(
        "esign_guest_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("envelope_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("esign_envelopes.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("recipient_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("invitation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("esign_guest_invitations.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("token_sha256", sa.String(length=64), nullable=False, unique=True),
        sa.Column("csrf_sha256", sa.String(length=64), nullable=False),
        sa.Column("routing_version", sa.Integer(), nullable=False),
        sa.Column("last_seen_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("idle_expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("absolute_expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_esign_guest_sessions_recipient", "esign_guest_sessions", ["recipient_id"])

    op.execute("""
        CREATE OR REPLACE FUNCTION esign_recipient_changes_block_mutation()
        RETURNS trigger AS $$ BEGIN
            RAISE EXCEPTION 'esign_recipient_changes is append-only: % not allowed', TG_OP;
        END; $$ LANGUAGE plpgsql;
        CREATE TRIGGER trg_esign_recipient_changes_append_only
        BEFORE UPDATE OR DELETE ON esign_recipient_changes
        FOR EACH ROW EXECUTE FUNCTION esign_recipient_changes_block_mutation();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_esign_recipient_changes_append_only ON esign_recipient_changes")
    op.execute("DROP FUNCTION IF EXISTS esign_recipient_changes_block_mutation() CASCADE")
    op.drop_table("esign_guest_sessions")
    op.drop_table("esign_guest_invitations")
    op.drop_table("esign_recipient_changes")
    op.execute("DROP TRIGGER IF EXISTS trg_esign_events_append_only ON esign_events")
    op.execute("""
        UPDATE esign_events event SET recipient_id = NULL
        WHERE recipient_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM esign_recipients recipient WHERE recipient.id = event.recipient_id)
    """)
    op.create_foreign_key(
        "esign_events_recipient_id_fkey", "esign_events", "esign_recipients",
        ["recipient_id"], ["id"], ondelete="SET NULL",
    )
    op.execute("""
        CREATE TRIGGER trg_esign_events_append_only
        BEFORE UPDATE OR DELETE ON esign_events
        FOR EACH ROW EXECUTE FUNCTION esign_events_block_mutation();
    """)
    op.drop_constraint("fk_esign_recipients_host_user", "esign_recipients", type_="foreignkey")
    op.drop_constraint("fk_esign_recipients_witness_for", "esign_recipients", type_="foreignkey")
    op.drop_constraint("fk_esign_recipients_managed_by", "esign_recipients", type_="foreignkey")
    for column in (
        "identity_changed_at", "action_completed_at", "allow_reassignment", "host_user_id", "host_email", "host_name",
        "witness_for_recipient_id", "managed_by_recipient_id", "private_message", "role_label",
    ):
        op.drop_column("esign_recipients", column)
    op.drop_index("uq_esign_recipients_envelope_email", table_name="esign_recipients")
    op.alter_column("esign_recipients", "name", existing_type=sa.String(length=255), nullable=False)
    op.alter_column("esign_recipients", "email", existing_type=sa.String(length=255), nullable=False)
    op.create_index("uq_esign_recipients_envelope_email", "esign_recipients", ["envelope_id", "email"], unique=True)
    op.drop_column("esign_envelopes", "allow_reassignment")
    op.drop_column("esign_envelopes", "routing_version")
