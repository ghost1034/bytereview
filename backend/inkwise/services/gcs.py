"""GCS signed URL helpers for the Inkwise module."""

from __future__ import annotations

import os
import urllib.request
from datetime import timedelta

import google.auth
from google.auth import impersonated_credentials
from google.auth.transport.requests import Request as AuthRequest
from google.cloud import storage


class InkwiseGcsError(RuntimeError):
    pass


def _metadata_service_account_email() -> str | None:
    url = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email"
    try:
        req = urllib.request.Request(url, headers={"Metadata-Flavor": "Google"})
        with urllib.request.urlopen(req, timeout=2) as resp:
            return resp.read().decode("utf-8").strip() or None
    except Exception:
        return None


def _resolve_signing_service_account_email(source_creds: object) -> str | None:
    target = os.getenv("GCP_SIGNING_SERVICE_ACCOUNT_EMAIL") or os.getenv("INKWISE_GCP_SIGNING_SERVICE_ACCOUNT_EMAIL")
    if target and "@" in target:
        return target

    email = getattr(source_creds, "service_account_email", None)
    if isinstance(email, str) and email and email != "default" and "@" in email:
        return email

    meta_email = _metadata_service_account_email()
    if meta_email and "@" in meta_email:
        return meta_email

    return email if isinstance(email, str) and "@" in email else None


def _default_credentials():
    return google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])


def _ensure_access_token(creds: object) -> str:
    token = getattr(creds, "token", None)
    valid = bool(getattr(creds, "valid", False))
    if not token or not valid:
        creds.refresh(AuthRequest())  # type: ignore[attr-defined]
        token = getattr(creds, "token", None)
    if not token:
        raise InkwiseGcsError("no access token available for signing")
    return str(token)


def storage_client() -> storage.Client:
    return storage.Client()


def generate_signed_upload_url(
    *,
    bucket: str,
    object_name: str,
    content_type: str,
    expires_in_seconds: int = 15 * 60,
) -> tuple[str, dict[str, str]]:
    try:
        client = storage_client()
        blob = client.bucket(bucket).blob(object_name)
        source_creds, _ = _default_credentials()
        signing_email = _resolve_signing_service_account_email(source_creds)

        try:
            if hasattr(source_creds, "sign_bytes"):
                url = blob.generate_signed_url(
                    version="v4",
                    expiration=timedelta(seconds=expires_in_seconds),
                    method="PUT",
                    content_type=content_type,
                    credentials=source_creds,
                )
                return url, {"Content-Type": content_type}
        except Exception:
            pass

        if not signing_email:
            raise InkwiseGcsError("no service account email available for IAM signing")

        token = _ensure_access_token(source_creds)
        try:
            url = blob.generate_signed_url(
                version="v4",
                expiration=timedelta(seconds=expires_in_seconds),
                method="PUT",
                content_type=content_type,
                service_account_email=signing_email,
                access_token=token,
            )
            return url, {"Content-Type": content_type}
        except TypeError:
            pass

        imp = impersonated_credentials.Credentials(
            source_credentials=source_creds,
            target_principal=signing_email,
            target_scopes=["https://www.googleapis.com/auth/devstorage.read_write"],
            lifetime=3600,
        )
        url = blob.generate_signed_url(
            version="v4",
            expiration=timedelta(seconds=expires_in_seconds),
            method="PUT",
            content_type=content_type,
            credentials=imp,
        )
        return url, {"Content-Type": content_type}
    except Exception as exc:
        raise InkwiseGcsError("failed to generate signed upload url") from exc


def generate_signed_download_url(
    *,
    bucket: str,
    object_name: str,
    expires_in_seconds: int = 15 * 60,
    disposition_filename: str | None = None,
    inline: bool = False,
) -> str:
    try:
        client = storage_client()
        blob = client.bucket(bucket).blob(object_name)
        source_creds, _ = _default_credentials()
        signing_email = _resolve_signing_service_account_email(source_creds)

        response_disposition = None
        if disposition_filename:
            disposition_type = "inline" if inline else "attachment"
            response_disposition = f'{disposition_type}; filename="{disposition_filename}"'

        try:
            if hasattr(source_creds, "sign_bytes"):
                return blob.generate_signed_url(
                    version="v4",
                    expiration=timedelta(seconds=expires_in_seconds),
                    method="GET",
                    credentials=source_creds,
                    response_disposition=response_disposition,
                )
        except Exception:
            pass

        if not signing_email:
            raise InkwiseGcsError("no service account email available for IAM signing")

        token = _ensure_access_token(source_creds)
        try:
            return blob.generate_signed_url(
                version="v4",
                expiration=timedelta(seconds=expires_in_seconds),
                method="GET",
                service_account_email=signing_email,
                access_token=token,
                response_disposition=response_disposition,
            )
        except TypeError:
            pass

        imp = impersonated_credentials.Credentials(
            source_credentials=source_creds,
            target_principal=signing_email,
            target_scopes=["https://www.googleapis.com/auth/devstorage.read_write"],
            lifetime=3600,
        )
        return blob.generate_signed_url(
            version="v4",
            expiration=timedelta(seconds=expires_in_seconds),
            method="GET",
            credentials=imp,
            response_disposition=response_disposition,
        )
    except Exception as exc:
        raise InkwiseGcsError("failed to generate signed download url") from exc
