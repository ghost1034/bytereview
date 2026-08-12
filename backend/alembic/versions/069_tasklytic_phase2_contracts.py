"""Add durable Tasklytic workspace events.

Revision ID: 069_tasklytic_phase2_contracts
Revises: 068_remove_pbc_virus_scanning
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "069_tasklytic_phase2_contracts"
down_revision = "068_remove_pbc_virus_scanning"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tasklytic_invitations",
        sa.Column("revision", sa.Integer(), server_default="1", nullable=False),
    )
    op.create_table(
        "tasklytic_workspace_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("workspace_id", sa.String(length=128), nullable=False),
        sa.Column("actor_id", sa.String(length=128), nullable=False),
        sa.Column("entity_kind", sa.String(length=64), nullable=False),
        sa.Column("record_id", sa.String(length=128), nullable=False),
        sa.Column("operation", sa.String(length=16), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "operation IN ('created', 'updated', 'deleted')",
            name="ck_tasklytic_workspace_event_operation",
        ),
        sa.ForeignKeyConstraint(["workspace_id"], ["tasklytic_workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_tasklytic_workspace_events_workspace_id_id",
        "tasklytic_workspace_events",
        ["workspace_id", "id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_tasklytic_workspace_events_workspace_id_id",
        table_name="tasklytic_workspace_events",
    )
    op.drop_table("tasklytic_workspace_events")
    op.drop_column("tasklytic_invitations", "revision")
