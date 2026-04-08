"""Segment builders for vector-ready Inkwise retrieval."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from inkwise.services.media_chunker import MediaChunk
from inkwise.services.source_normalizer import NormalizedSource
from inkwise.settings import get_inkwise_settings


_WHITESPACE_RE = re.compile(r"\s+")


@dataclass(frozen=True)
class SegmentDraft:
    segment_type: str
    modality: str
    order_index: int
    title: str | None
    text_content: str | None
    char_count: int
    token_count: int | None
    page_start: int | None = None
    page_end: int | None = None
    time_start_ms: int | None = None
    time_end_ms: int | None = None
    locator_json: dict[str, Any] = field(default_factory=dict)
    meta_json: dict[str, Any] = field(default_factory=dict)
    asset_local_path: str | None = None
    asset_mime_type: str | None = None


@dataclass(frozen=True)
class SegmentationResult:
    segments: list[SegmentDraft]
    stats: dict[str, Any]


class InkwiseSegmentationService:
    def build_segments(self, normalized: NormalizedSource, *, media_chunks: list[MediaChunk] | None = None) -> SegmentationResult:
        if normalized.canonical_mime_type == "application/pdf":
            pdf_window_segments = self._build_pdf_window_segments(normalized)
            text_chunk_segments = self._build_text_chunk_segments(normalized)
            segments = pdf_window_segments + text_chunk_segments
            stats = {
                "pdf_window_count": len(pdf_window_segments),
                "text_chunk_count": len(text_chunk_segments),
                "segment_count": len(segments),
                "page_count": normalized.page_count,
            }
            return SegmentationResult(segments=segments, stats=stats)

        if normalized.canonical_mime_type == "text/html":
            web_segments = self._build_web_segments(normalized)
            return SegmentationResult(
                segments=web_segments,
                stats={
                    "web_block_count": len(web_segments),
                    "segment_count": len(web_segments),
                    "page_count": 0,
                },
            )

        if normalized.source_kind in {"image", "audio", "video"}:
            media_segments = self._build_media_segments(normalized, media_chunks=media_chunks)
            return SegmentationResult(
                segments=media_segments,
                stats={
                    "media_segment_count": len(media_segments),
                    "media_chunk_count": len(media_segments) if normalized.source_kind in {"audio", "video"} else 0,
                    "segment_count": len(media_segments),
                    "page_count": 0,
                },
            )

        raise ValueError(f"Unsupported canonical mime type for segmentation: {normalized.canonical_mime_type}")

    def _build_pdf_window_segments(self, normalized: NormalizedSource) -> list[SegmentDraft]:
        settings = get_inkwise_settings()
        page_blocks = [block for block in normalized.text_blocks if block.page_number is not None]
        if not page_blocks:
            return []

        window_size = max(1, settings.segment_pdf_window_pages)
        overlap = min(window_size - 1, max(0, settings.segment_pdf_window_overlap_pages))
        step = max(1, window_size - overlap)
        out: list[SegmentDraft] = []

        for order_index, start_idx in enumerate(range(0, len(page_blocks), step)):
            window = page_blocks[start_idx : start_idx + window_size]
            if not window:
                continue
            page_start = int(window[0].page_number or 0)
            page_end = int(window[-1].page_number or page_start)
            text_content = "\n\n".join(block.text.strip() for block in window if block.text.strip()) or None
            out.append(
                SegmentDraft(
                    segment_type="pdf_window",
                    modality="pdf",
                    order_index=order_index,
                    title=_page_range_title(normalized.title, page_start, page_end),
                    text_content=text_content,
                    char_count=len(text_content or ""),
                    token_count=_estimate_token_count(text_content),
                    page_start=page_start,
                    page_end=page_end,
                    locator_json={
                        "kind": "page_range",
                        "page_start": page_start,
                        "page_end": page_end,
                    },
                    meta_json={
                        "source_kind": normalized.source_kind,
                        "segment_family": "pdf_window",
                        "page_numbers": [int(block.page_number or 0) for block in window],
                    },
                    asset_local_path=normalized.canonical_local_path,
                    asset_mime_type=normalized.canonical_mime_type,
                )
            )

        return out

    def _build_text_chunk_segments(self, normalized: NormalizedSource) -> list[SegmentDraft]:
        settings = get_inkwise_settings()
        max_chars = max(500, settings.segment_text_chunk_chars)
        out: list[SegmentDraft] = []
        current_parts: list[str] = []
        current_pages: list[int] = []

        def flush() -> None:
            if not current_parts:
                return
            text_content = "\n\n".join(part for part in current_parts if part).strip()
            if not text_content:
                current_parts.clear()
                current_pages.clear()
                return
            page_start = min(current_pages) if current_pages else None
            page_end = max(current_pages) if current_pages else None
            order_index = len(out)
            out.append(
                SegmentDraft(
                    segment_type="text_chunk",
                    modality="text",
                    order_index=order_index,
                    title=_page_range_title(normalized.title, page_start, page_end),
                    text_content=text_content,
                    char_count=len(text_content),
                    token_count=_estimate_token_count(text_content),
                    page_start=page_start,
                    page_end=page_end,
                    locator_json={
                        "kind": "page_range",
                        "page_start": page_start,
                        "page_end": page_end,
                    },
                    meta_json={
                        "source_kind": normalized.source_kind,
                        "segment_family": "text_chunk",
                        "page_numbers": list(current_pages),
                    },
                    asset_local_path=normalized.canonical_local_path,
                    asset_mime_type=normalized.canonical_mime_type,
                )
            )
            current_parts.clear()
            current_pages.clear()

        for block in normalized.text_blocks:
            paragraphs = _split_paragraphs(block.text)
            if not paragraphs:
                continue
            for paragraph in paragraphs:
                paragraph = paragraph.strip()
                if not paragraph:
                    continue
                pending_text = "\n\n".join(current_parts + [paragraph]).strip()
                if current_parts and len(pending_text) > max_chars:
                    flush()
                current_parts.append(paragraph)
                if block.page_number is not None and block.page_number not in current_pages:
                    current_pages.append(int(block.page_number))
                if len("\n\n".join(current_parts)) >= max_chars:
                    flush()

        flush()
        return out

    def _build_web_segments(self, normalized: NormalizedSource) -> list[SegmentDraft]:
        settings = get_inkwise_settings()
        max_chars = max(500, settings.segment_text_chunk_chars)
        source_url = normalized.metadata.get("source_url") if isinstance(normalized.metadata, dict) else None
        out: list[SegmentDraft] = []
        current_parts: list[str] = []
        block_start: int | None = None
        block_end: int | None = None

        def flush() -> None:
            nonlocal block_start, block_end
            if not current_parts:
                return
            text_content = "\n\n".join(current_parts).strip()
            if not text_content:
                current_parts.clear()
                block_start = None
                block_end = None
                return
            order_index = len(out)
            out.append(
                SegmentDraft(
                    segment_type="web_block",
                    modality="web",
                    order_index=order_index,
                    title=_web_segment_title(normalized.title, order_index + 1),
                    text_content=text_content,
                    char_count=len(text_content),
                    token_count=_estimate_token_count(text_content),
                    locator_json={
                        "kind": "web_snapshot",
                        "source_url": source_url,
                        "block_start": block_start,
                        "block_end": block_end,
                    },
                    meta_json={
                        "source_kind": normalized.source_kind,
                        "segment_family": "web_block",
                        "source_url": source_url,
                    },
                    asset_local_path=normalized.canonical_local_path,
                    asset_mime_type=normalized.canonical_mime_type,
                )
            )
            current_parts.clear()
            block_start = None
            block_end = None

        for block in normalized.text_blocks:
            paragraph = (block.text or "").strip()
            if not paragraph:
                continue
            if block_start is None:
                block_start = block.order_index
            block_end = block.order_index
            pending_text = "\n\n".join(current_parts + [paragraph]).strip()
            if current_parts and len(pending_text) > max_chars:
                flush()
                block_start = block.order_index
                block_end = block.order_index
            current_parts.append(paragraph)
            if len("\n\n".join(current_parts)) >= max_chars:
                flush()

        flush()
        return out

    def _build_media_segments(self, normalized: NormalizedSource, *, media_chunks: list[MediaChunk] | None) -> list[SegmentDraft]:
        source_kind = normalized.source_kind
        if source_kind not in {"image", "audio", "video"}:
            return []
        if source_kind in {"audio", "video"} and media_chunks:
            return [
                SegmentDraft(
                    segment_type="audio_clip" if source_kind == "audio" else "video_clip",
                    modality=source_kind,
                    order_index=chunk.order_index,
                    title=_media_time_range_title(normalized.title, source_kind, chunk.time_start_ms, chunk.time_end_ms),
                    text_content=None,
                    char_count=0,
                    token_count=None,
                    time_start_ms=chunk.time_start_ms,
                    time_end_ms=chunk.time_end_ms,
                    locator_json={
                        "kind": "time_range",
                        "source_kind": source_kind,
                        "time_start_ms": chunk.time_start_ms,
                        "time_end_ms": chunk.time_end_ms,
                    },
                    meta_json={
                        "source_kind": normalized.source_kind,
                        "segment_family": "audio_clip" if source_kind == "audio" else "video_clip",
                        "uses_original_asset": bool(chunk.uses_original_asset),
                    },
                    asset_local_path=chunk.local_path,
                    asset_mime_type=chunk.mime_type,
                )
                for chunk in media_chunks
            ]
        segment_type = {
            "image": "image_asset",
            "audio": "audio_clip",
            "video": "video_clip",
        }[source_kind]
        return [
            SegmentDraft(
                segment_type=segment_type,
                modality=source_kind,
                order_index=0,
                title=_media_segment_title(normalized.title, source_kind),
                text_content=None,
                char_count=0,
                token_count=None,
                locator_json={"kind": f"{source_kind}_asset"},
                meta_json={
                    "source_kind": normalized.source_kind,
                    "segment_family": segment_type,
                },
                asset_local_path=normalized.canonical_local_path,
                asset_mime_type=normalized.canonical_mime_type,
            )
        ]


def _split_paragraphs(text: str | None) -> list[str]:
    cleaned = (text or "").strip()
    if not cleaned:
        return []
    parts = re.split(r"\n\s*\n+", cleaned)
    if len(parts) == 1:
        parts = [line.strip() for line in cleaned.splitlines() if line.strip()]
    return [part.strip() for part in parts if part.strip()]


def _estimate_token_count(text: str | None) -> int | None:
    cleaned = _WHITESPACE_RE.sub(" ", (text or "").strip())
    if not cleaned:
        return None
    return max(1, len(cleaned.split(" ")))


def _page_range_title(title: str, page_start: int | None, page_end: int | None) -> str:
    clean_title = (title or "Untitled source").strip() or "Untitled source"
    if page_start is None and page_end is None:
        return clean_title
    if page_start == page_end:
        return f"{clean_title} p.{page_start}"
    return f"{clean_title} pp.{page_start}-{page_end}"


def _web_segment_title(title: str, index: int) -> str:
    clean_title = (title or "Untitled source").strip() or "Untitled source"
    return f"{clean_title} section {index}"


def _media_segment_title(title: str, source_kind: str) -> str:
    clean_title = (title or "Untitled source").strip() or "Untitled source"
    if source_kind == "image":
        return f"{clean_title} image"
    if source_kind == "audio":
        return f"{clean_title} audio"
    if source_kind == "video":
        return f"{clean_title} video"
    return clean_title


def _media_time_range_title(title: str, source_kind: str, time_start_ms: int, time_end_ms: int) -> str:
    clean_title = _media_segment_title(title, source_kind)
    return f"{clean_title} {_format_time_range(time_start_ms, time_end_ms)}"


def _format_time_range(time_start_ms: int | None, time_end_ms: int | None) -> str:
    if time_start_ms is None or time_end_ms is None:
        return "clip"
    return f"{_format_timestamp(time_start_ms)}-{_format_timestamp(time_end_ms)}"


def _format_timestamp(value_ms: int) -> str:
    total_seconds = max(0, int(value_ms) // 1000)
    minutes, seconds = divmod(total_seconds, 60)
    hours, minutes = divmod(minutes, 60)
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    return f"{minutes:02d}:{seconds:02d}"
