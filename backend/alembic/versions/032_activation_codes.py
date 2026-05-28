"""Add activation_codes table — controllable six-digit AccountingClaw codes.

Replaces the single universal CPAA_ACTIVATION_CODE env value with a database
allowlist. Multiple six-digit codes may be valid at once; each is reusable by many
users and can be enabled/disabled by flipping ``active``. Codes are managed directly
in the database (insert/update rows).

Revision ID: 032_activation_codes
Revises: 031_activation_keys
Create Date: 2026-05-28
"""

import os
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "032_activation_codes"
down_revision: Union[str, Sequence[str], None] = "031_activation_keys"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "activation_codes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(length=6), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("code", name="uq_activation_codes_code"),
    )

    # One-time cutover: carry the currently-live universal code into the table so the
    # existing six-digit code keeps working the moment this migration runs. After this,
    # codes are managed in the table and CPAA_ACTIVATION_CODE is no longer read at runtime.
    existing_code = os.getenv("CPAA_ACTIVATION_CODE")
    if existing_code:
        op.get_bind().execute(
            sa.text(
                "INSERT INTO activation_codes (id, code, active) VALUES (:id, :code, true) "
                "ON CONFLICT (code) DO NOTHING"
            ),
            {"id": str(uuid.uuid4()), "code": existing_code},
        )


def downgrade() -> None:
    op.drop_table("activation_codes")
