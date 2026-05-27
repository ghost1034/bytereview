"""Add user role/persona/title, project status/module/assignee/due_date for Phase 5.1.

- Adds 4 Postgres enums: analytics_user_role, analytics_user_persona,
  analytics_project_status, analytics_project_module.
- Adds role/persona/title columns on users; backfills first user per firm as
  'admin', everyone else as 'analyst'.
- Replaces projects.status (VARCHAR) with enum analytics_project_status,
  mapping legacy 'active' -> 'in_progress'.
- Adds projects.module, projects.assigned_to_user_id (FK -> users.id),
  projects.due_date.

Revision ID: 028_analytics_phase51
Revises: 027_analytics_schema
Create Date: 2026-05-26
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "028_analytics_phase51"
down_revision: Union[str, Sequence[str], None] = "027_analytics_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


USER_ROLE_VALUES = ("admin", "manager", "analyst", "reviewer", "viewer")
USER_PERSONA_VALUES = (
    "staff_accountant",
    "senior_accountant",
    "accounting_manager",
    "cpa_partner",
)
PROJECT_STATUS_VALUES = (
    "draft",
    "in_progress",
    "in_review",
    "approved",
    "archived",
)
PROJECT_MODULE_VALUES = (
    "variance",
    "reconciliation",
    "amortization",
    "waterfall",
    "irs",
    "gaap",
    "assistant",
    "other",
)


def upgrade() -> None:
    bind = op.get_bind()

    # ------------------------------------------------------------------
    # Enums
    # ------------------------------------------------------------------
    user_role_enum = postgresql.ENUM(*USER_ROLE_VALUES, name="analytics_user_role")
    user_persona_enum = postgresql.ENUM(*USER_PERSONA_VALUES, name="analytics_user_persona")
    project_status_enum = postgresql.ENUM(*PROJECT_STATUS_VALUES, name="analytics_project_status")
    project_module_enum = postgresql.ENUM(*PROJECT_MODULE_VALUES, name="analytics_project_module")

    user_role_enum.create(bind, checkfirst=True)
    user_persona_enum.create(bind, checkfirst=True)
    project_status_enum.create(bind, checkfirst=True)
    project_module_enum.create(bind, checkfirst=True)

    # ------------------------------------------------------------------
    # users.role / users.persona / users.title
    # ------------------------------------------------------------------
    op.add_column(
        "users",
        sa.Column(
            "role",
            sa.Enum(*USER_ROLE_VALUES, name="analytics_user_role", create_type=False),
            nullable=False,
            server_default=sa.text("'analyst'::analytics_user_role"),
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "persona",
            sa.Enum(*USER_PERSONA_VALUES, name="analytics_user_persona", create_type=False),
            nullable=True,
        ),
    )
    op.add_column("users", sa.Column("title", sa.String(length=255), nullable=True))

    # Backfill: first user per firm (by created_at) -> 'admin'; everyone else
    # retains the default 'analyst'. Users with no firm_id stay 'analyst'.
    op.execute(
        """
        WITH ranked AS (
            SELECT id, ROW_NUMBER() OVER (
                PARTITION BY firm_id
                ORDER BY created_at ASC
            ) AS rn
            FROM users
            WHERE firm_id IS NOT NULL
        )
        UPDATE users
        SET role = 'admin'::analytics_user_role
        FROM ranked
        WHERE users.id = ranked.id AND ranked.rn = 1
        """
    )

    # ------------------------------------------------------------------
    # projects: convert status VARCHAR -> enum, add module/assignee/due_date
    # ------------------------------------------------------------------
    # 1) Drop the old default so the USING clause can convert cleanly.
    op.execute("ALTER TABLE projects ALTER COLUMN status DROP DEFAULT")

    # 2) Map legacy values and switch column type to the new enum.
    op.execute(
        """
        ALTER TABLE projects
        ALTER COLUMN status TYPE analytics_project_status
        USING (
            CASE
                WHEN status = 'active' THEN 'in_progress'::analytics_project_status
                WHEN status IN ('draft','in_progress','in_review','approved','archived')
                    THEN status::analytics_project_status
                ELSE 'draft'::analytics_project_status
            END
        )
        """
    )

    # 3) Restore default to 'draft' under the new enum type.
    op.execute(
        "ALTER TABLE projects ALTER COLUMN status SET DEFAULT 'draft'::analytics_project_status"
    )

    op.add_column(
        "projects",
        sa.Column(
            "module",
            sa.Enum(*PROJECT_MODULE_VALUES, name="analytics_project_module", create_type=False),
            nullable=False,
            server_default=sa.text("'other'::analytics_project_module"),
        ),
    )
    op.add_column(
        "projects",
        sa.Column("assigned_to_user_id", sa.String(length=128), nullable=True),
    )
    op.add_column("projects", sa.Column("due_date", sa.Date(), nullable=True))

    op.create_foreign_key(
        "fk_projects_assigned_to_user_id",
        "projects",
        "users",
        ["assigned_to_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_projects_assigned_to_user_id", "projects", ["assigned_to_user_id"]
    )


def downgrade() -> None:
    # Reverse projects changes
    op.drop_index("ix_projects_assigned_to_user_id", table_name="projects")
    op.drop_constraint("fk_projects_assigned_to_user_id", "projects", type_="foreignkey")
    op.drop_column("projects", "due_date")
    op.drop_column("projects", "assigned_to_user_id")
    op.drop_column("projects", "module")

    op.execute("ALTER TABLE projects ALTER COLUMN status DROP DEFAULT")
    op.execute(
        """
        ALTER TABLE projects
        ALTER COLUMN status TYPE VARCHAR(50)
        USING (
            CASE
                WHEN status = 'in_progress' THEN 'active'
                ELSE status::text
            END
        )
        """
    )
    op.execute("ALTER TABLE projects ALTER COLUMN status SET DEFAULT 'active'")

    # Reverse users changes
    op.drop_column("users", "title")
    op.drop_column("users", "persona")
    op.drop_column("users", "role")

    bind = op.get_bind()
    sa.Enum(name="analytics_project_module").drop(bind, checkfirst=True)
    sa.Enum(name="analytics_project_status").drop(bind, checkfirst=True)
    sa.Enum(name="analytics_user_persona").drop(bind, checkfirst=True)
    sa.Enum(name="analytics_user_role").drop(bind, checkfirst=True)
