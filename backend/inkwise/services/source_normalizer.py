"""Source normalization helpers for vector-ready Inkwise ingestion."""

from __future__ import annotations

import asyncio
import os
import re
from html import unescape
from dataclasses import dataclass, field
from typing import Any

from inkwise.services.ocrmypdf_service import OCRmyPDFError, OCRmyPDFService
from inkwise.services.pdf_extract import ExtractedPage, extract_pdf_pages_text
from inkwise.settings import get_inkwise_settings
from services.document_conversion_service import (
    DOCX_MIME,
    PPTX_MIME,
    XLSX_MIME,
    get_document_conversion_service,
)
from services.spreadsheet_extraction_service import spreadsheet_extraction_service


PDF_MIME = "application/pdf"
HTML_MIME = "text/html"
IMAGE_JPEG_MIME = "image/jpeg"
IMAGE_PNG_MIME = "image/png"
IMAGE_MIME_TYPES = {IMAGE_JPEG_MIME, IMAGE_PNG_MIME}
AUDIO_MP3_MIME = "audio/mp3"
AUDIO_WAV_MIME = "audio/wav"
AUDIO_MIME_TYPES = {AUDIO_MP3_MIME, AUDIO_WAV_MIME}
VIDEO_MP4_MIME = "video/mp4"
VIDEO_MPEG_MIME = "video/mpeg"
VIDEO_MIME_TYPES = {VIDEO_MP4_MIME, VIDEO_MPEG_MIME}
_HTML_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
_XLSX_SHEET_HEADER_RE = re.compile(r"^Sheet (\d+): (.*)$", re.MULTILINE)


class SourceNormalizationError(RuntimeError):
    pass


@dataclass(frozen=True)
class NormalizedTextBlock:
    order_index: int
    text: str
    page_number: int | None = None
    is_ocr: bool = False
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class NormalizedAsset:
    kind: str
    mime_type: str
    local_path: str
    page_start: int | None = None
    page_end: int | None = None
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class NormalizedSource:
    source_kind: str
    title: str
    original_local_path: str
    original_mime_type: str
    canonical_local_path: str
    canonical_mime_type: str
    text_blocks: list[NormalizedTextBlock]
    assets: list[NormalizedAsset]
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def page_count(self) -> int:
        return int(self.metadata.get("page_count") or 0)


