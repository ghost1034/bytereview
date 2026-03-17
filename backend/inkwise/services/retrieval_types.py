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


def build_evidence_pack(evidence: list[EvidenceItem]) -> str:
    blocks: list[str] = []
    for item in evidence:
        locator = item.locator_json or {}
        page_end = locator.get("page_end") if isinstance(locator, dict) else None
        if item.page_number > 0:
            header = f'[{item.evidence_id}] source="{item.source_title}" page={item.page_number}'
            if isinstance(page_end, int) and page_end != item.page_number:
                header = f'[{item.evidence_id}] source="{item.source_title}" pages={item.page_number}-{page_end}'
        else:
            header = f'[{item.evidence_id}] source="{item.source_title}"'
        if item.segment_title:
            header += f' segment="{item.segment_title}"'
        blocks.append(header + "\n" + item.excerpt.strip())
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
        "excerpt": item.excerpt,
        "score": item.score,
    }
