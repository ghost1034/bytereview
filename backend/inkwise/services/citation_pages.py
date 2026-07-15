"""Resolve verified citation quotes to source page locators."""

from __future__ import annotations

import copy
import logging
import uuid
from dataclasses import dataclass
from typing import Any, Mapping, Sequence

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from inkwise.services.citation_text import normalize_citation_match_text
from models.inkwise_models import InkwiseSourcePage


logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CitationSourcePage:
    page_number: int
    text: str


def resolve_citation_page_locators(
    db: Session,
    *,
    citations: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    ranges = _source_page_ranges(citations)
    if not ranges:
        return citations

    filters = [
        and_(
            InkwiseSourcePage.source_id == source_id,
            InkwiseSourcePage.page_number >= page_start,
            InkwiseSourcePage.page_number <= page_end,
        )
        for source_id, (page_start, page_end) in ranges.items()
    ]
    try:
        rows = (
            db.query(InkwiseSourcePage)
            .filter(or_(*filters))
            .order_by(InkwiseSourcePage.source_id.asc(), InkwiseSourcePage.page_number.asc())
            .all()
        )
    except Exception:
        logger.warning("Inkwise citation page resolution failed; retaining chunk locators", exc_info=True)
        return citations

    pages_by_source: dict[str, list[CitationSourcePage]] = {}
    for row in rows:
        pages_by_source.setdefault(str(row.source_id), []).append(
            CitationSourcePage(page_number=int(row.page_number), text=str(row.text or ""))
        )
    return refine_citation_page_locators(citations=citations, pages_by_source=pages_by_source)


def refine_citation_page_locators(
    *,
    citations: list[dict[str, Any]],
    pages_by_source: Mapping[str, Sequence[CitationSourcePage]],
) -> list[dict[str, Any]]:
    refined = copy.deepcopy(citations)
    for citation in refined:
        source_id = str(citation.get("source_id") or "").strip()
        page_start, page_end = _citation_page_range(citation)
        if not source_id or page_start is None or page_end is None:
            continue

        source_pages = [
            page
            for page in pages_by_source.get(source_id, [])
            if page_start <= page.page_number <= page_end
        ]
        references = citation.get("references")
        excerpt = str(citation.get("excerpt") or "")
        if not source_pages or not isinstance(references, list) or not excerpt:
            continue

        resolved_references = 0
        all_resolved_pages: set[int] = set()
        for reference in references:
            if not isinstance(reference, dict):
                continue
            highlight = reference.get("highlight")
            if not isinstance(highlight, dict):
                continue
            start = _int_or_none(highlight.get("start"))
            end = _int_or_none(highlight.get("end"))
            if start is None or end is None or start < 0 or end <= start or end > len(excerpt):
                continue

            quote_pages = find_quote_pages(source_pages, excerpt[start:end])
            if not quote_pages:
                continue
            reference["page_number"] = quote_pages[0]
            reference["locator_json"] = _page_locator(citation.get("locator_json"), quote_pages)
            resolved_references += 1
            all_resolved_pages.update(quote_pages)

        if references and resolved_references == len(references):
            page_numbers = tuple(sorted(all_resolved_pages))
            citation["page_number"] = page_numbers[0]
            citation["locator_json"] = _page_locator(citation.get("locator_json"), page_numbers)

    return refined


def find_quote_pages(pages: Sequence[CitationSourcePage], quote: str) -> tuple[int, ...] | None:
    needle = normalize_citation_match_text(quote)
    if not needle:
        return None

    matches: set[tuple[int, ...]] = set()
    group: list[CitationSourcePage] = []
    previous_page: int | None = None
    for page in sorted(pages, key=lambda item: item.page_number):
        if previous_page is not None and page.page_number != previous_page + 1:
            matches.update(_find_quote_pages_in_group(group, needle))
            group = []
        group.append(page)
        previous_page = page.page_number
    matches.update(_find_quote_pages_in_group(group, needle))

    return next(iter(matches)) if len(matches) == 1 else None


def _find_quote_pages_in_group(pages: Sequence[CitationSourcePage], needle: str) -> set[tuple[int, ...]]:
    haystack_parts: list[str] = []
    page_mapping: list[int | None] = []
    for page in pages:
        normalized = normalize_citation_match_text(page.text)
        if not normalized:
            continue
        if haystack_parts:
            haystack_parts.append(" ")
            page_mapping.append(None)
        haystack_parts.append(normalized)
        page_mapping.extend([page.page_number] * len(normalized))

    haystack = "".join(haystack_parts)
    matches: set[tuple[int, ...]] = set()
    position = haystack.find(needle)
    while position != -1:
        page_numbers = tuple(
            sorted(
                {
                    page_number
                    for page_number in page_mapping[position : position + len(needle)]
                    if page_number is not None
                }
            )
        )
        if page_numbers:
            matches.add(page_numbers)
        position = haystack.find(needle, position + 1)
    return matches


def _source_page_ranges(citations: list[dict[str, Any]]) -> dict[uuid.UUID, tuple[int, int]]:
    ranges: dict[uuid.UUID, tuple[int, int]] = {}
    for citation in citations:
        references = citation.get("references")
        if not isinstance(references, list) or not any(
            isinstance(reference, dict) and isinstance(reference.get("highlight"), dict)
            for reference in references
        ):
            continue
        source_id = _uuid_or_none(citation.get("source_id"))
        page_start, page_end = _citation_page_range(citation)
        if source_id is None or page_start is None or page_end is None:
            continue
        current = ranges.get(source_id)
        if current is None:
            ranges[source_id] = (page_start, page_end)
        else:
            ranges[source_id] = (min(current[0], page_start), max(current[1], page_end))
    return ranges


def _citation_page_range(citation: Mapping[str, Any]) -> tuple[int | None, int | None]:
    locator = citation.get("locator_json")
    page_start = _int_or_none(locator.get("page_start")) if isinstance(locator, dict) else None
    page_end = _int_or_none(locator.get("page_end")) if isinstance(locator, dict) else None
    page_start = page_start or _int_or_none(citation.get("page_number"))
    page_end = page_end or page_start
    if page_start is None or page_end is None or page_start <= 0 or page_end < page_start:
        return None, None
    return page_start, page_end


def _page_locator(value: Any, page_numbers: tuple[int, ...]) -> dict[str, Any]:
    locator = dict(value) if isinstance(value, dict) else {}
    locator.update(
        {
            "kind": "page_range",
            "page_start": page_numbers[0],
            "page_end": page_numbers[-1],
            "page_numbers": list(page_numbers),
        }
    )
    return locator


def _uuid_or_none(value: Any) -> uuid.UUID | None:
    try:
        return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))
    except (TypeError, ValueError, AttributeError):
        return None


def _int_or_none(value: Any) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None
