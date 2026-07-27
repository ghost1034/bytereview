"""Filesystem-backed object storage used by the local development profile.

The small client/bucket/blob adapters intentionally mirror the subset of the
Google Cloud Storage API used by the application.  This keeps product code on
the same path locally without granting a developer process access to a cloud
bucket.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import shutil
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import BinaryIO, Iterable
from urllib.parse import quote

from core.runtime import local_api_base_url, local_storage_root


def _safe_part(value: str) -> str:
    clean = (value or "").strip()
    if not clean or clean in {".", ".."} or "/" in clean or "\\" in clean:
        raise ValueError("Invalid local storage bucket")
    return clean


def _safe_object_name(value: str) -> str:
    normalized = (value or "").replace("\\", "/").lstrip("/")
    parts = PurePosixPath(normalized).parts
    if not parts or any(part in {"", ".", ".."} for part in parts):
        raise ValueError("Invalid local storage object name")
    return "/".join(parts)


def _signing_key() -> bytes:
    return (os.getenv("LOCAL_STORAGE_SIGNING_KEY") or "cpaautomation-local-storage-only").encode()


def create_local_storage_token(
    method: str,
    bucket: str,
    object_name: str,
    *,
    expires_in_seconds: int,
    download_filename: str | None = None,
    inline: bool = False,
) -> str:
    payload = {
        "m": method.upper(),
        "b": _safe_part(bucket),
        "o": _safe_object_name(object_name),
        "e": int(time.time()) + max(1, int(expires_in_seconds)),
        "f": os.path.basename(download_filename) if download_filename else None,
        "i": bool(inline),
    }
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    encoded = base64.urlsafe_b64encode(raw).rstrip(b"=")
    signature = hmac.new(_signing_key(), encoded, hashlib.sha256).digest()
    return f"{encoded.decode()}.{base64.urlsafe_b64encode(signature).rstrip(b'=').decode()}"


def verify_local_storage_token(token: str, expected_method: str) -> dict:
    try:
        encoded_text, signature_text = token.split(".", 1)
        encoded = encoded_text.encode()
        signature = base64.urlsafe_b64decode(signature_text + "=" * (-len(signature_text) % 4))
        expected = hmac.new(_signing_key(), encoded, hashlib.sha256).digest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError("Invalid signature")
        raw = base64.urlsafe_b64decode(encoded_text + "=" * (-len(encoded_text) % 4))
        payload = json.loads(raw)
        if payload.get("m") != expected_method.upper():
            raise ValueError("Wrong method")
        if int(payload.get("e", 0)) < int(time.time()):
            raise ValueError("Expired token")
        payload["b"] = _safe_part(payload["b"])
        payload["o"] = _safe_object_name(payload["o"])
        return payload
    except Exception as exc:
        raise ValueError("Invalid or expired local storage URL") from exc


def local_storage_url(
    method: str,
    bucket: str,
    object_name: str,
    *,
    expires_in_seconds: int,
    download_filename: str | None = None,
    inline: bool = False,
) -> str:
    token = create_local_storage_token(
        method,
        bucket,
        object_name,
        expires_in_seconds=expires_in_seconds,
        download_filename=download_filename,
        inline=inline,
    )
    action = "upload" if method.upper() == "PUT" else "download"
    return f"{local_api_base_url()}/api/local-storage/{action}/{quote(token)}"


class LocalBlob:
    def __init__(self, bucket: "LocalBucket", name: str):
        self.bucket = bucket
        self.name = _safe_object_name(name)
        self.metadata: dict | None = self._read_metadata()
        self.size: int | None = None
        self.updated: datetime | None = None
        self.time_created: datetime | None = None
        self.reload()

    @property
    def path(self) -> Path:
        path = (self.bucket.path / self.name).resolve()
        if self.bucket.path not in path.parents:
            raise ValueError("Local storage path escaped its bucket")
        return path

    @property
    def metadata_path(self) -> Path:
        return Path(f"{self.path}.metadata.json")

    def _read_metadata(self) -> dict | None:
        try:
            path = Path(f"{(self.bucket.path / self.name).resolve()}.metadata.json")
            return json.loads(path.read_text()) if path.is_file() else None
        except Exception:
            return None

    def exists(self) -> bool:
        return self.path.is_file()

    def reload(self) -> None:
        if not self.exists():
            self.size = None
            self.updated = None
            self.time_created = None
            return
        stat = self.path.stat()
        self.size = stat.st_size
        self.updated = datetime.fromtimestamp(stat.st_mtime, timezone.utc)
        self.time_created = datetime.fromtimestamp(stat.st_ctime, timezone.utc)
        self.metadata = self._read_metadata()

    def patch(self) -> None:
        self.metadata_path.parent.mkdir(parents=True, exist_ok=True)
        self.metadata_path.write_text(json.dumps(self.metadata or {}, sort_keys=True))

    def open(self, mode: str = "rb") -> BinaryIO:
        if any(flag in mode for flag in ("w", "a", "+")):
            self.path.parent.mkdir(parents=True, exist_ok=True)
        return self.path.open(mode)  # type: ignore[return-value]

    def upload_from_string(self, data: bytes | str, content_type: str | None = None) -> None:
        content = data.encode() if isinstance(data, str) else data
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_bytes(content)
        self.reload()

    def upload_from_filename(self, filename: str, content_type: str | None = None) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(filename, self.path)
        self.reload()

    def download_as_bytes(self) -> bytes:
        return self.path.read_bytes()

    def download_to_filename(self, filename: str) -> None:
        Path(filename).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(self.path, filename)

    def delete(self) -> None:
        self.path.unlink(missing_ok=True)
        self.metadata_path.unlink(missing_ok=True)
        self.reload()

    def generate_signed_url(
        self,
        *,
        expiration,
        method: str = "GET",
        response_disposition: str | None = None,
        **_: object,
    ) -> str:
        seconds = int(expiration.total_seconds()) if hasattr(expiration, "total_seconds") else int(expiration)
        filename = None
        inline = False
        if response_disposition:
            inline = response_disposition.lower().startswith("inline")
            if 'filename="' in response_disposition:
                filename = response_disposition.split('filename="', 1)[1].split('"', 1)[0]
        return local_storage_url(
            method,
            self.bucket.name,
            self.name,
            expires_in_seconds=seconds,
            download_filename=filename,
            inline=inline,
        )


class LocalBucket:
    def __init__(self, root: Path, name: str):
        self.name = _safe_part(name)
        self.path = (root / self.name).resolve()
        self.path.mkdir(parents=True, exist_ok=True)

    def exists(self) -> bool:
        return True

    def blob(self, name: str) -> LocalBlob:
        return LocalBlob(self, name)

    def list_blobs(self, prefix: str = "") -> Iterable[LocalBlob]:
        safe_prefix = prefix.replace("\\", "/").lstrip("/")
        if ".." in PurePosixPath(safe_prefix).parts:
            raise ValueError("Invalid local storage prefix")
        if not self.path.exists():
            return []
        blobs: list[LocalBlob] = []
        for path in self.path.rglob("*"):
            if not path.is_file() or path.name.endswith(".metadata.json"):
                continue
            name = path.relative_to(self.path).as_posix()
            if name.startswith(safe_prefix):
                blobs.append(LocalBlob(self, name))
        return blobs

    def copy_blob(self, source_blob: LocalBlob, destination_bucket: "LocalBucket", new_name: str) -> LocalBlob:
        destination = destination_bucket.blob(new_name)
        destination.path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source_blob.path, destination.path)
        if source_blob.metadata_path.exists():
            shutil.copyfile(source_blob.metadata_path, destination.metadata_path)
        destination.reload()
        return destination


class LocalStorageClient:
    def __init__(self, root: Path | None = None):
        self.root = (root or local_storage_root()).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def bucket(self, name: str) -> LocalBucket:
        return LocalBucket(self.root, name)


class LocalStorageService:
    def __init__(self) -> None:
        self.bucket_name = os.getenv("GCS_BUCKET_NAME") or "cpaautomation-local"
        self.temp_folder_prefix = os.getenv("GCS_TEMP_FOLDER", "temp_uploads")
        self.client = LocalStorageClient()
        self.bucket = self.client.bucket(self.bucket_name)

    def is_available(self) -> bool:
        return True

    def get_bucket_name(self) -> str:
        return self.bucket_name

    def construct_gcs_uri_for_object(self, object_name: str) -> str:
        return f"local://{self.bucket_name}/{_safe_object_name(object_name)}"

    async def generate_presigned_put_url(self, object_name: str, expiration_minutes: int = 60, content_type: str | None = None) -> str:
        return local_storage_url("PUT", self.bucket_name, object_name, expires_in_seconds=expiration_minutes * 60)

    async def generate_presigned_get_url(self, object_name: str, expiration_minutes: int = 15, download_filename: str | None = None) -> str:
        return local_storage_url(
            "GET",
            self.bucket_name,
            object_name,
            expires_in_seconds=expiration_minutes * 60,
            download_filename=download_filename,
        )

    async def copy_object(self, source_object_name: str, dest_object_name: str) -> None:
        self.bucket.copy_blob(self.bucket.blob(source_object_name), self.bucket, dest_object_name)

    async def download_file(self, object_name: str, local_path: str) -> None:
        self.bucket.blob(object_name).download_to_filename(local_path)

    async def upload_file(self, local_path: str, object_name: str) -> None:
        self.bucket.blob(object_name).upload_from_filename(local_path)

    async def upload_file_content(self, content: bytes, object_name: str) -> None:
        self.bucket.blob(object_name).upload_from_string(content)

    async def delete_file(self, object_name: str) -> None:
        self.bucket.blob(object_name).delete()

    async def list_objects(self, prefix: str) -> list[dict]:
        return [{"name": blob.name, "updated": blob.updated or blob.time_created} for blob in self.bucket.list_blobs(prefix)]

    def upload_temp_file(self, content: bytes, original_filename: str, user_id: str | None = None) -> str:
        file_id = str(uuid.uuid4())
        timestamp = int(time.time())
        owner = user_id or "anonymous"
        name = f"{self.temp_folder_prefix}/{owner}/{timestamp}_{file_id}_{os.path.basename(original_filename)}"
        blob = self.bucket.blob(name)
        blob.upload_from_string(content)
        blob.metadata = {
            "file_id": file_id,
            "original_filename": original_filename,
            "upload_time": str(timestamp),
            "size_bytes": str(len(content)),
            "user_id": owner,
        }
        blob.patch()
        return file_id

    def _temp_blob(self, file_id: str, user_id: str | None = None) -> LocalBlob | None:
        for blob in self.bucket.list_blobs(f"{self.temp_folder_prefix}/"):
            metadata = blob.metadata or {}
            if metadata.get("file_id") == file_id and (not user_id or metadata.get("user_id") == user_id):
                return blob
        return None

    def download_temp_file(self, file_id: str, user_id: str | None = None) -> bytes | None:
        blob = self._temp_blob(file_id, user_id)
        return blob.download_as_bytes() if blob else None

    def get_temp_file_info(self, file_id: str) -> dict | None:
        blob = self._temp_blob(file_id)
        if not blob:
            return None
        metadata = blob.metadata or {}
        return {
            "file_id": file_id,
            "original_filename": metadata.get("original_filename"),
            "size_bytes": int(metadata.get("size_bytes", blob.size or 0)),
            "upload_time": float(metadata.get("upload_time", 0)),
            "blob_name": blob.name,
        }

    def delete_temp_file(self, file_id: str, user_id: str | None = None) -> bool:
        blob = self._temp_blob(file_id, user_id)
        if not blob:
            return False
        blob.delete()
        return True

    def cleanup_old_files(self, max_age_hours: int = 24) -> int:
        cutoff = time.time() - max_age_hours * 3600
        deleted = 0
        for blob in list(self.bucket.list_blobs(f"{self.temp_folder_prefix}/")):
            metadata = blob.metadata or {}
            if float(metadata.get("upload_time", 0)) < cutoff:
                blob.delete()
                deleted += 1
        return deleted

    def delete_user_files(self, user_id: str) -> bool:
        for blob in list(self.bucket.list_blobs()):
            metadata = blob.metadata or {}
            if metadata.get("user_id") == user_id or f"/{user_id}/" in f"/{blob.name}/":
                blob.delete()
        return True

