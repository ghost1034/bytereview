"""Source ingestion pipeline for the Inkwise module."""

from __future__ import annotations

import os
import tempfile
import uuid
from datetime import datetime

from sqlalchemy import desc
from sqlalchemy.orm import Session

from inkwise.schemas import InkwiseSourceIngestionOut
from inkwise.services.gcs import storage_client
from inkwise.services.pageindex_oss_treegen import PageIndexOssTreeGenError, generate_tree_sync
from inkwise.services.pdf_extract import PdfExtractError, extract_pdf_pages_text
from inkwise.settings import get_inkwise_settings
from models.inkwise_models import (
    InkwiseSource,
    InkwiseSourceIngestion,
    InkwiseSourcePage,
    InkwiseSourceTreeNode,
)


class IngestionError(RuntimeError):
    pass


class InkwiseIngestionService:
    def enqueue_ingestion(self, db: Session, *, user_id: str, source_id: uuid.UUID) -> InkwiseSourceIngestion:
        source = self._get_source_for_user(db, user_id=user_id, source_id=source_id)
        if source.status == "deleted":
            raise FileNotFoundError("Source not found")

        now = datetime.utcnow()
        ingestion = InkwiseSourceIngestion(
            source_id=source.id,
            pipeline="treegen",
            status="queued",
            created_at=now,
        )
        source.status = "queued"
        source.failure_code = None
        source.failure_detail = None
        source.updated_at = now
        db.add(ingestion)
        db.commit()
        db.refresh(ingestion)
        return ingestion

    def process_source_ingestion_once(self, db: Session, *, ingestion_id: uuid.UUID) -> InkwiseSourceIngestion:
        ingestion = db.query(InkwiseSourceIngestion).filter(InkwiseSourceIngestion.id == ingestion_id).first()
        if ingestion is None:
            raise FileNotFoundError("Ingestion not found")
        if ingestion.status in ("completed", "failed"):
            return ingestion

        source = db.query(InkwiseSource).filter(InkwiseSource.id == ingestion.source_id).first()
        if source is None or source.status == "deleted":
            self._mark_failed(db, ingestion_id=ingestion_id, code="source_missing", message="Source missing or deleted")
            return self._get_ingestion_or_404(db, ingestion_id)

        if not self._is_pdf(source):
            self._mark_failed(db, ingestion_id=ingestion_id, code="unsupported_type", message="Only PDF sources are supported")
            return self._get_ingestion_or_404(db, ingestion_id)

        if not source.storage_bucket or not source.storage_object:
            self._mark_failed(db, ingestion_id=ingestion_id, code="storage_missing", message="Source storage path missing")
            return self._get_ingestion_or_404(db, ingestion_id)

        settings = get_inkwise_settings()
        if not settings.vertex_enabled:
            self._mark_failed(db, ingestion_id=ingestion_id, code="config_missing", message="Vertex AI is not configured")
            return self._get_ingestion_or_404(db, ingestion_id)

        now = datetime.utcnow()
        ingestion.status = "processing"
        ingestion.pipeline = "treegen"
        ingestion.started_at = ingestion.started_at or now
        ingestion.treegen_engine = "pageindex_oss"
        ingestion.treegen_version = "vendor/pageindex"
        ingestion.extraction_engine = "pymupdf"
        ingestion.canonical_pdf_gcs_bucket = source.storage_bucket
        ingestion.canonical_pdf_gcs_object = source.storage_object
        source.status = "processing"
        source.updated_at = now
        db.commit()

        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                filename = source.original_filename or f"{source.id}.pdf"
                local_path = os.path.join(temp_dir, filename)
                blob = storage_client().bucket(source.storage_bucket).blob(source.storage_object)
                blob.download_to_filename(local_path)

                pages = extract_pdf_pages_text(pdf_path=local_path)
                page_count = len(pages)
                ingestion.page_count = page_count
                ingestion.provider_document_name = source.original_filename or source.title

                tree_raw = generate_tree_sync(
                    pdf_path=local_path,
                    model=settings.treegen_model,
                    toc_check_pages=20,
                    max_pages_per_node=10,
                    max_tokens_per_node=20000,
                    add_node_summary=True,
                )
                structure = tree_raw.get("structure")
                if not isinstance(structure, list):
                    raise IngestionError("treegen returned invalid structure")

                tree_bucket = settings.derived_bucket or source.storage_bucket
                if tree_bucket:
                    tree_object = f"inkwise/derived/{source.user_id}/{source.id}/tree/{ingestion.id}/tree.json"
                    storage_client().bucket(tree_bucket).blob(tree_object).upload_from_string(
                        __import__("json").dumps(tree_raw, ensure_ascii=True),
                        content_type="application/json",
                    )
                    ingestion.tree_gcs_bucket = tree_bucket
                    ingestion.tree_gcs_object = tree_object
                    ingestion.tree_cached_at = datetime.utcnow()

                db.query(InkwiseSourcePage).filter(InkwiseSourcePage.source_id == source.id).delete()
                db.query(InkwiseSourceTreeNode).filter(InkwiseSourceTreeNode.source_id == source.id).delete()

                for page in pages:
                    db.add(
                        InkwiseSourcePage(
                            source_id=source.id,
                            page_number=page.page_number,
                            text=page.text,
                            is_ocr=False,
                            char_count=len(page.text),
                            created_at=datetime.utcnow(),
                        )
                    )

                flat: list[dict] = []

                def _walk(nodes: list[dict], parent_id: str | None, depth: int, path: list[str]) -> None:
                    for node in nodes:
                        if not isinstance(node, dict):
                            continue
                        title = str(node.get("title") or "").strip()
                        node_id = str(node.get("node_id") or "").strip()
                        start = node.get("start_index")
                        if not node_id or not title or not isinstance(start, int):
                            raise IngestionError("tree node missing node_id/title/start_index")
                        node_summary = node.get("summary")
                        flat.append(
                            {
                                "node_id": node_id,
                                "parent_node_id": parent_id,
                                "depth": depth,
                                "title": title,
                                "page_start": int(start),
                                "node_summary": node_summary if isinstance(node_summary, str) else None,
                                "path_titles": path + [title],
                            }
                        )
                        children = node.get("nodes")
                        if isinstance(children, list) and children:
                            _walk(children, node_id, depth + 1, path + [title])

                _walk(structure, None, 0, [])

                for idx, node in enumerate(flat):
                    start = int(node["page_start"])
                    next_start = page_count + 1
                    if idx + 1 < len(flat):
                        next_start = int(flat[idx + 1]["page_start"])
                    node["page_end"] = max(start, min(page_count, next_start - 1))

                for node in flat:
                    db.add(
                        InkwiseSourceTreeNode(
                            source_id=source.id,
                            node_id=node["node_id"],
                            parent_node_id=node["parent_node_id"],
                            depth=node["depth"],
                            title=node["title"],
                            page_start=node["page_start"],
                            page_end=node["page_end"],
                            node_summary=node["node_summary"],
                            path_titles=node["path_titles"],
                            created_at=datetime.utcnow(),
                        )
                    )

                ingestion.status = "completed"
                ingestion.finished_at = datetime.utcnow()
                ingestion.error_json = None
                ingestion.pageindex_doc_id = f"local:{source.id}:{ingestion.id}"
                source.status = "completed"
                source.failure_code = None
                source.failure_detail = None
                source.updated_at = datetime.utcnow()
                db.commit()
                db.refresh(ingestion)
                return ingestion

        except (PdfExtractError, PageIndexOssTreeGenError, IngestionError) as exc:
            self._mark_failed(db, ingestion_id=ingestion_id, code="ingest_failed", message=str(exc))
            return self._get_ingestion_or_404(db, ingestion_id)
        except Exception as exc:
            self._mark_failed(db, ingestion_id=ingestion_id, code="ingest_failed", message=str(exc))
            return self._get_ingestion_or_404(db, ingestion_id)

    def list_ingestions(
        self,
        db: Session,
        *,
        user_id: str,
        source_id: uuid.UUID | None = None,
        limit: int = 50,
    ) -> list[InkwiseSourceIngestion]:
        query = db.query(InkwiseSourceIngestion).join(InkwiseSource, InkwiseSource.id == InkwiseSourceIngestion.source_id).filter(
            InkwiseSource.user_id == user_id,
            InkwiseSource.status != "deleted",
        )
        if source_id is not None:
            query = query.filter(InkwiseSourceIngestion.source_id == source_id)
        return query.order_by(desc(InkwiseSourceIngestion.created_at)).limit(limit).all()

    def get_ingestion_for_user(self, db: Session, *, user_id: str, ingestion_id: uuid.UUID) -> InkwiseSourceIngestion:
        ingestion = (
            db.query(InkwiseSourceIngestion)
            .join(InkwiseSource, InkwiseSource.id == InkwiseSourceIngestion.source_id)
            .filter(
                InkwiseSourceIngestion.id == ingestion_id,
                InkwiseSource.user_id == user_id,
                InkwiseSource.status != "deleted",
            )
            .first()
        )
        if ingestion is None:
            raise FileNotFoundError("Ingestion not found")
        return ingestion

    def _get_source_for_user(self, db: Session, *, user_id: str, source_id: uuid.UUID) -> InkwiseSource:
        source = db.query(InkwiseSource).filter(InkwiseSource.id == source_id, InkwiseSource.user_id == user_id).first()
        if source is None:
            raise FileNotFoundError("Source not found")
        return source

    def _get_ingestion_or_404(self, db: Session, ingestion_id: uuid.UUID) -> InkwiseSourceIngestion:
        ingestion = db.query(InkwiseSourceIngestion).filter(InkwiseSourceIngestion.id == ingestion_id).first()
        if ingestion is None:
            raise FileNotFoundError("Ingestion not found")
        return ingestion

    def _mark_failed(self, db: Session, *, ingestion_id: uuid.UUID, code: str, message: str) -> None:
        try:
            db.rollback()
        except Exception:
            pass

        ingestion = db.query(InkwiseSourceIngestion).filter(InkwiseSourceIngestion.id == ingestion_id).first()
        if ingestion is None:
            return
        source = db.query(InkwiseSource).filter(InkwiseSource.id == ingestion.source_id).first()

        ingestion.status = "failed"
        ingestion.finished_at = datetime.utcnow()
        ingestion.error_json = {"code": code, "message": (message or "")[:2000]}

        if source is not None:
            source.status = "failed"
            source.failure_code = code
            source.failure_detail = (message or "")[:2000]
            source.updated_at = datetime.utcnow()

        db.commit()

    def _is_pdf(self, source: InkwiseSource) -> bool:
        content_type = (source.content_type or "").lower()
        if content_type == "application/pdf" or content_type.endswith("/pdf"):
            return True
        filename = (source.original_filename or "").lower()
        return filename.endswith(".pdf")
