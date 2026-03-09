"""
Add Inkwise module schema

Revision ID: 010_inkwise_module_schema
Revises: 009_unique_append_from_run
Create Date: 2026-03-08
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "010_inkwise_module_schema"
down_revision = "009_unique_append_from_run"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "inkwise_documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(length=128), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False, server_default=sa.text("'Untitled'")),
        sa.Column("content_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("content_html", sa.Text(), nullable=True),
        sa.Column("init_prompt", sa.Text(), nullable=True),
        sa.Column("language", sa.String(length=50), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_inkwise_documents_user_id", "inkwise_documents", ["user_id"])

    op.create_table(
        "inkwise_sources",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(length=128), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=400), nullable=False),
        sa.Column("original_filename", sa.String(length=512), nullable=True),
        sa.Column("content_type", sa.String(length=200), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False, server_default=sa.text("0")),
        sa.Column("checksum_sha256", sa.String(length=64), nullable=True),
        sa.Column("storage_bucket", sa.String(length=200), nullable=True),
        sa.Column("storage_object", sa.String(length=1024), nullable=True),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'queued'")),
        sa.Column("failure_code", sa.String(length=100), nullable=True),
        sa.Column("failure_detail", sa.Text(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_inkwise_sources_user_id", "inkwise_sources", ["user_id"])

    op.create_table(
        "inkwise_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(length=128), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("icon", sa.String(length=200), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("content_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_inkwise_templates_user_id", "inkwise_templates", ["user_id"])

    op.create_table(
        "inkwise_system_template_categories",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(length=200), nullable=False, unique=True),
    )

    op.create_table(
        "inkwise_system_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "category_id",
            sa.Integer(),
            sa.ForeignKey("inkwise_system_template_categories.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("icon", sa.String(length=200), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("content_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    )
    op.create_index("ix_inkwise_system_templates_category_id", "inkwise_system_templates", ["category_id"])

    op.create_table(
        "inkwise_source_ingestions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "source_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("inkwise_sources.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("pipeline", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'queued'")),
        sa.Column("treegen_engine", sa.String(length=32), nullable=True),
        sa.Column("treegen_version", sa.String(length=100), nullable=True),
        sa.Column("extraction_engine", sa.String(length=32), nullable=True),
        sa.Column("canonical_pdf_gcs_bucket", sa.String(length=200), nullable=True),
        sa.Column("canonical_pdf_gcs_object", sa.String(length=1024), nullable=True),
        sa.Column("started_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("finished_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("pageindex_doc_id", sa.String(length=200), nullable=True),
        sa.Column("page_count", sa.Integer(), nullable=True),
        sa.Column("provider_document_name", sa.String(length=512), nullable=True),
        sa.Column("doc_description", sa.Text(), nullable=True),
        sa.Column("tree_gcs_bucket", sa.String(length=200), nullable=True),
        sa.Column("tree_gcs_object", sa.String(length=1024), nullable=True),
        sa.Column("tree_cached_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("error_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_inkwise_source_ingestions_source_id", "inkwise_source_ingestions", ["source_id"])

    op.create_table(
        "inkwise_document_source_bindings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("inkwise_documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "source_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("inkwise_sources.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("document_id", "source_id", name="uq_inkwise_document_source_bindings_pair"),
    )
    op.create_index("ix_inkwise_document_source_bindings_document_id", "inkwise_document_source_bindings", ["document_id"])
    op.create_index("ix_inkwise_document_source_bindings_source_id", "inkwise_document_source_bindings", ["source_id"])

    op.create_table(
        "inkwise_chat_threads",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(length=128), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("inkwise_documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("mode", sa.String(length=32), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_inkwise_chat_threads_user_id", "inkwise_chat_threads", ["user_id"])
    op.create_index("ix_inkwise_chat_threads_document_id", "inkwise_chat_threads", ["document_id"])

    op.create_table(
        "inkwise_chat_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "thread_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("inkwise_chat_threads.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_with_citations", sa.Text(), nullable=True),
        sa.Column("citations_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("provider_meta", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_inkwise_chat_messages_thread_id", "inkwise_chat_messages", ["thread_id"])

    op.create_table(
        "inkwise_source_pages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "source_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("inkwise_sources.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("page_number", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("is_ocr", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("char_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "text_tsv",
            postgresql.TSVECTOR(),
            sa.Computed("to_tsvector('english', coalesce(text, ''))", persisted=True),
            nullable=True,
        ),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("source_id", "page_number", name="uq_inkwise_source_pages_source_page"),
    )
    op.create_index("ix_inkwise_source_pages_source_id", "inkwise_source_pages", ["source_id"])
    op.create_index(
        "ix_inkwise_source_pages_text_tsv",
        "inkwise_source_pages",
        ["text_tsv"],
        unique=False,
        postgresql_using="gin",
    )

    op.create_table(
        "inkwise_source_tree_nodes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "source_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("inkwise_sources.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("node_id", sa.String(length=32), nullable=False),
        sa.Column("parent_node_id", sa.String(length=32), nullable=True),
        sa.Column("depth", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=400), nullable=False),
        sa.Column("page_start", sa.Integer(), nullable=False),
        sa.Column("page_end", sa.Integer(), nullable=False),
        sa.Column("node_summary", sa.Text(), nullable=True),
        sa.Column("path_titles", postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column(
            "node_text_tsv",
            postgresql.TSVECTOR(),
            sa.Computed(
                "to_tsvector('english', coalesce(title, '') || ' ' || coalesce(node_summary, ''))",
                persisted=True,
            ),
            nullable=True,
        ),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("source_id", "node_id", name="uq_inkwise_source_tree_nodes_source_node"),
    )
    op.create_index("ix_inkwise_source_tree_nodes_source_id", "inkwise_source_tree_nodes", ["source_id"])
    op.create_index(
        "ix_inkwise_source_tree_nodes_node_text_tsv",
        "inkwise_source_tree_nodes",
        ["node_text_tsv"],
        unique=False,
        postgresql_using="gin",
    )

    op.create_table(
        "inkwise_retrieval_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(length=128), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("inkwise_documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "thread_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("inkwise_chat_threads.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("query", sa.Text(), nullable=False),
        sa.Column("bound_source_ids", postgresql.ARRAY(postgresql.UUID(as_uuid=True)), nullable=False),
        sa.Column("strategy_version", sa.String(length=64), nullable=False),
        sa.Column("meta", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_inkwise_retrieval_runs_user_id", "inkwise_retrieval_runs", ["user_id"])
    op.create_index("ix_inkwise_retrieval_runs_document_id", "inkwise_retrieval_runs", ["document_id"])

    op.create_table(
        "inkwise_retrieval_evidence",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "retrieval_run_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("inkwise_retrieval_runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("evidence_id", sa.String(length=16), nullable=False),
        sa.Column(
            "source_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("inkwise_sources.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("page_number", sa.Integer(), nullable=False),
        sa.Column("node_id", sa.String(length=32), nullable=True),
        sa.Column("node_title", sa.String(length=400), nullable=True),
        sa.Column("excerpt", sa.Text(), nullable=False),
        sa.Column("score", sa.Numeric(14, 6), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("retrieval_run_id", "evidence_id", name="uq_inkwise_retrieval_evidence_run_evidence"),
    )
    op.create_index("ix_inkwise_retrieval_evidence_retrieval_run_id", "inkwise_retrieval_evidence", ["retrieval_run_id"])
    op.create_index("ix_inkwise_retrieval_evidence_source_id", "inkwise_retrieval_evidence", ["source_id"])


def downgrade():
    op.drop_index("ix_inkwise_retrieval_evidence_source_id", table_name="inkwise_retrieval_evidence")
    op.drop_index("ix_inkwise_retrieval_evidence_retrieval_run_id", table_name="inkwise_retrieval_evidence")
    op.drop_table("inkwise_retrieval_evidence")

    op.drop_index("ix_inkwise_retrieval_runs_document_id", table_name="inkwise_retrieval_runs")
    op.drop_index("ix_inkwise_retrieval_runs_user_id", table_name="inkwise_retrieval_runs")
    op.drop_table("inkwise_retrieval_runs")

    op.drop_index("ix_inkwise_source_tree_nodes_node_text_tsv", table_name="inkwise_source_tree_nodes")
    op.drop_index("ix_inkwise_source_tree_nodes_source_id", table_name="inkwise_source_tree_nodes")
    op.drop_table("inkwise_source_tree_nodes")

    op.drop_index("ix_inkwise_source_pages_text_tsv", table_name="inkwise_source_pages")
    op.drop_index("ix_inkwise_source_pages_source_id", table_name="inkwise_source_pages")
    op.drop_table("inkwise_source_pages")

    op.drop_index("ix_inkwise_chat_messages_thread_id", table_name="inkwise_chat_messages")
    op.drop_table("inkwise_chat_messages")

    op.drop_index("ix_inkwise_chat_threads_document_id", table_name="inkwise_chat_threads")
    op.drop_index("ix_inkwise_chat_threads_user_id", table_name="inkwise_chat_threads")
    op.drop_table("inkwise_chat_threads")

    op.drop_index("ix_inkwise_document_source_bindings_source_id", table_name="inkwise_document_source_bindings")
    op.drop_index("ix_inkwise_document_source_bindings_document_id", table_name="inkwise_document_source_bindings")
    op.drop_table("inkwise_document_source_bindings")

    op.drop_index("ix_inkwise_source_ingestions_source_id", table_name="inkwise_source_ingestions")
    op.drop_table("inkwise_source_ingestions")

    op.drop_index("ix_inkwise_system_templates_category_id", table_name="inkwise_system_templates")
    op.drop_table("inkwise_system_templates")

    op.drop_table("inkwise_system_template_categories")

    op.drop_index("ix_inkwise_templates_user_id", table_name="inkwise_templates")
    op.drop_table("inkwise_templates")

    op.drop_index("ix_inkwise_sources_user_id", table_name="inkwise_sources")
    op.drop_table("inkwise_sources")

    op.drop_index("ix_inkwise_documents_user_id", table_name="inkwise_documents")
    op.drop_table("inkwise_documents")
