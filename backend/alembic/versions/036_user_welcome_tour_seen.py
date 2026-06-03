"""Add welcome_tour_seen_at to users for the one-time welcome tour dialog

Existing users are backfilled to now() so they never see the first-login
welcome dialog; new users get NULL and see it once.

Revision ID: 036_user_welcome_tour_seen
Revises: 035_usage_token_tracking
Create Date: 2026-06-02
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "036_user_welcome_tour_seen"
down_revision: Union[str, Sequence[str], None] = "035_usage_token_tracking"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nullable with no server_default: new users get NULL ("dialog not yet seen").
    op.add_column(
        "users",
        sa.Column("welcome_tour_seen_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    # Backfill existing rows so pre-existing accounts never see the dialog.
    op.execute("UPDATE users SET welcome_tour_seen_at = now() WHERE welcome_tour_seen_at IS NULL")


def downgrade() -> None:
    op.drop_column("users", "welcome_tour_seen_at")
