"""SQLAlchemy models for the Inkwise module."""

import uuid

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    Computed,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    TIMESTAMP,
    UniqueConstraint,
    UUID,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from models.db_models import Base


class InkwiseDocument(Base):
    __tablename__ = "inkwise_documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(128), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(300), nullable=False, default="Untitled")
    content_json = Column(JSONB, nullable=True)
    content_html = Column(Text, nullable=True)
    init_prompt = Column(Text, nullable=True)
    language = Column(String(50), nullable=True)
    version = Column(Integer, nullable=False, default=1)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    sources = relationship(
        "InkwiseDocumentSourceBinding",
        back_populates="document",
        cascade="all, delete-orphan",
    )
    chat_threads = relationship(
        "InkwiseChatThread",
        back_populates="document",
        cascade="all, delete-orphan",
    )
    retrieval_runs = relationship(
        "InkwiseRetrievalRun",
        back_populates="document",
        cascade="all, delete-orphan",
    )


class InkwiseSource(Base):
    __tablename__ = "inkwise_sources"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(128), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(String(32), nullable=False)
    title = Column(String(400), nullable=False)
    original_filename = Column(String(512), nullable=True)
    content_type = Column(String(200), nullable=False)
    size_bytes = Column(BigInteger, nullable=False, default=0)
    checksum_sha256 = Column(String(64), nullable=True)
    storage_bucket = Column(String(200), nullable=True)
    storage_object = Column(String(1024), nullable=True)
    source_url = Column(Text, nullable=True)
    status = Column(String(32), nullable=False, default="queued")
    failure_code = Column(String(100), nullable=True)
    failure_detail = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    ingestions = relationship(
        "InkwiseSourceIngestion",
        back_populates="source",
        cascade="all, delete-orphan",
    )
    document_bindings = relationship(
        "InkwiseDocumentSourceBinding",
        back_populates="source",
        cascade="all, delete-orphan",
    )
    pages = relationship(
        "InkwiseSourcePage",
        back_populates="source",
        cascade="all, delete-orphan",
    )
    tree_nodes = relationship(
        "InkwiseSourceTreeNode",
        back_populates="source",
        cascade="all, delete-orphan",
    )
    retrieval_evidence = relationship(
        "InkwiseRetrievalEvidence",
        back_populates="source",
        cascade="all, delete-orphan",
    )


