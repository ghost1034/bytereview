"""Firm E-Signature administration, sharing, branding, and webhook outbox.

Revision ID: 051_esign_administration_parity
Revises: 050_esign_scale_parity
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "051_esign_administration_parity"
down_revision: Union[str, Sequence[str], None] = "050_esign_scale_parity"
branch_labels = None
depends_on = None


ALL_FEATURES = {
    "scheduled_sending": True, "bulk_sends": True, "powerforms": True,
    "advanced_recipients": True, "recipient_reassignment": True,
    "signer_attachments": True, "envelope_webhooks": True,
}

BUILT_INS = {
    "sender": {"send": True, "templates": True, "scheduling": True, "bulk_sends": True,
               "powerforms": True, "advanced_recipients": True, "corrections": True,
               "voiding": True, "reminders": True, "sharing": True, "reports": True,
               "envelope_webhooks": True, "exports": True},
    "firm_operator": {"send": True, "templates": True, "scheduling": True, "bulk_sends": True,
                      "powerforms": True, "advanced_recipients": True, "corrections": True,
                      "voiding": True, "reminders": True, "sharing": True,
                      "manage_shared_envelopes": True, "firm_view": True, "firm_manage": True,
                      "custody_transfer": True, "reports": True, "exports": True,
                      "envelope_webhooks": True},
    "read_only_auditor": {"firm_view": True, "reports": True, "exports": True},
    "restricted": {},
}


def upgrade() -> None:
    with op.get_context().autocommit_block():
        for value in ("access_granted", "access_revoked", "ownership_transferred", "webhook.test"):
            op.execute(f"ALTER TYPE esign_event_type ADD VALUE IF NOT EXISTS '{value}'")
    op.create_table(
        "esign_brand_assets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("firms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("gcs_object_name", sa.Text(), nullable=False, unique=True),
        sa.Column("content_type", sa.String(32), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("created_by_user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_esign_brand_assets_firm", "esign_brand_assets", ["firm_id", "created_at"])
    op.create_table(
        "esign_permission_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("firms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("capabilities", postgresql.JSONB(), nullable=False),
        sa.Column("built_in_key", sa.String(32)),
        sa.Column("locked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_by_user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("firm_id", "name", name="uq_esign_permission_profiles_firm_name"),
        sa.UniqueConstraint("firm_id", "built_in_key", name="uq_esign_permission_profiles_builtin"),
    )
    op.create_table(
        "esign_brand_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("firms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("logo_asset_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("esign_brand_assets.id", ondelete="RESTRICT")),
        sa.Column("primary_color", sa.String(7), nullable=False, server_default="#1D4ED8"),
        sa.Column("accent_color", sa.String(7), nullable=False, server_default="#0F172A"),
        sa.Column("email_header", sa.Text()), sa.Column("email_footer", sa.Text()),
        sa.Column("reply_to_address", sa.String(255)), sa.Column("signing_welcome_text", sa.Text()),
        sa.Column("support_url", sa.Text()),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("allowed_profile_ids", postgresql.ARRAY(postgresql.UUID(as_uuid=True))),
        sa.Column("created_by_user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("firm_id", "name", name="uq_esign_brand_profiles_firm_name"),
    )
    op.create_table(
        "esign_firm_settings",
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("firms.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("default_brand_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("esign_brand_profiles.id", ondelete="SET NULL")),
        sa.Column("date_format", sa.String(32), nullable=False, server_default="MM/DD/YYYY"),
        sa.Column("signing_type", sa.String(20), nullable=False, server_default="sequential"),
        sa.Column("expiration_days", sa.Integer(), server_default="30"),
        sa.Column("reminder_interval_hours", sa.Integer(), server_default="72"),
        sa.Column("allow_reassignment", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("sender_overrides", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("features", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("updated_by_user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.add_column("esign_templates", sa.Column("brand_id", postgresql.UUID(as_uuid=True)))
    op.create_foreign_key("fk_esign_templates_brand", "esign_templates", "esign_brand_profiles", ["brand_id"], ["id"], ondelete="SET NULL")
    op.add_column("esign_powerforms", sa.Column("brand_id", postgresql.UUID(as_uuid=True)))
    op.create_foreign_key("fk_esign_powerforms_brand", "esign_powerforms", "esign_brand_profiles", ["brand_id"], ["id"], ondelete="SET NULL")
    op.create_table(
        "esign_permission_assignments",
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("firms.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("profile_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("esign_permission_profiles.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("assigned_by_user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "esign_envelope_grants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("envelope_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("esign_envelopes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("firms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("access_level", sa.String(16), nullable=False),
        sa.Column("granted_by_user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("access_level IN ('view', 'manage')", name="ck_esign_envelope_grants_level"),
        sa.UniqueConstraint("envelope_id", "user_id", name="uq_esign_envelope_grants_user"),
    )
    op.create_index("ix_esign_envelope_grants_user", "esign_envelope_grants", ["firm_id", "user_id"])

    op.create_table(
        "esign_webhook_configurations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("firms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("envelope_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("esign_envelopes.id", ondelete="CASCADE")),
        sa.Column("endpoint_url", sa.Text(), nullable=False), sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("event_filters", postgresql.ARRAY(sa.String(64)), nullable=False, server_default="{}"),
        sa.Column("include_completed_documents", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("secret_current", sa.Text(), nullable=False), sa.Column("secret_previous", sa.Text()),
        sa.Column("secret_previous_expires_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("created_by_user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("disabled_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_esign_webhook_configurations_scope", "esign_webhook_configurations", ["firm_id", "envelope_id", "enabled"])
    op.create_table(
        "esign_webhook_deliveries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("configuration_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("esign_webhook_configurations.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("esign_events.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("firms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("envelope_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("esign_envelopes.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False), sa.Column("status", sa.String(24), nullable=False, server_default="pending"),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_attempt_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column("claimed_at", sa.TIMESTAMP(timezone=True)), sa.Column("completed_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("terminal_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("manual_retry_by_user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("configuration_id", "event_id", name="uq_esign_webhook_delivery_event"),
    )
    op.create_index("ix_esign_webhook_deliveries_due", "esign_webhook_deliveries", ["status", "next_attempt_at"])
    op.create_index("ix_esign_webhook_deliveries_firm", "esign_webhook_deliveries", ["firm_id", "created_at"])
    op.create_table(
        "esign_webhook_attempts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("delivery_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("esign_webhook_deliveries.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("attempt_number", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.TIMESTAMP(timezone=True), nullable=False), sa.Column("completed_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=False), sa.Column("result", sa.String(24), nullable=False),
        sa.Column("http_status", sa.Integer()), sa.Column("response_excerpt", sa.Text()), sa.Column("error", sa.Text()),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("delivery_id", "attempt_number", name="uq_esign_webhook_attempt_number"),
    )
    op.create_table(
        "esign_admin_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("firms.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("actor_user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("actor_email", sa.String(255)), sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("target_type", sa.String(32)), sa.Column("target_id", sa.String(128)), sa.Column("details", postgresql.JSONB()),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_esign_admin_events_firm_created", "esign_admin_events", ["firm_id", "created_at"])

    op.add_column("esign_envelopes", sa.Column("brand_id", postgresql.UUID(as_uuid=True)))
    op.add_column("esign_envelopes", sa.Column("brand_snapshot", postgresql.JSONB()))
    op.add_column("esign_envelopes", sa.Column("settings_snapshot", postgresql.JSONB()))
    op.create_foreign_key("fk_esign_envelopes_brand", "esign_envelopes", "esign_brand_profiles", ["brand_id"], ["id"], ondelete="SET NULL")

    op.execute(sa.text("INSERT INTO esign_firm_settings (firm_id, features) SELECT id, CAST(:features AS jsonb) FROM firms ON CONFLICT DO NOTHING").bindparams(features=__import__("json").dumps(ALL_FEATURES)))
    for key, capabilities in BUILT_INS.items():
        name = {"sender": "Sender", "firm_operator": "Firm Operator", "read_only_auditor": "Read-only Auditor", "restricted": "Restricted"}[key]
        op.execute(sa.text("""
            INSERT INTO esign_permission_profiles (id, firm_id, name, capabilities, built_in_key, locked)
            SELECT gen_random_uuid(), id, :name, CAST(:caps AS jsonb), :key, true FROM firms
            ON CONFLICT (firm_id, built_in_key) DO NOTHING
        """).bindparams(name=name, caps=__import__("json").dumps(capabilities), key=key))
    op.execute("""
        INSERT INTO esign_permission_assignments (firm_id, user_id, profile_id)
        SELECT u.firm_id, u.id, p.id FROM users u
        JOIN esign_permission_profiles p ON p.firm_id = u.firm_id AND p.built_in_key = 'sender'
        WHERE u.firm_id IS NOT NULL AND u.role <> 'admin' ON CONFLICT DO NOTHING
    """)

    op.execute("""
        CREATE FUNCTION esign_webhook_attempts_block_mutation() RETURNS trigger AS $$ BEGIN
          IF TG_OP = 'DELETE' AND current_setting('esign.retention_cleanup', true) = 'on' THEN RETURN OLD; END IF;
          RAISE EXCEPTION 'esign_webhook_attempts is append-only';
        END; $$ LANGUAGE plpgsql;
        CREATE TRIGGER trg_esign_webhook_attempts_append_only BEFORE UPDATE OR DELETE ON esign_webhook_attempts
        FOR EACH ROW EXECUTE FUNCTION esign_webhook_attempts_block_mutation();
        CREATE FUNCTION esign_admin_events_block_mutation() RETURNS trigger AS $$ BEGIN
          RAISE EXCEPTION 'esign_admin_events is append-only';
        END; $$ LANGUAGE plpgsql;
        CREATE TRIGGER trg_esign_admin_events_append_only BEFORE UPDATE OR DELETE ON esign_admin_events
        FOR EACH ROW EXECUTE FUNCTION esign_admin_events_block_mutation();
    """)


def downgrade() -> None:
    for table in ("esign_admin_events", "esign_webhook_attempts"):
        op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_append_only ON {table}")
        op.execute(f"DROP FUNCTION IF EXISTS {table}_block_mutation()")
    op.drop_constraint("fk_esign_envelopes_brand", "esign_envelopes", type_="foreignkey")
    for column in ("settings_snapshot", "brand_snapshot", "brand_id"):
        op.drop_column("esign_envelopes", column)
    op.drop_constraint("fk_esign_powerforms_brand", "esign_powerforms", type_="foreignkey")
    op.drop_column("esign_powerforms", "brand_id")
    op.drop_constraint("fk_esign_templates_brand", "esign_templates", type_="foreignkey")
    op.drop_column("esign_templates", "brand_id")
    for table in ("esign_admin_events", "esign_webhook_attempts", "esign_webhook_deliveries", "esign_webhook_configurations",
                  "esign_envelope_grants", "esign_permission_assignments", "esign_firm_settings", "esign_brand_profiles",
                  "esign_permission_profiles", "esign_brand_assets"):
        op.drop_table(table)
