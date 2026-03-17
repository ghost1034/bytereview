"""Source ingestion pipeline for the Inkwise module."""

# pyright: reportAttributeAccessIssue=false, reportGeneralTypeIssues=false, reportArgumentType=false, reportOptionalMemberAccess=false

from __future__ import annotations

import json
import os
import tempfile
import uuid
from datetime import datetime
from typing import Any

import pymupdf
from sqlalchemy import desc
from sqlalchemy.orm import Session

from inkwise.services.embeddings import InkwiseEmbeddingError, InkwiseEmbeddingService
from inkwise.services.gcs import storage_client
from inkwise.services.segmentation_service import InkwiseSegmentationService, SegmentDraft
from inkwise.services.source_normalizer import InkwiseSourceNormalizer, SourceNormalizationError
from inkwise.settings import get_inkwise_settings, is_valid_gcs_bucket_name, normalize_gcs_bucket_name
from models.inkwise_models import InkwiseSource, InkwiseSourceIngestion, InkwiseSourceSegment, InkwiseSourceSegmentEmbedding


class IngestionError(RuntimeError):
    pass


class InkwiseIngestionService:
    def __init__(self) -> None:
        self.embedding_service = InkwiseEmbeddingService()
        self.source_normalizer = InkwiseSourceNormalizer()
        self.segmentation_service = InkwiseSegmentationService()

    def enqueue_ingestion(self, db: Session, *, user_id: str, source_id: uuid.UUID) -> InkwiseSourceIngestion:
        source = self._get_source_for_user(db, user_id=user_id, source_id=source_id)
        if source.status == "deleted":
            raise FileNotFoundError("Source not found")

        now = datetime.utcnow()
        ingestion = InkwiseSourceIngestion(
            source_id=source.id,
            pipeline="normalize_embed",
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

        if not self._is_supported_source(source):
            self._mark_failed(db, ingestion_id=ingestion_id, code="unsupported_type", message="Only PDF sources are supported")
            return self._get_ingestion_or_404(db, ingestion_id)

        source_bucket = normalize_gcs_bucket_name(str(source.storage_bucket or ""))
        source_object = str(source.storage_object or "").strip()
        if not source_bucket or not source_object:
            self._mark_failed(db, ingestion_id=ingestion_id, code="storage_missing", message="Source storage path missing")
            return self._get_ingestion_or_404(db, ingestion_id)
        if not is_valid_gcs_bucket_name(source_bucket):
            self._mark_failed(db, ingestion_id=ingestion_id, code="storage_invalid", message="Source storage bucket is invalid")
            return self._get_ingestion_or_404(db, ingestion_id)

        settings = get_inkwise_settings()
        if not settings.vertex_enabled:
            self._mark_failed(db, ingestion_id=ingestion_id, code="config_missing", message="Vertex AI is not configured")
            return self._get_ingestion_or_404(db, ingestion_id)
        if settings.embedding_dimension != 1536:
            self._mark_failed(
                db,
                ingestion_id=ingestion_id,
                code="config_invalid",
                message="Inkwise ingestion currently requires INKWISE_EMBEDDING_DIMENSION=1536 to match the vector schema",
            )
            return self._get_ingestion_or_404(db, ingestion_id)

        now = datetime.utcnow()
        ingestion.status = "processing"
        ingestion.pipeline = "normalize_embed"
        ingestion.started_at = ingestion.started_at or now
        ingestion.extraction_engine = "pymupdf"
        ingestion.canonical_pdf_gcs_bucket = source_bucket
        ingestion.canonical_pdf_gcs_object = source_object
        ingestion.normalizer_version = "phase8_v1"
        ingestion.embedding_model = settings.embedding_model
        ingestion.embedding_dimension = settings.embedding_dimension
        ingestion.embedding_location = settings.embedding_location
        source.status = "processing"
        source.updated_at = now
        db.commit()

        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                filename = source.original_filename or f"{source.id}.pdf"
                local_path = os.path.join(temp_dir, filename)
                storage_client().bucket(source_bucket).blob(source_object).download_to_filename(local_path)

                normalized = self.source_normalizer.normalize_local_source(
                    local_path=local_path,
                    filename=source.original_filename or filename,
                    content_type=source.content_type,
                    title=source.title,
                )
                ingestion.page_count = normalized.page_count or None
                ingestion.provider_document_name = source.original_filename or source.title

                derived_bucket = normalize_gcs_bucket_name(settings.derived_bucket or source_bucket)
                if not derived_bucket or not is_valid_gcs_bucket_name(derived_bucket):
                    raise IngestionError("Derived storage bucket is invalid")

                self._persist_vector_artifacts(
                    db,
                    source=source,
                    ingestion=ingestion,
                    normalized=normalized,
                    derived_bucket=derived_bucket,
                )

                ingestion.status = "completed"
                ingestion.finished_at = datetime.utcnow()
                ingestion.error_json = None
                source.status = "completed"
                source.failure_code = None
                source.failure_detail = None
                source.updated_at = datetime.utcnow()
                db.commit()
                db.refresh(ingestion)
                return ingestion

        except (IngestionError, SourceNormalizationError, InkwiseEmbeddingError) as exc:
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

    def mark_enqueue_failed(self, db: Session, *, ingestion_id: uuid.UUID, message: str) -> InkwiseSourceIngestion:
        self._mark_failed(db, ingestion_id=ingestion_id, code="enqueue_failed", message=message)
        return self._get_ingestion_or_404(db, ingestion_id)

    def _persist_vector_artifacts(
        self,
        db: Session,
        *,
        source: InkwiseSource,
        ingestion: InkwiseSourceIngestion,
        normalized: Any,
        derived_bucket: str,
    ) -> None:
        settings = get_inkwise_settings()
        segmentation = self.segmentation_service.build_segments(normalized)
        db.query(InkwiseSourceSegmentEmbedding).filter(InkwiseSourceSegmentEmbedding.source_id == source.id).delete()
        db.query(InkwiseSourceSegment).filter(InkwiseSourceSegment.source_id == source.id).delete()

        manifest_segments: list[dict[str, Any]] = []
        for draft in segmentation.segments:
            segment = InkwiseSourceSegment(
                source_id=source.id,
                ingestion_id=ingestion.id,
                user_id=source.user_id,
                segment_type=draft.segment_type,
                modality=draft.modality,
                order_index=draft.order_index,
                title=draft.title,
                text_content=draft.text_content,
                char_count=draft.char_count,
                token_count=draft.token_count,
                page_start=draft.page_start,
                page_end=draft.page_end,
                time_start_ms=draft.time_start_ms,
                time_end_ms=draft.time_end_ms,
                locator_json=draft.locator_json,
                meta_json=draft.meta_json,
                created_at=datetime.utcnow(),
            )

            if draft.segment_type == "pdf_window":
                asset_object = self._upload_pdf_window_asset(
                    source=source,
                    ingestion=ingestion,
                    draft=draft,
                    canonical_pdf_path=normalized.canonical_local_path,
                    bucket=derived_bucket,
                )
                segment.asset_bucket = derived_bucket
                segment.asset_object = asset_object
                segment.preview_bucket = derived_bucket
                segment.preview_object = asset_object
                embedding_result = self.embedding_service.embed_pdf_gcs_sync(
                    gcs_uri=f"gs://{derived_bucket}/{asset_object}",
                    output_dimensionality=settings.embedding_dimension,
                    document_ocr=settings.embedding_enable_document_ocr,
                )
            else:
                embedding_result = self.embedding_service.embed_document_text_sync(
                    draft.text_content or "",
                    output_dimensionality=settings.embedding_dimension,
                )

            db.add(segment)
            db.flush()
            db.add(
                InkwiseSourceSegmentEmbedding(
                    segment_id=segment.id,
                    source_id=source.id,
                    user_id=source.user_id,
                    model=settings.embedding_model,
                    embedding_dimension=settings.embedding_dimension,
                    task_instruction=settings.embedding_document_task_type,
                    is_active=True,
                    embedding=embedding_result.values,
                    created_at=datetime.utcnow(),
                )
            )
            manifest_segments.append(
                {
                    "segment_id": str(segment.id),
                    "segment_type": draft.segment_type,
                    "order_index": draft.order_index,
                    "page_start": draft.page_start,
                    "page_end": draft.page_end,
                    "asset_bucket": segment.asset_bucket,
                    "asset_object": segment.asset_object,
                }
            )

        ingestion.segment_count = int(segmentation.stats.get("segment_count") or len(segmentation.segments))
        manifest_object = f"inkwise/derived/{source.user_id}/{source.id}/segments/{ingestion.id}/manifest.json"
        storage_client().bucket(derived_bucket).blob(manifest_object).upload_from_string(
            json.dumps(
                {
                    "source_id": str(source.id),
                    "ingestion_id": str(ingestion.id),
                    "segment_count": ingestion.segment_count,
                    "stats": segmentation.stats,
                    "segments": manifest_segments,
                },
                ensure_ascii=True,
            ),
            content_type="application/json",
        )
        ingestion.preview_manifest_bucket = derived_bucket
        ingestion.preview_manifest_object = manifest_object

    def _upload_pdf_window_asset(
        self,
        *,
        source: InkwiseSource,
        ingestion: InkwiseSourceIngestion,
        draft: SegmentDraft,
        canonical_pdf_path: str,
        bucket: str,
    ) -> str:
        if draft.page_start is None or draft.page_end is None:
            raise IngestionError("PDF window segment missing page range")
        if not is_valid_gcs_bucket_name(bucket):
            raise IngestionError("Derived storage bucket is invalid")

        with tempfile.TemporaryDirectory() as temp_dir:
            filename = f"segment_{draft.order_index:04d}_p{draft.page_start}-{draft.page_end}.pdf"
            local_pdf = os.path.join(temp_dir, filename)
            self._write_pdf_window(
                source_pdf_path=canonical_pdf_path,
                output_pdf_path=local_pdf,
                page_start=draft.page_start,
                page_end=draft.page_end,
            )
            object_name = f"inkwise/derived/{source.user_id}/{source.id}/segments/{ingestion.id}/pdf_window/{filename}"
            storage_client().bucket(bucket).blob(object_name).upload_from_filename(local_pdf, content_type="application/pdf")
            return object_name

    def _write_pdf_window(
        self,
        *,
        source_pdf_path: str,
        output_pdf_path: str,
        page_start: int,
        page_end: int,
    ) -> None:
        src = pymupdf.open(source_pdf_path)
        dest = pymupdf.open()
        try:
            dest.insert_pdf(src, from_page=max(0, page_start - 1), to_page=max(0, page_end - 1))
            dest.save(output_pdf_path)
        finally:
            try:
                dest.close()
            except Exception:
                pass
            try:
                src.close()
            except Exception:
                pass

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

    def _is_supported_source(self, source: InkwiseSource) -> bool:
        content_type = (source.content_type or "").lower()
        if content_type == "application/pdf" or content_type.endswith("/pdf"):
            return True
        filename = (source.original_filename or "").lower()
        return filename.endswith(".pdf")