class InkwiseSourceIngestion(Base):
    __tablename__ = "inkwise_source_ingestions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_id = Column(UUID(as_uuid=True), ForeignKey("inkwise_sources.id", ondelete="CASCADE"), nullable=False, index=True)
    pipeline = Column(String(32), nullable=False)
    status = Column(String(32), nullable=False, default="queued")
    treegen_engine = Column(String(32), nullable=True)
    treegen_version = Column(String(100), nullable=True)
    extraction_engine = Column(String(32), nullable=True)
    canonical_pdf_gcs_bucket = Column(String(200), nullable=True)
    canonical_pdf_gcs_object = Column(String(1024), nullable=True)
    started_at = Column(TIMESTAMP(timezone=True), nullable=True)
    finished_at = Column(TIMESTAMP(timezone=True), nullable=True)
    pageindex_doc_id = Column(String(200), nullable=True)
    page_count = Column(Integer, nullable=True)
    provider_document_name = Column(String(512), nullable=True)
    doc_description = Column(Text, nullable=True)
    tree_gcs_bucket = Column(String(200), nullable=True)
    tree_gcs_object = Column(String(1024), nullable=True)
    tree_cached_at = Column(TIMESTAMP(timezone=True), nullable=True)
    error_json = Column(JSONB, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    source = relationship("InkwiseSource", back_populates="ingestions")


class InkwiseDocumentSourceBinding(Base):
    __tablename__ = "inkwise_document_source_bindings"
    __table_args__ = (UniqueConstraint("document_id", "source_id", name="uq_inkwise_document_source_bindings_pair"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("inkwise_documents.id", ondelete="CASCADE"), nullable=False, index=True)
    source_id = Column(UUID(as_uuid=True), ForeignKey("inkwise_sources.id", ondelete="CASCADE"), nullable=False, index=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    document = relationship("InkwiseDocument", back_populates="sources")
    source = relationship("InkwiseSource", back_populates="document_bindings")


class InkwiseChatThread(Base):
    __tablename__ = "inkwise_chat_threads"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(128), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    document_id = Column(UUID(as_uuid=True), ForeignKey("inkwise_documents.id", ondelete="CASCADE"), nullable=False, index=True)
    mode = Column(String(32), nullable=True)
    title = Column(String(200), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    document = relationship("InkwiseDocument", back_populates="chat_threads")
    messages = relationship(
        "InkwiseChatMessage",
        back_populates="thread",
        cascade="all, delete-orphan",
    )
    retrieval_runs = relationship("InkwiseRetrievalRun", back_populates="thread")


class InkwiseChatMessage(Base):
    __tablename__ = "inkwise_chat_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    thread_id = Column(UUID(as_uuid=True), ForeignKey("inkwise_chat_threads.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(16), nullable=False)
    content = Column(Text, nullable=False)
    content_with_citations = Column(Text, nullable=True)
    citations_json = Column(JSONB, nullable=True)
    provider = Column(String(32), nullable=False)
    provider_meta = Column(JSONB, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    thread = relationship("InkwiseChatThread", back_populates="messages")


class InkwiseSourcePage(Base):
    __tablename__ = "inkwise_source_pages"
    __table_args__ = (UniqueConstraint("source_id", "page_number", name="uq_inkwise_source_pages_source_page"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_id = Column(UUID(as_uuid=True), ForeignKey("inkwise_sources.id", ondelete="CASCADE"), nullable=False, index=True)
    page_number = Column(Integer, nullable=False)
    text = Column(Text, nullable=False)
    is_ocr = Column(Boolean, nullable=False, default=False)
    char_count = Column(Integer, nullable=False, default=0)
    text_tsv = Column(
        postgresql.TSVECTOR,
        Computed("to_tsvector('english', coalesce(text, ''))", persisted=True),
        nullable=True,
    )
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    source = relationship("InkwiseSource", back_populates="pages")


class InkwiseSourceTreeNode(Base):
    __tablename__ = "inkwise_source_tree_nodes"
    __table_args__ = (UniqueConstraint("source_id", "node_id", name="uq_inkwise_source_tree_nodes_source_node"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_id = Column(UUID(as_uuid=True), ForeignKey("inkwise_sources.id", ondelete="CASCADE"), nullable=False, index=True)
    node_id = Column(String(32), nullable=False)
    parent_node_id = Column(String(32), nullable=True)
    depth = Column(Integer, nullable=False)
    title = Column(String(400), nullable=False)
    page_start = Column(Integer, nullable=False)
    page_end = Column(Integer, nullable=False)
    node_summary = Column(Text, nullable=True)
    path_titles = Column(postgresql.ARRAY(Text), nullable=False, default=list)
    node_text_tsv = Column(
        postgresql.TSVECTOR,
        Computed(
            "to_tsvector('english', coalesce(title, '') || ' ' || coalesce(node_summary, ''))",
            persisted=True,
        ),
        nullable=True,
    )
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    source = relationship("InkwiseSource", back_populates="tree_nodes")


class InkwiseRetrievalRun(Base):
    __tablename__ = "inkwise_retrieval_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(128), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    document_id = Column(UUID(as_uuid=True), ForeignKey("inkwise_documents.id", ondelete="CASCADE"), nullable=False, index=True)
    thread_id = Column(UUID(as_uuid=True), ForeignKey("inkwise_chat_threads.id", ondelete="SET NULL"), nullable=True)
    query = Column(Text, nullable=False)
    bound_source_ids = Column(postgresql.ARRAY(UUID(as_uuid=True)), nullable=False)
    strategy_version = Column(String(64), nullable=False)
    meta = Column(JSONB, nullable=False, default=dict)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    document = relationship("InkwiseDocument", back_populates="retrieval_runs")
    thread = relationship("InkwiseChatThread", back_populates="retrieval_runs")
    evidence = relationship(
        "InkwiseRetrievalEvidence",
        back_populates="retrieval_run",
        cascade="all, delete-orphan",
    )


class InkwiseRetrievalEvidence(Base):
    __tablename__ = "inkwise_retrieval_evidence"
    __table_args__ = (UniqueConstraint("retrieval_run_id", "evidence_id", name="uq_inkwise_retrieval_evidence_run_evidence"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    retrieval_run_id = Column(UUID(as_uuid=True), ForeignKey("inkwise_retrieval_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    evidence_id = Column(String(16), nullable=False)
    source_id = Column(UUID(as_uuid=True), ForeignKey("inkwise_sources.id", ondelete="CASCADE"), nullable=False, index=True)
    page_number = Column(Integer, nullable=False)
    node_id = Column(String(32), nullable=True)
    node_title = Column(String(400), nullable=True)
    excerpt = Column(Text, nullable=False)
    score = Column(Numeric(14, 6), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    retrieval_run = relationship("InkwiseRetrievalRun", back_populates="evidence")
    source = relationship("InkwiseSource", back_populates="retrieval_evidence")


class InkwiseTemplate(Base):
    __tablename__ = "inkwise_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(128), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(300), nullable=False)
    icon = Column(String(200), nullable=True)
    description = Column(Text, nullable=True)
    content_json = Column(JSONB, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class InkwiseSystemTemplateCategory(Base):
    __tablename__ = "inkwise_system_template_categories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False, unique=True)
    templates = relationship("InkwiseSystemTemplate", back_populates="category")


class InkwiseSystemTemplate(Base):
    __tablename__ = "inkwise_system_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category_id = Column(
        Integer,
        ForeignKey("inkwise_system_template_categories.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    title = Column(String(300), nullable=False)
    icon = Column(String(200), nullable=True)
    description = Column(Text, nullable=True)
    content_json = Column(JSONB, nullable=False)

    category = relationship("InkwiseSystemTemplateCategory", back_populates="templates")
