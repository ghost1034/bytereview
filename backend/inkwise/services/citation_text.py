"""Helpers for parsing grounded text with inline evidence markers."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


_EVIDENCE_ID_RE = re.compile(r"\[(E\d{2})\]")


@dataclass(frozen=True)
class ParsedCitationText:
    plain_text: str
    content_with_citations: str
    citations: list[dict[str, Any]]
    segments: list[dict[str, Any]]


def _citation_payload(item: Any, *, evidence_id: str) -> dict[str, Any]:
    return {
        "evidence_id": evidence_id,
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
        "excerpt": item.excerpt,
        "bibliographic_metadata": getattr(item, "bibliographic_metadata", None),
    }


def parse_citation_text(*, text: str, evidence: list[Any]) -> ParsedCitationText:
    raw_text = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    evidence_by_id = {item.evidence_id: item for item in evidence}

    tokens: list[tuple[str, str]] = []
    cursor = 0
    for match in _EVIDENCE_ID_RE.finditer(raw_text):
        if match.start() > cursor:
            tokens.append(("text", raw_text[cursor : match.start()]))
        tokens.append(("marker", match.group(1)))
        cursor = match.end()
    if cursor < len(raw_text):
        tokens.append(("text", raw_text[cursor:]))

    segments: list[dict[str, Any]] = []
    citations: list[dict[str, Any]] = []
    seen_citation_ids: set[str] = set()
    current_text = ""
    current_ids: list[str] = []

    def flush() -> None:
        nonlocal current_text, current_ids
        if not current_text:
            current_ids = []
            return
        segment_text = current_text
        segment_ids = list(current_ids)
        segments.append(
            {
                "text": segment_text,
                "citation_ids": segment_ids,
            }
        )
        for evidence_id in segment_ids:
            if evidence_id in seen_citation_ids or evidence_id not in evidence_by_id:
                continue
            citations.append(_citation_payload(evidence_by_id[evidence_id], evidence_id=evidence_id))
            seen_citation_ids.add(evidence_id)
        current_text = ""
        current_ids = []

    for token_type, value in tokens:
        if token_type == "text":
            if current_ids and current_text:
                flush()
            current_text += value
            continue

        evidence_id = value
        if evidence_id not in evidence_by_id:
            current_text += f"[{evidence_id}]"
            continue
        if not current_text:
            continue
        if evidence_id not in current_ids:
            current_ids.append(evidence_id)

    flush()

    if not segments and raw_text:
        segments.append({"text": raw_text, "citation_ids": []})

    plain_text = "".join(str(segment.get("text") or "") for segment in segments)
    return ParsedCitationText(
        plain_text=plain_text,
        content_with_citations=raw_text,
        citations=citations,
        segments=segments,
    )
