"""Citation style formatting helpers for Inkwise."""

from __future__ import annotations

import html
from typing import Any


CITATION_STYLE_DEFAULT = "default"
CITATION_STYLE_APA = "apa"
CITATION_STYLE_MLA = "mla"
CITATION_STYLE_CHICAGO = "chicago"
CITATION_STYLE_BLUEBOOK = "bluebook"
CITATION_STYLE_NONE = "none"
CITATION_STYLE_VALUES = {
    CITATION_STYLE_DEFAULT,
    CITATION_STYLE_APA,
    CITATION_STYLE_MLA,
    CITATION_STYLE_CHICAGO,
    CITATION_STYLE_BLUEBOOK,
    CITATION_STYLE_NONE,
}


def normalize_citation_style(value: str | None) -> str:
    candidate = str(value or "").strip().lower()
    return candidate if candidate in CITATION_STYLE_VALUES else CITATION_STYLE_DEFAULT


def citation_style_requires_reference_text(style: str | None) -> bool:
    return normalize_citation_style(style) != CITATION_STYLE_NONE


def normalize_bibliographic_metadata(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    normalized: dict[str, Any] = {}
    for key, item in value.items():
        if isinstance(item, list):
            cleaned = [str(entry).strip() for entry in item if str(entry or "").strip()]
            if cleaned:
                normalized[str(key)] = cleaned
            continue
        text = str(item).strip() if item is not None else ""
        if text:
            normalized[str(key)] = text
    return normalized


def format_inline_citation(citations: list[dict[str, Any]], style: str | None) -> str:
    if not citation_style_requires_reference_text(style):
        return ""
    items = [item for item in (_format_inline_item(citation, style) for citation in _dedupe_citations(citations)) if item]
    return f" ({'; '.join(items)})" if items else ""


def format_note_citation(citations: list[dict[str, Any]], style: str | None) -> str:
    if not citation_style_requires_reference_text(style):
        return ""
    normalized_style = normalize_citation_style(style)
    items = [item for item in (_format_note_item(citation, normalized_style) for citation in _dedupe_citations(citations)) if item]
    if normalized_style == CITATION_STYLE_DEFAULT:
        return "; ".join(items)
    return " ".join(items)


def escape_html_text(value: str) -> str:
    return html.escape(value, quote=True)


def _dedupe_citations(citations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    items: list[dict[str, Any]] = []
    for citation in citations:
        if not isinstance(citation, dict):
            continue
        key = str(citation.get("evidence_id") or f'{citation.get("source_id") or "source"}:{citation.get("page_number") or ""}:{citation.get("excerpt") or ""}')
        if key in seen:
            continue
        seen.add(key)
        items.append(citation)
    return items


def _format_inline_item(citation: dict[str, Any], style: str | None) -> str:
    normalized_style = normalize_citation_style(style)
    if normalized_style == CITATION_STYLE_APA:
        return _format_apa_inline(citation)
    if normalized_style == CITATION_STYLE_MLA:
        return _format_mla_inline(citation)
    if normalized_style == CITATION_STYLE_CHICAGO:
        return _format_chicago_inline(citation)
    if normalized_style == CITATION_STYLE_BLUEBOOK:
        return _format_bluebook_inline(citation)
    return _format_default_inline(citation)


def _format_note_item(citation: dict[str, Any], style: str) -> str:
    if style == CITATION_STYLE_APA:
        return _ensure_terminal_period(_format_apa_note(citation))
    if style == CITATION_STYLE_MLA:
        return _ensure_terminal_period(_format_mla_note(citation))
    if style == CITATION_STYLE_CHICAGO:
        return _ensure_terminal_period(_format_chicago_note(citation))
    if style == CITATION_STYLE_BLUEBOOK:
        return _ensure_terminal_period(_format_bluebook_note(citation))
    return _format_default_note(citation)


def _format_default_inline(citation: dict[str, Any]) -> str:
    label = _title_for_citation(citation)
    locator = _default_locator(citation)
    return " ".join(part for part in [label, locator] if part)


def _format_default_note(citation: dict[str, Any]) -> str:
    return _format_default_inline(citation)


def _format_apa_inline(citation: dict[str, Any]) -> str:
    author = _author_short(citation)
    year = _year(citation)
    locator = _apa_locator(citation)
    body = ", ".join(part for part in [author, year] if part)
    if locator:
        return f"{body}, {locator}" if body else locator
    return body or _title_for_citation(citation)


def _format_apa_note(citation: dict[str, Any]) -> str:
    metadata = _metadata(citation)
    author = _author_full(citation)
    year = _year(citation)
    title = _text(metadata.get("title")) or _title_for_citation(citation)
    publisher = _text(metadata.get("publisher"))
    locator = _apa_locator(citation)
    parts = []
    if author:
        parts.append(author)
    if year:
        parts.append(f"({year})")
    if title:
        parts.append(title)
    if publisher:
        parts.append(publisher)
    if locator:
        parts.append(locator)
    return ". ".join(part.rstrip(".") for part in parts if part)


def _format_mla_inline(citation: dict[str, Any]) -> str:
    author = _author_short(citation)
    locator = _mla_locator(citation)
    title = _short_title(citation)
    base = author or title
    return " ".join(part for part in [base, locator] if part)


def _format_mla_note(citation: dict[str, Any]) -> str:
    metadata = _metadata(citation)
    author = _author_full(citation)
    title = _text(metadata.get("title")) or _title_for_citation(citation)
    container = _text(metadata.get("container_title"))
    publisher = _text(metadata.get("publisher"))
    year = _year(citation)
    locator = _default_locator(citation)
    parts = [author, title, container, publisher, year, locator]
    return ", ".join(part for part in parts if part)


def _format_chicago_inline(citation: dict[str, Any]) -> str:
    author = _author_short(citation)
    year = _year(citation)
    locator = _chicago_locator(citation)
    body = " ".join(part for part in [author, year] if part)
    if locator:
        return f"{body}, {locator}" if body else locator
    return body or _short_title(citation)


def _format_chicago_note(citation: dict[str, Any]) -> str:
    metadata = _metadata(citation)
    author = _author_full(citation)
    title = _text(metadata.get("title")) or _title_for_citation(citation)
    publisher = _text(metadata.get("publisher"))
    year = _year(citation)
    locator = _chicago_locator(citation)
    core = ", ".join(part for part in [publisher, year] if part)
    parts = [author, title]
    if core:
        parts.append(f"({core})")
    if locator:
        parts.append(locator)
    return ", ".join(part for part in parts if part)


def _format_bluebook_inline(citation: dict[str, Any]) -> str:
    case_citation = _bluebook_case_citation(citation)
    if case_citation:
        return case_citation
    metadata = _metadata(citation)
    title = _text(metadata.get("title")) or _title_for_citation(citation)
    year = _year(citation)
    locator = _bluebook_locator(citation)
    parts = [title, locator]
    body = ", ".join(part for part in parts if part)
    if year:
        body = f"{body} ({year})" if body else f"({year})"
    return body


def _format_bluebook_note(citation: dict[str, Any]) -> str:
    case_citation = _bluebook_case_citation(citation)
    if case_citation:
        return case_citation
    metadata = _metadata(citation)
    author = _author_full(citation)
    title = _text(metadata.get("title")) or _title_for_citation(citation)
    year = _year(citation)
    locator = _bluebook_locator(citation)
    parts = [author, title]
    if locator:
        parts.append(f"at {locator}")
    body = ", ".join(part for part in parts if part)
    if year:
        body = f"{body} ({year})" if body else f"({year})"
    return body


def _bluebook_case_citation(citation: dict[str, Any]) -> str:
    metadata = _metadata(citation)
    if _text(metadata.get("citation_type")) != "case":
        return ""
    case_name = _text(metadata.get("title")) or _title_for_citation(citation)
    reporter_volume = _text(metadata.get("reporter_volume"))
    reporter = _text(metadata.get("reporter"))
    first_page = _text(metadata.get("first_page"))
    pin = _text(metadata.get("pin_cite")) or _locator_number(citation)
    cite = " ".join(part for part in [reporter_volume, reporter, first_page] if part)
    if case_name and cite:
        body = f"{case_name}, {cite}"
    else:
        body = case_name or cite
    if pin:
        body = f"{body}, {pin}" if body else pin
    parenthetical = " ".join(part for part in [_text(metadata.get("court")), _year(citation)] if part)
    if parenthetical:
        body = f"{body} ({parenthetical})" if body else f"({parenthetical})"
    return body


def _metadata(citation: dict[str, Any]) -> dict[str, Any]:
    return normalize_bibliographic_metadata(citation.get("bibliographic_metadata"))


def _authors(citation: dict[str, Any]) -> list[str]:
    metadata = _metadata(citation)
    value = metadata.get("authors")
    return value if isinstance(value, list) else []


def _author_short(citation: dict[str, Any]) -> str:
    authors = _authors(citation)
    if not authors:
        return _short_title(citation)
    first = _last_name(authors[0])
    if len(authors) > 2:
        return f"{first} et al."
    if len(authors) == 2:
        return f"{first} & {_last_name(authors[1])}"
    return first


def _author_full(citation: dict[str, Any]) -> str:
    authors = _authors(citation)
    if not authors:
        return ""
    if len(authors) == 1:
        return authors[0]
    if len(authors) == 2:
        return f"{authors[0]} and {authors[1]}"
    return ", ".join(authors[:-1]) + f", and {authors[-1]}"


def _year(citation: dict[str, Any]) -> str:
    metadata = _metadata(citation)
    return _text(metadata.get("year"))


def _title_for_citation(citation: dict[str, Any]) -> str:
    metadata = _metadata(citation)
    return _text(metadata.get("title")) or _text(citation.get("source_title")) or "Evidence"


def _short_title(citation: dict[str, Any]) -> str:
    metadata = _metadata(citation)
    return _text(metadata.get("short_title")) or _title_for_citation(citation)


def _default_locator(citation: dict[str, Any]) -> str:
    locator = _locator_number(citation)
    return f"p.{locator}" if locator else ""


def _apa_locator(citation: dict[str, Any]) -> str:
    locator = _locator_number(citation)
    if not locator:
        return ""
    return f"p. {locator}" if "-" not in locator else f"pp. {locator}"


def _mla_locator(citation: dict[str, Any]) -> str:
    return _locator_number(citation)


def _chicago_locator(citation: dict[str, Any]) -> str:
    return _locator_number(citation)


def _bluebook_locator(citation: dict[str, Any]) -> str:
    metadata = _metadata(citation)
    return _text(metadata.get("pin_cite")) or _locator_number(citation)


def _locator_number(citation: dict[str, Any]) -> str:
    metadata = _metadata(citation)
    explicit = _text(metadata.get("pin_cite"))
    if explicit:
        return explicit
    locator = citation.get("locator_json")
    if isinstance(locator, dict):
        page_start = _int(locator.get("page_start"))
        page_end = _int(locator.get("page_end"))
        if page_start and page_end and page_end != page_start:
            return f"{page_start}-{page_end}"
        if page_start:
            return str(page_start)
    page_number = _int(citation.get("page_number"))
    return str(page_number) if page_number else ""


def _last_name(value: str) -> str:
    text_value = _text(value)
    if not text_value:
        return ""
    if "," in text_value:
        return text_value.split(",", 1)[0].strip() or text_value
    parts = text_value.split()
    return parts[-1] if parts else text_value


def _ensure_terminal_period(value: str) -> str:
    text_value = value.rstrip()
    if not text_value:
        return ""
    return text_value if text_value.endswith((".", "!", "?")) else f"{text_value}."


def _text(value: Any) -> str:
    return str(value or "").strip()


def _int(value: Any) -> int | None:
    try:
        number = int(value)
        return number if number > 0 else None
    except Exception:
        return None
