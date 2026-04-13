"""Helpers for semantic Inkwise citation nodes and document refreshes."""

from __future__ import annotations

import copy
from typing import Any

from inkwise.services.citation_styles import escape_html_text, format_inline_citation, format_note_citation, normalize_citation_style


INKWISE_CITATION_ANCHOR_NODE = "inkwiseCitationAnchor"
INKWISE_INLINE_CITATION_NODE = "inkwiseInlineCitation"
INKWISE_NOTE_DEFINITION_NODE = "inkwiseNoteDefinition"
INKWISE_NOTE_REF_NODE = "inkwiseNoteRef"
INKWISE_PAGE_BREAK_NODE = "inkwisePageBreak"


def refresh_document_citations(
    *,
    content_json: dict[str, Any] | None,
    citation_style: str | None,
    source_map: dict[str, dict[str, Any]] | None = None,
) -> tuple[dict[str, Any] | None, bool]:
    if not isinstance(content_json, dict):
        return content_json, False

    normalized_style = normalize_citation_style(citation_style)
    source_map = source_map or {}
    changed = False
    document = copy.deepcopy(content_json)

    def visit(node: dict[str, Any]) -> None:
        nonlocal changed
        attrs = node.get("attrs") if isinstance(node.get("attrs"), dict) else None
        node_type = str(node.get("type") or "")

        if attrs is not None and node_type in {INKWISE_CITATION_ANCHOR_NODE, INKWISE_INLINE_CITATION_NODE, INKWISE_NOTE_DEFINITION_NODE}:
            raw_citations = attrs.get("citations") if isinstance(attrs.get("citations"), list) else []
            refreshed_citations = [_refresh_citation_payload(item, source_map) for item in raw_citations if isinstance(item, dict)]
            if refreshed_citations != raw_citations:
                attrs["citations"] = refreshed_citations
                changed = True
            if attrs.get("citationStyle") != normalized_style:
                attrs["citationStyle"] = normalized_style
                changed = True

            if node_type == INKWISE_INLINE_CITATION_NODE and refreshed_citations:
                label = format_inline_citation(refreshed_citations, normalized_style).strip()
                if attrs.get("label") != label:
                    attrs["label"] = label
                    changed = True
            elif node_type == INKWISE_NOTE_DEFINITION_NODE and refreshed_citations:
                text_value = format_note_citation(refreshed_citations, normalized_style)
                next_content = [{"type": "text", "text": text_value}] if text_value else []
                if node.get("content") != next_content:
                    node["content"] = next_content
                    changed = True

        for child in node.get("content") or []:
            if isinstance(child, dict):
                visit(child)

    visit(document)
    return document, changed


def content_json_to_html(content_json: dict[str, Any] | None) -> str:
    if not isinstance(content_json, dict):
        return ""

    def render_node(node: Any) -> str:
        if not isinstance(node, dict):
            return ""
        node_type = str(node.get("type") or "")
        attrs = node.get("attrs") if isinstance(node.get("attrs"), dict) else {}
        children = "".join(render_node(child) for child in node.get("content") or [])

        if node_type == "text":
            return escape_html_text(str(node.get("text") or ""))
        if node_type == INKWISE_CITATION_ANCHOR_NODE:
            return ""
        if node_type == INKWISE_INLINE_CITATION_NODE:
            label = str(attrs.get("label") or "").strip()
            return f'<span data-inkwise-inline-citation="true">{escape_html_text(label)}</span>' if label else ""
        if node_type == INKWISE_NOTE_REF_NODE:
            note_number = escape_html_text(str(attrs.get("noteNumber") or ""))
            return f"<sup>{note_number}</sup>" if note_number else ""
        if node_type == INKWISE_NOTE_DEFINITION_NODE:
            note_number = escape_html_text(str(attrs.get("noteNumber") or ""))
            return f"<div>{note_number}. {children}</div>" if note_number else f"<div>{children}</div>"
        if node_type == INKWISE_PAGE_BREAK_NODE:
            return '<hr data-inkwise-page-break="true" />'
        if node_type == "doc":
            return children
        if node_type == "paragraph":
            return f"<p>{children}</p>"
        if node_type == "heading":
            level = int(attrs.get("level") or 1)
            level = 1 if level < 1 or level > 6 else level
            return f"<h{level}>{children}</h{level}>"
        if node_type == "blockquote":
            return f"<blockquote>{children}</blockquote>"
        if node_type == "bulletList":
            return f"<ul>{children}</ul>"
        if node_type == "orderedList":
            return f"<ol>{children}</ol>"
        if node_type == "listItem":
            return f"<li>{children}</li>"
        if node_type == "table":
            return f"<table>{children}</table>"
        if node_type == "tableRow":
            return f"<tr>{children}</tr>"
        if node_type == "tableCell":
            return f"<td>{children}</td>"
        if node_type == "tableHeader":
            return f"<th>{children}</th>"
        return children

    return render_node(content_json)


def _refresh_citation_payload(citation: dict[str, Any], source_map: dict[str, dict[str, Any]]) -> dict[str, Any]:
    refreshed = dict(citation)
    source_id = str(refreshed.get("source_id") or "").strip()
    source_state = source_map.get(source_id)
    if source_state:
        if source_state.get("title"):
            refreshed["source_title"] = source_state["title"]
        refreshed["bibliographic_metadata"] = source_state.get("bibliographic_metadata") or {}
    return refreshed
