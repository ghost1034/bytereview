"""Regression tests: NUL (0x00) characters must never reach PostgreSQL TEXT columns.

PyMuPDF can emit NUL characters when extracting text from PDFs with broken font
encodings; psycopg2 rejects any string parameter containing them with
"A string literal cannot contain NUL (0x00) characters." (see prod ingest_failed
failures on 2026-07-07).
"""

from __future__ import annotations

import os
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

from inkwise.services.ingestion_service import InkwiseIngestionService, _strip_nul
from inkwise.services.pdf_extract import extract_pdf_pages_text
from inkwise.services.segmentation_service import SegmentDraft, SegmentationResult


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

    def flush(self) -> None:
        for obj in self.added:
            if getattr(obj, "id", None) is None:
                setattr(obj, "id", uuid.uuid4())


class _FakePage:
    def __init__(self, text: str) -> None:
        self._text = text

    def get_text(self, _mode: str) -> str:
        return self._text


class _FakeDoc:
    def __init__(self, pages: list[str]) -> None:
        self._pages = pages

    def __len__(self) -> int:
        return len(self._pages)

    def load_page(self, idx: int) -> _FakePage:
        return _FakePage(self._pages[idx])

    def close(self) -> None:
        return None


class _FakeBlob:
    def upload_from_string(self, payload: str, content_type: str | None = None) -> None:
        return None


class _FakeBucket:
    def blob(self, _object_name: str) -> _FakeBlob:
        return _FakeBlob()


class _FakeStorageClient:
    def bucket(self, _bucket_name: str) -> _FakeBucket:
        return _FakeBucket()


class InkwiseNulSanitizationTests(unittest.TestCase):
    def test_strip_nul_helper(self) -> None:
        self.assertEqual(_strip_nul("a\x00b\x00"), "ab")
        self.assertEqual(_strip_nul(None), "")

    def test_extract_pdf_pages_text_strips_nul_characters(self) -> None:
        fake_doc = _FakeDoc(["Deferred\x00 tax assets\nSchedule\x00 M-1"])

        with patch("inkwise.services.pdf_extract.pymupdf.open", return_value=fake_doc):
            pages = extract_pdf_pages_text(pdf_path="/tmp/fake.pdf")

        self.assertEqual(pages[0].text, "Deferred tax assets\nSchedule M-1")
        self.assertNotIn("\x00", pages[0].text)

    def test_persist_source_pages_strips_nul_characters(self) -> None:
        service = InkwiseIngestionService()
        db = _FakeDb()
        source = SimpleNamespace(id=uuid.uuid4())
        normalized = SimpleNamespace(
            text_blocks=[
                SimpleNamespace(page_number=1, text="Basis\x00 adjustment", is_ocr=False, meta={}),
            ]
        )

        service._persist_source_pages(db, source=source, normalized=normalized)

        self.assertEqual(len(db.added), 1)
        self.assertEqual(db.added[0].text, "Basis adjustment")
        self.assertEqual(db.added[0].char_count, len("Basis adjustment"))

    def test_persist_vector_artifacts_strips_nul_from_segments(self) -> None:
        service = InkwiseIngestionService()
        db = _FakeDb()
        source = SimpleNamespace(
            id=uuid.uuid4(),
            user_id="user-123",
            storage_bucket="uploads-bucket",
            storage_object="inkwise/uploads/user-123/source/original/lease.pdf",
        )
        ingestion = SimpleNamespace(
            id=uuid.uuid4(),
            canonical_pdf_gcs_bucket="derived-bucket",
            canonical_pdf_gcs_object="inkwise/derived/user-123/source/canonical/latest/canonical.pdf",
            segment_count=None,
            preview_manifest_bucket=None,
            preview_manifest_object=None,
        )
        normalized = SimpleNamespace(
            canonical_mime_type="application/pdf",
            canonical_local_path="/tmp/canonical.pdf",
            text_blocks=[],
        )
        segmentation = SegmentationResult(
            segments=[
                SegmentDraft(
                    segment_type="text_chunk",
                    modality="text",
                    order_index=0,
                    title="Lease\x00 pp.3-4",
                    text_content="Lease\x00 text",
                    char_count=10,
                    token_count=3,
                    page_start=3,
                    page_end=4,
                    locator_json={"kind": "page_range", "page_start": 3, "page_end": 4},
                    meta_json={"segment_family": "text_chunk"},
                    asset_local_path=None,
                    asset_mime_type=None,
                )
            ],
            stats={"segment_count": 1},
        )

        with (
            patch(
                "inkwise.services.ingestion_service.get_inkwise_settings",
                return_value=SimpleNamespace(embedding_dimension=1536, embedding_model="gemini", embedding_document_task_type="RETRIEVAL_DOCUMENT"),
            ),
            patch.object(service.segmentation_service, "build_segments", return_value=segmentation),
            patch.object(service, "_persist_source_pages"),
            patch.object(service, "_upload_pdf_window_asset", return_value="inkwise/derived/preview.pdf"),
            patch.object(service.embedding_service, "embed_document_text_sync", return_value=SimpleNamespace(values=[0.1, 0.2])) as embed_text,
            patch("inkwise.services.ingestion_service.storage_client", return_value=_FakeStorageClient()),
        ):
            service._persist_vector_artifacts(
                db,
                source=source,
                ingestion=ingestion,
                normalized=normalized,
                derived_bucket="derived-bucket",
                media_chunks=None,
            )

        segments = [obj for obj in db.added if getattr(obj, "text_content", None) is not None]
        self.assertEqual(len(segments), 1)
        self.assertEqual(segments[0].text_content, "Lease text")
        self.assertEqual(segments[0].title, "Lease pp.3-4")
        embed_text.assert_called_once()
        self.assertEqual(embed_text.call_args.args[0], "Lease text")


if __name__ == "__main__":
    unittest.main()
