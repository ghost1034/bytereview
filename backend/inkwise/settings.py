"""Environment-backed settings for the Inkwise module."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "y", "on")


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except Exception:
        return default


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except Exception:
        return default


def _normalize_env_text(raw: str | None, *, strip_trailing_slash: bool = False) -> str | None:
    value = (raw or "").strip().strip('"').strip("'")
    while value.endswith("\\"):
        value = value[:-1].rstrip()
    if strip_trailing_slash:
        value = value.rstrip("/")
    return value or None


_BUCKET_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$")


def normalize_gcs_bucket_name(raw: str | None) -> str | None:
    value = _normalize_env_text(raw)
    if not value:
        return None
    if value.startswith("gs://"):
        value = value[5:]
    value = value.strip().strip("/")
    if not value:
        return None
    return value


def is_valid_gcs_bucket_name(value: str | None) -> bool:
    if not value:
        return False
    return bool(_BUCKET_RE.match(value))


@dataclass(frozen=True)
class InkwiseSettings:
    enabled: bool
    project_id: str | None
    location: str
    uploads_bucket: str | None
    derived_bucket: str | None
    gemini_model: str
    embedding_model: str
    embedding_location: str
    embedding_dimension: int
    embedding_query_task_type: str
    embedding_document_task_type: str
    embedding_auto_truncate: bool
    embedding_enable_document_ocr: bool
    embedding_enable_audio_track_extraction: bool
    ocr_enabled: bool
    ocr_languages: str
    ocr_timeout_seconds: int
    ocr_force: bool
    ocr_min_chars_per_page: int
    ocr_empty_page_ratio_threshold: float
    ocr_min_usable_page_ratio: float
    use_lexical_fusion: bool
    use_vector_rerank: bool
    vector_search_top_k: int
    lexical_search_top_k: int
    rerank_top_k: int
    vector_rerank_model: str
    segment_pdf_window_pages: int
    segment_pdf_window_overlap_pages: int
    segment_text_chunk_chars: int
    audio_chunk_seconds: int
    video_chunk_seconds: int
    media_chunk_overlap_seconds: int
    media_max_clips_per_source: int
    grounded_model: str
    grounded_chat_history_enabled: bool
    grounded_chat_max_history_messages: int
    grounded_chat_max_history_chars: int
    query_rewrite_model: str
    query_rewrite_enabled: bool
    query_rewrite_max_history_messages: int
    query_rewrite_max_query_chars: int
    query_rewrite_timeout_seconds: float
    max_bound_sources: int
    max_upload_mb: int
    media_tokens_per_page: int
    cloud_tasks_project: str | None
    cloud_tasks_location: str | None
    cloud_tasks_queue_ingest: str | None
    cloud_tasks_service_url: str | None
    tasks_token: str | None
    inline_ingest_fallback_enabled: bool

    @property
    def vertex_enabled(self) -> bool:
        return bool(self.project_id)

    @property
    def cloud_tasks_enabled(self) -> bool:
        return bool(
            self.cloud_tasks_project
            and self.cloud_tasks_location
            and self.cloud_tasks_queue_ingest
            and self.cloud_tasks_service_url
        )


def get_inkwise_settings() -> InkwiseSettings:
    default_model = os.getenv("INKWISE_GEMINI_MODEL", "gemini-3-flash-preview")
    return InkwiseSettings(
        enabled=_env_bool("INKWISE_ENABLED", True),
        project_id=_normalize_env_text(os.getenv("GOOGLE_CLOUD_PROJECT_ID") or os.getenv("GCP_PROJECT")),
        location=_normalize_env_text(os.getenv("GOOGLE_CLOUD_LOCATION", "global")) or "global",
        uploads_bucket=normalize_gcs_bucket_name(os.getenv("GCS_BUCKET_NAME")),
        derived_bucket=normalize_gcs_bucket_name(os.getenv("INKWISE_DERIVED_BUCKET") or os.getenv("GCS_BUCKET_NAME")),
        gemini_model=default_model,
        embedding_model=os.getenv("INKWISE_EMBEDDING_MODEL", "gemini-embedding-2-preview"),
        embedding_location=_normalize_env_text(os.getenv("INKWISE_EMBEDDING_LOCATION", "us-central1")) or "us-central1",
        embedding_dimension=min(3072, max(128, _env_int("INKWISE_EMBEDDING_DIMENSION", 1536))),
        embedding_query_task_type=os.getenv("INKWISE_EMBEDDING_QUERY_TASK_TYPE", "RETRIEVAL_QUERY"),
        embedding_document_task_type=os.getenv("INKWISE_EMBEDDING_DOCUMENT_TASK_TYPE", "RETRIEVAL_DOCUMENT"),
        embedding_auto_truncate=_env_bool("INKWISE_EMBEDDING_AUTO_TRUNCATE", True),
        embedding_enable_document_ocr=_env_bool("INKWISE_EMBEDDING_ENABLE_DOCUMENT_OCR", True),
        embedding_enable_audio_track_extraction=_env_bool("INKWISE_EMBEDDING_ENABLE_AUDIO_TRACK_EXTRACTION", True),
        ocr_enabled=_env_bool("INKWISE_OCR_ENABLED", True),
        ocr_languages=os.getenv("INKWISE_OCR_LANGUAGES", "eng"),
        ocr_timeout_seconds=max(30, _env_int("INKWISE_OCR_TIMEOUT_SECONDS", 900)),
        ocr_force=_env_bool("INKWISE_OCR_FORCE", False),
        ocr_min_chars_per_page=max(1, _env_int("INKWISE_OCR_MIN_CHARS_PER_PAGE", 80)),
        ocr_empty_page_ratio_threshold=max(0.0, min(1.0, _env_float("INKWISE_OCR_EMPTY_PAGE_RATIO_THRESHOLD", 0.2))),
        ocr_min_usable_page_ratio=max(0.0, min(1.0, _env_float("INKWISE_OCR_MIN_USABLE_PAGE_RATIO", 0.7))),
        use_lexical_fusion=_env_bool("INKWISE_USE_LEXICAL_FUSION", False),
        use_vector_rerank=_env_bool("INKWISE_USE_VECTOR_RERANK", False),
        vector_search_top_k=max(1, _env_int("INKWISE_VECTOR_SEARCH_TOP_K", 24)),
        lexical_search_top_k=max(1, _env_int("INKWISE_LEXICAL_SEARCH_TOP_K", 16)),
        rerank_top_k=max(1, _env_int("INKWISE_RERANK_TOP_K", 12)),
        vector_rerank_model=os.getenv("INKWISE_VECTOR_RERANK_MODEL", default_model),
        segment_pdf_window_pages=max(1, _env_int("INKWISE_SEGMENT_PDF_WINDOW_PAGES", 4)),
        segment_pdf_window_overlap_pages=max(0, _env_int("INKWISE_SEGMENT_PDF_WINDOW_OVERLAP_PAGES", 1)),
        segment_text_chunk_chars=max(500, _env_int("INKWISE_SEGMENT_TEXT_CHUNK_CHARS", 3000)),
        audio_chunk_seconds=max(5, _env_int("INKWISE_AUDIO_CHUNK_SECONDS", 60)),
        video_chunk_seconds=max(5, _env_int("INKWISE_VIDEO_CHUNK_SECONDS", 60)),
        media_chunk_overlap_seconds=max(0, _env_int("INKWISE_MEDIA_CHUNK_OVERLAP_SECONDS", 2)),
        media_max_clips_per_source=max(1, _env_int("INKWISE_MEDIA_MAX_CLIPS_PER_SOURCE", 256)),
        grounded_model=os.getenv("INKWISE_GROUNDED_MODEL", default_model),
        grounded_chat_history_enabled=_env_bool("INKWISE_GROUNDED_CHAT_HISTORY_ENABLED", True),
        grounded_chat_max_history_messages=_env_int("INKWISE_GROUNDED_CHAT_MAX_HISTORY_MESSAGES", 6),
        grounded_chat_max_history_chars=_env_int("INKWISE_GROUNDED_CHAT_MAX_HISTORY_CHARS", 3500),
        query_rewrite_model=os.getenv("INKWISE_QUERY_REWRITE_MODEL", default_model),
        query_rewrite_enabled=_env_bool("INKWISE_QUERY_REWRITE_ENABLED", True),
        query_rewrite_max_history_messages=_env_int("INKWISE_QUERY_REWRITE_MAX_HISTORY_MESSAGES", 12),
        query_rewrite_max_query_chars=_env_int("INKWISE_QUERY_REWRITE_MAX_QUERY_CHARS", 180),
        query_rewrite_timeout_seconds=_env_float("INKWISE_QUERY_REWRITE_TIMEOUT_SECONDS", 15.0),
        max_bound_sources=_env_int("INKWISE_MAX_BOUND_SOURCES", 100),
        max_upload_mb=_env_int("INKWISE_MAX_UPLOAD_MB", 100),
        media_tokens_per_page=max(1, _env_int("INKWISE_MEDIA_TOKENS_PER_PAGE", 750)),
        cloud_tasks_project=_normalize_env_text(os.getenv("CLOUD_TASKS_PROJECT") or os.getenv("GOOGLE_CLOUD_PROJECT_ID")),
        cloud_tasks_location=_normalize_env_text(os.getenv("CLOUD_TASKS_LOCATION") or os.getenv("CLOUD_RUN_REGION")),
        cloud_tasks_queue_ingest=_normalize_env_text(os.getenv("CLOUD_TASKS_QUEUE_INGEST") or os.getenv("INKWISE_TASKS_QUEUE")),
        cloud_tasks_service_url=_normalize_env_text(
            os.getenv("CLOUD_TASKS_SERVICE_URL") or os.getenv("INKWISE_TASKS_SERVICE_URL"),
            strip_trailing_slash=True,
        ),
        tasks_token=_normalize_env_text(os.getenv("TASKS_TOKEN") or os.getenv("INKWISE_TASKS_TOKEN")),
        inline_ingest_fallback_enabled=_env_bool(
            "INKWISE_INLINE_INGEST_FALLBACK_ENABLED",
            os.getenv("ENVIRONMENT", "development").strip().lower() != "production",
        ),
    )
