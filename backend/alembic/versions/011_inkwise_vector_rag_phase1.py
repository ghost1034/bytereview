"""
Inkwise vector RAG phase 1 schema

Revision ID: 011_inkwise_vector_rag_phase1
Revises: 010_inkwise_module_schema
Create Date: 2026-03-17
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.types import UserDefinedType


# revision identifiers, used by Alembic.
revision = "011_inkwise_vector_rag_phase1"
down_revision = "010_inkwise_module_schema"
branch_labels = None
depends_on = None


class PgVector(UserDefinedType):
    cache_ok = True

    def __init__(self, dimensions: int):
        self.dimensions = dimensions

    def get_col_spec(self, **_kw):
        return f"vector({self.dimensions})"


def upgrade():
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.add_column("inkwise_source_ingestions", sa.Column("normalizer_version", sa.String(length=100), nullable=True))
    op.add_column("inkwise_source_ingestions", sa.Column("embedding_model", sa.String(length=200), nullable=True))
    op.add_column("inkwise_source_ingestions", sa.Column("embedding_dimension", sa.Integer(), nullable=True))
    op.add_column("inkwise_source_ingestions", sa.Column("embedding_location", sa.String(length=100), nullable=True))
    op.add_column("inkwise_source_ingestions", sa.Column("segment_count", sa.Integer(), nullable=True))
    op.add_column("inkwise_source_ingestions", sa.Column("preview_manifest_bucket", sa.String(length=200), nullable=True))
    op.add_column("inkwise_source_ingestions", sa.Column("preview_manifest_object", sa.String(length=1024), nullable=True))

    op.create_table(
        "inkwise_source_segments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "source_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("inkwise_sources.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "ingestion_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("inkwise_source_ingestions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_id", sa.String(length=128), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("segment_type", sa.String(length=32), nullable=False),
        sa.Column("modality", sa.String(length=32), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("title", sa.String(length=400), nullable=True),
        sa.Column("text_content", sa.Text(), nullable=True),
        sa.Column(
            "text_tsv",
            postgresql.TSVECTOR(),
            sa.Computed("to_tsvector('english', coalesce(text_content, ''))", persisted=True),
            nullable=True,
        ),
        sa.Column("char_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("token_count", sa.Integer(), nullable=True),
        sa.Column("page_start", sa.Integer(), nullable=True),
        sa.Column("page_end", sa.Integer(), nullable=True),
        sa.Column("time_start_ms", sa.BigInteger(), nullable=True),
        sa.Column("time_end_ms", sa.BigInteger(), nullable=True),
        sa.Column("locator_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("asset_bucket", sa.String(length=200), nullable=True),
        sa.Column("asset_object", sa.String(length=1024), nullable=True),
        sa.Column("preview_bucket", sa.String(length=200), nullable=True),
        sa.Column("preview_object", sa.String(length=1024), nullable=True),
        sa.Column("meta_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint(
            "ingestion_id",
            "segment_type",
            "order_index",
            name="uq_inkwise_source_segments_ingestion_type_order",
        ),
    )
    op.create_index("ix_inkwise_source_segments_source_id", "inkwise_source_segments", ["source_id"])
    op.create_index("ix_inkwise_source_segments_ingestion_id", "inkwise_source_segments", ["ingestion_id"])
    op.create_index("ix_inkwise_source_segments_user_id", "inkwise_source_segments", ["user_id"])
    op.create_index("ix_inkwise_source_segments_segment_type", "inkwise_source_segments", ["segment_type"])
    op.create_index(
        "ix_inkwise_source_segments_text_tsv",
        "inkwise_source_segments",
        ["text_tsv"],
        unique=False,
        postgresql_using="gin",
    )

    op.create_table(
        "inkwise_source_segment_embeddings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "segment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("inkwise_source_segments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "source_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("inkwise_sources.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_id", sa.String(length=128), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("model", sa.String(length=200), nullable=False),
        sa.Column("embedding_dimension", sa.Integer(), nullable=False),
        sa.Column("task_instruction", sa.String(length=200), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("embedding", PgVector(1536), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_inkwise_source_segment_embeddings_segment_id", "inkwise_source_segment_embeddings", ["segment_id"])
    op.create_index("ix_inkwise_source_segment_embeddings_source_id", "inkwise_source_segment_embeddings", ["source_id"])
    op.create_index("ix_inkwise_source_segment_embeddings_user_id", "inkwise_source_segment_embeddings", ["user_id"])
    op.execute(
        "CREATE INDEX ix_inkwise_source_segment_embeddings_embedding_hnsw "
        "ON inkwise_source_segment_embeddings USING hnsw (embedding vector_cosine_ops) "
        "WHERE is_active"
    )

    op.add_column(
        "inkwise_retrieval_evidence",
        sa.Column(
            "segment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("inkwise_source_segments.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column("inkwise_retrieval_evidence", sa.Column("locator_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("inkwise_retrieval_evidence", sa.Column("preview_bucket", sa.String(length=200), nullable=True))
    op.add_column("inkwise_retrieval_evidence", sa.Column("preview_object", sa.String(length=1024), nullable=True))
    op.create_index("ix_inkwise_retrieval_evidence_segment_id", "inkwise_retrieval_evidence", ["segment_id"])
    op.alter_column("inkwise_retrieval_evidence", "page_number", existing_type=sa.Integer(), nullable=True)


def downgrade():
    op.alter_column("inkwise_retrieval_evidence", "page_number", existing_type=sa.Integer(), nullable=False)
    op.drop_index("ix_inkwise_retrieval_evidence_segment_id", table_name="inkwise_retrieval_evidence")
    op.drop_column("inkwise_retrieval_evidence", "preview_object")
    op.drop_column("inkwise_retrieval_evidence", "preview_bucket")
    op.drop_column("inkwise_retrieval_evidence", "locator_json")
    op.drop_column("inkwise_retrieval_evidence", "segment_id")

    op.execute("DROP INDEX IF EXISTS ix_inkwise_source_segment_embeddings_embedding_hnsw")
    op.drop_index("ix_inkwise_source_segment_embeddings_user_id", table_name="inkwise_source_segment_embeddings")
    op.drop_index("ix_inkwise_source_segment_embeddings_source_id", table_name="inkwise_source_segment_embeddings")
    op.drop_index("ix_inkwise_source_segment_embeddings_segment_id", table_name="inkwise_source_segment_embeddings")
    op.drop_table("inkwise_source_segment_embeddings")

    op.drop_index("ix_inkwise_source_segments_text_tsv", table_name="inkwise_source_segments")
    op.drop_index("ix_inkwise_source_segments_segment_type", table_name="inkwise_source_segments")
    op.drop_index("ix_inkwise_source_segments_user_id", table_name="inkwise_source_segments")
    op.drop_index("ix_inkwise_source_segments_ingestion_id", table_name="inkwise_source_segments")
    op.drop_index("ix_inkwise_source_segments_source_id", table_name="inkwise_source_segments")
    op.drop_table("inkwise_source_segments")

    op.drop_column("inkwise_source_ingestions", "preview_manifest_object")
    op.drop_column("inkwise_source_ingestions", "preview_manifest_bucket")
    op.drop_column("inkwise_source_ingestions", "segment_count")
    op.drop_column("inkwise_source_ingestions", "embedding_location")
    op.drop_column("inkwise_source_ingestions", "embedding_dimension")
    op.drop_column("inkwise_source_ingestions", "embedding_model")
    op.drop_column("inkwise_source_ingestions", "normalizer_version")
