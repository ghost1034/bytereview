"""Security primitives shared by hosted-Claw HTTP and worker paths."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional


class HostedClawUnavailable(RuntimeError):
    """Raised when a mandatory hosted security dependency is unavailable."""


def hosted_enabled() -> bool:
    return os.getenv("HOSTED_CLAW_ENABLED", "false").strip().lower() in {"1", "true", "yes", "on"}


def sha256_token(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def new_secret(prefix: str = "") -> str:
    return prefix + secrets.token_urlsafe(32)


def canonical_arguments(arguments: Any) -> bytes:
    """Stable JSON representation used to bind approvals to exact arguments."""
    return json.dumps(
        arguments,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")


def approval_argument_hash(arguments: Any) -> str:
    return hashlib.sha256(canonical_arguments(arguments)).hexdigest()


def verify_slack_signature(
    raw_body: bytes,
    timestamp: Optional[str],
    signature: Optional[str],
    signing_secret: Optional[str] = None,
    *,
    now: Optional[int] = None,
) -> bool:
    """Validate Slack v0 HMAC and reject requests outside the five-minute window."""
    secret = signing_secret if signing_secret is not None else os.getenv("SLACK_SIGNING_SECRET")
    if not secret or not timestamp or not signature or not signature.startswith("v0="):
        return False
    try:
        sent_at = int(timestamp)
    except (TypeError, ValueError):
        return False
    current = int(time.time()) if now is None else int(now)
    if abs(current - sent_at) > 300:
        return False
    base = b"v0:" + timestamp.encode("ascii") + b":" + raw_body
    expected = "v0=" + hmac.new(secret.encode("utf-8"), base, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


@dataclass(frozen=True)
class EncryptedValue:
    ciphertext: bytes
    key_version: str


class KmsEnvelope:
    """Small Cloud KMS adapter. There is deliberately no plaintext fallback."""

    def __init__(self, key_name: Optional[str] = None, client: Any = None):
        self.key_name = (key_name or os.getenv("HOSTED_CLAW_KMS_KEY", "")).strip()
        self._client = client

    @property
    def client(self):
        if not self.key_name:
            raise HostedClawUnavailable("HOSTED_CLAW_KMS_KEY is not configured")
        if self._client is None:
            try:
                from google.cloud import kms

                self._client = kms.KeyManagementServiceClient()
            except Exception as exc:
                raise HostedClawUnavailable("Cloud KMS is unavailable") from exc
        return self._client

    def encrypt(self, plaintext: bytes, *, aad: bytes) -> EncryptedValue:
        try:
            response = self.client.encrypt(
                request={
                    "name": self.key_name,
                    "plaintext": plaintext,
                    "additional_authenticated_data": aad,
                }
            )
            version = getattr(response, "name", None) or self.key_name
            return EncryptedValue(bytes(response.ciphertext), str(version))
        except HostedClawUnavailable:
            raise
        except Exception as exc:
            raise HostedClawUnavailable("Cloud KMS encryption failed") from exc

    def decrypt(self, ciphertext: bytes, *, aad: bytes, key_version: Optional[str] = None) -> bytes:
        try:
            response = self.client.decrypt(
                request={
                    "name": key_version or self.key_name,
                    "ciphertext": ciphertext,
                    "additional_authenticated_data": aad,
                }
            )
            return bytes(response.plaintext)
        except HostedClawUnavailable:
            raise
        except Exception as exc:
            raise HostedClawUnavailable("Cloud KMS decryption failed") from exc


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def one_time_record_is_valid(record: Any, *, now: Optional[datetime] = None) -> bool:
    current = now or utcnow()
    return bool(record is not None and record.consumed_at is None and record.expires_at > current)
