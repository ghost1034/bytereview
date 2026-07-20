"""E-sign template versions, bulk sends, schedules, PowerForms, and reporting scope.

Revision ID: 050_esign_scale_parity
Revises: 049_esign_advanced_recipients
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "050_esign_scale_parity"
down_revision: Union[str, Sequence[str], None] = "049_esign_advanced_recipients"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        for value in ("scheduled", "send_failed"):
            op.execute(f"ALTER TYPE esign_envelope_status ADD VALUE IF NOT EXISTS '{value}'")
        for value in ("scheduled", "unscheduled", "send_failed"):
            op.execute(f"ALTER TYPE esign_event_type ADD VALUE IF NOT EXISTS '{value}'")

    op.add_column("esign_templates", sa.Column("firm_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_esign_templates_firm", "esign_templates", "firms", ["firm_id"], ["id"], ondelete="CASCADE")

    op.create_table(
        "esign_template_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("esign_templates.id", ondelete="CASCADE"), nullable=False),
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("firms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("snapshot", postgresql.JSONB(), nullable=False),
        sa.Column("published_by_user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("published_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("uq_esign_template_versions_number", "esign_template_versions", ["template_id", "version"], unique=True)
    op.create_index("ix_esign_template_versions_firm", "esign_template_versions", ["firm_id", "published_at"])
    op.execute("""
        CREATE FUNCTION esign_template_versions_block_update()
        RETURNS trigger AS $$ BEGIN
          RAISE EXCEPTION 'published e-sign template versions are immutable';
        END; $$ LANGUAGE plpgsql;
        CREATE TRIGGER trg_esign_template_versions_immutable
        BEFORE UPDATE ON esign_template_versions
        FOR EACH ROW EXECUTE FUNCTION esign_template_versions_block_update();
    """)

    for name, type_, nullable in (
        ("firm_id", postgresql.UUID(as_uuid=True), True),
        ("source_type", sa.String(20), False),
        ("source_id", postgresql.UUID(as_uuid=True), True),
        ("template_version_id", postgresql.UUID(as_uuid=True), True),
        ("scheduled_at", sa.TIMESTAMP(timezone=True), True),
        ("schedule_timezone", sa.String(64), True),
        ("schedule_claimed_at", sa.TIMESTAMP(timezone=True), True),
        ("send_error_code", sa.String(64), True),
        ("send_error_message", sa.Text(), True),
    ):
        kwargs = {"nullable": nullable}
        if name == "source_type":
            kwargs["server_default"] = "manual"
        op.add_column("esign_envelopes", sa.Column(name, type_, **kwargs))
    op.create_foreign_key("fk_esign_envelopes_firm", "esign_envelopes", "firms", ["firm_id"], ["id"], ondelete="RESTRICT")
    op.create_foreign_key("fk_esign_envelopes_template_version", "esign_envelopes", "esign_template_versions", ["template_version_id"], ["id"], ondelete="SET NULL")

    # Assign legacy records to their owner's firm. Users without one receive a
    # deterministic personal firm so the backfill remains rerunnable.
    op.execute("""
        DO $$
        DECLARE account RECORD; new_firm_id uuid;
        BEGIN
          FOR account IN SELECT id, email FROM users WHERE firm_id IS NULL LOOP
            new_firm_id := gen_random_uuid();
            INSERT INTO firms (id, name, created_at, updated_at)
            VALUES (new_firm_id, split_part(account.email, '@', 1) || '''s Firm', now(), now());
            UPDATE users SET firm_id = new_firm_id, role = 'admin' WHERE id = account.id;
          END LOOP;
        END $$
    """)
    op.execute("UPDATE esign_templates t SET firm_id = u.firm_id FROM users u WHERE t.user_id = u.id AND t.firm_id IS NULL")
    op.execute("UPDATE esign_envelopes e SET firm_id = u.firm_id FROM users u WHERE e.user_id = u.id AND e.firm_id IS NULL")

    # Existing templates become immutable version 1 snapshots.
    op.execute("""
        INSERT INTO esign_template_versions (id, template_id, firm_id, version, snapshot, published_by_user_id, published_at)
        SELECT gen_random_uuid(), t.id, t.firm_id, 1,
          jsonb_build_object(
            'name', t.name, 'title', t.title, 'message', t.message,
            'signing_type', t.signing_type, 'date_format', t.date_format,
            'recipient_roles', t.recipient_roles,
            'documents', COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'id', d.id, 'display_order', d.display_order, 'original_filename', d.original_filename,
              'gcs_object_name', d.gcs_object_name, 'sha256', d.sha256,
              'page_count', d.page_count, 'file_size_bytes', d.file_size_bytes
            ) ORDER BY d.display_order) FROM esign_template_documents d WHERE d.template_id = t.id), '[]'::jsonb),
            'fields', COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'id', f.id, 'template_document_id', f.template_document_id,
              'recipient_index', f.recipient_index, 'field_type', f.field_type,
              'page_number', f.page_number, 'pos_x', f.pos_x, 'pos_y', f.pos_y,
              'width', f.width, 'height', f.height, 'required', f.required,
              'label', f.label, 'properties', f.properties
            )) FROM esign_template_fields f WHERE f.template_id = t.id), '[]'::jsonb)
          ), t.user_id, COALESCE(t.updated_at, now())
        FROM esign_templates t WHERE t.firm_id IS NOT NULL
        ON CONFLICT (template_id, version) DO NOTHING
    """)

    op.alter_column("esign_templates", "firm_id", nullable=False)
    op.alter_column("esign_envelopes", "firm_id", nullable=False)
    op.create_index("ix_esign_envelopes_firm_sent", "esign_envelopes", ["firm_id", "sent_at"])
    op.create_index("ix_esign_envelopes_firm_status_source", "esign_envelopes", ["firm_id", "status", "source_type"])
    op.create_index("ix_esign_envelopes_schedule_due", "esign_envelopes", ["status", "scheduled_at"])

    op.create_table(
        "esign_bulk_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("firms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("template_version_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("esign_template_versions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="validating"),
        sa.Column("kind", sa.String(20), nullable=False, server_default="bulk"),
        sa.Column("default_schedule_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("default_schedule_timezone", sa.String(64)),
        sa.Column("total_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("valid_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("invalid_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("processed_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("confirmed_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("completed_at", sa.TIMESTAMP(timezone=True)),
    )
    op.create_index("ix_esign_bulk_jobs_firm_created", "esign_bulk_jobs", ["firm_id", "created_at"])
    op.create_table(
        "esign_bulk_rows",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("job_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("esign_bulk_jobs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("row_number", sa.Integer(), nullable=False),
        sa.Column("idempotency_key", sa.String(64), nullable=False, unique=True),
        sa.Column("normalized_input", postgresql.JSONB(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_code", sa.String(64)), sa.Column("error_message", sa.Text()),
        sa.Column("scheduled_at", sa.TIMESTAMP(timezone=True)), sa.Column("schedule_timezone", sa.String(64)),
        sa.Column("envelope_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("esign_envelopes.id", ondelete="SET NULL"), unique=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("uq_esign_bulk_rows_job_row", "esign_bulk_rows", ["job_id", "row_number"], unique=True)
    op.create_index("ix_esign_bulk_rows_job_status", "esign_bulk_rows", ["job_id", "status"])

    op.create_table(
        "esign_powerforms",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("firms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("template_version_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("esign_template_versions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False), sa.Column("public_token_sha256", sa.String(64), nullable=False, unique=True),
        sa.Column("state", sa.String(20), nullable=False, server_default="active"),
        sa.Column("starts_at", sa.TIMESTAMP(timezone=True)), sa.Column("ends_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("submission_cap", sa.Integer()), sa.Column("submission_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("role_config", postgresql.JSONB(), nullable=False),
        sa.Column("public_fields", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("instructions", sa.Text()), sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_esign_powerforms_firm", "esign_powerforms", ["firm_id", "created_at"])
    op.create_table(
        "esign_powerform_submissions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("powerform_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("esign_powerforms.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("status", sa.String(24), nullable=False, server_default="pending_verification"),
        sa.Column("normalized_input", postgresql.JSONB(), nullable=False), sa.Column("initiating_email", sa.String(255), nullable=False),
        sa.Column("verification_token_sha256", sa.String(64), nullable=False, unique=True),
        sa.Column("verification_expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("verified_at", sa.TIMESTAMP(timezone=True)), sa.Column("consumed_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("envelope_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("esign_envelopes.id", ondelete="SET NULL"), unique=True),
        sa.Column("consent", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("ip_address", sa.String(64)), sa.Column("user_agent", sa.Text()),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_esign_powerform_submissions_form", "esign_powerform_submissions", ["powerform_id", "created_at"])


def downgrade() -> None:
    op.drop_table("esign_powerform_submissions")
    op.drop_table("esign_powerforms")
    op.drop_table("esign_bulk_rows")
    op.drop_table("esign_bulk_jobs")
    for index in ("ix_esign_envelopes_schedule_due", "ix_esign_envelopes_firm_status_source", "ix_esign_envelopes_firm_sent"):
        op.drop_index(index, table_name="esign_envelopes")
    op.drop_constraint("fk_esign_envelopes_template_version", "esign_envelopes", type_="foreignkey")
    op.drop_constraint("fk_esign_envelopes_firm", "esign_envelopes", type_="foreignkey")
    for column in ("send_error_message", "send_error_code", "schedule_claimed_at", "schedule_timezone", "scheduled_at", "template_version_id", "source_id", "source_type", "firm_id"):
        op.drop_column("esign_envelopes", column)
    op.execute("DROP TRIGGER IF EXISTS trg_esign_template_versions_immutable ON esign_template_versions")
    op.execute("DROP FUNCTION IF EXISTS esign_template_versions_block_update()")
    op.drop_table("esign_template_versions")
    op.drop_constraint("fk_esign_templates_firm", "esign_templates", type_="foreignkey")
    op.drop_column("esign_templates", "firm_id")
