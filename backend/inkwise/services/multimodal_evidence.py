"""Helpers for attaching multimodal evidence assets to Gemini requests."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from inkwise.services.retrieval_types import EvidenceItem, evidence_has_pdf_preview


@dataclass(frozen=True)
class MultimodalEvidenceBundle:
    contents: list[Any]
    attached_evidence_ids: list[str]

    @property
    def has_attachments(self) -> bool:
        return bool(self.attached_evidence_ids)


def build_pdf_multimodal_contents(
    *,
    prompt: str,
    evidence: list[EvidenceItem],
    max_files: int = 100,
) -> MultimodalEvidenceBundle:
    attached_evidence_ids: list[str] = []
    contents: list[Any] = []
    seen_assets: set[tuple[str, str]] = set()

    for item in evidence:
        if len(attached_evidence_ids) >= max(1, int(max_files)):
            break
        if not evidence_has_pdf_preview(item):
            continue
        bucket = str(item.preview_bucket or "").strip()
        object_name = str(item.preview_object or "").strip()
        if not bucket or not object_name:
            continue
        key = (bucket, object_name)
        if key in seen_assets:
            continue
        seen_assets.add(key)
        contents.append(
            {
                "fileData": {
                    "mimeType": "application/pdf",
                    "fileUri": f"gs://{bucket}/{object_name}",
                }
            }
        )
        attached_evidence_ids.append(item.evidence_id)

    prompt_text = prompt.strip()
    if attached_evidence_ids:
        prompt_text = (
            "Attached PDF evidence files are provided before this instruction. "
            "Use those PDF pages directly when they are relevant, and use the evidence IDs below for citations.\n"
            f"Attached PDF evidence IDs: {', '.join(attached_evidence_ids)}\n\n"
            + prompt_text
        )
    contents.append({"text": prompt_text})
    return MultimodalEvidenceBundle(contents=contents, attached_evidence_ids=attached_evidence_ids)
