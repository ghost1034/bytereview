"""Source storage service for the Inkwise module."""

# pyright: reportAttributeAccessIssue=false, reportGeneralTypeIssues=false, reportArgumentType=false, reportOptionalMemberAccess=false

from __future__ import annotations

import io
import os
import re
import uuid
import zipfile
from html import escape, unescape
from dataclasses import dataclass
from datetime import datetime, timedelta
from urllib.parse import urlparse

import requests

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from inkwise.schemas import (
    InkwiseAssetPreviewRequest,
    InkwiseSourceCreateRequest,
    InkwiseSourceOut,
    InkwiseSourceUploadInitRequest,
    InkwiseWebpageCaptureRequest,
)
from inkwise.services.gcs import generate_signed_download_url, generate_signed_upload_url, storage_client
from inkwise.settings import get_inkwise_settings, is_valid_gcs_bucket_name, normalize_gcs_bucket_name
from models.db_models import User
from models.inkwise_models import InkwiseSource, InkwiseSourceIngestion
from services.google_service import GoogleService
from services.gcs_service import GCSService
from services.user_service import DuplicatePhoneNumberError, UserService


_SAFE_FILENAME_RE = re.compile(r"[^a-zA-Z0-9._ -]+")
_HTML_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
_UPLOAD_KIND_TO_CONTENT_TYPE = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "zip": "application/zip",
    "image_jpeg": "image/jpeg",
    "image_png": "image/png",
    "audio_mp3": "audio/mp3",
    "audio_wav": "audio/wav",
    "video_mp4": "video/mp4",
    "video_mpeg": "video/mpeg",
}
_UPLOAD_KIND_TO_EXTENSION = {
    "pdf": ".pdf",
    "docx": ".docx",
    "zip": ".zip",
    "image_jpeg": ".jpg",
    "image_png": ".png",
    "audio_mp3": ".mp3",
    "audio_wav": ".wav",
    "video_mp4": ".mp4",
    "video_mpeg": ".mpeg",
}
_SUPPORTED_UPLOAD_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip",
    "application/x-zip-compressed",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "audio/mp3",
    "audio/mpeg",
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "video/mp4",
    "video/mpeg",
    "video/mpg",
}


@dataclass(frozen=True)
class SignedUpload:
    url: str
    headers: dict[str, str]
    expires_at: str


@dataclass(frozen=True)
class SignedDownload:
    url: str
    expires_at: str


class InkwisePlanRestrictionError(PermissionError):
    pass


