"""Document export helpers for the Inkwise module."""

from __future__ import annotations

import html
import io
import json
import re
from typing import Any

from inkwise.services.citation_styles import format_inline_citation, format_note_citation, normalize_citation_style


class ExportError(RuntimeError):
    pass


_TAG_RE = re.compile(r"<[^>]+>")
_BR_RE = re.compile(r"<\s*br\s*/?\s*>", re.IGNORECASE)
_P_END_RE = re.compile(r"</\s*p\s*>", re.IGNORECASE)
_PAGE_BREAK_SENTINEL = "\f"


def html_to_text(content_html: str | None) -> str:
    if not content_html:
        return ""

    text = _BR_RE.sub("\n", content_html)
    text = _P_END_RE.sub("\n\n", text)
    text = _TAG_RE.sub("", text)
    text = html.unescape(text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _normalize_block_text(value: str) -> str:
    value = (value or "").replace("\r\n", "\n").replace("\r", "\n")
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def _content_json_to_text(content_json: Any) -> str:
    def render_node(node: Any) -> str:
        if isinstance(node, str):
            return node
        if not isinstance(node, dict):
            return ""

        node_type = node.get("type")
        content = node.get("content") or []

        if node_type == "text":
            return str(node.get("text") or "")
        if node_type == "inkwiseCitationAnchor":
            return ""
        if node_type == "inkwiseInlineCitation":
            attrs = node.get("attrs") or {}
            citations = attrs.get("citations") if isinstance(attrs.get("citations"), list) else []
            label = str(attrs.get("label") or "").strip() or format_inline_citation(citations, attrs.get("citationStyle")).strip()
            return label
        if node_type == "inkwiseNoteRef":
            attrs = node.get("attrs") or {}
            note_number = attrs.get("noteNumber", "")
            note_kind = attrs.get("noteKind", "footnote")
            if note_kind == "footnote":
                return f"[^{note_number}]"
            return f"[{note_number}]"
        if node_type == "inkwiseNoteDefinition":
            attrs = node.get("attrs") or {}
            note_number = attrs.get("noteNumber", "")
            note_kind = attrs.get("noteKind", "footnote")
            citations = attrs.get("citations") if isinstance(attrs.get("citations"), list) else []
            inner_text = format_note_citation(citations, normalize_citation_style(attrs.get("citationStyle"))) if citations else "".join(render_node(child) for child in content)
            inner_text = _normalize_block_text(inner_text)
            if note_kind == "footnote":
                return f"[^{note_number}]: {inner_text}"
            return f"{note_number}. {inner_text}"
        if node_type == "inkwisePageBreak":
            return _PAGE_BREAK_SENTINEL

        if node_type in {"doc", "paragraph", "heading", "blockquote", "tableCell", "tableHeader"}:
            rendered = "".join(render_node(child) for child in content)
            return _normalize_block_text(rendered)

        if node_type == "listItem":
            rendered = " ".join(part for part in (render_node(child) for child in content) if part)
            return _normalize_block_text(rendered)

        if node_type == "bulletList":
            return "\n".join(f"- {item}" for item in (render_node(child) for child in content) if item)

        if node_type == "orderedList":
            items = [item for item in (render_node(child) for child in content) if item]
            return "\n".join(f"{index}. {item}" for index, item in enumerate(items, start=1))

        if node_type == "tableRow":
            cells = [render_node(child) for child in content]
            return "\t".join(cell for cell in cells if cell is not None)

        if node_type == "table":
            rows = [render_node(child) for child in content]
            return "\n".join(row for row in rows if row)

        rendered_children = [render_node(child) for child in content]
        return _normalize_block_text("\n".join(part for part in rendered_children if part))

    if not isinstance(content_json, dict):
        return ""

    text = render_node(content_json)
    text = text.replace(f"{_PAGE_BREAK_SENTINEL}\n", _PAGE_BREAK_SENTINEL)
    text = text.replace(f"\n{_PAGE_BREAK_SENTINEL}", _PAGE_BREAK_SENTINEL)
    return _normalize_block_text(text.replace(_PAGE_BREAK_SENTINEL, f"\n{_PAGE_BREAK_SENTINEL}\n"))


def content_to_text(*, content_html: str | None, content_json: Any = None) -> str:
    if isinstance(content_json, dict):
        structured_text = _content_json_to_text(content_json)
        if structured_text:
            return structured_text

    text = html_to_text(content_html)
    if text:
        return text
    if isinstance(content_json, str):
        return content_json.strip()
    if isinstance(content_json, dict):
        try:
            return json.dumps(content_json, ensure_ascii=True, indent=2)
        except Exception:
            return str(content_json)
    return ""


def _wrap_lines(text: str, max_chars: int) -> list[str]:
    lines: list[str] = []
    for raw in text.split("\n"):
        if not raw:
            lines.append("")
            continue
        words = raw.split(" ")
        current = ""
        for word in words:
            if not current:
                current = word
                continue
            candidate = current + " " + word
            if len(candidate) <= max_chars:
                current = candidate
            else:
                lines.append(current)
                current = word
        if current:
            lines.append(current)
    return lines


def render_docx(*, title: str, content_html: str | None, content_json: Any = None) -> bytes:
    try:
        from docx import Document as DocxDocument
    except Exception as exc:
        raise ExportError("python-docx is not installed") from exc

    doc = DocxDocument()
    doc.add_heading(title or "Untitled", level=1)
    text = content_to_text(content_html=content_html, content_json=content_json)
    if text:
        page_chunks = text.split(_PAGE_BREAK_SENTINEL)
        for page_index, page_chunk in enumerate(page_chunks):
            if page_index > 0:
                doc.add_page_break()
            for paragraph in [item for item in page_chunk.split("\n\n") if item.strip()]:
                doc.add_paragraph(paragraph)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def render_pdf(*, title: str, content_html: str | None, content_json: Any = None) -> bytes:
    try:
        from reportlab.lib.pagesizes import LETTER
        from reportlab.lib.units import inch
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        from reportlab.pdfgen.canvas import Canvas
    except Exception as exc:
        raise ExportError("reportlab is not installed") from exc

    buf = io.BytesIO()
    page_w, page_h = LETTER
    margin_x = 0.85 * inch
    margin_y = 0.85 * inch
    canvas = Canvas(buf, pagesize=LETTER)

    font_title = "Helvetica-Bold"
    font_body = "Helvetica"
    try:
        pdfmetrics.registerFont(TTFont("IBMPlexSans", "IBMPlexSans-Regular.ttf"))
        font_body = "IBMPlexSans"
    except Exception:
        pass

    y = page_h - margin_y
    canvas.setFont(font_title, 18)
    canvas.drawString(margin_x, y, (title or "Untitled")[:120])
    y -= 0.35 * inch
    canvas.setFont(font_body, 11)

    text = content_to_text(content_html=content_html, content_json=content_json)
    leading = 14
    for page_index, page_chunk in enumerate(text.split(_PAGE_BREAK_SENTINEL)):
        if page_index > 0:
            canvas.showPage()
            canvas.setFont(font_body, 11)
            y = page_h - margin_y

        lines = _wrap_lines(page_chunk, max_chars=95)
        for line in lines:
            if y <= margin_y:
                canvas.showPage()
                canvas.setFont(font_body, 11)
                y = page_h - margin_y
            if not line:
                y -= leading
                continue
            canvas.drawString(margin_x, y, line[:200])
            y -= leading

    canvas.showPage()
    canvas.save()
    return buf.getvalue()
