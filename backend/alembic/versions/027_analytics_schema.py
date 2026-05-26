"""Add CPAAnalytics tables (firms, clients, projects, analyses, reconciliations,
amortizations, chat_sessions, journal_entries, analytics_audit_logs) and firm_id on users.

Revision ID: 027_analytics_schema
Revises: 026_form_fill_all_sources_default
Create Date: 2026-05-26
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "027_analytics_schema"
down_revision: Union[str, Sequence[str], None] = "026_form_fill_all_sources_default"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # firms
    # ------------------------------------------------------------------
    op.create_table(
        "firms",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    # ------------------------------------------------------------------
    # users.firm_id (nullable; backfill creates a personal firm per user)
    # ------------------------------------------------------------------
    op.add_column(
        "users",
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_users_firm_id",
        "users",
        "firms",
        ["firm_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_users_firm_id", "users", ["firm_id"])

    # Backfill: one personal firm per existing user, linked via firm_id.
    op.execute(
        """
        DO $$
        DECLARE
            u RECORD;
            new_firm_id UUID;
        BEGIN
            FOR u IN SELECT id, email, display_name FROM users WHERE firm_id IS NULL LOOP
                INSERT INTO firms (id, name, created_at, updated_at)
                VALUES (
                    gen_random_uuid(),
                    COALESCE(NULLIF(u.display_name, ''), u.email) || ' (Personal)',
                    now(),
                    now()
                )
                RETURNING id INTO new_firm_id;

                UPDATE users SET firm_id = new_firm_id WHERE id = u.id;
            END LOOP;
        END $$;
        """
    )

    # ------------------------------------------------------------------
    # clients
    # ------------------------------------------------------------------
    op.create_table(
        "clients",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("industry", sa.String(length=255), nullable=True),
        sa.Column("contact_name", sa.String(length=255), nullable=True),
        sa.Column("contact_email", sa.String(length=255), nullable=True),
        sa.Column("contact_phone", sa.String(length=64), nullable=True),
        sa.Column("fiscal_year_end", sa.String(length=32), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["firm_id"], ["firms.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_clients_firm_id", "clients", ["firm_id"])

    # ------------------------------------------------------------------
    # projects
    # ------------------------------------------------------------------
    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False, server_default=sa.text("'active'")),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["firm_id"], ["firms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_projects_firm_id", "projects", ["firm_id"])
    op.create_index("ix_projects_client_id", "projects", ["client_id"])

    # ------------------------------------------------------------------
    # analyses (variance + waterfall)
    # ------------------------------------------------------------------
    op.create_table(
        "analyses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_by_user_id", sa.String(length=128), nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False),  # 'variance' | 'waterfall'
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False, server_default=sa.text("'draft'")),
        sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("results", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("memo_content", sa.Text(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["firm_id"], ["firms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.CheckConstraint("type IN ('variance', 'waterfall')", name="ck_analyses_type"),
    )
    op.create_index("ix_analyses_firm_id", "analyses", ["firm_id"])
    op.create_index("ix_analyses_client_id", "analyses", ["client_id"])
    op.create_index("ix_analyses_type", "analyses", ["type"])

    # ------------------------------------------------------------------
    # reconciliations
    # ------------------------------------------------------------------
    op.create_table(
        "reconciliations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_by_user_id", sa.String(length=128), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False, server_default=sa.text("'draft'")),
        sa.Column("source_a", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("source_b", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("rules", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("match_groups", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["firm_id"], ["firms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_reconciliations_firm_id", "reconciliations", ["firm_id"])
    op.create_index("ix_reconciliations_client_id", "reconciliations", ["client_id"])

    # ------------------------------------------------------------------
    # amortizations
    # Wide table with first-class columns for common fields + JSONB blobs for
    # the long-tail of asset-type-specific fields (lease classification, MACRS,
    # Section 179, intangibles, etc.).
    # ------------------------------------------------------------------
    op.create_table(
        "amortizations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_by_user_id", sa.String(length=128), nullable=False),
        sa.Column("asset_name", sa.String(length=255), nullable=False),
        sa.Column("asset_type", sa.String(length=64), nullable=False),  # 'fixed_asset' | 'lease' | 'loan' | 'intangible' | 'software'
        sa.Column("cost_basis", sa.Numeric(18, 2), nullable=True),
        sa.Column("salvage_value", sa.Numeric(18, 2), nullable=True),
        sa.Column("useful_life_months", sa.Integer(), nullable=True),
        sa.Column("gaap_method", sa.String(length=64), nullable=True),
        sa.Column("tax_method", sa.String(length=64), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("vendor", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False, server_default=sa.text("'draft'")),
        sa.Column("approval_status", sa.String(length=50), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("type_specific", postgresql.JSONB(astext_type=sa.Text()), nullable=True),  # lease/MACRS/intangible details
        sa.Column("schedule", postgresql.JSONB(astext_type=sa.Text()), nullable=True),  # GAAP schedule
        sa.Column("tax_schedule", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["firm_id"], ["firms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_amortizations_firm_id", "amortizations", ["firm_id"])
    op.create_index("ix_amortizations_client_id", "amortizations", ["client_id"])
    op.create_index("ix_amortizations_asset_type", "amortizations", ["asset_type"])

    # ------------------------------------------------------------------
    # chat_sessions (IRS bot, GAAP bot, AI assistant)
    # ------------------------------------------------------------------
    op.create_table(
        "chat_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.String(length=128), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("bot_type", sa.String(length=32), nullable=False),  # 'irs' | 'gaap' | 'assistant'
        sa.Column("title", sa.String(length=400), nullable=True),
        sa.Column("messages", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["firm_id"], ["firms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="SET NULL"),
        sa.CheckConstraint("bot_type IN ('irs', 'gaap', 'assistant')", name="ck_chat_sessions_bot_type"),
    )
    op.create_index("ix_chat_sessions_firm_id", "chat_sessions", ["firm_id"])
    op.create_index("ix_chat_sessions_user_id", "chat_sessions", ["user_id"])
    op.create_index("ix_chat_sessions_bot_type", "chat_sessions", ["bot_type"])

    # ------------------------------------------------------------------
    # journal_entries (generated from amortizations)
    # ------------------------------------------------------------------
    op.create_table(
        "journal_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("amortization_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("period", sa.String(length=32), nullable=False),  # e.g., '2026-05'
        sa.Column("entries", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["firm_id"], ["firms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["amortization_id"], ["amortizations.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_journal_entries_firm_id", "journal_entries", ["firm_id"])
    op.create_index("ix_journal_entries_amortization_id", "journal_entries", ["amortization_id"])

    # ------------------------------------------------------------------
    # analytics_audit_logs
    # ------------------------------------------------------------------
    op.create_table(
        "analytics_audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.String(length=128), nullable=True),
        sa.Column("action", sa.String(length=128), nullable=False),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["firm_id"], ["firms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_analytics_audit_logs_firm_id", "analytics_audit_logs", ["firm_id"])
    op.create_index("ix_analytics_audit_logs_created_at", "analytics_audit_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_analytics_audit_logs_created_at", table_name="analytics_audit_logs")
    op.drop_index("ix_analytics_audit_logs_firm_id", table_name="analytics_audit_logs")
    op.drop_table("analytics_audit_logs")

    op.drop_index("ix_journal_entries_amortization_id", table_name="journal_entries")
    op.drop_index("ix_journal_entries_firm_id", table_name="journal_entries")
    op.drop_table("journal_entries")

    op.drop_index("ix_chat_sessions_bot_type", table_name="chat_sessions")
    op.drop_index("ix_chat_sessions_user_id", table_name="chat_sessions")
    op.drop_index("ix_chat_sessions_firm_id", table_name="chat_sessions")
    op.drop_table("chat_sessions")

    op.drop_index("ix_amortizations_asset_type", table_name="amortizations")
    op.drop_index("ix_amortizations_client_id", table_name="amortizations")
    op.drop_index("ix_amortizations_firm_id", table_name="amortizations")
    op.drop_table("amortizations")

    op.drop_index("ix_reconciliations_client_id", table_name="reconciliations")
    op.drop_index("ix_reconciliations_firm_id", table_name="reconciliations")
    op.drop_table("reconciliations")

    op.drop_index("ix_analyses_type", table_name="analyses")
    op.drop_index("ix_analyses_client_id", table_name="analyses")
    op.drop_index("ix_analyses_firm_id", table_name="analyses")
    op.drop_table("analyses")

    op.drop_index("ix_projects_client_id", table_name="projects")
    op.drop_index("ix_projects_firm_id", table_name="projects")
    op.drop_table("projects")

    op.drop_index("ix_clients_firm_id", table_name="clients")
    op.drop_table("clients")

    op.drop_index("ix_users_firm_id", table_name="users")
    op.drop_constraint("fk_users_firm_id", "users", type_="foreignkey")
    op.drop_column("users", "firm_id")

    op.drop_table("firms")
