"""Share firm clients between AI Analytics and Tasklytic.

Revision ID: 074_shared_firm_clients
Revises: 073_hosted_claw_channels
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "074_shared_firm_clients"
down_revision = "073_hosted_claw_channels"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tasklytic_workspaces",
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_tasklytic_workspaces_firm_id",
        "tasklytic_workspaces",
        "firms",
        ["firm_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_tasklytic_workspaces_firm_id",
        "tasklytic_workspaces",
        ["firm_id"],
    )

    # Existing workspaces inherit the firm of their earliest administrator.
    op.execute(
        """
        UPDATE tasklytic_workspaces AS workspace
        SET firm_id = owner.firm_id
        FROM (
            SELECT DISTINCT ON (membership.workspace_id)
                membership.workspace_id,
                app_user.firm_id
            FROM tasklytic_workspace_members AS membership
            JOIN users AS app_user ON app_user.id = membership.user_id
            WHERE membership.role = 'admin' AND app_user.firm_id IS NOT NULL
            ORDER BY membership.workspace_id, membership.created_at, membership.user_id
        ) AS owner
        WHERE workspace.id = owner.workspace_id
          AND workspace.firm_id IS NULL
        """
    )

    # Preserve existing Tasklytic clients in the canonical firm client table.
    # Tasklytic has always generated UUID client ids; the regex guards any
    # hand-authored legacy/evaluation rows before casting.
    op.execute(
        """
        INSERT INTO clients (
            id,
            firm_id,
            name,
            industry,
            contact_name,
            contact_email,
            contact_phone,
            fiscal_year_end,
            notes,
            created_at,
            updated_at
        )
        SELECT DISTINCT ON (record.record_id)
            record.record_id::uuid,
            workspace.firm_id,
            LEFT(COALESCE(NULLIF(record.payload->>'name', ''), 'Unnamed client'), 255),
            NULLIF(LEFT(record.payload->>'industry', 255), ''),
            NULLIF(LEFT(record.payload->>'contactName', 255), ''),
            NULLIF(LEFT(record.payload->>'contactEmail', 255), ''),
            NULLIF(LEFT(record.payload->>'contactPhone', 64), ''),
            NULLIF(LEFT(record.payload->>'fiscalYearEnd', 32), ''),
            NULLIF(record.payload->>'notes', ''),
            COALESCE(record.created_at, now()),
            COALESCE(record.updated_at, now())
        FROM tasklytic_entity_records AS record
        JOIN tasklytic_workspaces AS workspace
          ON workspace.id = record.workspace_id
        WHERE record.entity_kind = 'clients'
          AND workspace.firm_id IS NOT NULL
          AND record.record_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        ORDER BY record.record_id, record.created_at, record.id
        ON CONFLICT (id) DO NOTHING
        """
    )


def downgrade() -> None:
    # Canonical clients are intentionally retained: they may have acquired
    # Analytics references after this migration and remain valid firm data.
    op.drop_index("ix_tasklytic_workspaces_firm_id", table_name="tasklytic_workspaces")
    op.drop_constraint(
        "fk_tasklytic_workspaces_firm_id",
        "tasklytic_workspaces",
        type_="foreignkey",
    )
    op.drop_column("tasklytic_workspaces", "firm_id")
