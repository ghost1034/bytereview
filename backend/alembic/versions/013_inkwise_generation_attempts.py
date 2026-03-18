"""
Add Inkwise generation attempts

Revision ID: 013_inkwise_generation_attempts
Revises: 012_remove_pageindex_runtime_schema
Create Date: 2026-03-17
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "013_inkwise_generation_attempts"
down_revision = "012_remove_pageindex_runtime_schema"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "inkwise_generation_attempts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(length=128), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("inkwise_documents.id", ondelete="CASCADE"), nullable=True),
        sa.Column("thread_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("inkwise_chat_threads.id", ondelete="CASCADE"), nullable=True),
        sa.Column("chat_message_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("inkwise_chat_messages.id", ondelete="SET NULL"), nullable=True),
        sa.Column("retrieval_run_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("inkwise_retrieval_runs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("parent_attempt_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("inkwise_generation_attempts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("generation_group_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'processing'")),
        sa.Column("attempt_number", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("provider", sa.String(length=32), nullable=True),
        sa.Column("model", sa.String(length=200), nullable=True),
        sa.Column("request_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("response_text", sa.Text(), nullable=True),
        sa.Column("citations_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("meta_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("completed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.UniqueConstraint("generation_group_id", "attempt_number", name="uq_inkwise_generation_attempts_group_attempt"),
    )
    op.create_index("ix_inkwise_generation_attempts_user_id", "inkwise_generation_attempts", ["user_id"])
    op.create_index("ix_inkwise_generation_attempts_document_id", "inkwise_generation_attempts", ["document_id"])
    op.create_index("ix_inkwise_generation_attempts_thread_id", "inkwise_generation_attempts", ["thread_id"])
    op.create_index("ix_inkwise_generation_attempts_chat_message_id", "inkwise_generation_attempts", ["chat_message_id"])
    op.create_index("ix_inkwise_generation_attempts_retrieval_run_id", "inkwise_generation_attempts", ["retrieval_run_id"])
    op.create_index("ix_inkwise_generation_attempts_parent_attempt_id", "inkwise_generation_attempts", ["parent_attempt_id"])
    op.create_index("ix_inkwise_generation_attempts_generation_group_id", "inkwise_generation_attempts", ["generation_group_id"])


def downgrade():
    op.drop_index("ix_inkwise_generation_attempts_generation_group_id", table_name="inkwise_generation_attempts")
    op.drop_index("ix_inkwise_generation_attempts_parent_attempt_id", table_name="inkwise_generation_attempts")
    op.drop_index("ix_inkwise_generation_attempts_retrieval_run_id", table_name="inkwise_generation_attempts")
    op.drop_index("ix_inkwise_generation_attempts_chat_message_id", table_name="inkwise_generation_attempts")
    op.drop_index("ix_inkwise_generation_attempts_thread_id", table_name="inkwise_generation_attempts")
    op.drop_index("ix_inkwise_generation_attempts_document_id", table_name="inkwise_generation_attempts")
    op.drop_index("ix_inkwise_generation_attempts_user_id", table_name="inkwise_generation_attempts")
    op.drop_table("inkwise_generation_attempts")