class InkwiseSourceService:
    def ensure_user_record(self, db: Session, *, user_id: str, email: str | None, phone_number: str | None) -> None:
        existing = db.query(User).filter(User.id == user_id).first()
        clean_phone_number = UserService._normalize_phone_number(phone_number)

        try:
            if existing is not None:
                if clean_phone_number and existing.phone_number != clean_phone_number:
                    existing.phone_number = clean_phone_number
                    if existing.phone_verified_at is None:
                        existing.phone_verified_at = datetime.utcnow()
                    db.flush()
                return

            clean_email = (email or "").strip()
            if not clean_email:
                raise ValueError("User profile is not initialized; email is required to create the account record")

            if not clean_phone_number:
                raise ValueError("User profile is not initialized; a verified phone number is required to create the account record")

            db.add(
                User(
                    id=user_id,
                    email=clean_email,
                    phone_number=clean_phone_number,
                    phone_verified_at=datetime.utcnow(),
                    display_name=None,
                    photo_url=None,
                )
            )
            db.flush()
        except IntegrityError as exc:
            db.rollback()
            UserService._raise_if_phone_conflict(exc)
            raise

    def list_sources(self, db: Session, *, user_id: str, page: int, limit: int) -> tuple[list[InkwiseSource], int]:
        if page < 1 or limit < 1 or limit > 100:
            raise ValueError("Invalid pagination")

        query = db.query(InkwiseSource).filter(
            InkwiseSource.user_id == user_id,
            InkwiseSource.status != "deleted",
        )
        total = query.count()
        items = (
            query.order_by(InkwiseSource.updated_at.desc(), InkwiseSource.created_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
            .all()
        )
        return items, total

    def get_source_or_404(self, db: Session, *, user_id: str, source_id: uuid.UUID) -> InkwiseSource:
        source = (
            db.query(InkwiseSource)
            .filter(
                InkwiseSource.id == source_id,
                InkwiseSource.user_id == user_id,
                InkwiseSource.status != "deleted",
            )
            .first()
        )
        if source is None:
            raise FileNotFoundError("Source not found")
        return source

    def create_source(self, db: Session, *, user_id: str, body: InkwiseSourceCreateRequest) -> InkwiseSource:
        upload_kind = self._detect_upload_kind(
            filename=(body.original_filename or body.title or "reference").strip(),
            content_type=(body.content_type or "").strip().lower(),
        )
        self._assert_upload_kind_allowed_for_plan(
            upload_kind=upload_kind,
            filename=(body.original_filename or body.title or "reference").strip() or "reference",
            plan_code=self._get_plan_code(db, user_id),
        )
        filename = self._sanitize_filename(body.original_filename) if body.original_filename else None
        now = datetime.utcnow()
        source = InkwiseSource(
            user_id=user_id,
            type=(body.type or "upload").strip() or "upload",
            title=(body.title or body.original_filename or "Untitled Source").strip() or "Untitled Source",
            original_filename=filename,
            original_path=self._sanitize_relative_path(body.original_filename, fallback_filename=filename),
            content_type=(body.content_type or "application/pdf").strip() or "application/pdf",
            size_bytes=max(0, int(body.size_bytes)),
            source_url=(body.source_url or "").strip() or None,
            status="pending",
            created_at=now,
            updated_at=now,
        )
        db.add(source)
        db.commit()
        db.refresh(source)
        return source

    def init_upload(self, db: Session, *, user_id: str, body: InkwiseSourceUploadInitRequest) -> tuple[InkwiseSource, SignedUpload]:
        self._validate_upload_request(body)
        bucket = self._require_bucket()

        upload_kind = self._detect_upload_kind(
            filename=(body.original_filename or "").strip(),
            content_type=(body.content_type or "").strip().lower(),
        )
        self._assert_upload_kind_allowed_for_plan(
            upload_kind=upload_kind,
            filename=(body.original_filename or "").strip() or "reference",
            plan_code=self._get_plan_code(db, user_id),
        )
        resolved_content_type = self._resolved_content_type_for_kind(upload_kind)
        filename = self._sanitize_filename(
            body.original_filename,
            default_extension=self._default_extension_for_kind(upload_kind),
        )
        now = datetime.utcnow()
        source = InkwiseSource(
            user_id=user_id,
            type="upload",
            title=(body.title or filename).strip() or filename,
            original_filename=filename,
            original_path=self._sanitize_relative_path(body.original_path, fallback_filename=filename),
            content_type=resolved_content_type,
            size_bytes=int(body.size_bytes),
            storage_bucket=bucket,
            status="uploading",
            created_at=now,
            updated_at=now,
        )
        db.add(source)
        db.flush()

        source.storage_object = self._build_storage_object_name(
            user_id=user_id,
            source_id=source.id,
            original_filename=filename,
        )

        url, headers = generate_signed_upload_url(
            bucket=bucket,
            object_name=source.storage_object,
            content_type=source.content_type,
        )

        db.commit()
        db.refresh(source)

        expires_at = (datetime.utcnow() + timedelta(minutes=15)).isoformat() + "Z"
        return source, SignedUpload(url=url, headers=headers, expires_at=expires_at)

    def capture_webpage_snapshot(
        self,
        db: Session,
        *,
        user_id: str,
        body: InkwiseWebpageCaptureRequest,
    ) -> InkwiseSource:
        clean_url = self._validate_webpage_url(body.source_url)
        bucket = self._require_bucket()
        pdf_bytes, resolved_title = self._build_webpage_snapshot_pdf(
            clean_url,
            preferred_title=(body.title or "").strip() or None,
        )
        filename = self._sanitize_filename(self._webpage_filename(clean_url, resolved_title, extension=".pdf"), default_extension=".pdf")

        now = datetime.utcnow()
        source = InkwiseSource(
            user_id=user_id,
            type="webpage",
            title=resolved_title,
            original_filename=filename,
            content_type="application/pdf",
            size_bytes=len(pdf_bytes),
            storage_bucket=bucket,
            source_url=clean_url,
            status="queued",
            created_at=now,
            updated_at=now,
        )
        db.add(source)
        db.flush()

        source.storage_object = self._build_storage_object_name(
            user_id=user_id,
            source_id=source.id,
            original_filename=filename,
        )
        storage_client().bucket(bucket).blob(source.storage_object).upload_from_string(
            pdf_bytes,
            content_type="application/pdf",
        )
        db.commit()
        db.refresh(source)
        return source

    def complete_upload(
        self,
        db: Session,
        *,
        user_id: str,
        source_id: uuid.UUID,
        checksum_sha256: str | None,
    ) -> list[InkwiseSource]:
        source = self.get_source_or_404(db, user_id=user_id, source_id=source_id)
        if not source.storage_bucket or not source.storage_object:
            raise ValueError("Source storage path is missing")

        client = storage_client()
        blob = client.bucket(source.storage_bucket).blob(source.storage_object)
        if not blob.exists():
            raise FileNotFoundError("Uploaded file was not found in storage")

        blob.reload()
        if checksum_sha256:
            source.checksum_sha256 = checksum_sha256.strip() or None
        if blob.size is not None:
            source.size_bytes = int(blob.size)

        upload_kind = self._detect_upload_kind(
            filename=str(source.original_filename or ""),
            content_type=str(source.content_type or ""),
        )
        if upload_kind == "zip":
            try:
                imported = self._import_archive_blob(db, source=source, blob=blob)
                return imported
            except (ValueError, InkwisePlanRestrictionError) as exc:
                self._mark_source_failed(source, code="upload_rejected", message=str(exc))
                db.commit()
                raise

        source.status = "queued"
        source.failure_code = None
        source.failure_detail = None
        source.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(source)
        return [source]

    def import_drive_files(self, db: Session, *, user_id: str, file_ids: list[str]) -> list[InkwiseSource]:
        clean_ids = [file_id.strip() for file_id in file_ids if str(file_id or "").strip()]
        if not clean_ids:
            raise ValueError("file_ids required")

        google_service = GoogleService()
        if not google_service.has_drive_access(db, user_id):
            raise ValueError("Google Drive is not connected for this account")

        imported: list[InkwiseSource] = []
        plan_code = self._get_plan_code(db, user_id)
        for file_id in clean_ids:
            metadata = google_service.get_drive_file_metadata(db, user_id, file_id)
            if not metadata:
                raise ValueError(f"Could not access Drive file {file_id}")

            filename = str(metadata.get("name") or "reference")
            content_type = str(metadata.get("mimeType") or "application/octet-stream")
            upload_kind = self._detect_upload_kind(filename=filename, content_type=content_type)
            self._assert_upload_kind_allowed_for_plan(
                upload_kind=upload_kind,
                filename=filename,
                plan_code=plan_code,
            )
            content = google_service.download_drive_file(db, user_id, file_id)
            if content is None:
                raise ValueError(f"Could not download Drive file {filename}")

            imported.extend(
                self._import_source_payload(
                    db,
                    user_id=user_id,
                    filename=filename,
                    content_type=content_type,
                    content=content,
                    original_path=filename,
                    external_source="gdrive",
                    external_id=file_id,
                    plan_code=plan_code,
                    external_meta={
                        "web_view_link": metadata.get("webViewLink"),
                        "drive_id": metadata.get("driveId"),
                        "parents": metadata.get("parents") or [],
                    },
                )
            )

        return imported

    def signed_preview(
        self,
        db: Session,
        *,
        user_id: str,
        source_id: uuid.UUID,
    ) -> SignedDownload:
        source = self.get_source_or_404(db, user_id=user_id, source_id=source_id)
        bucket, object_name = self._resolve_preview_storage_path(db, source)
        url = generate_signed_download_url(
            bucket=bucket,
            object_name=object_name,
            disposition_filename=self._preview_filename_for_object(source, object_name),
            inline=True,
        )
        expires_at = (datetime.utcnow() + timedelta(minutes=15)).isoformat() + "Z"
        return SignedDownload(url=url, expires_at=expires_at)

    def signed_preview_asset(
        self,
        db: Session,
        *,
        user_id: str,
        source_id: uuid.UUID,
        body: InkwiseAssetPreviewRequest,
    ) -> SignedDownload:
        source = self.get_source_or_404(db, user_id=user_id, source_id=source_id)
        bucket = normalize_gcs_bucket_name(body.bucket or source.storage_bucket)
        object_name = (body.object_name or "").strip()
        if not bucket or not object_name:
            raise ValueError("Preview asset bucket and object are required")
        if not self._is_allowed_preview_asset(source=source, bucket=bucket, object_name=object_name):
            raise FileNotFoundError("Preview asset is not available")

        url = generate_signed_download_url(
            bucket=bucket,
            object_name=object_name,
            disposition_filename=(body.disposition_filename or source.original_filename),
            inline=True,
        )
        expires_at = (datetime.utcnow() + timedelta(minutes=15)).isoformat() + "Z"
        return SignedDownload(url=url, expires_at=expires_at)

    def signed_download(
        self,
        db: Session,
        *,
        user_id: str,
        source_id: uuid.UUID,
    ) -> SignedDownload:
        source = self.get_source_or_404(db, user_id=user_id, source_id=source_id)
        url = self._signed_download_for_source(source, inline=False)
        expires_at = (datetime.utcnow() + timedelta(minutes=15)).isoformat() + "Z"
        return SignedDownload(url=url, expires_at=expires_at)

    def delete_source(self, db: Session, *, user_id: str, source_id: uuid.UUID) -> None:
        source = self.get_source_or_404(db, user_id=user_id, source_id=source_id)
        source.status = "deleted"
        source.updated_at = datetime.utcnow()
        db.commit()

    def _import_archive_blob(self, db: Session, *, source: InkwiseSource, blob) -> list[InkwiseSource]:
        archive_bytes = blob.download_as_bytes()
        imported = self._import_archive_bytes(
            db,
            user_id=source.user_id,
            archive_filename=source.original_filename or "archive.zip",
            archive_bytes=archive_bytes,
            plan_code=self._get_plan_code(db, source.user_id),
            external_source=source.external_source,
            external_id=source.external_id,
            external_meta=source.external_meta or {},
        )
        source.status = "deleted"
        source.failure_code = None
        source.failure_detail = None
        source.updated_at = datetime.utcnow()
        db.commit()
        return imported

    def _import_source_payload(
        self,
        db: Session,
        *,
        user_id: str,
        filename: str,
        content_type: str,
        content: bytes,
        original_path: str | None,
        plan_code: str | None = None,
        external_source: str | None = None,
        external_id: str | None = None,
        external_meta: dict | None = None,
    ) -> list[InkwiseSource]:
        upload_kind = self._detect_upload_kind(filename=filename, content_type=content_type)
        if upload_kind is None:
            raise ValueError(f"Unsupported reference type for {filename}")
        self._assert_upload_kind_allowed_for_plan(
            upload_kind=upload_kind,
            filename=filename,
            plan_code=plan_code,
        )
        if upload_kind == "zip":
            return self._import_archive_bytes(
                db,
                user_id=user_id,
                archive_filename=filename,
                archive_bytes=content,
                plan_code=plan_code,
                external_source=external_source,
                external_id=external_id,
                external_meta=external_meta or {},
            )
        return [
            self._create_source_from_bytes(
                db,
                user_id=user_id,
                filename=filename,
                content_type=self._resolved_content_type_for_kind(upload_kind),
                content=content,
                original_path=original_path,
                plan_code=plan_code,
                external_source=external_source,
                external_id=external_id,
                external_meta=external_meta,
            )
        ]

    def _create_source_from_bytes(
        self,
        db: Session,
        *,
        user_id: str,
        filename: str,
        content_type: str,
        content: bytes,
        original_path: str | None,
        plan_code: str | None = None,
        external_source: str | None = None,
        external_id: str | None = None,
        external_meta: dict | None = None,
    ) -> InkwiseSource:
        upload_kind = self._detect_upload_kind(filename=filename, content_type=content_type)
        self._assert_upload_kind_allowed_for_plan(
            upload_kind=upload_kind,
            filename=filename,
            plan_code=plan_code,
        )
        bucket = self._require_bucket()
        clean_filename = self._sanitize_filename(
            filename,
            default_extension=self._default_extension_for_kind(upload_kind),
        )
        now = datetime.utcnow()
        source = InkwiseSource(
            user_id=user_id,
            type="upload",
            title=clean_filename,
            original_filename=clean_filename,
            original_path=self._sanitize_relative_path(original_path, fallback_filename=clean_filename),
            content_type=content_type,
            size_bytes=len(content),
            storage_bucket=bucket,
            external_source=(external_source or "").strip() or None,
            external_id=(external_id or "").strip() or None,
            external_meta=external_meta or None,
            status="queued",
            created_at=now,
            updated_at=now,
        )
        db.add(source)
        db.flush()

        source.storage_object = self._build_storage_object_name(
            user_id=user_id,
            source_id=source.id,
            original_filename=clean_filename,
        )
        storage_client().bucket(bucket).blob(source.storage_object).upload_from_string(content, content_type=content_type)
        db.commit()
        db.refresh(source)
        return source

    def _import_archive_bytes(
        self,
        db: Session,
        *,
        user_id: str,
        archive_filename: str,
        archive_bytes: bytes,
        plan_code: str | None,
        external_source: str | None,
        external_id: str | None,
        external_meta: dict | None,
    ) -> list[InkwiseSource]:
        imported: list[InkwiseSource] = []
        try:
            with zipfile.ZipFile(io.BytesIO(archive_bytes), "r") as archive:
                for info in archive.infolist():
                    if info.is_dir():
                        continue
                    entry_name = str(info.filename or "").strip()
                    if self._is_ignored_archive_member(entry_name):
                        continue
                    upload_kind = self._detect_upload_kind(filename=entry_name, content_type="")
                    if upload_kind is None or upload_kind == "zip":
                        continue
                    self._assert_upload_kind_allowed_for_plan(
                        upload_kind=upload_kind,
                        filename=entry_name,
                        plan_code=plan_code,
                    )

                    imported.append(
                        self._create_source_from_bytes(
                            db,
                            user_id=user_id,
                            filename=entry_name,
                            content_type=self._resolved_content_type_for_kind(upload_kind),
                            content=archive.read(info),
                            original_path=entry_name,
                            plan_code=plan_code,
                            external_source=external_source,
                            external_id=external_id,
                            external_meta={
                                **(external_meta or {}),
                                "archive_filename": archive_filename,
                                "archive_entry_path": entry_name,
                            },
                        )
                    )
        except zipfile.BadZipFile as exc:
            raise ValueError("Uploaded ZIP file could not be opened") from exc

        if not imported:
            raise ValueError("ZIP file did not contain any supported references")
        return imported

    def _signed_download_for_source(self, source: InkwiseSource, *, inline: bool) -> str:
        if not source.storage_bucket or not source.storage_object:
            raise FileNotFoundError("Source file is not available")

        return generate_signed_download_url(
            bucket=source.storage_bucket,
            object_name=source.storage_object,
            disposition_filename=source.original_filename,
            inline=inline,
        )

    def _resolve_preview_storage_path(self, db: Session, source: InkwiseSource) -> tuple[str, str]:
        preview_ingestion = (
            db.query(InkwiseSourceIngestion)
            .filter(
                InkwiseSourceIngestion.source_id == source.id,
                InkwiseSourceIngestion.status == "completed",
                InkwiseSourceIngestion.canonical_pdf_gcs_bucket.isnot(None),
                InkwiseSourceIngestion.canonical_pdf_gcs_object.isnot(None),
            )
            .order_by(InkwiseSourceIngestion.created_at.desc())
            .first()
        )
        preview_bucket = normalize_gcs_bucket_name(
            str(preview_ingestion.canonical_pdf_gcs_bucket or "") if preview_ingestion else str(source.storage_bucket or "")
        )
        preview_object = (
            str(preview_ingestion.canonical_pdf_gcs_object or "").strip()
            if preview_ingestion
            else str(source.storage_object or "").strip()
        )
        if not preview_bucket or not preview_object:
            raise FileNotFoundError("Source file is not available")
        return preview_bucket, preview_object

    def _preview_filename_for_object(self, source: InkwiseSource, object_name: str) -> str | None:
        inferred_ext = os.path.splitext(os.path.basename(object_name or ""))[1].lower()
        if inferred_ext == ".pdf":
            preferred_name = source.original_filename or source.title or "reference.pdf"
            return self._sanitize_filename(preferred_name, default_extension=".pdf")
        return source.original_filename

    def _is_allowed_preview_asset(self, *, source: InkwiseSource, bucket: str, object_name: str) -> bool:
        source_bucket = normalize_gcs_bucket_name(str(source.storage_bucket or ""))
        source_object = str(source.storage_object or "").strip()
        if bucket == source_bucket and object_name == source_object:
            return True

        derived_bucket = normalize_gcs_bucket_name(get_inkwise_settings().derived_bucket or source_bucket)
        allowed_prefix = f"inkwise/derived/{source.user_id}/{source.id}/"
        return bucket == derived_bucket and object_name.startswith(allowed_prefix)

    def _require_bucket(self) -> str:
        gcs_service = GCSService()
        if not gcs_service.is_available():
            raise RuntimeError("Storage is not available")
        bucket = normalize_gcs_bucket_name(gcs_service.get_bucket_name())
        if not is_valid_gcs_bucket_name(bucket):
            raise RuntimeError("GCS bucket name is invalid or misconfigured")
        return str(bucket)

    def _validate_upload_request(self, body: InkwiseSourceUploadInitRequest) -> None:
        filename = (body.original_filename or "").strip()
        content_type = (body.content_type or "").strip().lower()
        if not filename:
            raise ValueError("original_filename is required")
        if int(body.size_bytes) <= 0:
            raise ValueError("size_bytes must be greater than zero")

        settings = get_inkwise_settings()
        max_upload_bytes = max(1, settings.max_upload_mb) * 1024 * 1024
        if int(body.size_bytes) > max_upload_bytes:
            raise ValueError(f"File too large. Maximum size is {settings.max_upload_mb}MB")

        upload_kind = self._detect_upload_kind(filename=filename, content_type=content_type)
        if upload_kind is None:
            raise ValueError("Only PDF, DOCX, image, audio, video, and ZIP uploads are currently supported")

    def _mark_source_failed(self, source: InkwiseSource, *, code: str, message: str) -> None:
        source.status = "failed"
        source.failure_code = code
        source.failure_detail = (message or "")[:2000]
        source.updated_at = datetime.utcnow()

    def _get_plan_code(self, db: Session, user_id: str) -> str:
        from services.billing_service import get_billing_service

        billing_info = get_billing_service(db).get_billing_info(user_id)
        return str(billing_info.get("plan_code") or "free").strip().lower() or "free"

    def _assert_upload_kind_allowed_for_plan(
        self,
        *,
        upload_kind: str | None,
        filename: str,
        plan_code: str | None,
    ) -> None:
        if upload_kind not in {"audio_mp3", "audio_wav", "video_mp4", "video_mpeg"}:
            return
        if (plan_code or "").strip().lower() == "pro":
            return
        raise InkwisePlanRestrictionError(
            f'Audio and video references like "{filename}" are available on the Pro plan only.'
        )

    def _build_storage_object_name(self, *, user_id: str, source_id: uuid.UUID, original_filename: str) -> str:
        return f"inkwise/uploads/{user_id}/{source_id}/original/{original_filename}"

    def _sanitize_filename(self, original_filename: str | None, *, default_extension: str = ".pdf") -> str:
        fallback_name = f"source{default_extension}"
        filename = os.path.basename((original_filename or "").strip()) or fallback_name
        filename = _SAFE_FILENAME_RE.sub("", filename)
        filename = re.sub(r"\s+", " ", filename).strip()
        if not filename:
            filename = fallback_name
        if "." not in filename:
            filename += default_extension
        return filename[:180]

    def _sanitize_relative_path(self, original_path: str | None, *, fallback_filename: str | None = None) -> str | None:
        raw = (original_path or "").replace("\\", "/").strip().strip("/")
        if not raw:
            return fallback_filename

        parts: list[str] = []
        for part in raw.split("/"):
            clean_part = _SAFE_FILENAME_RE.sub("", part).strip()
            if not clean_part or clean_part in {".", ".."}:
                continue
            parts.append(clean_part[:180])
        if not parts:
            return fallback_filename
        return "/".join(parts)[:1024]

    def _detect_upload_kind(self, *, filename: str, content_type: str) -> str | None:
        lowered_filename = filename.lower()
        lowered_type = (content_type or "").lower()
        if lowered_type == "application/pdf" or lowered_type.endswith("/pdf") or lowered_filename.endswith(".pdf"):
            return "pdf"
        if lowered_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document" or lowered_filename.endswith(".docx"):
            return "docx"
        if lowered_type in {"application/zip", "application/x-zip-compressed"} or lowered_filename.endswith(".zip"):
            return "zip"
        if lowered_type in {"image/jpeg", "image/jpg"} or lowered_filename.endswith((".jpg", ".jpeg")):
            return "image_jpeg"
        if lowered_type == "image/png" or lowered_filename.endswith(".png"):
            return "image_png"
        if lowered_type in {"audio/mp3", "audio/mpeg"} or lowered_filename.endswith(".mp3"):
            return "audio_mp3"
        if lowered_type in {"audio/wav", "audio/x-wav", "audio/wave"} or lowered_filename.endswith(".wav"):
            return "audio_wav"
        if lowered_type == "video/mp4" or lowered_filename.endswith(".mp4"):
            return "video_mp4"
        if lowered_type in {"video/mpeg", "video/mpg"} or lowered_filename.endswith((".mpeg", ".mpg")):
            return "video_mpeg"
        return None

    def _resolved_content_type_for_kind(self, upload_kind: str | None) -> str:
        return _UPLOAD_KIND_TO_CONTENT_TYPE.get(upload_kind or "", "application/pdf")

    def _default_extension_for_kind(self, upload_kind: str | None) -> str:
        return _UPLOAD_KIND_TO_EXTENSION.get(upload_kind or "", ".pdf")

    def _is_ignored_archive_member(self, value: str) -> bool:
        normalized = (value or "").replace("\\", "/").strip()
        if not normalized:
            return True
        if normalized.startswith("__MACOSX/"):
            return True
        base = os.path.basename(normalized)
        return base in {".DS_Store"}

    def _validate_webpage_url(self, raw_url: str) -> str:
        clean_url = (raw_url or "").strip()
        if not clean_url:
            raise ValueError("A valid webpage URL is required")
        if "://" not in clean_url:
            clean_url = f"https://{clean_url.lstrip('/')}"
        parsed = urlparse(clean_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("A valid http or https URL is required")
        return parsed.geturl()

    def _build_webpage_snapshot_pdf(self, url: str, *, preferred_title: str | None) -> tuple[bytes, str]:
        html_text, resolved_title = self._fetch_webpage_html(url, preferred_title=preferred_title)
        pdf_bytes = self._render_webpage_snapshot_pdf(url=url, title=resolved_title, html_text=html_text)
        return pdf_bytes, resolved_title

    def _fetch_webpage_html(self, url: str, *, preferred_title: str | None) -> tuple[str, str]:
        settings = get_inkwise_settings()
        max_bytes = max(1, settings.max_upload_mb) * 1024 * 1024
        try:
            response = requests.get(
                url,
                timeout=30,
                headers={"User-Agent": "CPAAutomation Inkwise Reference Capture/1.0"},
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            raise ValueError(f"Could not fetch webpage snapshot: {exc}") from exc
        content = response.content
        if len(content) > max_bytes:
            raise ValueError(f"Webpage snapshot too large. Maximum size is {settings.max_upload_mb}MB")

        content_type = (response.headers.get("content-type") or "text/html").split(";")[0].strip().lower() or "text/html"
        if "html" not in content_type and not content_type.startswith("text/"):
            raise ValueError("The URL did not return an HTML or text webpage")

        html_text = content.decode(response.encoding or "utf-8", errors="ignore")
        title = preferred_title or self._extract_html_title(html_text) or urlparse(url).netloc or "Webpage snapshot"
        return html_text, title[:400]

    def _render_webpage_snapshot_pdf(self, *, url: str, title: str, html_text: str) -> bytes:
        try:
            from reportlab.lib.colors import HexColor
            from reportlab.lib.pagesizes import letter
            from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
            from reportlab.lib.units import inch
            from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
        except Exception as exc:
            raise ValueError("reportlab is required to capture webpage snapshots") from exc

        paragraphs = self._extract_html_paragraphs(html_text)
        if not paragraphs:
            paragraphs = [title or url]

        buffer = io.BytesIO()
        document = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            leftMargin=0.75 * inch,
            rightMargin=0.75 * inch,
            topMargin=0.75 * inch,
            bottomMargin=0.75 * inch,
            title=title[:250],
        )
        styles = getSampleStyleSheet()
        title_style = styles["Title"]
        body_style = ParagraphStyle(
            "InkwiseWebpageBody",
            parent=styles["BodyText"],
            leading=14,
            spaceAfter=8,
        )
        meta_style = ParagraphStyle(
            "InkwiseWebpageMeta",
            parent=styles["BodyText"],
            textColor=HexColor("#475569"),
            fontSize=9,
            leading=12,
            spaceAfter=10,
        )

        story: list[object] = [
            Paragraph(escape((title or "Webpage snapshot").strip() or "Webpage snapshot"), title_style),
            Spacer(1, 0.15 * inch),
            Paragraph(escape(url), meta_style),
            Paragraph(escape(f"Captured {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}"), meta_style),
            Spacer(1, 0.1 * inch),
        ]
        for paragraph in paragraphs:
            clean_paragraph = paragraph.strip()
            if not clean_paragraph:
                continue
            story.append(Paragraph(escape(clean_paragraph), body_style))

        try:
            document.build(story)
        except Exception as exc:
            raise ValueError(f"Could not generate webpage PDF snapshot: {exc}") from exc
        return buffer.getvalue()

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

    def _webpage_filename(self, url: str, title: str, *, extension: str = ".html") -> str:
        parsed = urlparse(url)
        stem = (title or parsed.netloc or "webpage").strip() or "webpage"
        stem = re.sub(r"\s+", "-", stem)
        stem = _SAFE_FILENAME_RE.sub("", stem).strip("- ") or "webpage"
        return f"{stem[:120]}{extension}"
