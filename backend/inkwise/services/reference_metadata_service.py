"""AI-assisted bibliographic metadata extraction for Inkwise sources."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

from inkwise.services.json_utils import extract_first_json_object
from inkwise.services.vertex_ai import generate_text_sync
from inkwise.settings import get_inkwise_settings


_SUPPORTED_CITATION_TYPES = {"book", "article", "case", "statute", "webpage", "report", "other"}
_LIST_FIELDS = {"authors", "editors"}
_TEXT_FIELDS = {
    "citation_type",
    "short_title",
    "container_title",
    "publisher",
    "edition",
    "volume",
    "issue",
    "pages",
    "year",
    "month",
    "day",
    "url",
    "accessed_date",
    "court",
    "reporter",
    "reporter_volume",
    "first_page",
    "pin_cite",
    "docket_number",
}


@dataclass(frozen=True)
class ReferenceMetadataAutofillResult:
    suggested_title: str | None
    bibliographic_metadata: dict[str, Any]

    @property
    def is_empty(self) -> bool:
        return not self.suggested_title and not self.bibliographic_metadata


class InkwiseReferenceMetadataService:
    def extract_source_metadata(self, *, source: Any, normalized: Any) -> ReferenceMetadataAutofillResult:
        settings = get_inkwise_settings()
        if not settings.reference_metadata_autofill_enabled or not settings.vertex_enabled:
            return ReferenceMetadataAutofillResult(suggested_title=None, bibliographic_metadata={})

        if str(getattr(normalized, "source_kind", "") or "").strip().lower() not in {"pdf", "docx", "webpage"}:
            return ReferenceMetadataAutofillResult(suggested_title=None, bibliographic_metadata={})

        excerpt = self._build_excerpt(normalized=normalized, max_chars=settings.reference_metadata_max_text_chars)
        if not excerpt:
            return ReferenceMetadataAutofillResult(suggested_title=None, bibliographic_metadata={})

        prompt = self._build_prompt(source=source, normalized=normalized, excerpt=excerpt)
        response = generate_text_sync(
            model=settings.reference_metadata_model,
            prompt=prompt,
            temperature=0.0,
            max_output_tokens=4096,
            location=settings.location,
        )
        return self._parse_response(response.text)

    def _build_excerpt(self, *, normalized: Any, max_chars: int) -> str:
        clean_max = max(1000, int(max_chars or 0))
        parts: list[str] = []
        total = 0
        for block in getattr(normalized, "text_blocks", []) or []:
            text = self._clean_text(getattr(block, "text", ""))
            if not text:
                continue
            remaining = clean_max - total
            if remaining <= 0:
                break
            snippet = text[:remaining].rstrip()
            if snippet:
                parts.append(snippet)
                total += len(snippet) + 2
        return "\n\n".join(parts).strip()

    def _build_prompt(self, *, source: Any, normalized: Any, excerpt: str) -> str:
        prompt_context = {
            "source_type": str(getattr(source, "type", "") or "").strip() or None,
            "source_kind": str(getattr(normalized, "source_kind", "") or "").strip() or None,
            "current_title": str(getattr(source, "title", "") or "").strip() or None,
            "original_filename": str(getattr(source, "original_filename", "") or "").strip() or None,
            "source_url": str(getattr(source, "source_url", "") or "").strip() or None,
            "external_meta": getattr(source, "external_meta", None),
        }
        return "\n".join(
            [
                "You extract bibliographic metadata for a reference-management system.",
                "Infer citation metadata only when the evidence is present in the excerpt or source context.",
                "If a field is unknown, omit it instead of guessing.",
                "Return ONLY valid JSON.",
                "Use this exact shape:",
                '{"suggested_title":"...","bibliographic_metadata":{"citation_type":"article","authors":["..."],"year":"2024"}}',
                "Do not include markdown fences.",
                "Do not include explanatory text.",
                'Do not set "bibliographic_metadata.title"; use "suggested_title" instead.',
                "Allowed citation_type values: book, article, case, statute, webpage, report, other.",
                "Allowed bibliographic_metadata keys: citation_type, authors, editors, short_title, container_title, publisher, edition, volume, issue, pages, year, month, day, url, accessed_date, court, reporter, reporter_volume, first_page, pin_cite, docket_number.",
                "",
                "Source context (JSON):",
                json.dumps(prompt_context, ensure_ascii=True, default=str),
                "",
                "Document excerpt:",
                excerpt,
            ]
        ).strip()

    def _parse_response(self, response_text: str) -> ReferenceMetadataAutofillResult:
        data = extract_first_json_object(response_text)
        if not data:
            return ReferenceMetadataAutofillResult(suggested_title=None, bibliographic_metadata={})

        raw_metadata = data.get("bibliographic_metadata") if isinstance(data.get("bibliographic_metadata"), dict) else data
        raw_title = data.get("suggested_title")
        if not isinstance(raw_title, str) and isinstance(raw_metadata, dict):
            raw_title = raw_metadata.get("title")

        suggested_title = self._clean_text(raw_title, max_chars=400)
        metadata = self._normalize_metadata(raw_metadata if isinstance(raw_metadata, dict) else {})
        metadata.pop("title", None)
        return ReferenceMetadataAutofillResult(
            suggested_title=suggested_title or None,
            bibliographic_metadata=metadata,
        )

    def _normalize_metadata(self, value: dict[str, Any]) -> dict[str, Any]:
        out: dict[str, Any] = {}
        for key, raw in value.items():
            clean_key = str(key or "").strip()
            if not clean_key or clean_key == "title":
                continue
            if clean_key in _LIST_FIELDS:
                items = self._normalize_people_list(raw)
                if items:
                    out[clean_key] = items
                continue
            if clean_key not in _TEXT_FIELDS:
                continue
            clean_text = self._clean_text(raw)
            if not clean_text:
                continue
            if clean_key == "citation_type":
                normalized_type = clean_text.lower()
                out[clean_key] = normalized_type if normalized_type in _SUPPORTED_CITATION_TYPES else "other"
                continue
            out[clean_key] = clean_text
        return out

    def _normalize_people_list(self, value: Any) -> list[str]:
        if isinstance(value, list):
            parts = value
        elif isinstance(value, str):
            parts = re.split(r"\n|;", value)
        else:
            return []
        cleaned = [self._clean_text(item, max_chars=200) for item in parts]
        return [item for item in cleaned if item]

    def _clean_text(self, value: Any, *, max_chars: int = 1000) -> str:
        text = re.sub(r"\s+", " ", str(value or "").replace("\x00", " ")).strip()
        if not text:
            return ""
        return text[:max_chars].strip()
