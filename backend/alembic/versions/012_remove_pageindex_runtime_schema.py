"""
Remove Inkwise PageIndex runtime schema artifacts

Revision ID: 012_rm_pageindex_schema
Revises: 011_inkwise_vector_rag_phase1
Create Date: 2026-03-17
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "012_rm_pageindex_schema"
down_revision = "011_inkwise_vector_rag_phase1"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column("inkwise_retrieval_evidence", "node_title")
    op.drop_column("inkwise_retrieval_evidence", "node_id")

    op.drop_index("ix_inkwise_source_tree_nodes_node_text_tsv", table_name="inkwise_source_tree_nodes")
    op.drop_index("ix_inkwise_source_tree_nodes_source_id", table_name="inkwise_source_tree_nodes")
    op.drop_table("inkwise_source_tree_nodes")

    op.drop_column("inkwise_source_ingestions", "tree_cached_at")
    op.drop_column("inkwise_source_ingestions", "tree_gcs_object")
    op.drop_column("inkwise_source_ingestions", "tree_gcs_bucket")
    op.drop_column("inkwise_source_ingestions", "doc_description")
    op.drop_column("inkwise_source_ingestions", "pageindex_doc_id")
    op.drop_column("inkwise_source_ingestions", "treegen_version")
    op.drop_column("inkwise_source_ingestions", "treegen_engine")


def downgrade():
    op.add_column("inkwise_source_ingestions", sa.Column("treegen_engine", sa.String(length=32), nullable=True))
    op.add_column("inkwise_source_ingestions", sa.Column("treegen_version", sa.String(length=100), nullable=True))
    op.add_column("inkwise_source_ingestions", sa.Column("pageindex_doc_id", sa.String(length=200), nullable=True))
    op.add_column("inkwise_source_ingestions", sa.Column("doc_description", sa.Text(), nullable=True))
    op.add_column("inkwise_source_ingestions", sa.Column("tree_gcs_bucket", sa.String(length=200), nullable=True))
    op.add_column("inkwise_source_ingestions", sa.Column("tree_gcs_object", sa.String(length=1024), nullable=True))
    op.add_column("inkwise_source_ingestions", sa.Column("tree_cached_at", sa.TIMESTAMP(timezone=True), nullable=True))

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

    op.add_column("inkwise_retrieval_evidence", sa.Column("node_id", sa.String(length=32), nullable=True))
    op.add_column("inkwise_retrieval_evidence", sa.Column("node_title", sa.String(length=400), nullable=True))
