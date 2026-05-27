"""Add uploaded_docs JSONB to chat_sessions (Phase 5.2 prerequisite).

Persists the documents uploaded to an IRS / GAAP research (or AI assistant)
session so reloading the session restores the document list and the combined
document context fed to the LLM. Each entry is
`{ id, name, text, summary?, extractedData? }`.

Revision ID: 029_chat_session_documents
Revises: 028_analytics_phase51
Create Date: 2026-05-26
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "029_chat_session_documents"
down_revision: Union[str, Sequence[str], None] = "028_analytics_phase51"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "chat_sessions",
        sa.Column(
            "uploaded_docs",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("chat_sessions", "uploaded_docs")
