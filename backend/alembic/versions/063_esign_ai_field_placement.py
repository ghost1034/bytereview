"""Add durable E-Signature AI field-placement runs.

Revision ID: 063_esign_ai_field_placement
Revises: 062_hosted_claw
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "063_esign_ai_field_placement"
down_revision = "062_hosted_claw"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "esign_ai_field_placement_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("target_type", sa.String(length=16), nullable=False),
        sa.Column("envelope_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("esign_envelopes.id", ondelete="CASCADE")),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("esign_templates.id", ondelete="CASCADE")),
        sa.Column("requester_user_id", sa.String(length=128), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="queued"),
        sa.Column("scope", sa.String(length=24), nullable=False),
        sa.Column("selected_document_ids", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("target_snapshot", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("base_revision", sa.Integer(), nullable=False),
        sa.Column("instructions", sa.Text()),
        sa.Column("proposals", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("warnings", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("error", sa.Text()),
        sa.Column("page_usage", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("started_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("completed_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("applied_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("discarded_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "(target_type = 'envelope' AND envelope_id IS NOT NULL AND template_id IS NULL) OR "
            "(target_type = 'template' AND template_id IS NOT NULL AND envelope_id IS NULL)",
            name="ck_esign_ai_placement_target",
        ),
        sa.CheckConstraint("page_usage >= 0", name="ck_esign_ai_placement_page_usage"),
    )
    op.create_index("ix_esign_ai_placement_envelope_created", "esign_ai_field_placement_runs", ["envelope_id", "created_at"])
    op.create_index("ix_esign_ai_placement_template_created", "esign_ai_field_placement_runs", ["template_id", "created_at"])
    op.create_index("ix_esign_ai_placement_status", "esign_ai_field_placement_runs", ["status", "created_at"])
    op.create_index(
        "uq_esign_ai_placement_active_envelope_scope",
        "esign_ai_field_placement_runs", ["envelope_id", "scope"], unique=True,
        postgresql_where=sa.text("envelope_id IS NOT NULL AND status IN ('queued', 'processing')"),
    )
    op.create_index(
        "uq_esign_ai_placement_active_template_scope",
        "esign_ai_field_placement_runs", ["template_id", "scope"], unique=True,
        postgresql_where=sa.text("template_id IS NOT NULL AND status IN ('queued', 'processing')"),
    )
    op.add_column("usage_events", sa.Column("esign_ai_field_placement_run_id", postgresql.UUID(as_uuid=True)))
    op.create_foreign_key(
        "fk_usage_events_esign_ai_field_placement_run",
        "usage_events", "esign_ai_field_placement_runs",
        ["esign_ai_field_placement_run_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index(
        "uq_usage_events_esign_ai_field_placement_run",
        "usage_events", ["esign_ai_field_placement_run_id"], unique=True,
        postgresql_where=sa.text("esign_ai_field_placement_run_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_usage_events_esign_ai_field_placement_run", table_name="usage_events")
    op.drop_constraint("fk_usage_events_esign_ai_field_placement_run", "usage_events", type_="foreignkey")
    op.drop_column("usage_events", "esign_ai_field_placement_run_id")
    op.drop_index("uq_esign_ai_placement_active_template_scope", table_name="esign_ai_field_placement_runs")
    op.drop_index("uq_esign_ai_placement_active_envelope_scope", table_name="esign_ai_field_placement_runs")
    op.drop_index("ix_esign_ai_placement_status", table_name="esign_ai_field_placement_runs")
    op.drop_index("ix_esign_ai_placement_template_created", table_name="esign_ai_field_placement_runs")
    op.drop_index("ix_esign_ai_placement_envelope_created", table_name="esign_ai_field_placement_runs")
    op.drop_table("esign_ai_field_placement_runs")
