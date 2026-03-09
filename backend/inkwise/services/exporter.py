"""Document export helpers for the Inkwise module."""

from __future__ import annotations

import html
import io
import json
import re
from typing import Any


class ExportError(RuntimeError):
    pass


_TAG_RE = re.compile(r"<[^>]+>")
_BR_RE = re.compile(r"<\s*br\s*/?\s*>", re.IGNORECASE)
_P_END_RE = re.compile(r"</\s*p\s*>", re.IGNORECASE)


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


def content_to_text(*, content_html: str | None, content_json: Any = None) -> str:
    text = html_to_text(content_html)
    if text:
        return text
    if isinstance(content_json, dict):
        try:
            return json.dumps(content_json, ensure_ascii=True, indent=2)
        except Exception:
            return str(content_json)
    if isinstance(content_json, str):
        return content_json.strip()
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
        for paragraph in text.split("\n\n"):
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
    lines = _wrap_lines(text, max_chars=95)
    leading = 14
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
