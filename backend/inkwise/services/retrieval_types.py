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
    node_id: str | None
    node_title: str | None
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
        header = f'[{item.evidence_id}] source="{item.source_title}" page={item.page_number}'
        locator = item.locator_json or {}
        page_end = locator.get("page_end") if isinstance(locator, dict) else None
        if isinstance(page_end, int) and page_end != item.page_number:
            header = f'[{item.evidence_id}] source="{item.source_title}" pages={item.page_number}-{page_end}'
        if item.node_title:
            header += f' node="{item.node_title}"'
        elif item.segment_title:
            header += f' segment="{item.segment_title}"'
        blocks.append(header + "\n" + item.excerpt.strip())
    return ("\n\n".join(blocks).strip() + "\n") if blocks else ""
