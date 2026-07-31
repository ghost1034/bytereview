"""Add the hosted Claw Slack control-plane schema.

Revision ID: 062_hosted_claw
Revises: 061_merge_esign_tasklytic_heads
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "062_hosted_claw"
down_revision = "061_merge_esign_tasklytic_heads"
branch_labels = None
depends_on = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    op.add_column("connector_tokens", sa.Column("token_kind", sa.String(20), server_default="self_hosted", nullable=False))
    op.add_column("connector_tokens", sa.Column("runtime_id", sa.String(128), nullable=True))
    op.create_check_constraint("ck_connector_tokens_kind", "connector_tokens", "token_kind IN ('self_hosted', 'hosted_runtime')")
    op.create_index("ix_connector_tokens_runtime_id", "connector_tokens", ["runtime_id"])

    op.create_table(
        "hosted_claw_slack_installations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("enterprise_id", sa.String(64), nullable=True),
        sa.Column("team_id", sa.String(64), nullable=False),
        sa.Column("team_name", sa.String(255), nullable=True),
        sa.Column("bot_user_id", sa.String(64), nullable=False),
        sa.Column("bot_token_ciphertext", sa.LargeBinary(), nullable=False),
        sa.Column("kms_key_version", sa.Text(), nullable=False),
        sa.Column("scopes", postgresql.JSONB(), server_default="[]", nullable=False),
        sa.Column("status", sa.String(20), server_default="active", nullable=False),
        sa.Column("installed_by_slack_user_id", sa.String(64), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("revoked_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('active', 'revoked', 'error')", name="ck_hosted_claw_installation_status"),
    )
    op.create_index("uq_hosted_claw_slack_workspace", "hosted_claw_slack_installations", [sa.text("coalesce(enterprise_id, '')"), "team_id"], unique=True)
    op.create_table(
        "hosted_claw_slack_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("installation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("hosted_claw_slack_installations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("enterprise_id", sa.String(64), nullable=True),
        sa.Column("team_id", sa.String(64), nullable=False),
        sa.Column("slack_user_id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("unlinked_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.create_index("ix_hosted_claw_slack_links_user_id", "hosted_claw_slack_links", ["user_id"])
    op.create_index("uq_hosted_claw_active_slack_identity", "hosted_claw_slack_links", [sa.text("coalesce(enterprise_id, '')"), "team_id", "slack_user_id"], unique=True, postgresql_where=sa.text("unlinked_at IS NULL"))
    op.create_index("uq_hosted_claw_active_user_link", "hosted_claw_slack_links", ["user_id"], unique=True, postgresql_where=sa.text("unlinked_at IS NULL"))

    op.create_table(
        "hosted_claw_oauth_states",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("state_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        *_timestamps(),
    )
    op.create_index("ix_hosted_claw_oauth_states_user_id", "hosted_claw_oauth_states", ["user_id"])
    op.create_table(
        "hosted_claw_link_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("installation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("hosted_claw_slack_installations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("enterprise_id", sa.String(64), nullable=True),
        sa.Column("team_id", sa.String(64), nullable=False),
        sa.Column("slack_user_id", sa.String(64), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("consumed_by_user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        *_timestamps(),
    )
    op.create_table(
        "hosted_claw_entitlements",
        sa.Column("user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("enabled", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("allowed_products", postgresql.JSONB(), server_default='["accountingclaw"]', nullable=False),
        sa.Column("allowed_model_aliases", postgresql.JSONB(), server_default='["claw-default"]', nullable=False),
        sa.Column("monthly_budget_usd", sa.Numeric(12, 4), server_default="0", nullable=False),
        sa.Column("granted_by", sa.String(128), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("revoked_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "hosted_claw_configs",
        sa.Column("user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("active_product", sa.String(32), server_default="accountingclaw", nullable=False),
        sa.Column("model_alias", sa.String(100), server_default="claw-default", nullable=False),
        sa.Column("personal_instructions", sa.Text(), server_default="", nullable=False),
        sa.Column("timezone", sa.String(64), server_default="UTC", nullable=False),
        sa.Column("memory_enabled", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("revision", sa.Integer(), server_default="1", nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("active_product IN ('accountingclaw', 'legalclaw')", name="ck_hosted_claw_config_product"),
    )
    op.create_table(
        "hosted_claw_product_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product", sa.String(32), nullable=False),
        sa.Column("hermes_session_id", sa.String(128), nullable=True),
        sa.Column("runtime_id", sa.String(128), nullable=True, unique=True),
        sa.Column("worker_id", sa.String(128), nullable=True),
        sa.Column("status", sa.String(20), server_default="stopped", nullable=False),
        sa.Column("applied_config_revision", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_activity_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("product IN ('accountingclaw', 'legalclaw')", name="ck_hosted_claw_session_product"),
        sa.CheckConstraint("status IN ('stopped', 'starting', 'ready', 'running', 'error', 'deleting')", name="ck_hosted_claw_session_status"),
        sa.UniqueConstraint("user_id", "product", name="uq_hosted_claw_user_product_session"),
    )
    op.create_index("ix_hosted_claw_product_sessions_user_id", "hosted_claw_product_sessions", ["user_id"])
    op.create_table(
        "hosted_claw_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("event_id", sa.String(128), nullable=False, unique=True),
        sa.Column("user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("slack_link_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("hosted_claw_slack_links.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product", sa.String(32), nullable=False),
        sa.Column("payload_ciphertext", sa.LargeBinary(), nullable=False),
        sa.Column("kms_key_version", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), server_default="queued", nullable=False),
        sa.Column("worker_id", sa.String(128), nullable=True),
        sa.Column("lease_expires_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("run_id", sa.String(128), nullable=True),
        sa.Column("error_code", sa.String(64), nullable=True),
        sa.Column("available_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("claimed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("completed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        *_timestamps(),
        sa.CheckConstraint("status IN ('queued', 'claimed', 'running', 'completed', 'failed', 'cancelled')", name="ck_hosted_claw_job_status"),
    )
    op.create_index("ix_hosted_claw_jobs_user_id", "hosted_claw_jobs", ["user_id"])
    op.create_index("ix_hosted_claw_jobs_claim", "hosted_claw_jobs", ["status", "available_at", "created_at"])
    op.create_index(
        "uq_hosted_claw_active_job_per_user",
        "hosted_claw_jobs",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('claimed', 'running')"),
    )
    op.create_table(
        "hosted_claw_artifacts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("job_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("hosted_claw_jobs.id", ondelete="CASCADE"), nullable=True),
        sa.Column("source_id", sa.String(64), nullable=True),
        sa.Column("direction", sa.String(12), nullable=False),
        sa.Column("filename", sa.Text(), nullable=False),
        sa.Column("content_type", sa.String(255), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("gcs_object_name", sa.Text(), nullable=False, unique=True),
        sa.Column("scan_status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        *_timestamps(),
        sa.CheckConstraint("direction IN ('inbound', 'outbound')", name="ck_hosted_claw_artifact_direction"),
        sa.CheckConstraint("scan_status IN ('pending', 'clean', 'infected', 'rejected', 'deleted')", name="ck_hosted_claw_artifact_scan"),
        sa.CheckConstraint("size_bytes >= 0 AND size_bytes <= 52428800", name="ck_hosted_claw_artifact_size"),
    )
    op.create_index("ix_hosted_claw_artifacts_user_id", "hosted_claw_artifacts", ["user_id"])
    op.create_index("ix_hosted_claw_artifact_retention", "hosted_claw_artifacts", ["expires_at", "deleted_at"])
    op.create_index(
        "uq_hosted_claw_artifact_source",
        "hosted_claw_artifacts",
        ["job_id", "source_id"],
        unique=True,
        postgresql_where=sa.text("source_id IS NOT NULL"),
    )
    op.create_table(
        "hosted_claw_approvals",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("connector_token_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("connector_tokens.id", ondelete="CASCADE"), nullable=False),
        sa.Column("run_id", sa.String(128), nullable=False),
        sa.Column("action_id", sa.String(200), nullable=False),
        sa.Column("argument_hash", sa.String(64), nullable=False),
        sa.Column("interaction_token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("grant_token_hash", sa.String(64), nullable=True, unique=True),
        sa.Column("status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("decided_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("consumed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        *_timestamps(),
        sa.CheckConstraint("status IN ('pending', 'approved', 'denied', 'expired', 'consumed')", name="ck_hosted_claw_approval_status"),
    )
    op.create_index("ix_hosted_claw_approvals_user_id", "hosted_claw_approvals", ["user_id"])
    op.create_index("ix_hosted_claw_approval_match", "hosted_claw_approvals", ["connector_token_id", "run_id", "action_id", "argument_hash"])
    op.create_table(
        "hosted_claw_read_only_actions",
        sa.Column("action_id", sa.String(200), primary_key=True),
        sa.Column("enabled", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("updated_by", sa.String(128), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "hosted_claw_worker_leases",
        sa.Column("worker_id", sa.String(128), primary_key=True),
        sa.Column("hostname", sa.String(255), nullable=False),
        sa.Column("capacity", sa.Integer(), server_default="10", nullable=False),
        sa.Column("active_turns", sa.Integer(), server_default="0", nullable=False),
        sa.Column("disk_percent", sa.Numeric(5, 2), nullable=True),
        sa.Column("status", sa.String(20), server_default="healthy", nullable=False),
        sa.Column("lease_expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("last_heartbeat_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "hosted_claw_usage_summaries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(128), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("prompt_tokens", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("completion_tokens", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("cost_usd", sa.Numeric(12, 6), server_default="0", nullable=False),
        sa.Column("turns", sa.Integer(), server_default="0", nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "period_start", name="uq_hosted_claw_usage_period"),
    )
    op.create_index("ix_hosted_claw_usage_summaries_user_id", "hosted_claw_usage_summaries", ["user_id"])


def downgrade() -> None:
    for table in [
        "hosted_claw_usage_summaries", "hosted_claw_worker_leases",
        "hosted_claw_read_only_actions", "hosted_claw_approvals",
        "hosted_claw_artifacts", "hosted_claw_jobs", "hosted_claw_product_sessions",
        "hosted_claw_configs", "hosted_claw_entitlements", "hosted_claw_link_tokens",
        "hosted_claw_oauth_states", "hosted_claw_slack_links",
        "hosted_claw_slack_installations",
    ]:
        op.drop_table(table)
    op.drop_index("ix_connector_tokens_runtime_id", table_name="connector_tokens")
    op.drop_constraint("ck_connector_tokens_kind", "connector_tokens", type_="check")
    op.drop_column("connector_tokens", "runtime_id")
    op.drop_column("connector_tokens", "token_kind")
