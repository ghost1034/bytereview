"""Add the Prepared by Client module.

Revision ID: 066_pbc_module
Revises: 065_hosted_claw_native_cron
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "066_pbc_module"
down_revision = "065_hosted_claw_native_cron"
branch_labels = None
depends_on = None


def upgrade() -> None:
    jsonb = postgresql.JSONB(astext_type=sa.Text())
    op.create_table(
        "pbc_firm_settings",
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("firms.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("timezone", sa.String(64), server_default="America/Los_Angeles", nullable=False),
        sa.Column("portal_name", sa.String(255), nullable=True),
        sa.Column("logo_url", sa.Text(), nullable=True),
        sa.Column("reminder_days_before", sa.Integer(), server_default="3", nullable=False),
        sa.Column("overdue_interval_days", sa.Integer(), server_default="3", nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "pbc_engagements",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("firms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clients.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("client_name_snapshot", sa.String(255), nullable=False),
        sa.Column("engagement_type", sa.String(32), server_default="audit", nullable=False),
        sa.Column("period_start", sa.Date(), nullable=True),
        sa.Column("period_end", sa.Date(), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("owner_user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(16), server_default="draft", nullable=False),
        sa.Column("tasklytic_workspace_id", sa.String(128), nullable=True),
        sa.Column("tasklytic_project_id", sa.String(128), nullable=True),
        sa.Column("reminders_paused", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("revision", sa.Integer(), server_default="1", nullable=False),
        sa.Column("published_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("completed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("archived_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_by_user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("status IN ('draft','active','completed','archived')", name="ck_pbc_engagement_status"),
        sa.CheckConstraint("engagement_type IN ('audit','tax','bookkeeping','advisory','other')", name="ck_pbc_engagement_type"),
    )
    op.create_index("ix_pbc_engagements_firm_status", "pbc_engagements", ["firm_id", "status"])
    op.create_index("ix_pbc_engagements_client", "pbc_engagements", ["firm_id", "client_id"])
    op.create_table(
        "pbc_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("engagement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("pbc_engagements.id", ondelete="CASCADE"), nullable=False),
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("firms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("request_number", sa.String(64), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("category", sa.String(128), nullable=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("period_end", sa.Date(), nullable=True),
        sa.Column("priority", sa.String(16), server_default="normal", nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("owner_user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("expected_filename", sa.String(500), nullable=True),
        sa.Column("expected_formats", jsonb, nullable=False),
        sa.Column("gl_account", sa.String(128), nullable=True),
        sa.Column("gl_balance", sa.String(64), nullable=True),
        sa.Column("sensitive", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("requires_redaction", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("dependency_ids", jsonb, nullable=False),
        sa.Column("status", sa.String(20), server_default="draft", nullable=False),
        sa.Column("status_reason", sa.Text(), nullable=True),
        sa.Column("external_source_id", sa.String(255), nullable=True),
        sa.Column("revision", sa.Integer(), server_default="1", nullable=False),
        sa.Column("submitted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("accepted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_by_user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("priority IN ('low','normal','high','urgent')", name="ck_pbc_request_priority"),
        sa.CheckConstraint("status IN ('draft','open','submitted','needs_changes','accepted','waived')", name="ck_pbc_request_status"),
        sa.UniqueConstraint("engagement_id", "request_number", name="uq_pbc_request_number"),
    )
    op.create_index("ix_pbc_requests_engagement_status", "pbc_requests", ["engagement_id", "status"])
    op.create_index("ix_pbc_requests_firm_due", "pbc_requests", ["firm_id", "due_date", "status"])
    op.create_table(
        "pbc_contacts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("firms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clients.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_by_user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("firm_id", "email", name="uq_pbc_contact_firm_email"),
    )
    op.create_index("ix_pbc_contacts_client", "pbc_contacts", ["firm_id", "client_id"])
    op.create_table(
        "pbc_engagement_contacts",
        sa.Column("engagement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("pbc_engagements.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("contact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("pbc_contacts.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("role", sa.String(16), server_default="contributor", nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("role IN ('coordinator','contributor')", name="ck_pbc_engagement_contact_role"),
    )
    op.create_table(
        "pbc_request_assignments",
        sa.Column("request_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("pbc_requests.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("contact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("pbc_contacts.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "pbc_documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("request_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("pbc_requests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("firms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("object_name", sa.Text(), nullable=False, unique=True),
        sa.Column("filename", sa.String(512), nullable=False),
        sa.Column("mime_type", sa.String(255), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("checksum_sha256", sa.String(64), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("state", sa.String(20), server_default="initiated", nullable=False),
        sa.Column("scan_status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("scan_detail", sa.Text(), nullable=True),
        sa.Column("uploaded_by_kind", sa.String(16), nullable=False),
        sa.Column("uploaded_by_id", sa.String(128), nullable=True),
        sa.Column("ai_metadata", jsonb, nullable=True),
        sa.Column("completed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("size_bytes >= 0 AND size_bytes <= 104857600", name="ck_pbc_document_size"),
        sa.CheckConstraint("state IN ('initiated','quarantined','available','rejected','deleted','abandoned')", name="ck_pbc_document_state"),
        sa.CheckConstraint("scan_status IN ('pending','clean','infected','failed','skipped')", name="ck_pbc_document_scan_status"),
        sa.CheckConstraint("uploaded_by_kind IN ('firm','client')", name="ck_pbc_document_actor_kind"),
        sa.UniqueConstraint("request_id", "version", name="uq_pbc_document_request_version"),
    )
    op.create_index("ix_pbc_documents_request_state", "pbc_documents", ["request_id", "state"])
    op.create_table(
        "pbc_comments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("request_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("pbc_requests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("firms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("visibility", sa.String(16), server_default="client", nullable=False),
        sa.Column("actor_kind", sa.String(16), nullable=False),
        sa.Column("actor_id", sa.String(128), nullable=True),
        sa.Column("actor_name", sa.String(255), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("visibility IN ('client','internal')", name="ck_pbc_comment_visibility"),
        sa.CheckConstraint("actor_kind IN ('firm','client','system')", name="ck_pbc_comment_actor_kind"),
    )
    op.create_index("ix_pbc_comments_request_created", "pbc_comments", ["request_id", "created_at"])
    op.create_table(
        "pbc_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("firms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("engagement_type", sa.String(32), server_default="audit", nullable=False),
        sa.Column("items", jsonb, nullable=False),
        sa.Column("created_by_user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_pbc_templates_firm", "pbc_templates", ["firm_id", "name"])
    op.create_table(
        "pbc_access_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("engagement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("pbc_engagements.id", ondelete="CASCADE"), nullable=False),
        sa.Column("contact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("pbc_contacts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("purpose", sa.String(16), nullable=False),
        sa.Column("request_ids", jsonb, nullable=False),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("one_time", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("used_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_by_user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("purpose IN ('portal_login','scoped_link')", name="ck_pbc_access_token_purpose"),
    )
    op.create_index("ix_pbc_access_tokens_contact", "pbc_access_tokens", ["contact_id", "expires_at"])
    op.create_table(
        "pbc_portal_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("engagement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("pbc_engagements.id", ondelete="CASCADE"), nullable=False),
        sa.Column("contact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("pbc_contacts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("csrf_hash", sa.String(64), nullable=False),
        sa.Column("request_ids", jsonb, nullable=False),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_seen_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_pbc_sessions_expiry", "pbc_portal_sessions", ["expires_at", "revoked_at"])
    op.create_table(
        "pbc_audit_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("firms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("engagement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("pbc_engagements.id", ondelete="CASCADE"), nullable=False),
        sa.Column("request_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("pbc_requests.id", ondelete="SET NULL"), nullable=True),
        sa.Column("actor_kind", sa.String(16), nullable=False),
        sa.Column("actor_id", sa.String(128), nullable=True),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("details", jsonb, nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_pbc_audit_engagement_created", "pbc_audit_events", ["engagement_id", "created_at"])
    op.create_table(
        "pbc_notification_outbox",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("engagement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("pbc_engagements.id", ondelete="CASCADE"), nullable=False),
        sa.Column("request_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("pbc_requests.id", ondelete="CASCADE"), nullable=True),
        sa.Column("contact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("pbc_contacts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("dedupe_key", sa.String(255), nullable=False, unique=True),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("recipient_email", sa.String(320), nullable=False),
        sa.Column("payload", jsonb, nullable=False),
        sa.Column("status", sa.String(16), server_default="pending", nullable=False),
        sa.Column("attempt_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("next_attempt_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("sent_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("status IN ('pending','sending','sent','failed')", name="ck_pbc_notification_status"),
    )
    op.create_index("ix_pbc_notification_due", "pbc_notification_outbox", ["status", "next_attempt_at"])


def downgrade() -> None:
    for table in (
        "pbc_notification_outbox", "pbc_audit_events", "pbc_portal_sessions", "pbc_access_tokens",
        "pbc_templates", "pbc_comments", "pbc_documents", "pbc_request_assignments",
        "pbc_engagement_contacts", "pbc_contacts", "pbc_requests", "pbc_engagements", "pbc_firm_settings",
    ):
        op.drop_table(table)
