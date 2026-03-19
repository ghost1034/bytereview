"""Gemini Embedding 2 helpers for the Inkwise module."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

import google.auth
import requests
from google.auth.transport.requests import AuthorizedSession

from inkwise.settings import get_inkwise_settings
from inkwise.services.vertex_ai import VertexAIConfigError, VertexAIError

_CLOUD_PLATFORM_SCOPE = ("https://www.googleapis.com/auth/cloud-platform",)
_ALLOWED_FILE_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "audio/mp3",
    "audio/wav",
    "video/mp4",
    "video/mpeg",
}


class InkwiseEmbeddingError(VertexAIError):
    pass


class InkwiseEmbeddingConfigError(VertexAIConfigError):
    pass


@dataclass(frozen=True)
class InkwiseEmbeddingUsage:
    prompt_token_count: int | None
    total_token_count: int | None
    truncated: bool
    raw: Any


@dataclass(frozen=True)
class InkwiseEmbeddingResult:
    values: list[float]
    usage: InkwiseEmbeddingUsage


def _get_project_id(project_id: str | None) -> str:
    if project_id:
        return project_id
    settings = get_inkwise_settings()
    if settings.project_id:
        return settings.project_id
    raise InkwiseEmbeddingConfigError("GOOGLE_CLOUD_PROJECT_ID is required for Inkwise embeddings")


def _get_location(location: str | None) -> str:
    if location:
        return location
    settings = get_inkwise_settings()
    return settings.embedding_location


def _embed_url(*, project_id: str, location: str, model: str) -> str:
    return f"https://{location}-aiplatform.googleapis.com/v1/projects/{project_id}/locations/{location}/publishers/google/models/{model}:embedContent"


def _authorized_session() -> AuthorizedSession:
    credentials, _ = google.auth.default(scopes=_CLOUD_PLATFORM_SCOPE)
    return AuthorizedSession(credentials)


def _validate_dimension(value: int) -> int:
    if value < 128 or value > 3072:
        raise InkwiseEmbeddingConfigError("Embedding dimension must be between 128 and 3072")
    return int(value)


def _clean_task_type(task_type: str | None) -> str | None:
    value = (task_type or "").strip().upper()
    return value or None


def _build_config(
    *,
    title: str | None = None,
    task_type: str | None = None,
    output_dimensionality: int | None = None,
    auto_truncate: bool | None = None,
    document_ocr: bool | None = None,
    audio_track_extraction: bool | None = None,
) -> dict[str, Any]:
    config: dict[str, Any] = {}
    if title:
        config["title"] = title
    if task_type:
        config["taskType"] = task_type
    if output_dimensionality is not None:
        config["outputDimensionality"] = _validate_dimension(output_dimensionality)
    if auto_truncate is not None:
        config["autoTruncate"] = bool(auto_truncate)
    if document_ocr is not None:
        config["documentOcr"] = bool(document_ocr)
    if audio_track_extraction is not None:
        config["audioTrackExtraction"] = bool(audio_track_extraction)
    return config


def _embed_content_sync(
    *,
    parts: list[dict[str, Any]],
    model: str | None = None,
    title: str | None = None,
    task_type: str | None = None,
    output_dimensionality: int | None = None,
    auto_truncate: bool | None = None,
    document_ocr: bool | None = None,
    audio_track_extraction: bool | None = None,
    project_id: str | None = None,
    location: str | None = None,
    timeout_seconds: float = 120,
) -> InkwiseEmbeddingResult:
    settings = get_inkwise_settings()
    resolved_project = _get_project_id(project_id)
    resolved_location = _get_location(location)
    resolved_model = (model or settings.embedding_model).strip() or settings.embedding_model
    body: dict[str, Any] = {
        "content": {
            "role": "user",
            "parts": parts,
        }
    }
    config = _build_config(
        title=title,
        task_type=_clean_task_type(task_type),
        output_dimensionality=output_dimensionality or settings.embedding_dimension,
        auto_truncate=auto_truncate,
        document_ocr=document_ocr,
        audio_track_extraction=audio_track_extraction,
    )
    if config:
        body["embedContentConfig"] = config

    try:
        response = _authorized_session().post(
            _embed_url(project_id=resolved_project, location=resolved_location, model=resolved_model),
            json=body,
            timeout=timeout_seconds,
        )
    except requests.RequestException as exc:
        raise InkwiseEmbeddingError(f"Embedding request failed: {exc}") from exc

    if not response.ok:
        detail = None
        try:
            detail = response.json()
        except Exception:
            detail = response.text
        raise InkwiseEmbeddingError(f"Embedding request failed with HTTP {response.status_code}: {detail}")

    try:
        payload = response.json()
    except Exception as exc:
        raise InkwiseEmbeddingError("Embedding response was not valid JSON") from exc

    values = (((payload.get("embedding") or {}).get("values")) or [])
    if not isinstance(values, list) or not values:
        raise InkwiseEmbeddingError("Embedding response did not include vector values")

    try:
        vector = [float(value) for value in values]
    except Exception as exc:
        raise InkwiseEmbeddingError("Embedding response contained non-numeric values") from exc

    usage_metadata = payload.get("usageMetadata") or {}
    usage = InkwiseEmbeddingUsage(
        prompt_token_count=_safe_int(usage_metadata.get("promptTokenCount")),
        total_token_count=_safe_int(usage_metadata.get("totalTokenCount")),
        truncated=bool(payload.get("truncated")),
        raw=payload,
    )
    return InkwiseEmbeddingResult(values=vector, usage=usage)


def _safe_int(value: Any) -> int | None:
    try:
        return int(value) if value is not None else None
    except Exception:
        return None


class InkwiseEmbeddingService:
    def embed_query_text_sync(self, text: str, **kwargs: Any) -> InkwiseEmbeddingResult:
        settings = get_inkwise_settings()
        return self.embed_text_sync(text, task_type=settings.embedding_query_task_type, **kwargs)

    async def embed_query_text(self, text: str, **kwargs: Any) -> InkwiseEmbeddingResult:
        return await asyncio.to_thread(self.embed_query_text_sync, text, **kwargs)

    def embed_document_text_sync(self, text: str, **kwargs: Any) -> InkwiseEmbeddingResult:
        settings = get_inkwise_settings()
        return self.embed_text_sync(text, task_type=settings.embedding_document_task_type, **kwargs)

    async def embed_document_text(self, text: str, **kwargs: Any) -> InkwiseEmbeddingResult:
        return await asyncio.to_thread(self.embed_document_text_sync, text, **kwargs)

    def embed_text_sync(
        self,
        text: str,
        *,
        title: str | None = None,
        task_type: str | None = None,
        output_dimensionality: int | None = None,
        auto_truncate: bool | None = None,
        model: str | None = None,
        project_id: str | None = None,
        location: str | None = None,
        timeout_seconds: float = 120,
    ) -> InkwiseEmbeddingResult:
        cleaned = (text or "").strip()
        if not cleaned:
            raise InkwiseEmbeddingError("Text to embed must not be empty")
        settings = get_inkwise_settings()
        return _embed_content_sync(
            parts=[{"text": cleaned}],
            title=title,
            task_type=task_type or settings.embedding_query_task_type,
            output_dimensionality=output_dimensionality,
            auto_truncate=settings.embedding_auto_truncate if auto_truncate is None else auto_truncate,
            model=model,
            project_id=project_id,
            location=location,
            timeout_seconds=timeout_seconds,
        )

    async def embed_text(
        self,
        text: str,
        **kwargs: Any,
    ) -> InkwiseEmbeddingResult:
        return await asyncio.to_thread(self.embed_text_sync, text, **kwargs)

    def embed_file_gcs_sync(
        self,
        *,
        gcs_uri: str,
        mime_type: str,
        title: str | None = None,
        output_dimensionality: int | None = None,
        document_ocr: bool | None = None,
        audio_track_extraction: bool | None = None,
        model: str | None = None,
        project_id: str | None = None,
        location: str | None = None,
        timeout_seconds: float = 120,
    ) -> InkwiseEmbeddingResult:
        clean_uri = (gcs_uri or "").strip()
        clean_mime = (mime_type or "").strip().lower()
        if not clean_uri.startswith("gs://"):
            raise InkwiseEmbeddingError("GCS URI is required for file embeddings")
        if clean_mime not in _ALLOWED_FILE_MIME_TYPES:
            raise InkwiseEmbeddingError(f"Unsupported embedding mime type: {clean_mime or '<empty>'}")

        settings = get_inkwise_settings()
        return _embed_content_sync(
            parts=[{"fileData": {"mimeType": clean_mime, "fileUri": clean_uri}}],
            output_dimensionality=output_dimensionality,
            document_ocr=settings.embedding_enable_document_ocr if document_ocr is None else document_ocr,
            audio_track_extraction=(
                settings.embedding_enable_audio_track_extraction
                if audio_track_extraction is None
                else audio_track_extraction
            ),
            model=model,
            project_id=project_id,
            location=location,
            timeout_seconds=timeout_seconds,
        )

    async def embed_file_gcs(self, **kwargs: Any) -> InkwiseEmbeddingResult:
        return await asyncio.to_thread(self.embed_file_gcs_sync, **kwargs)

    def embed_pdf_gcs_sync(
        self,
        *,
        gcs_uri: str,
        title: str | None = None,
        output_dimensionality: int | None = None,
        document_ocr: bool | None = None,
        model: str | None = None,
        project_id: str | None = None,
        location: str | None = None,
        timeout_seconds: float = 120,
    ) -> InkwiseEmbeddingResult:
        return self.embed_file_gcs_sync(
            gcs_uri=gcs_uri,
            mime_type="application/pdf",
            title=title,
            output_dimensionality=output_dimensionality,
            document_ocr=document_ocr,
            model=model,
            project_id=project_id,
            location=location,
            timeout_seconds=timeout_seconds,
        )

    async def embed_pdf_gcs(self, **kwargs: Any) -> InkwiseEmbeddingResult:
        return await asyncio.to_thread(self.embed_pdf_gcs_sync, **kwargs)
