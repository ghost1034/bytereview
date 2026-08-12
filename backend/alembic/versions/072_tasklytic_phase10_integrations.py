"""Add Tasklytic production integration and first-party event records.

Revision ID: 072_tasklytic_phase10
Revises: 071_tasklytic_phase7_ai
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "072_tasklytic_phase10"
down_revision = "071_tasklytic_phase7_ai"
branch_labels = None
depends_on = None

JSON_PAYLOAD = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def upgrade() -> None:
    op.create_table(
        "tasklytic_integration_connections",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", sa.String(128), sa.ForeignKey("tasklytic_workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("owner_user_id", sa.String(128)),
        sa.Column("external_account_id", sa.String(255)),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        sa.Column("capability", JSON_PAYLOAD, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("last_error_code", sa.String(128)),
        sa.Column("last_error_detail", sa.Text()),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("revoked_at", sa.TIMESTAMP(timezone=True)),
        sa.CheckConstraint("provider IN ('google_drive', 'vertex_receipts', 'gmail', 'gcs', 'stripe_connect')", name="ck_tasklytic_integration_provider"),
        sa.CheckConstraint("status IN ('active', 'degraded', 'revoked', 'disabled')", name="ck_tasklytic_integration_status"),
        sa.UniqueConstraint("workspace_id", "provider", name="uq_tasklytic_integration_workspace_provider"),
    )
    op.create_index("ix_tasklytic_integrations_workspace_status", "tasklytic_integration_connections", ["workspace_id", "status"])
    op.create_table(
        "tasklytic_external_references",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", sa.String(128), sa.ForeignKey("tasklytic_workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("resource_type", sa.String(64), nullable=False),
        sa.Column("external_id", sa.String(255), nullable=False),
        sa.Column("local_kind", sa.String(64), nullable=False),
        sa.Column("local_id", sa.String(128), nullable=False),
        sa.Column("sync_status", sa.String(24), nullable=False, server_default="synchronized"),
        sa.Column("external_version", sa.String(255)),
        sa.Column("metadata_json", JSON_PAYLOAD, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("last_error_code", sa.String(128)),
        sa.Column("last_error_detail", sa.Text()),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("sync_status IN ('pending', 'synchronized', 'partial', 'failed', 'conflict')", name="ck_tasklytic_external_reference_status"),
        sa.UniqueConstraint("workspace_id", "provider", "resource_type", "external_id", name="uq_tasklytic_external_provider_id"),
        sa.UniqueConstraint("workspace_id", "provider", "local_kind", "local_id", name="uq_tasklytic_external_local_id"),
    )
    op.create_index("ix_tasklytic_external_reference_local", "tasklytic_external_references", ["workspace_id", "local_kind", "local_id"])
    op.create_table(
        "tasklytic_webhook_receipts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("event_id", sa.String(255), nullable=False),
        sa.Column("payload_digest", sa.String(64), nullable=False),
        sa.Column("workspace_id", sa.String(128), sa.ForeignKey("tasklytic_workspaces.id", ondelete="CASCADE")),
        sa.Column("status", sa.String(16), nullable=False, server_default="received"),
        sa.Column("local_kind", sa.String(64)),
        sa.Column("local_id", sa.String(128)),
        sa.Column("failure_detail", sa.Text()),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("processed_at", sa.TIMESTAMP(timezone=True)),
        sa.CheckConstraint("status IN ('received', 'processed', 'ignored', 'failed')", name="ck_tasklytic_webhook_receipt_status"),
        sa.UniqueConstraint("provider", "event_id", name="uq_tasklytic_webhook_provider_event"),
    )
    op.create_index("ix_tasklytic_webhooks_workspace_created", "tasklytic_webhook_receipts", ["workspace_id", "created_at"])
    op.create_table(
        "tasklytic_usage_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", sa.String(128), sa.ForeignKey("tasklytic_workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actor_id", sa.String(128), nullable=False),
        sa.Column("event_name", sa.String(96), nullable=False),
        sa.Column("properties", JSON_PAYLOAD, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("occurred_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_tasklytic_usage_workspace_occurred", "tasklytic_usage_events", ["workspace_id", "occurred_at"])


def downgrade() -> None:
    for table in (
        "tasklytic_usage_events", "tasklytic_webhook_receipts",
        "tasklytic_external_references", "tasklytic_integration_connections",
    ):
        op.drop_table(table)