class InkwiseSourceNormalizer:
    def __init__(self) -> None:
        self.ocr_service = OCRmyPDFService()

    def normalize_local_source(
        self,
        *,
        local_path: str,
        filename: str | None = None,
        content_type: str | None = None,
        title: str | None = None,
        source_url: str | None = None,
    ) -> NormalizedSource:
        path = os.path.abspath(local_path)
        if not os.path.exists(path):
            raise SourceNormalizationError(f"Source file does not exist: {path}")

        detected_mime = self._detect_mime_type(filename=filename or path, content_type=content_type)
        resolved_title = (title or os.path.basename(filename or path) or "Untitled source").strip() or "Untitled source"

        if detected_mime == PDF_MIME:
            return self._normalize_pdf(local_path=path, title=resolved_title)
        if detected_mime == DOCX_MIME:
            return self._normalize_docx(local_path=path, title=resolved_title)
        if detected_mime == PPTX_MIME:
            return self._normalize_pptx(local_path=path, title=resolved_title)
        if detected_mime == XLSX_MIME:
            return self._normalize_xlsx(local_path=path, title=resolved_title)
        if detected_mime == HTML_MIME:
            return self._normalize_webpage(local_path=path, title=resolved_title, source_url=source_url)
        if detected_mime in IMAGE_MIME_TYPES:
            return self._normalize_binary_media(local_path=path, title=resolved_title, source_kind="image", mime_type=detected_mime)
        if detected_mime in AUDIO_MIME_TYPES:
            return self._normalize_binary_media(local_path=path, title=resolved_title, source_kind="audio", mime_type=detected_mime)
        if detected_mime in VIDEO_MIME_TYPES:
            return self._normalize_binary_media(local_path=path, title=resolved_title, source_kind="video", mime_type=detected_mime)

        raise SourceNormalizationError(f"Unsupported source type for normalization: {detected_mime}")

    def _normalize_pdf(self, *, local_path: str, title: str) -> NormalizedSource:
        pages, canonical_pdf_path, metadata = self._extract_pdf_pages_with_optional_ocr(local_path=local_path)
        blocks = self._pages_to_blocks(pages)
        assets = [
            NormalizedAsset(
                kind="canonical_pdf",
                mime_type=PDF_MIME,
                local_path=canonical_pdf_path,
                page_start=1 if pages else None,
                page_end=len(pages) if pages else None,
                meta={"page_count": len(pages)},
            )
        ]
        return NormalizedSource(
            source_kind="pdf",
            title=title,
            original_local_path=local_path,
            original_mime_type=PDF_MIME,
            canonical_local_path=canonical_pdf_path,
            canonical_mime_type=PDF_MIME,
            text_blocks=blocks,
            assets=assets,
            metadata={
                "page_count": len(pages),
                **metadata,
            },
        )

    def _normalize_docx(self, *, local_path: str, title: str) -> NormalizedSource:
        converter = get_document_conversion_service()
        try:
            canonical_pdf_path = self._run_async(converter.convert_docx_local_to_pdf_local(local_path, out_dir=os.path.dirname(local_path)))
        except Exception as exc:
            raise SourceNormalizationError(f"DOCX conversion failed: {exc}") from exc

        pages, resolved_canonical_pdf_path, metadata = self._extract_pdf_pages_with_optional_ocr(local_path=canonical_pdf_path)
        blocks = self._pages_to_blocks(pages)
        assets = [
            NormalizedAsset(kind="original_docx", mime_type=DOCX_MIME, local_path=local_path),
            NormalizedAsset(
                kind="canonical_pdf",
                mime_type=PDF_MIME,
                local_path=resolved_canonical_pdf_path,
                page_start=1 if pages else None,
                page_end=len(pages) if pages else None,
                meta={"page_count": len(pages)},
            ),
        ]
        return NormalizedSource(
            source_kind="docx",
            title=title,
            original_local_path=local_path,
            original_mime_type=DOCX_MIME,
            canonical_local_path=resolved_canonical_pdf_path,
            canonical_mime_type=PDF_MIME,
            text_blocks=blocks,
            assets=assets,
            metadata={
                "page_count": len(pages),
                **metadata,
                "normalization": "docx_to_pdf",
            },
        )

    def _normalize_pptx(self, *, local_path: str, title: str) -> NormalizedSource:
        converter = get_document_conversion_service()
        try:
            canonical_pdf_path = self._run_async(converter.convert_pptx_local_to_pdf_local(local_path, out_dir=os.path.dirname(local_path)))
        except Exception as exc:
            raise SourceNormalizationError(f"PPTX conversion failed: {exc}") from exc

        pages, resolved_canonical_pdf_path, metadata = self._extract_pdf_pages_with_optional_ocr(local_path=canonical_pdf_path)
        blocks = self._pages_to_blocks(pages)
        assets = [
            NormalizedAsset(kind="original_pptx", mime_type=PPTX_MIME, local_path=local_path),
            NormalizedAsset(
                kind="canonical_pdf",
                mime_type=PDF_MIME,
                local_path=resolved_canonical_pdf_path,
                page_start=1 if pages else None,
                page_end=len(pages) if pages else None,
                meta={"page_count": len(pages)},
            ),
        ]
        return NormalizedSource(
            source_kind="pptx",
            title=title,
            original_local_path=local_path,
            original_mime_type=PPTX_MIME,
            canonical_local_path=resolved_canonical_pdf_path,
            canonical_mime_type=PDF_MIME,
            text_blocks=blocks,
            assets=assets,
            metadata={
                "page_count": len(pages),
                **metadata,
                "normalization": "pptx_to_pdf",
            },
        )

    def _normalize_xlsx(self, *, local_path: str, title: str) -> NormalizedSource:
        converter = get_document_conversion_service()
        try:
            canonical_pdf_path = self._run_async(converter.convert_xlsx_local_to_pdf_local(local_path, out_dir=os.path.dirname(local_path)))
        except Exception as exc:
            raise SourceNormalizationError(f"XLSX conversion failed: {exc}") from exc

        pages, resolved_canonical_pdf_path, pdf_metadata = self._extract_pdf_pages_with_optional_ocr(local_path=canonical_pdf_path)
        pdf_page_count = len(pages)

        # Embed higher-fidelity text rendered directly from the workbook (openpyxl),
        # rather than the layout-clipped text PyMuPDF reads off the converted PDF.
        try:
            rendered_text = spreadsheet_extraction_service.render_xlsx_local_to_text(local_path, filename=title)
        except ValueError as exc:
            raise SourceNormalizationError("Spreadsheet has no readable content") from exc
        except Exception as exc:
            raise SourceNormalizationError(f"XLSX text extraction failed: {exc}") from exc

        sheet_sections = self._split_xlsx_sheets(rendered_text)
        sheet_count = len(sheet_sections)
        blocks: list[NormalizedTextBlock] = []
        for idx, section in enumerate(sheet_sections):
            if pdf_page_count <= 0:
                page_number = None
            elif sheet_count == pdf_page_count:
                page_number = idx + 1
            else:
                page_number = min(idx + 1, pdf_page_count)
            blocks.append(
                NormalizedTextBlock(
                    order_index=idx,
                    text=section["text"],
                    page_number=page_number,
                    meta={
                        "char_count": len(section["text"]),
                        "sheet_index": section["sheet_index"],
                        "sheet_title": section["sheet_title"],
                    },
                )
            )

        assets = [
            NormalizedAsset(kind="original_xlsx", mime_type=XLSX_MIME, local_path=local_path),
            NormalizedAsset(
                kind="canonical_pdf",
                mime_type=PDF_MIME,
                local_path=resolved_canonical_pdf_path,
                page_start=1 if pages else None,
                page_end=pdf_page_count if pages else None,
                meta={"page_count": pdf_page_count},
            ),
        ]
        return NormalizedSource(
            source_kind="xlsx",
            title=title,
            original_local_path=local_path,
            original_mime_type=XLSX_MIME,
            canonical_local_path=resolved_canonical_pdf_path,
            canonical_mime_type=PDF_MIME,
            text_blocks=blocks,
            assets=assets,
            metadata={
                "page_count": pdf_page_count,
                **pdf_metadata,
                "normalization": "xlsx_to_pdf_with_text",
                "sheet_count": sheet_count,
            },
        )

    def _split_xlsx_sheets(self, rendered_text: str) -> list[dict[str, Any]]:
        """Split the workbook render produced by SpreadsheetExtractionService into per-sheet blocks."""
        matches = list(_XLSX_SHEET_HEADER_RE.finditer(rendered_text))
        if not matches:
            return [{"sheet_index": 1, "sheet_title": "", "text": rendered_text.strip()}]
        sections: list[dict[str, Any]] = []
        for i, match in enumerate(matches):
            start = match.start()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(rendered_text)
            sheet_index = int(match.group(1))
            sheet_title = match.group(2).split(" (dimension=")[0].strip()
            sections.append(
                {
                    "sheet_index": sheet_index,
                    "sheet_title": sheet_title,
                    "text": rendered_text[start:end].strip(),
                }
            )
        return sections

    def _normalize_webpage(self, *, local_path: str, title: str, source_url: str | None) -> NormalizedSource:
        try:
            with open(local_path, "r", encoding="utf-8", errors="ignore") as handle:
                html_text = handle.read()
        except Exception as exc:
            raise SourceNormalizationError(f"Could not read webpage snapshot: {exc}") from exc

        extracted_title = self._extract_html_title(html_text)
        resolved_title = extracted_title or title
        paragraphs = self._extract_html_paragraphs(html_text)
        blocks = [
            NormalizedTextBlock(
                order_index=idx,
                text=paragraph,
                meta={"char_count": len(paragraph), "source_url": source_url},
            )
            for idx, paragraph in enumerate(paragraphs)
        ]
        if not blocks:
            blocks = [NormalizedTextBlock(order_index=0, text=resolved_title, meta={"source_url": source_url})]

        return NormalizedSource(
            source_kind="webpage",
            title=resolved_title,
            original_local_path=local_path,
            original_mime_type=HTML_MIME,
            canonical_local_path=local_path,
            canonical_mime_type=HTML_MIME,
            text_blocks=blocks,
            assets=[NormalizedAsset(kind="webpage_snapshot", mime_type=HTML_MIME, local_path=local_path)],
            metadata={
                "normalization": "webpage_snapshot",
                "source_url": source_url,
                "block_count": len(blocks),
            },
        )

    def _normalize_binary_media(
        self,
        *,
        local_path: str,
        title: str,
        source_kind: str,
        mime_type: str,
    ) -> NormalizedSource:
        page_count = 1 if source_kind == "image" else 0
        return NormalizedSource(
            source_kind=source_kind,
            title=title,
            original_local_path=local_path,
            original_mime_type=mime_type,
            canonical_local_path=local_path,
            canonical_mime_type=mime_type,
            text_blocks=[],
            assets=[NormalizedAsset(kind=f"{source_kind}_asset", mime_type=mime_type, local_path=local_path)],
            metadata={
                "page_count": page_count,
                "normalization": f"{source_kind}_passthrough",
            },
        )

    def _pages_to_blocks(self, pages: list[ExtractedPage]) -> list[NormalizedTextBlock]:
        blocks: list[NormalizedTextBlock] = []
        for idx, page in enumerate(pages):
            blocks.append(
                NormalizedTextBlock(
                    order_index=idx,
                    text=page.text,
                    page_number=page.page_number,
                    is_ocr=bool(page.is_ocr),
                    meta={"char_count": len(page.text), "is_ocr": bool(page.is_ocr)},
                )
            )
        return blocks

    def _extract_pdf_pages_with_optional_ocr(self, *, local_path: str) -> tuple[list[ExtractedPage], str, dict[str, Any]]:
        primary_pages = extract_pdf_pages_text(pdf_path=local_path, is_ocr=False)
        settings = get_inkwise_settings()
        if not primary_pages:
            return primary_pages, local_path, {"normalization": "pdf_passthrough", "extraction_engine": "pymupdf", "ocr_applied": False}

        if not settings.ocr_enabled:
            return primary_pages, local_path, self._build_pdf_text_metadata(primary_pages=primary_pages, final_pages=primary_pages, ocr_applied=False)

        if not self._should_run_ocr(primary_pages=primary_pages, force_ocr=settings.ocr_force):
            return primary_pages, local_path, self._build_pdf_text_metadata(primary_pages=primary_pages, final_pages=primary_pages, ocr_applied=False)

        ocr_pdf_path = os.path.join(os.path.dirname(local_path), f"ocr_{os.path.basename(local_path)}")
        try:
            self.ocr_service.run_ocr(
                input_pdf_path=local_path,
                output_pdf_path=ocr_pdf_path,
                languages=settings.ocr_languages,
                timeout_seconds=settings.ocr_timeout_seconds,
                force_ocr=settings.ocr_force,
            )
        except OCRmyPDFError as exc:
            raise SourceNormalizationError(f"PDF OCR failed: {exc}") from exc

        ocr_pages = extract_pdf_pages_text(pdf_path=ocr_pdf_path, is_ocr=True)
        final_pages = self._merge_pdf_pages(primary_pages=primary_pages, ocr_pages=ocr_pages, force_ocr=settings.ocr_force)
        return final_pages, ocr_pdf_path, self._build_pdf_text_metadata(primary_pages=primary_pages, final_pages=final_pages, ocr_applied=True)

    def _should_run_ocr(self, *, primary_pages: list[ExtractedPage], force_ocr: bool) -> bool:
        if force_ocr:
            return True
        settings = get_inkwise_settings()
        total_pages = len(primary_pages)
        if total_pages <= 0:
            return False
        usable_pages = sum(1 for page in primary_pages if self._page_has_usable_text(page.text))
        empty_pages = sum(1 for page in primary_pages if not self._clean_page_text(page.text))
        usable_ratio = usable_pages / total_pages
        empty_ratio = empty_pages / total_pages
        return usable_pages == 0 or empty_ratio >= settings.ocr_empty_page_ratio_threshold or usable_ratio < settings.ocr_min_usable_page_ratio

    def _merge_pdf_pages(
        self,
        *,
        primary_pages: list[ExtractedPage],
        ocr_pages: list[ExtractedPage],
        force_ocr: bool,
    ) -> list[ExtractedPage]:
        ocr_by_number = {page.page_number: page for page in ocr_pages}
        out: list[ExtractedPage] = []
        for primary in primary_pages:
            ocr_page = ocr_by_number.get(primary.page_number)
            primary_text = self._clean_page_text(primary.text)
            ocr_text = self._clean_page_text(ocr_page.text if ocr_page is not None else "")
            use_ocr = bool(ocr_text) and (force_ocr or not self._page_has_usable_text(primary_text))
            selected_text = ocr_text if use_ocr else primary_text
            out.append(ExtractedPage(page_number=primary.page_number, text=selected_text, is_ocr=use_ocr))
        return out

    def _build_pdf_text_metadata(
        self,
        *,
        primary_pages: list[ExtractedPage],
        final_pages: list[ExtractedPage],
        ocr_applied: bool,
    ) -> dict[str, Any]:
        ocr_page_numbers = [page.page_number for page in final_pages if page.is_ocr]
        return {
            "normalization": "pdf_passthrough",
            "extraction_engine": "ocrmypdf" if ocr_page_numbers else "pymupdf",
            "ocr_applied": bool(ocr_applied),
            "ocr_page_count": len(ocr_page_numbers),
            "ocr_page_numbers": ocr_page_numbers,
            "page_count": len(final_pages),
            "usable_text_page_count": sum(1 for page in primary_pages if self._page_has_usable_text(page.text)),
        }

    def _page_has_usable_text(self, text: str | None) -> bool:
        settings = get_inkwise_settings()
        return len(self._clean_page_text(text)) >= int(settings.ocr_min_chars_per_page)

    def _clean_page_text(self, text: str | None) -> str:
        return re.sub(r"\s+", " ", (text or "")).strip()

    def _detect_mime_type(self, *, filename: str, content_type: str | None) -> str:
        clean_content_type = (content_type or "").strip().lower()
        if clean_content_type in {PDF_MIME, DOCX_MIME, PPTX_MIME, XLSX_MIME, HTML_MIME}:
            return clean_content_type
        if clean_content_type in {"image/jpeg", "image/jpg"}:
            return IMAGE_JPEG_MIME
        if clean_content_type == IMAGE_PNG_MIME:
            return IMAGE_PNG_MIME
        if clean_content_type in {"audio/mp3", "audio/mpeg"}:
            return AUDIO_MP3_MIME
        if clean_content_type in {"audio/wav", "audio/x-wav", "audio/wave"}:
            return AUDIO_WAV_MIME
        if clean_content_type == VIDEO_MP4_MIME:
            return VIDEO_MP4_MIME
        if clean_content_type in {"video/mpeg", "video/mpg"}:
            return VIDEO_MPEG_MIME
        lowered = (filename or "").strip().lower()
        if lowered.endswith(".pdf"):
            return PDF_MIME
        if lowered.endswith(".docx"):
            return DOCX_MIME
        if lowered.endswith(".pptx"):
            return PPTX_MIME
        if lowered.endswith(".xlsx"):
            return XLSX_MIME
        if lowered.endswith(".html") or lowered.endswith(".htm"):
            return HTML_MIME
        if lowered.endswith((".jpg", ".jpeg")):
            return IMAGE_JPEG_MIME
        if lowered.endswith(".png"):
            return IMAGE_PNG_MIME
        if lowered.endswith(".mp3"):
            return AUDIO_MP3_MIME
        if lowered.endswith(".wav"):
            return AUDIO_WAV_MIME
        if lowered.endswith(".mp4"):
            return VIDEO_MP4_MIME
        if lowered.endswith((".mpeg", ".mpg")):
            return VIDEO_MPEG_MIME
        return clean_content_type or "application/octet-stream"

    def _extract_html_title(self, html_text: str) -> str | None:
        match = _HTML_TITLE_RE.search(html_text or "")
        if not match:
            return None
        title = unescape(re.sub(r"\s+", " ", match.group(1))).strip()
        return title or None

    def _extract_html_paragraphs(self, html_text: str) -> list[str]:
        cleaned = re.sub(r"<!--.*?-->", " ", html_text or "", flags=re.DOTALL)
        cleaned = re.sub(r"<script[^>]*>.*?</script>", " ", cleaned, flags=re.IGNORECASE | re.DOTALL)
        cleaned = re.sub(r"<style[^>]*>.*?</style>", " ", cleaned, flags=re.IGNORECASE | re.DOTALL)
        cleaned = re.sub(r"<(p|div|section|article|li|h1|h2|h3|h4|h5|h6|br)[^>]*>", "\n\n", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"<[^>]+>", " ", cleaned)
        cleaned = unescape(cleaned)
        parts = [re.sub(r"\s+", " ", part).strip() for part in re.split(r"\n\s*\n+", cleaned)]
        return [part for part in parts if part]

    def _run_async(self, coro: Any) -> Any:
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            return asyncio.run(coro)
        raise SourceNormalizationError("DOCX normalization must be run from a synchronous worker context")
