"""Source normalization helpers for vector-ready Inkwise ingestion."""

from __future__ import annotations

import asyncio
import re
import os
from html import unescape
from dataclasses import dataclass, field
from typing import Any

from inkwise.services.pdf_extract import ExtractedPage, extract_pdf_pages_text
from services.document_conversion_service import DOCX_MIME, get_document_conversion_service


PDF_MIME = "application/pdf"
HTML_MIME = "text/html"
_HTML_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)


class SourceNormalizationError(RuntimeError):
    pass


@dataclass(frozen=True)
class NormalizedTextBlock:
    order_index: int
    text: str
    page_number: int | None = None
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
        if detected_mime == HTML_MIME:
            return self._normalize_webpage(local_path=path, title=resolved_title, source_url=source_url)

        raise SourceNormalizationError(f"Unsupported source type for normalization: {detected_mime}")

    def _normalize_pdf(self, *, local_path: str, title: str) -> NormalizedSource:
        pages = extract_pdf_pages_text(pdf_path=local_path)
        blocks = self._pages_to_blocks(pages)
        assets = [
            NormalizedAsset(
                kind="canonical_pdf",
                mime_type=PDF_MIME,
                local_path=local_path,
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
            canonical_local_path=local_path,
            canonical_mime_type=PDF_MIME,
            text_blocks=blocks,
            assets=assets,
            metadata={
                "page_count": len(pages),
                "normalization": "pdf_passthrough",
            },
        )

    def _normalize_docx(self, *, local_path: str, title: str) -> NormalizedSource:
        converter = get_document_conversion_service()
        try:
            canonical_pdf_path = self._run_async(converter.convert_docx_local_to_pdf_local(local_path, out_dir=os.path.dirname(local_path)))
        except Exception as exc:
            raise SourceNormalizationError(f"DOCX conversion failed: {exc}") from exc

        pages = extract_pdf_pages_text(pdf_path=canonical_pdf_path)
        blocks = self._pages_to_blocks(pages)
        assets = [
            NormalizedAsset(kind="original_docx", mime_type=DOCX_MIME, local_path=local_path),
            NormalizedAsset(
                kind="canonical_pdf",
                mime_type=PDF_MIME,
                local_path=canonical_pdf_path,
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
            canonical_local_path=canonical_pdf_path,
            canonical_mime_type=PDF_MIME,
            text_blocks=blocks,
            assets=assets,
            metadata={
                "page_count": len(pages),
                "normalization": "docx_to_pdf",
            },
        )

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

    def _pages_to_blocks(self, pages: list[ExtractedPage]) -> list[NormalizedTextBlock]:
        blocks: list[NormalizedTextBlock] = []
        for idx, page in enumerate(pages):
            blocks.append(
                NormalizedTextBlock(
                    order_index=idx,
                    text=page.text,
                    page_number=page.page_number,
                    meta={"char_count": len(page.text)},
                )
            )
        return blocks

    def _detect_mime_type(self, *, filename: str, content_type: str | None) -> str:
        clean_content_type = (content_type or "").strip().lower()
        if clean_content_type in {PDF_MIME, DOCX_MIME, HTML_MIME}:
            return clean_content_type
        lowered = (filename or "").strip().lower()
        if lowered.endswith(".pdf"):
            return PDF_MIME
        if lowered.endswith(".docx"):
            return DOCX_MIME
        if lowered.endswith(".html") or lowered.endswith(".htm"):
            return HTML_MIME
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
