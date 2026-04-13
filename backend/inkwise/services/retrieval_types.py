"""Shared retrieval types for Inkwise grounded evidence."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class EvidenceItem:
    evidence_id: str
    source_id: uuid.UUID
    source_title: str
    page_number: int
    excerpt: str
    score: float | None
    modality: str | None = None
    segment_type: str | None = None
    segment_id: uuid.UUID | None = None
    segment_title: str | None = None
    locator_json: dict[str, Any] | None = None
    preview_bucket: str | None = None
    preview_object: str | None = None
    bibliographic_metadata: dict[str, Any] | None = None


def evidence_excerpt(item: EvidenceItem) -> str:
    excerpt = (item.excerpt or "").strip()
    if excerpt:
        return excerpt

    locator = item.locator_json or {}
    locator_kind = str(locator.get("kind") or "").strip().lower() if isinstance(locator, dict) else ""
    page_end = locator.get("page_end") if isinstance(locator, dict) else None
    time_range_label = format_time_range_locator(locator)
    if item.page_number > 0 and isinstance(page_end, int) and page_end != item.page_number:
        return (
            f"Relevant evidence is contained in the attached PDF pages {item.page_number}-{page_end} "
            f"from {item.source_title}. No extracted text is available for this evidence block."
        )
    if item.page_number > 0:
        return (
            f"Relevant evidence is contained in the attached PDF page {item.page_number} "
            f"from {item.source_title}. No extracted text is available for this evidence block."
        )
    if locator_kind == "image_asset":
        return f"Relevant evidence is contained in the attached image from {item.source_title}."
    if locator_kind == "audio_asset":
        return f"Relevant evidence is contained in the attached audio file from {item.source_title}."
    if locator_kind == "video_asset":
        return f"Relevant evidence is contained in the attached video file from {item.source_title}."
    if locator_kind == "time_range":
        source_kind = str(locator.get("source_kind") or "media").strip().lower()
        clip_label = "audio clip" if source_kind == "audio" else "video clip" if source_kind == "video" else "media clip"
        if time_range_label:
            return f"Relevant evidence is contained in the attached {clip_label} {time_range_label} from {item.source_title}."
        return f"Relevant evidence is contained in the attached {clip_label} from {item.source_title}."
    return f"Relevant evidence is available in the attached reference asset from {item.source_title}."


def evidence_has_pdf_preview(item: EvidenceItem) -> bool:
    return evidence_preview_mime_type(item) == "application/pdf"


def evidence_preview_mime_type(item: EvidenceItem) -> str | None:
    preview_object = (item.preview_object or "").strip().lower()
    if not item.preview_bucket or not preview_object:
        return None
    if preview_object.endswith(".pdf"):
        return "application/pdf"
    if preview_object.endswith((".jpg", ".jpeg")):
        return "image/jpeg"
    if preview_object.endswith(".png"):
        return "image/png"
    if preview_object.endswith(".mp3"):
        return "audio/mp3"
    if preview_object.endswith(".wav"):
        return "audio/wav"
    if preview_object.endswith(".mp4"):
        return "video/mp4"
    if preview_object.endswith((".mpeg", ".mpg")):
        return "video/mpeg"

    locator = item.locator_json or {}
    locator_kind = str(locator.get("kind") or "").strip().lower() if isinstance(locator, dict) else ""
    if locator_kind == "image_asset":
        return "image/jpeg"
    if locator_kind == "audio_asset":
        return "audio/mp3"
    if locator_kind == "video_asset":
        return "video/mp4"
    if locator_kind == "time_range":
        source_kind = str(locator.get("source_kind") or "").strip().lower()
        if source_kind == "audio":
            return "audio/mp3"
        if source_kind == "video":
            return "video/mp4"
    return None


def build_evidence_pack(evidence: list[EvidenceItem]) -> str:
    blocks: list[str] = []
    for item in evidence:
        locator = item.locator_json or {}
        locator_kind = str(locator.get("kind") or "").strip().lower() if isinstance(locator, dict) else ""
        page_end = locator.get("page_end") if isinstance(locator, dict) else None
        if item.page_number > 0:
            header = f'[{item.evidence_id}] source="{item.source_title}" page={item.page_number}'
            if isinstance(page_end, int) and page_end != item.page_number:
                header = f'[{item.evidence_id}] source="{item.source_title}" pages={item.page_number}-{page_end}'
        else:
            header = f'[{item.evidence_id}] source="{item.source_title}"'
            if locator_kind == "image_asset":
                header += ' locator="image"'
            elif locator_kind == "audio_asset":
                header += ' locator="audio"'
            elif locator_kind == "video_asset":
                header += ' locator="video"'
            elif locator_kind == "time_range":
                time_range_label = format_time_range_locator(locator)
                if time_range_label:
                    header += f' locator="{time_range_label}"'
        if item.modality:
            header += f' modality="{item.modality}"'
        if item.segment_type:
            header += f' segment_type="{item.segment_type}"'
        if item.segment_title:
            header += f' segment="{item.segment_title}"'
        blocks.append(header + "\n" + evidence_excerpt(item))
    return ("\n\n".join(blocks).strip() + "\n") if blocks else ""


def format_time_range_locator(locator: dict[str, Any] | None) -> str | None:
    if not isinstance(locator, dict):
        return None
    start_ms = _int_or_none(locator.get("time_start_ms"))
    end_ms = _int_or_none(locator.get("time_end_ms"))
    if start_ms is None or end_ms is None:
        return None
    return f"{_format_timestamp(start_ms)}-{_format_timestamp(end_ms)}"


def _format_timestamp(value_ms: int) -> str:
    total_seconds = max(0, int(value_ms) // 1000)
    minutes, seconds = divmod(total_seconds, 60)
    hours, minutes = divmod(minutes, 60)
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    return f"{minutes:02d}:{seconds:02d}"


def _int_or_none(value: Any) -> int | None:
    try:
        return int(value) if value is not None else None
    except Exception:
        return None


def evidence_item_to_payload(item: EvidenceItem) -> dict[str, Any]:
    return {
        "evidence_id": item.evidence_id,
        "source_id": str(item.source_id),
        "source_title": item.source_title,
        "page_number": item.page_number,
        "modality": item.modality,
        "segment_type": item.segment_type,
        "segment_id": str(item.segment_id) if item.segment_id is not None else None,
        "segment_title": item.segment_title,
        "locator_json": item.locator_json,
        "preview_bucket": item.preview_bucket,
        "preview_object": item.preview_object,
        "excerpt": evidence_excerpt(item),
        "bibliographic_metadata": item.bibliographic_metadata,
        "score": item.score,
    }
