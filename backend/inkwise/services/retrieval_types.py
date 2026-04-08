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
    segment_id: uuid.UUID | None = None
    segment_title: str | None = None
    locator_json: dict[str, Any] | None = None
    preview_bucket: str | None = None
    preview_object: str | None = None


def evidence_excerpt(item: EvidenceItem) -> str:
    excerpt = (item.excerpt or "").strip()
    if excerpt:
        return excerpt

    locator = item.locator_json or {}
    locator_kind = str(locator.get("kind") or "").strip().lower() if isinstance(locator, dict) else ""
    page_end = locator.get("page_end") if isinstance(locator, dict) else None
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
        if item.segment_title:
            header += f' segment="{item.segment_title}"'
        blocks.append(header + "\n" + evidence_excerpt(item))
    return ("\n\n".join(blocks).strip() + "\n") if blocks else ""


def evidence_item_to_payload(item: EvidenceItem) -> dict[str, Any]:
    return {
        "evidence_id": item.evidence_id,
        "source_id": str(item.source_id),
        "source_title": item.source_title,
        "page_number": item.page_number,
        "segment_id": str(item.segment_id) if item.segment_id is not None else None,
        "segment_title": item.segment_title,
        "locator_json": item.locator_json,
        "preview_bucket": item.preview_bucket,
        "preview_object": item.preview_object,
        "excerpt": evidence_excerpt(item),
        "score": item.score,
    }
