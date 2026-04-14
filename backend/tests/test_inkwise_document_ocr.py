from __future__ import annotations

import os
import tempfile
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from inkwise.services.ingestion_service import InkwiseIngestionService
from inkwise.services.multimodal_evidence import build_multimodal_contents
from inkwise.services.pdf_extract import ExtractedPage
from inkwise.services.retrieval_types import EvidenceItem
from inkwise.services.segmentation_service import InkwiseSegmentationService
from inkwise.services.source_normalizer import NormalizedSource, NormalizedTextBlock, InkwiseSourceNormalizer


class _DeleteQuery:
    def filter(self, *args: object, **kwargs: object) -> _DeleteQuery:
        return self

    def delete(self) -> None:
        return None


class _FakeDb:
    def __init__(self) -> None:
        self.added: list[object] = []

    def query(self, _model: object) -> _DeleteQuery:
        return _DeleteQuery()

    def add(self, obj: object) -> None:
        self.added.append(obj)


class InkwiseDocumentOCRTests(unittest.TestCase):
    def test_normalize_pdf_skips_ocr_when_text_is_usable(self) -> None:
        normalizer = InkwiseSourceNormalizer()
        with tempfile.TemporaryDirectory() as temp_dir:
            pdf_path = Path(temp_dir) / "sample.pdf"
            pdf_path.write_bytes(b"%PDF-1.4 mock")

            with patch.dict(os.environ, {"INKWISE_OCR_ENABLED": "true", "INKWISE_OCR_MIN_CHARS_PER_PAGE": "20"}, clear=False):
                with patch(
                    "inkwise.services.source_normalizer.extract_pdf_pages_text",
                    return_value=[ExtractedPage(page_number=1, text="This page has plenty of extracted text for retrieval.")],
                ):
                    with patch.object(normalizer.ocr_service, "run_ocr") as run_ocr:
                        normalized = normalizer.normalize_local_source(
                            local_path=str(pdf_path),
                            filename="sample.pdf",
                            content_type="application/pdf",
                            title="Sample PDF",
                        )

        run_ocr.assert_not_called()
        self.assertEqual(normalized.canonical_local_path, str(pdf_path))
        self.assertFalse(normalized.metadata["ocr_applied"])
        self.assertEqual(normalized.metadata["extraction_engine"], "pymupdf")
        self.assertFalse(normalized.text_blocks[0].is_ocr)

    def test_normalize_pdf_uses_ocr_for_unusable_pages(self) -> None:
        normalizer = InkwiseSourceNormalizer()
        with tempfile.TemporaryDirectory() as temp_dir:
            pdf_path = Path(temp_dir) / "scan.pdf"
            pdf_path.write_bytes(b"%PDF-1.4 mock")

            with patch.dict(
                os.environ,
                {
                    "INKWISE_OCR_ENABLED": "true",
                    "INKWISE_OCR_MIN_CHARS_PER_PAGE": "20",
                    "INKWISE_OCR_EMPTY_PAGE_RATIO_THRESHOLD": "0.1",
                },
                clear=False,
            ):
                with patch(
                    "inkwise.services.source_normalizer.extract_pdf_pages_text",
                    side_effect=[
                        [ExtractedPage(page_number=1, text="")],
                        [ExtractedPage(page_number=1, text="OCR recovered text from the scanned page.", is_ocr=True)],
                    ],
                ):
                    with patch.object(normalizer.ocr_service, "run_ocr", return_value=str(Path(temp_dir) / "ocr_scan.pdf")) as run_ocr:
                        normalized = normalizer.normalize_local_source(
                            local_path=str(pdf_path),
                            filename="scan.pdf",
                            content_type="application/pdf",
                            title="Scanned PDF",
                        )

        run_ocr.assert_called_once()
        self.assertTrue(normalized.canonical_local_path.endswith("ocr_scan.pdf"))
        self.assertTrue(normalized.metadata["ocr_applied"])
        self.assertEqual(normalized.metadata["ocr_page_count"], 1)
        self.assertEqual(normalized.metadata["extraction_engine"], "ocrmypdf")
        self.assertTrue(normalized.text_blocks[0].is_ocr)
        self.assertEqual(normalized.text_blocks[0].text, "OCR recovered text from the scanned page.")

    def test_pdf_segmentation_builds_only_text_chunks(self) -> None:
        segmentation = InkwiseSegmentationService()
        normalized = NormalizedSource(
            source_kind="pdf",
            title="Lease",
            original_local_path="/tmp/lease.pdf",
            original_mime_type="application/pdf",
            canonical_local_path="/tmp/lease.pdf",
            canonical_mime_type="application/pdf",
            text_blocks=[
                NormalizedTextBlock(order_index=0, page_number=1, text="Paragraph one.", is_ocr=False),
                NormalizedTextBlock(order_index=1, page_number=2, text="Paragraph two.", is_ocr=True),
            ],
            assets=[],
            metadata={"page_count": 2},
        )

        with patch.dict(os.environ, {"INKWISE_SEGMENT_TEXT_CHUNK_CHARS": "500"}, clear=False):
            result = segmentation.build_segments(normalized)

        self.assertEqual(result.stats["pdf_window_count"], 0)
        self.assertEqual(result.stats["text_chunk_count"], 1)
        self.assertEqual([segment.segment_type for segment in result.segments], ["text_chunk"])

    def test_multimodal_bundle_skips_pdf_previews(self) -> None:
        evidence = [
            EvidenceItem(
                evidence_id="E01",
                source_id=uuid.uuid4(),
                source_title="Lease",
                page_number=3,
                excerpt="Relevant lease clause",
                score=0.9,
                preview_bucket="bucket",
                preview_object="refs/lease.pdf",
            ),
            EvidenceItem(
                evidence_id="E02",
                source_id=uuid.uuid4(),
                source_title="Photo",
                page_number=0,
                excerpt="",
                score=0.8,
                locator_json={"kind": "image_asset"},
                preview_bucket="bucket",
                preview_object="refs/photo.jpg",
            ),
        ]

        bundle = build_multimodal_contents(prompt="Summarize.", evidence=evidence, max_files=10)

        self.assertEqual(bundle.attached_evidence_ids, ["E02"])
        self.assertEqual(bundle.contents[0]["fileData"]["mimeType"], "image/jpeg")

    def test_persist_source_pages_tracks_ocr_flags(self) -> None:
        service = InkwiseIngestionService()
        db = _FakeDb()
        source = SimpleNamespace(id=uuid.uuid4())
        normalized = SimpleNamespace(
            text_blocks=[
                SimpleNamespace(page_number=1, text="Page 1", is_ocr=False, meta={"is_ocr": False}),
                SimpleNamespace(page_number=2, text="Page 2", is_ocr=True, meta={"is_ocr": True}),
                SimpleNamespace(page_number=None, text="Ignored", is_ocr=False, meta={}),
            ]
        )

        service._persist_source_pages(db, source=source, normalized=normalized)

        self.assertEqual(len(db.added), 2)
        self.assertEqual(db.added[0].page_number, 1)
        self.assertFalse(db.added[0].is_ocr)
        self.assertEqual(db.added[1].page_number, 2)
        self.assertTrue(db.added[1].is_ocr)


if __name__ == "__main__":
    unittest.main()
