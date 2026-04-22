from __future__ import annotations

import unittest
import uuid
import zipfile
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import Mock, patch

from inkwise.schemas import InkwiseWebpageCaptureRequest
from inkwise.services.gcs import _normalize_disposition_filename
from inkwise.services.source_service import InkwisePlanRestrictionError, InkwiseSourceService


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


class _ExistingBlob:
    def __init__(self, *, size: int) -> None:
        self.size = size

    def exists(self) -> bool:
        return True

    def reload(self) -> None:
        pass


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
    def test_validate_upload_request_allows_video_up_to_video_limit(self) -> None:
        service = InkwiseSourceService()
        request = SimpleNamespace(
            original_filename="walkthrough.mp4",
            content_type="video/mp4",
            size_bytes=1000 * 1024 * 1024,
        )

        with patch.dict(
            "os.environ",
            {"INKWISE_MAX_UPLOAD_MB": "100", "INKWISE_MAX_VIDEO_UPLOAD_MB": "1000"},
            clear=False,
        ):
            service._validate_upload_request(request)

    def test_validate_upload_request_rejects_video_over_video_limit(self) -> None:
        service = InkwiseSourceService()
        request = SimpleNamespace(
            original_filename="walkthrough.mp4",
            content_type="video/mp4",
            size_bytes=(1000 * 1024 * 1024) + 1,
        )

        with patch.dict(
            "os.environ",
            {"INKWISE_MAX_UPLOAD_MB": "100", "INKWISE_MAX_VIDEO_UPLOAD_MB": "1000"},
            clear=False,
        ):
            with self.assertRaisesRegex(ValueError, "1000MB"):
                service._validate_upload_request(request)

    def test_validate_upload_request_keeps_non_video_limit(self) -> None:
        service = InkwiseSourceService()
        request = SimpleNamespace(
            original_filename="brief.pdf",
            content_type="application/pdf",
            size_bytes=(100 * 1024 * 1024) + 1,
        )

        with patch.dict(
            "os.environ",
            {"INKWISE_MAX_UPLOAD_MB": "100", "INKWISE_MAX_VIDEO_UPLOAD_MB": "1000"},
            clear=False,
        ):
            with self.assertRaisesRegex(ValueError, "100MB"):
                service._validate_upload_request(request)

    def test_validate_webpage_url_adds_https_for_bare_domains(self) -> None:
        service = InkwiseSourceService()

        self.assertEqual(service._validate_webpage_url("example.com/path"), "https://example.com/path")

    def test_render_webpage_snapshot_pdf_returns_pdf_bytes(self) -> None:
        service = InkwiseSourceService()

        try:
            import reportlab  # noqa: F401
        except ImportError:
            self.skipTest("reportlab is not installed in this environment")

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

    def test_init_upload_rejects_audio_for_non_pro_plan(self) -> None:
        service = InkwiseSourceService()
        db = _FakeDb()
        request = SimpleNamespace(
            original_filename="call.mp3",
            content_type="audio/mpeg",
            size_bytes=1024,
            title=None,
            original_path=None,
        )

        with (
            patch.object(service, "_require_bucket", return_value="inkwise-test-bucket"),
            patch.object(service, "_get_plan_code", return_value="basic"),
        ):
            with self.assertRaises(InkwisePlanRestrictionError):
                service.init_upload(db, user_id="user-123", body=request)

    def test_import_archive_rejects_media_entries_for_non_pro_plan(self) -> None:
        service = InkwiseSourceService()
        db = _FakeDb()
        archive_buffer = BytesIO()
        with zipfile.ZipFile(archive_buffer, "w") as archive:
            archive.writestr("meeting.wav", b"wav-bytes")

        with self.assertRaises(InkwisePlanRestrictionError):
            service._import_archive_bytes(
                db,
                user_id="user-123",
                archive_filename="bundle.zip",
                archive_bytes=archive_buffer.getvalue(),
                plan_code="free",
                external_source=None,
                external_id=None,
                external_meta=None,
            )

    def test_import_drive_rejects_video_for_non_pro_plan(self) -> None:
        service = InkwiseSourceService()
        db = _FakeDb()
        google_service = SimpleNamespace(
            has_drive_access=lambda *_args, **_kwargs: True,
            get_drive_file_metadata=lambda *_args, **_kwargs: {"name": "walkthrough.mp4", "mimeType": "video/mp4"},
            download_drive_file=lambda *_args, **_kwargs: b"video-bytes",
        )

        with (
            patch("inkwise.services.source_service.GoogleService", return_value=google_service),
            patch.object(service, "_get_plan_code", return_value="basic"),
        ):
            with self.assertRaises(InkwisePlanRestrictionError):
                service.import_drive_files(db, user_id="user-123", file_ids=["file-1"])

    def test_import_drive_rejects_video_over_limit_before_download(self) -> None:
        service = InkwiseSourceService()
        db = _FakeDb()
        download_drive_file = Mock(return_value=b"video-bytes")
        google_service = SimpleNamespace(
            has_drive_access=lambda *_args, **_kwargs: True,
            get_drive_file_metadata=lambda *_args, **_kwargs: {
                "name": "walkthrough.mp4",
                "mimeType": "video/mp4",
                "size": str((1000 * 1024 * 1024) + 1),
            },
            download_drive_file=download_drive_file,
        )

        with (
            patch.dict(
                "os.environ",
                {"INKWISE_MAX_UPLOAD_MB": "100", "INKWISE_MAX_VIDEO_UPLOAD_MB": "1000"},
                clear=False,
            ),
            patch("inkwise.services.source_service.GoogleService", return_value=google_service),
            patch.object(service, "_get_plan_code", return_value="pro"),
        ):
            with self.assertRaisesRegex(ValueError, "1000MB"):
                service.import_drive_files(db, user_id="user-123", file_ids=["file-1"])

        download_drive_file.assert_not_called()

    def test_complete_upload_rejects_video_when_blob_exceeds_limit(self) -> None:
        service = InkwiseSourceService()
        source = SimpleNamespace(
            storage_bucket="inkwise-test-bucket",
            storage_object="inkwise/uploads/user/source/original/walkthrough.mp4",
            original_filename="walkthrough.mp4",
            content_type="video/mp4",
            size_bytes=0,
            status="uploading",
            failure_code=None,
            failure_detail=None,
            updated_at=None,
            checksum_sha256=None,
        )
        db = SimpleNamespace(commit=Mock(), refresh=Mock())
        blob = _ExistingBlob(size=(1000 * 1024 * 1024) + 1)

        with (
            patch.dict(
                "os.environ",
                {"INKWISE_MAX_UPLOAD_MB": "100", "INKWISE_MAX_VIDEO_UPLOAD_MB": "1000"},
                clear=False,
            ),
            patch.object(service, "get_source_or_404", return_value=source),
            patch("inkwise.services.source_service.storage_client", return_value=_FakeStorageClient(blob)),
        ):
            with self.assertRaisesRegex(ValueError, "1000MB"):
                service.complete_upload(
                    db,
                    user_id="user-123",
                    source_id=uuid.uuid4(),
                    checksum_sha256=None,
                )

        self.assertEqual(source.status, "failed")
        self.assertEqual(source.failure_code, "upload_rejected")
        self.assertIn("1000MB", str(source.failure_detail))

    def test_import_archive_rejects_oversized_video_entry(self) -> None:
        service = InkwiseSourceService()
        db = _FakeDb()
        archive_buffer = BytesIO()
        with zipfile.ZipFile(archive_buffer, "w") as archive:
            archive.writestr("walkthrough.mp4", b"v" * (2 * 1024 * 1024))

        with patch.dict(
            "os.environ",
            {"INKWISE_MAX_UPLOAD_MB": "100", "INKWISE_MAX_VIDEO_UPLOAD_MB": "1"},
            clear=False,
        ):
            with self.assertRaisesRegex(ValueError, "1MB"):
                service._import_archive_bytes(
                    db,
                    user_id="user-123",
                    archive_filename="bundle.zip",
                    archive_bytes=archive_buffer.getvalue(),
                    plan_code="pro",
                    external_source=None,
                    external_id=None,
                    external_meta=None,
                )

    def test_ingestion_autofill_fills_blank_fields_only(self) -> None:
        service = InkwiseSourceService()
        source = SimpleNamespace(
            id=uuid.uuid4(),
            user_id="user-123",
            title="lease.pdf",
            original_filename="lease.pdf",
            original_path="lease.pdf",
            bibliographic_metadata={"year": "2024"},
            updated_at=None,
        )

        with patch.object(service, "_refresh_linked_documents_for_source") as refresh:
            changed = service.apply_ingestion_metadata_autofill(
                SimpleNamespace(),
                source=source,
                suggested_title="Lease Agreement",
                bibliographic_metadata={"authors": ["Jane Smith"], "year": "2025"},
            )

        self.assertTrue(changed)
        self.assertEqual(source.title, "Lease Agreement")
        self.assertEqual(source.bibliographic_metadata, {"year": "2024", "authors": ["Jane Smith"]})
        self.assertIsNotNone(source.updated_at)
        refresh.assert_called_once()

    def test_ingestion_autofill_does_not_replace_non_placeholder_title(self) -> None:
        service = InkwiseSourceService()
        source = SimpleNamespace(
            id=uuid.uuid4(),
            user_id="user-123",
            title="Custom Source Title",
            original_filename="lease.pdf",
            original_path="lease.pdf",
            bibliographic_metadata=None,
            updated_at=None,
        )

        with patch.object(service, "_refresh_linked_documents_for_source") as refresh:
            changed = service.apply_ingestion_metadata_autofill(
                SimpleNamespace(),
                source=source,
                suggested_title="Lease Agreement",
                bibliographic_metadata=None,
            )

        self.assertFalse(changed)
        self.assertEqual(source.title, "Custom Source Title")
        refresh.assert_not_called()


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
