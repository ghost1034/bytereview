"""Helpers for parsing grounded text with inline evidence markers."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


# Markers are either bare ([E01]) or pin-cited with a verbatim quote ([E01|"exact words"]).
_EVIDENCE_MARKER_RE = re.compile(r"\[(E\d{2})(?:\|\s*\"(.{1,600}?)\")?\]", re.DOTALL)
# Longest tail we hold back from a stream while waiting for a marker to close.
_MAX_PARTIAL_MARKER_HOLDBACK = 700
_PARTIAL_MARKER_PREFIX_RE = re.compile(r"^\[(?:E(?:\d(?:\d(?:\|(?:\s*\"[^\"]{0,600}\"?)?)?)?)?)?$")

_MATCH_CHAR_FOLDS = {
    "‘": "'",
    "’": "'",
    "“": '"',
    "”": '"',
    "–": "-",
    "—": "-",
}


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


def find_excerpt_span(excerpt: str, quote: str) -> tuple[int, int] | None:
    """Locate a model-quoted span inside the excerpt, tolerating whitespace/quote-style drift.

    Returns character offsets into the original excerpt, or None when the quote
    is not a verbatim match (in which case the quote must be discarded).
    """
    haystack, mapping = _normalize_for_match(excerpt or "")
    needle, _ = _normalize_for_match(quote or "")
    needle = needle.strip()
    if not needle or not haystack:
        return None
    position = haystack.find(needle)
    if position == -1:
        return None
    start = mapping[position]
    end = mapping[position + len(needle) - 1] + 1
    return start, end


def normalize_citation_match_text(text: str) -> str:
    normalized, _mapping = _normalize_for_match(text or "")
    return normalized.strip()


def _normalize_for_match(text: str) -> tuple[str, list[int]]:
    chars: list[str] = []
    mapping: list[int] = []
    previous_space = False
    for index, raw_char in enumerate(text):
        char = _MATCH_CHAR_FOLDS.get(raw_char, raw_char)
        if char.isspace():
            if previous_space:
                continue
            previous_space = True
            char = " "
        else:
            previous_space = False
        chars.append(char.lower())
        mapping.append(index)
    return "".join(chars), mapping


def _merge_spans(spans: list[tuple[int, int]]) -> list[tuple[int, int]]:
    merged: list[tuple[int, int]] = []
    for start, end in sorted(spans):
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def strip_citation_quote_payloads(text: str) -> str:
    """Rewrite pin-cited markers like [E01|"quote"] to bare [E01] markers."""
    return _EVIDENCE_MARKER_RE.sub(lambda match: f"[{match.group(1)}]", text or "")


def split_stream_display_text(buffer: str, *, final: bool = False) -> tuple[str, str]:
    """Split streamed model text into (display_text, holdback).

    Quote payloads are stripped from complete markers so clients never see them
    mid-stream; a trailing partial marker is held back until it closes (or the
    holdback cap is hit, after which it flushes as-is and the final parsed
    message corrects the rendering).
    """
    if final:
        return strip_citation_quote_payloads(buffer), ""
    start = buffer.rfind("[")
    if start != -1:
        tail = buffer[start:]
        if "]" not in tail and len(tail) <= _MAX_PARTIAL_MARKER_HOLDBACK and _PARTIAL_MARKER_PREFIX_RE.match(tail):
            return strip_citation_quote_payloads(buffer[:start]), tail
    return strip_citation_quote_payloads(buffer), ""


def parse_citation_text(*, text: str, evidence: list[Any]) -> ParsedCitationText:
    raw_text = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    evidence_by_id = {item.evidence_id: item for item in evidence}

    tokens: list[tuple[str, Any]] = []
    cursor = 0
    for match in _EVIDENCE_MARKER_RE.finditer(raw_text):
        if match.start() > cursor:
            tokens.append(("text", raw_text[cursor : match.start()]))
        tokens.append(("marker", (match.group(1), match.group(2))))
        cursor = match.end()
    if cursor < len(raw_text):
        tokens.append(("text", raw_text[cursor:]))

    segments: list[dict[str, Any]] = []
    citations: list[dict[str, Any]] = []
    seen_citation_ids: set[str] = set()
    references_by_id: dict[str, list[dict[str, Any]]] = {}
    reference_counts_by_id: dict[str, int] = {}
    normalized_parts: list[str] = []
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
            normalized_parts.append(value)
            continue

        evidence_id, quote = value
        if evidence_id not in evidence_by_id:
            normalized_parts.append(f"[{evidence_id}]")
            current_text += f"[{evidence_id}]"
            continue
        if not current_text:
            normalized_parts.append(f"[{evidence_id}]")
            continue

        reference_index = reference_counts_by_id.get(evidence_id, 0) + 1
        reference_counts_by_id[evidence_id] = reference_index
        reference_id = f"{evidence_id}#{reference_index}"
        normalized_parts.append(f"[{reference_id}]")

        span = None
        if quote:
            span = find_excerpt_span(str(getattr(evidence_by_id[evidence_id], "excerpt", "") or ""), quote)
        references_by_id.setdefault(evidence_id, []).append(
            {
                "id": reference_id,
                "highlight": {"start": span[0], "end": span[1]} if span else None,
            }
        )
        if evidence_id not in current_ids:
            current_ids.append(evidence_id)

    flush()

    for citation in citations:
        references = references_by_id.get(str(citation.get("evidence_id")), [])
        citation["references"] = references
        reference_spans: list[tuple[int, int]] = []
        for reference in references:
            highlight = reference.get("highlight")
            if isinstance(highlight, dict):
                reference_spans.append((int(highlight["start"]), int(highlight["end"])))
        spans = _merge_spans(reference_spans)
        citation["highlights"] = [{"start": start, "end": end} for start, end in spans]

    if not segments and raw_text:
        segments.append({"text": strip_citation_quote_payloads(raw_text), "citation_ids": []})

    plain_text = "".join(str(segment.get("text") or "") for segment in segments)
    return ParsedCitationText(
        plain_text=plain_text,
        content_with_citations="".join(normalized_parts),
        citations=citations,
        segments=segments,
    )
