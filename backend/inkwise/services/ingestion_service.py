"""Source ingestion pipeline for the Inkwise module."""

# pyright: reportAttributeAccessIssue=false, reportGeneralTypeIssues=false, reportArgumentType=false, reportOptionalMemberAccess=false

from __future__ import annotations

import json
import logging
import os
import tempfile
import uuid
from dataclasses import dataclass
from datetime import datetime
from math import ceil
from typing import Any

import pymupdf
from sqlalchemy import desc
from sqlalchemy.orm import Session

from inkwise.services.embeddings import InkwiseEmbeddingError, InkwiseEmbeddingService
from inkwise.services.gcs import storage_client
from inkwise.services.media_chunker import InkwiseMediaChunker, MediaChunk, MediaChunkError
from inkwise.services.media_probe import MediaProbeError
from inkwise.services.segmentation_service import InkwiseSegmentationService, SegmentDraft
from inkwise.services.source_normalizer import InkwiseSourceNormalizer, SourceNormalizationError
from inkwise.settings import get_inkwise_settings, is_valid_gcs_bucket_name, normalize_gcs_bucket_name
from models.inkwise_models import InkwiseSource, InkwiseSourceIngestion, InkwiseSourcePage, InkwiseSourceSegment, InkwiseSourceSegmentEmbedding


class IngestionError(RuntimeError):
    pass


logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class IngestionUsageMeasurement:
    basis: str
    billable_pages: int
    usage_tokens: int | None = None
    usage_tokens_per_page: int | None = None


