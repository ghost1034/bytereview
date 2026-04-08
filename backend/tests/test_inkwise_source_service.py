from __future__ import annotations

import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import patch

from inkwise.schemas import InkwiseWebpageCaptureRequest
from inkwise.services.gcs import _normalize_disposition_filename
from inkwise.services.source_service import InkwiseSourceService


class _FakeBlob:
    def __init__(self) -> None:
        self.uploads: list[tuple[bytes, str | None]] = []

    def upload_from_string(self, payload: bytes, content_type: str | None = None) -> None:
        self.uploads.append((payload, content_type))


class _FakeBucket:
    def __init__(self, blob: _FakeBlob) -> None:
        self._blob = blob

    def blob(self, object_name: str) -> _FakeBlob:
        self.object_name = object_name
        return self._blob


class _FakeStorageClient:
    def __init__(self, blob: _FakeBlob) -> None:
        self._blob = blob

    def bucket(self, bucket_name: str) -> _FakeBucket:
        self.bucket_name = bucket_name
        return _FakeBucket(self._blob)


class _FakeDb:
    def __init__(self) -> None:
        self.added: list[object] = []

    def add(self, obj: object) -> None:
        self.added.append(obj)

    def flush(self) -> None:
        for obj in self.added:
            if getattr(obj, "id", None) is None:
                setattr(obj, "id", uuid.uuid4())

    def commit(self) -> None:
        pass

    def refresh(self, obj: object) -> None:
        pass


class _QueryStub:
    def __init__(self, result: object | None) -> None:
        self._result = result

    def filter(self, *args, **kwargs) -> _QueryStub:
        return self

    def order_by(self, *args, **kwargs) -> _QueryStub:
        return self

    def first(self) -> object | None:
        return self._result


class InkwiseSourceServiceTests(unittest.TestCase):
    def test_validate_webpage_url_adds_https_for_bare_domains(self) -> None:
        service = InkwiseSourceService()

        self.assertEqual(service._validate_webpage_url("example.com/path"), "https://example.com/path")

    def test_render_webpage_snapshot_pdf_returns_pdf_bytes(self) -> None:
        service = InkwiseSourceService()

        payload = service._render_webpage_snapshot_pdf(
            url="https://example.com/reference",
            title="Example Reference",
            html_text="<html><body><h1>Heading</h1><p>First paragraph.</p><p>Second paragraph.</p></body></html>",
        )

        self.assertTrue(payload.startswith(b"%PDF"))

    def test_capture_webpage_snapshot_stores_pdf_source(self) -> None:
        service = InkwiseSourceService()
        db = _FakeDb()
        blob = _FakeBlob()
        request = InkwiseWebpageCaptureRequest(source_url="example.com/reference")

        with (
            patch.object(service, "_require_bucket", return_value="inkwise-test-bucket"),
            patch.object(service, "_build_webpage_snapshot_pdf", return_value=(b"%PDF-1.7 mock", "Example Reference")),
            patch("inkwise.services.source_service.storage_client", return_value=_FakeStorageClient(blob)),
        ):
            source = service.capture_webpage_snapshot(db, user_id="user-123", body=request)

        self.assertEqual(source.type, "webpage")
        self.assertEqual(source.content_type, "application/pdf")
        self.assertTrue(str(source.original_filename).endswith(".pdf"))
        self.assertEqual(source.source_url, "https://example.com/reference")
        self.assertEqual(blob.uploads, [(b"%PDF-1.7 mock", "application/pdf")])

    def test_signed_preview_prefers_latest_canonical_pdf(self) -> None:
        service = InkwiseSourceService()
        source_id = uuid.uuid4()
        source = SimpleNamespace(
            id=source_id,
            storage_bucket="uploads-bucket",
            storage_object="inkwise/uploads/user/source/original/draft.docx",
            original_filename="draft.docx",
            title="Draft",
        )
        ingestion = SimpleNamespace(
            canonical_pdf_gcs_bucket="derived-bucket",
            canonical_pdf_gcs_object="inkwise/derived/user/source/canonical/latest/canonical.pdf",
        )
        db = SimpleNamespace(query=lambda model: _QueryStub(ingestion))

        with (
            patch.object(service, "get_source_or_404", return_value=source),
            patch("inkwise.services.source_service.generate_signed_download_url", return_value="https://signed.example/pdf") as signed_url,
        ):
            result = service.signed_preview(db, user_id="user-123", source_id=source_id)

        self.assertEqual(result.url, "https://signed.example/pdf")
        self.assertEqual(
            signed_url.call_args.kwargs["object_name"],
            "inkwise/derived/user/source/canonical/latest/canonical.pdf",
        )


class InkwiseDispositionFilenameTests(unittest.TestCase):
    def test_moves_page_suffix_before_pdf_extension(self) -> None:
        self.assertEqual(
            _normalize_disposition_filename("Lease.pdf p.1", "inkwise/derived/segment.pdf"),
            "Lease p.1.pdf",
        )

    def test_replaces_mismatched_extension_with_object_extension(self) -> None:
        self.assertEqual(
            _normalize_disposition_filename("Draft.docx", "inkwise/derived/canonical.pdf"),
            "Draft.pdf",
        )


if __name__ == "__main__":
    unittest.main()
