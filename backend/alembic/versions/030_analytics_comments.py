"""Add analytics_comments table — generic (entity_type, entity_id) comment
threads with @mention support. Scoped to firm.

Revision ID: 030_analytics_comments
Revises: 029_chat_session_documents
Create Date: 2026-05-27
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "030_analytics_comments"
down_revision: Union[str, Sequence[str], None] = "029_chat_session_documents"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "analytics_comments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entity_type", sa.String(length=48), nullable=False),
        sa.Column("entity_id", sa.String(length=128), nullable=False),
        sa.Column("parent_comment_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("author_user_id", sa.String(length=128), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "mentioned_user_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["firm_id"], ["firms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_comment_id"], ["analytics_comments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index(
        "ix_analytics_comments_entity",
        "analytics_comments",
        ["firm_id", "entity_type", "entity_id", "created_at"],
    )
    op.create_index(
        "ix_analytics_comments_parent",
        "analytics_comments",
        ["parent_comment_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_analytics_comments_parent", table_name="analytics_comments")
    op.drop_index("ix_analytics_comments_entity", table_name="analytics_comments")
    op.drop_table("analytics_comments")