class InkwiseIngestionService:
    def __init__(self) -> None:
        self.embedding_service = InkwiseEmbeddingService()
        self.source_normalizer = InkwiseSourceNormalizer()
        self.segmentation_service = InkwiseSegmentationService()
        self.media_chunker = InkwiseMediaChunker()

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
            self._mark_failed(
                db,
                ingestion_id=ingestion_id,
                code="unsupported_type",
                message="Only PDF, DOCX, webpage, image, audio, and video sources are supported",
            )
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
                filename = str(source.original_filename or f"{source.id}.pdf")
                local_path = os.path.join(temp_dir, filename)
                storage_client().bucket(source_bucket).blob(source_object).download_to_filename(local_path)

                normalized = self.source_normalizer.normalize_local_source(
                    local_path=local_path,
                    filename=source.original_filename or filename,
                    content_type=source.content_type,
                    title=source.title,
                    source_url=source.source_url,
                )
                media_chunks: list[MediaChunk] | None = None
                if normalized.source_kind in {"audio", "video"}:
                    _probe_result, media_chunks = self.media_chunker.create_chunks(
                        local_path=normalized.canonical_local_path,
                        source_kind=normalized.source_kind,
                        mime_type=normalized.canonical_mime_type,
                        output_dir=os.path.join(temp_dir, "media_chunks"),
                    )
                ingestion.extraction_engine = str(normalized.metadata.get("extraction_engine") or ingestion.extraction_engine or "pymupdf")
                ingestion.page_count = normalized.page_count or None
                ingestion.provider_document_name = source.original_filename or source.title
                provisional_usage = self._build_usage_measurement(normalized=normalized, embedded_media_tokens=None)
                self._apply_usage_measurement(ingestion=ingestion, measurement=provisional_usage)
                db.commit()

                if provisional_usage.basis != "media_tokens":
                    page_limit_error = self._check_usage_limits(
                        db,
                        user_id=source.user_id,
                        page_count=provisional_usage.billable_pages,
                    )
                else:
                    page_limit_error = None
                if page_limit_error is not None:
                    self._mark_failed(
                        db,
                        ingestion_id=ingestion_id,
                        code="billing_limit_exceeded",
                        message=page_limit_error,
                    )
                    return self._get_ingestion_or_404(db, ingestion_id)

                derived_bucket = normalize_gcs_bucket_name(settings.derived_bucket or source_bucket)
                if not derived_bucket or not is_valid_gcs_bucket_name(derived_bucket):
                    raise IngestionError("Derived storage bucket is invalid")
                canonical_bucket, canonical_object = self._persist_canonical_asset(
                    source=source,
                    ingestion=ingestion,
                    normalized=normalized,
                    derived_bucket=derived_bucket,
                )
                ingestion.canonical_pdf_gcs_bucket = canonical_bucket
                ingestion.canonical_pdf_gcs_object = canonical_object

                embedded_media_tokens = self._persist_vector_artifacts(
                    db,
                    source=source,
                    ingestion=ingestion,
                    normalized=normalized,
                    derived_bucket=derived_bucket,
                    media_chunks=media_chunks,
                )

                final_usage = self._build_usage_measurement(
                    normalized=normalized,
                    embedded_media_tokens=embedded_media_tokens,
                )
                self._apply_usage_measurement(ingestion=ingestion, measurement=final_usage)
                db.commit()

                page_limit_error = self._check_usage_limits(
                    db,
                    user_id=source.user_id,
                    page_count=final_usage.billable_pages,
                )
                if page_limit_error is not None:
                    self._mark_failed(
                        db,
                        ingestion_id=ingestion_id,
                        code="billing_limit_exceeded",
                        message=page_limit_error,
                    )
                    return self._get_ingestion_or_404(db, ingestion_id)

                self._record_usage_for_ingestion(
                    db,
                    source=source,
                    ingestion=ingestion,
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

        except (IngestionError, SourceNormalizationError, InkwiseEmbeddingError, MediaChunkError, MediaProbeError) as exc:
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
        media_chunks: list[MediaChunk] | None = None,
    ) -> int:
        settings = get_inkwise_settings()
        segmentation = self.segmentation_service.build_segments(normalized, media_chunks=media_chunks)
        self._persist_source_pages(db, source=source, normalized=normalized)
        db.query(InkwiseSourceSegmentEmbedding).filter(InkwiseSourceSegmentEmbedding.source_id == source.id).delete()
        db.query(InkwiseSourceSegment).filter(InkwiseSourceSegment.source_id == source.id).delete()

        manifest_segments: list[dict[str, Any]] = []
        embedded_media_tokens = 0
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

            if draft.modality in {"image", "audio", "video"} and draft.asset_mime_type:
                uses_original_asset = bool((draft.meta_json or {}).get("uses_original_asset"))
                if uses_original_asset:
                    if not source.storage_bucket or not source.storage_object:
                        raise IngestionError("Media segment source storage path is missing")
                    segment.asset_bucket = source.storage_bucket
                    segment.asset_object = source.storage_object
                    segment.preview_bucket = source.storage_bucket
                    segment.preview_object = source.storage_object
                else:
                    asset_object = self._upload_media_clip_asset(
                        source=source,
                        ingestion=ingestion,
                        draft=draft,
                        bucket=derived_bucket,
                    )
                    segment.asset_bucket = derived_bucket
                    segment.asset_object = asset_object
                    segment.preview_bucket = derived_bucket
                    segment.preview_object = asset_object
                embedding_result = self.embedding_service.embed_file_gcs_sync(
                    gcs_uri=f"gs://{segment.asset_bucket}/{segment.asset_object}",
                    mime_type=draft.asset_mime_type,
                    output_dimensionality=settings.embedding_dimension,
                    audio_track_extraction=(draft.modality == "video"),
                )
                if draft.modality in {"audio", "video"}:
                    embedded_media_tokens += self._extract_embedding_usage_tokens(embedding_result)
            else:
                if normalized.canonical_mime_type == "text/html":
                    segment.asset_bucket = source.storage_bucket
                    segment.asset_object = source.storage_object
                    segment.preview_bucket = source.storage_bucket
                    segment.preview_object = source.storage_object
                elif ingestion.canonical_pdf_gcs_bucket and ingestion.canonical_pdf_gcs_object:
                    segment.preview_bucket = ingestion.canonical_pdf_gcs_bucket
                    segment.preview_object = ingestion.canonical_pdf_gcs_object
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
                    "time_start_ms": draft.time_start_ms,
                    "time_end_ms": draft.time_end_ms,
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
        return embedded_media_tokens

    def _persist_source_pages(self, db: Session, *, source: InkwiseSource, normalized: Any) -> None:
        db.query(InkwiseSourcePage).filter(InkwiseSourcePage.source_id == source.id).delete()
        page_blocks = [block for block in normalized.text_blocks if block.page_number is not None]
        for block in page_blocks:
            text = str(block.text or "")
            db.add(
                InkwiseSourcePage(
                    source_id=source.id,
                    page_number=int(block.page_number),
                    text=text,
                    is_ocr=bool(getattr(block, "is_ocr", False) or bool((block.meta or {}).get("is_ocr"))),
                    char_count=len(text),
                )
            )

    def _build_usage_measurement(
        self,
        *,
        normalized: Any,
        embedded_media_tokens: int | None,
    ) -> IngestionUsageMeasurement:
        settings = get_inkwise_settings()
        if normalized.source_kind in {"pdf", "docx"}:
            return IngestionUsageMeasurement(
                basis="page_count",
                billable_pages=max(0, int(normalized.page_count or 0)),
            )
        if normalized.source_kind == "image":
            return IngestionUsageMeasurement(basis="single_page_image", billable_pages=1)
        if normalized.source_kind in {"audio", "video"}:
            if embedded_media_tokens is None:
                return IngestionUsageMeasurement(basis="media_tokens", billable_pages=0)
            usage_tokens = int(embedded_media_tokens or 0)
            if usage_tokens <= 0:
                raise IngestionError("Media ingestion could not determine embedding token usage")
            usage_tokens_per_page = max(1, settings.media_tokens_per_page)
            return IngestionUsageMeasurement(
                basis="media_tokens",
                billable_pages=max(1, ceil(usage_tokens / usage_tokens_per_page)),
                usage_tokens=usage_tokens,
                usage_tokens_per_page=usage_tokens_per_page,
            )
        return IngestionUsageMeasurement(basis="page_count", billable_pages=max(0, int(normalized.page_count or 0)))

    def _apply_usage_measurement(self, *, ingestion: InkwiseSourceIngestion, measurement: IngestionUsageMeasurement) -> None:
        ingestion.usage_basis = measurement.basis
        ingestion.usage_pages = measurement.billable_pages
        ingestion.usage_tokens = measurement.usage_tokens
        ingestion.usage_tokens_per_page = measurement.usage_tokens_per_page

    def _extract_embedding_usage_tokens(self, embedding_result: Any) -> int:
        prompt_tokens = int(embedding_result.usage.prompt_token_count or 0)
        if prompt_tokens > 0:
            return prompt_tokens
        total_tokens = int(embedding_result.usage.total_token_count or 0)
        if total_tokens > 0:
            return total_tokens
        return 0

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
            segment_family = str(draft.segment_type or "segment").strip().lower() or "segment"
            filename = f"{segment_family}_{draft.order_index:04d}_p{draft.page_start}-{draft.page_end}.pdf"
            local_pdf = os.path.join(temp_dir, filename)
            self._write_pdf_window(
                source_pdf_path=canonical_pdf_path,
                output_pdf_path=local_pdf,
                page_start=draft.page_start,
                page_end=draft.page_end,
            )
            object_name = f"inkwise/derived/{source.user_id}/{source.id}/segments/{ingestion.id}/{segment_family}/{filename}"
            storage_client().bucket(bucket).blob(object_name).upload_from_filename(local_pdf, content_type="application/pdf")
            return object_name

    def _upload_media_clip_asset(
        self,
        *,
        source: InkwiseSource,
        ingestion: InkwiseSourceIngestion,
        draft: SegmentDraft,
        bucket: str,
    ) -> str:
        clip_path = str(draft.asset_local_path or "").strip()
        mime_type = str(draft.asset_mime_type or "").strip().lower()
        if not clip_path or not os.path.exists(clip_path):
            raise IngestionError("Media clip segment is missing its local asset")
        if not is_valid_gcs_bucket_name(bucket):
            raise IngestionError("Derived storage bucket is invalid")

        segment_family = str(draft.segment_type or "segment").strip().lower() or "segment"
        ext = os.path.splitext(clip_path)[1].lower() or self._default_extension_for_mime_type(mime_type)
        filename = f"{segment_family}_{draft.order_index:04d}_{int(draft.time_start_ms or 0):010d}_{int(draft.time_end_ms or 0):010d}{ext}"
        object_name = f"inkwise/derived/{source.user_id}/{source.id}/segments/{ingestion.id}/{segment_family}/{filename}"
        storage_client().bucket(bucket).blob(object_name).upload_from_filename(clip_path, content_type=mime_type or None)
        return object_name

    def _default_extension_for_mime_type(self, mime_type: str) -> str:
        if mime_type == "image/jpeg":
            return ".jpg"
        if mime_type == "image/png":
            return ".png"
        if mime_type == "audio/mp3":
            return ".mp3"
        if mime_type == "audio/wav":
            return ".wav"
        if mime_type == "video/mp4":
            return ".mp4"
        if mime_type == "video/mpeg":
            return ".mpeg"
        return ".bin"

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

    def _check_usage_limits(self, db: Session, *, user_id: str, page_count: int) -> str | None:
        if page_count <= 0:
            return None

        from services.billing_service import get_billing_service

        billing_service = get_billing_service(db)
        if billing_service.check_page_limit(user_id, page_count):
            return None

        billing_info = billing_service.get_billing_info(user_id)
        pages_used = int(billing_info.get("pages_used") or 0)
        pages_included = int(billing_info.get("pages_included") or 0)
        pages_remaining = max(0, pages_included - pages_used)
        plan_name = billing_info.get("plan_display_name") or "current"
        return (
            f"Cannot ingest this reference: processing {page_count} pages would exceed your {plan_name} plan limit. "
            f"You have {pages_remaining} pages remaining out of {pages_included}. "
            "Please upgrade your plan or reduce the number of reference pages."
        )

    def _record_usage_for_ingestion(
        self,
        db: Session,
        *,
        source: InkwiseSource,
        ingestion: InkwiseSourceIngestion,
    ) -> None:
        usage_pages = int(ingestion.usage_pages or 0)
        if usage_pages <= 0:
            return

        from services.billing_service import PlanLimitExceeded, get_billing_service

        billing_service = get_billing_service(db)
        try:
            event_id = billing_service.record_usage(
                user_id=source.user_id,
                pages=usage_pages,
                source="inkwise_source_ingestion",
                inkwise_ingestion_id=str(ingestion.id),
                notes=f"Inkwise ingestion for source {source.id}",
            )
            logger.info(
                "Recorded %s Inkwise usage pages for ingestion %s (event %s)",
                usage_pages,
                ingestion.id,
                event_id,
            )
        except PlanLimitExceeded as exc:
            logger.error("Plan limit exceeded after successful Inkwise ingestion %s: %s", ingestion.id, exc)
            message = self._check_usage_limits(db, user_id=source.user_id, page_count=usage_pages) or str(exc)
            self._mark_failed(
                db,
                ingestion_id=uuid.UUID(str(ingestion.id)),
                code="billing_limit_exceeded",
                message=message,
            )
            raise
        except Exception as exc:
            logger.error("Failed to record Inkwise usage for ingestion %s: %s", ingestion.id, exc)

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
        if content_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            return True
        if content_type == "text/html":
            return True
        if content_type in {
            "image/jpeg",
            "image/jpg",
            "image/png",
            "audio/mp3",
            "audio/mpeg",
            "audio/wav",
            "audio/x-wav",
            "audio/wave",
            "video/mp4",
            "video/mpeg",
            "video/mpg",
        }:
            return True
        filename = (source.original_filename or "").lower()
        return filename.endswith(
            (
                ".pdf",
                ".docx",
                ".html",
                ".htm",
                ".jpg",
                ".jpeg",
                ".png",
                ".mp3",
                ".wav",
                ".mp4",
                ".mpeg",
                ".mpg",
            )
        )

    def _persist_canonical_asset(
        self,
        *,
        source: InkwiseSource,
        ingestion: InkwiseSourceIngestion,
        normalized: Any,
        derived_bucket: str,
    ) -> tuple[str | None, str | None]:
        if normalized.canonical_mime_type != "application/pdf":
            return None, None
        if normalized.canonical_local_path == normalized.original_local_path and (source.content_type or "").lower() == "application/pdf":
            return str(source.storage_bucket or "") or None, str(source.storage_object or "") or None

        object_name = f"inkwise/derived/{source.user_id}/{source.id}/canonical/{ingestion.id}/canonical.pdf"
        storage_client().bucket(derived_bucket).blob(object_name).upload_from_filename(
            normalized.canonical_local_path,
            content_type="application/pdf",
        )
        return derived_bucket, object_name
