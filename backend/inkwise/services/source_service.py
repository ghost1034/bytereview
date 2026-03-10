"""Source storage service for the Inkwise module."""

from __future__ import annotations

import os
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from inkwise.schemas import (
    InkwiseSourceCreateRequest,
    InkwiseSourceOut,
    InkwiseSourceUploadInitRequest,
)
from inkwise.services.gcs import generate_signed_download_url, generate_signed_upload_url, storage_client
from inkwise.settings import get_inkwise_settings, is_valid_gcs_bucket_name, normalize_gcs_bucket_name
from models.db_models import User
from models.inkwise_models import InkwiseSource
from services.gcs_service import GCSService


_SAFE_FILENAME_RE = re.compile(r"[^a-zA-Z0-9._ -]+")


@dataclass(frozen=True)
class SignedUpload:
    url: str
    headers: dict[str, str]
    expires_at: str


@dataclass(frozen=True)
class SignedDownload:
    url: str
    expires_at: str


class InkwiseSourceService:
    def ensure_user_record(self, db: Session, *, user_id: str, email: str | None) -> None:
        existing = db.query(User).filter(User.id == user_id).first()
        if existing is not None:
            return

        clean_email = (email or "").strip()
        if not clean_email:
            raise ValueError("User profile is not initialized; email is required to create the account record")

        db.add(User(id=user_id, email=clean_email, display_name=None, photo_url=None))
        db.flush()

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
        now = datetime.utcnow()
        source = InkwiseSource(
            user_id=user_id,
            type=(body.type or "upload").strip() or "upload",
            title=(body.title or body.original_filename or "Untitled Source").strip() or "Untitled Source",
            original_filename=self._sanitize_filename(body.original_filename) if body.original_filename else None,
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

        filename = self._sanitize_filename(body.original_filename)
        now = datetime.utcnow()
        source = InkwiseSource(
            user_id=user_id,
            type="upload",
            title=(body.title or filename).strip() or filename,
            original_filename=filename,
            content_type=(body.content_type or "application/pdf").strip() or "application/pdf",
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

    def complete_upload(
        self,
        db: Session,
        *,
        user_id: str,
        source_id: uuid.UUID,
        checksum_sha256: str | None,
    ) -> InkwiseSource:
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
        source.status = "queued"
        source.failure_code = None
        source.failure_detail = None
        source.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(source)
        return source

    def signed_preview(
        self,
        db: Session,
        *,
        user_id: str,
        source_id: uuid.UUID,
    ) -> SignedDownload:
        source = self.get_source_or_404(db, user_id=user_id, source_id=source_id)
        url = self._signed_download_for_source(source, inline=True)
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

    def _signed_download_for_source(self, source: InkwiseSource, *, inline: bool) -> str:
        if not source.storage_bucket or not source.storage_object:
            raise FileNotFoundError("Source file is not available")

        return generate_signed_download_url(
            bucket=source.storage_bucket,
            object_name=source.storage_object,
            disposition_filename=source.original_filename,
            inline=inline,
        )

    def _require_bucket(self) -> str:
        gcs_service = GCSService()
        if not gcs_service.is_available():
            raise RuntimeError("Storage is not available")
        bucket = normalize_gcs_bucket_name(gcs_service.get_bucket_name())
        if not is_valid_gcs_bucket_name(bucket):
            raise RuntimeError("GCS bucket name is invalid or misconfigured")
        return bucket

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

        is_pdf = content_type == "application/pdf" or content_type.endswith("/pdf") or filename.lower().endswith(".pdf")
        if not is_pdf:
            raise ValueError("Only PDF uploads are currently supported")

    def _build_storage_object_name(self, *, user_id: str, source_id: uuid.UUID, original_filename: str) -> str:
        return f"inkwise/uploads/{user_id}/{source_id}/original/{original_filename}"

    def _sanitize_filename(self, original_filename: str | None) -> str:
        filename = os.path.basename((original_filename or "").strip()) or "source.pdf"
        filename = _SAFE_FILENAME_RE.sub("", filename)
        filename = re.sub(r"\s+", " ", filename).strip()
        if not filename:
            filename = "source.pdf"
        if "." not in filename:
            filename += ".pdf"
        return filename[:180]
