"""PDF text extraction helpers for the Inkwise module."""

from __future__ import annotations

from dataclasses import dataclass

import pymupdf


class PdfExtractError(RuntimeError):
    pass


@dataclass(frozen=True)
class ExtractedPage:
    page_number: int
    text: str
    is_ocr: bool = False


def extract_pdf_pages_text(*, pdf_path: str, is_ocr: bool = False) -> list[ExtractedPage]:
    try:
        doc = pymupdf.open(pdf_path)
    except Exception as exc:
        raise PdfExtractError("failed to open pdf") from exc

    out: list[ExtractedPage] = []
    try:
        for idx in range(len(doc)):
            page = doc.load_page(idx)
            # PyMuPDF can emit NUL characters from broken font encodings; PostgreSQL
            # TEXT columns reject them, so strip before the text enters the pipeline.
            text = (page.get_text("text") or "").replace("\x00", "")
            text = "\n".join([line.rstrip() for line in text.splitlines()]).strip()
            out.append(ExtractedPage(page_number=idx + 1, text=text, is_ocr=bool(is_ocr)))
    finally:
        try:
            doc.close()
        except Exception:
            pass

    return out
