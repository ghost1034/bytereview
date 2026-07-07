"""
AccountingClaw activation routes.

Flow:
  - POST /api/activation/activate  (Firebase-authed): user redeems the universal
    six-digit code and is issued a personal, revocable key (shown once).
  - GET  /api/activation/me        (Firebase-authed): activation status for the UI.
  - POST /api/activation/resolve   (key-authed, NOT Firebase): the AccountingClaw
    container exchanges its key for the real build-time CPAA_BUNDLE_SECRET.
  - POST /api/activation/bundle    (key-authed, NOT Firebase): the desktop installer
    exchanges its key for a short-lived signed URL to the plaintext profile bundle
    in the private GCS bucket (no client-side decryption needed).

Only a SHA-256 hash of each key is stored. ``key_lookup`` (a non-secret prefix of
the random part) gives an indexed lookup; the full key is then verified with a
constant-time hash comparison.

NOTE (temporary): valid six-digit codes are an enable/disable allowlist in the
``activation_codes`` table (managed directly via SQL), replacing the single universal
CPAA_ACTIVATION_CODE env value. The permanent design replaces this code check with a
payment check — the per-user key mechanism below stays.
"""
import hashlib
import hmac
import logging
import os
import secrets
import asyncio
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.exc import IntegrityError

from core.database import db_config
from dependencies.auth import get_current_user_id
from models.activation import (
    ActivateRequest,
    ActivateResponse,
    ActivationStatusResponse,
    BundleRequest,
    BundleResponse,
    ResolveRequest,
    ResolveResponse,
)
from models.db_models import ActivationCode, ActivationKey
from services.gcs_service import get_bundle_signed_url
from services.rate_limit import rate_limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/activation", tags=["activation"])

KEY_PREFIX = "cpaa_live_"
LOOKUP_LEN = 12


def _hash_key(full_key: str) -> str:
    return hashlib.sha256(full_key.encode("utf-8")).hexdigest()


def _generate_key() -> tuple[str, str, str, str]:
    """Return (full_key, key_lookup, key_hash, key_prefix)."""
    secret_part = secrets.token_urlsafe(32)
    full_key = KEY_PREFIX + secret_part
    key_lookup = secret_part[:LOOKUP_LEN]
    key_hash = _hash_key(full_key)
    key_prefix = f"{KEY_PREFIX}{secret_part[:4]}…"
    return full_key, key_lookup, key_hash, key_prefix


def _lookup_from_submitted(full_key: str) -> str:
    """Extract the indexed lookup handle from a submitted key (best-effort)."""
    if not full_key.startswith(KEY_PREFIX):
        return ""
    return full_key[len(KEY_PREFIX):][:LOOKUP_LEN]


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _validate_key(db, submitted_key: str, ip: str) -> ActivationKey:
    """Return the active ActivationKey row for a submitted key, or raise.

    Shared by /resolve and /bundle. Performs the indexed lookup plus a
    constant-time hash comparison, with a per-key rate limit. Raises a generic
    401 for unknown, revoked, or mismatched keys so the endpoints do not reveal
    which keys exist. Callers handle their own per-IP rate limiting.
    """
    lookup = _lookup_from_submitted(submitted_key)
    if not lookup:
        raise HTTPException(status_code=401, detail="Invalid or inactive activation key.")

    if not rate_limiter.check("resolve_key", lookup, limit=10, window_seconds=60):
        raise HTTPException(status_code=429, detail="Too many requests.")

    row = (
        db.query(ActivationKey)
        .filter(ActivationKey.key_lookup == lookup, ActivationKey.revoked_at.is_(None))
        .first()
    )
    if not row or not hmac.compare_digest(row.key_hash, _hash_key(submitted_key)):
        logger.info("Key rejected key_lookup=%s ip=%s", lookup, ip)
        raise HTTPException(status_code=401, detail="Invalid or inactive activation key.")
    return row


def _stamp_resolution(row: ActivationKey, fingerprint: Optional[str], install_type: Optional[str], default_type: str) -> None:
    """Record a successful key exchange on the ActivationKey row (not committed)."""
    row.last_resolved_at = datetime.now(timezone.utc)
    row.last_resolved_fingerprint = fingerprint
    row.last_resolved_install_type = install_type or default_type
    row.resolve_count = (row.resolve_count or 0) + 1


@router.post("/activate", response_model=ActivateResponse)
async def activate(req: ActivateRequest, user_id: str = Depends(get_current_user_id)):
    """Redeem an active six-digit code and mint (or return) the user's key."""
    if not rate_limiter.check("activate", user_id, limit=10, window_seconds=900):
        raise HTTPException(status_code=429, detail="Too many activation attempts. Try again later.")

    db = db_config.get_session()
    try:
        code_row = (
            db.query(ActivationCode)
            .filter(ActivationCode.code == req.code, ActivationCode.active.is_(True))
            .first()
        )
        if code_row is None:
            logger.info("Activation code rejected for user_id=%s", user_id)
            raise HTTPException(status_code=403, detail="Invalid activation code.")

        existing = (
            db.query(ActivationKey)
            .filter(ActivationKey.user_id == user_id, ActivationKey.revoked_at.is_(None))
            .first()
        )
        if existing:
            return ActivateResponse(
                success=True,
                message="You already have an active activation key.",
                activation_key=None,
                key_prefix=existing.key_prefix,
                already_active=True,
                created_at=existing.created_at,
            )

        full_key, key_lookup, key_hash, key_prefix = _generate_key()
        record = ActivationKey(
            user_id=user_id,
            key_lookup=key_lookup,
            key_hash=key_hash,
            key_prefix=key_prefix,
        )
        db.add(record)
        try:
            db.commit()
        except IntegrityError:
            # Race: a concurrent request minted the active key first. Return it.
            db.rollback()
            existing = (
                db.query(ActivationKey)
                .filter(ActivationKey.user_id == user_id, ActivationKey.revoked_at.is_(None))
                .first()
            )
            if not existing:
                raise
            return ActivateResponse(
                success=True,
                message="You already have an active activation key.",
                activation_key=None,
                key_prefix=existing.key_prefix,
                already_active=True,
                created_at=existing.created_at,
            )

        db.refresh(record)
        logger.info("Issued activation key key_lookup=%s for user_id=%s", key_lookup, user_id)
        return ActivateResponse(
            success=True,
            message="Activation successful. Save your key now — it will not be shown again.",
            activation_key=full_key,
            key_prefix=key_prefix,
            already_active=False,
            created_at=record.created_at,
        )
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Failed to activate for user_id=%s: %s", user_id, e)
        raise HTTPException(status_code=500, detail="Activation failed.")
    finally:
        db.close()


@router.get("/me", response_model=ActivationStatusResponse)
async def get_my_activation(user_id: str = Depends(get_current_user_id)):
    """Return the user's activation status (never the full key)."""
    db = db_config.get_session()
    try:
        active = (
            db.query(ActivationKey)
            .filter(ActivationKey.user_id == user_id, ActivationKey.revoked_at.is_(None))
            .first()
        )
        if active:
            return ActivationStatusResponse(
                success=True,
                has_key=True,
                key_prefix=active.key_prefix,
                created_at=active.created_at,
                last_resolved_at=active.last_resolved_at,
                last_resolved_install_type=active.last_resolved_install_type,
                revoked=False,
            )

        most_recent = (
            db.query(ActivationKey)
            .filter(ActivationKey.user_id == user_id)
            .order_by(ActivationKey.created_at.desc())
            .first()
        )
        if most_recent and most_recent.revoked_at is not None:
            return ActivationStatusResponse(
                success=True,
                has_key=False,
                key_prefix=most_recent.key_prefix,
                created_at=most_recent.created_at,
                last_resolved_at=most_recent.last_resolved_at,
                last_resolved_install_type=most_recent.last_resolved_install_type,
                revoked=True,
            )

        return ActivationStatusResponse(success=True, has_key=False, revoked=False)
    finally:
        db.close()


@router.post("/resolve", response_model=ResolveResponse)
async def resolve(req: ResolveRequest, request: Request):
    """Container-only: exchange a valid activation key for the bundle secret.

    Authenticated by possession of the activation key itself (NOT Firebase), then
    validated against the database. Returns a generic 401 for unknown, revoked, or
    mismatched keys so the endpoint does not reveal which keys exist.
    """
    ip = _client_ip(request)
    if not rate_limiter.check("resolve_ip", ip, limit=30, window_seconds=60):
        raise HTTPException(status_code=429, detail="Too many requests.")

    db = db_config.get_session()
    try:
        row = _validate_key(db, req.activation_key, ip)

        bundle_secret = os.getenv("CPAA_BUNDLE_SECRET")
        if not bundle_secret:
            logger.error("CPAA_BUNDLE_SECRET is not configured on the backend")
            raise HTTPException(status_code=503, detail="Activation is not currently available.")

        _stamp_resolution(row, req.fingerprint, req.install_type, default_type="docker")
        db.commit()

        logger.info("Resolved bundle for key_lookup=%s user_id=%s ip=%s", row.key_lookup, row.user_id, ip)
        return ResolveResponse(bundle_secret=bundle_secret)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Resolve failed: %s", e)
        raise HTTPException(status_code=500, detail="Activation failed.")
    finally:
        db.close()


@router.post("/bundle", response_model=BundleResponse)
async def bundle(req: BundleRequest, request: Request):
    """Desktop-installer-only: exchange a valid activation key for a signed bundle URL.

    Like /resolve, authenticated by possession of the activation key itself (NOT
    Firebase). Instead of the decryption secret, returns a short-lived signed GET
    URL to the plaintext AccountingClaw profile tarball in the private GCS bucket,
    plus its sha256 for client-side verification. Generic 401 for all key failures.
    """
    ip = _client_ip(request)
    if not rate_limiter.check("bundle_ip", ip, limit=20, window_seconds=60):
        raise HTTPException(status_code=429, detail="Too many requests.")

    db = db_config.get_session()
    try:
        row = _validate_key(db, req.activation_key, ip)

        bucket = os.getenv("CPAA_BUNDLE_GCS_BUCKET")
        obj = os.getenv("CPAA_BUNDLE_GCS_OBJECT", "accountingclaw/accountingclaw-profile.tar.gz")
        if not bucket:
            logger.error("CPAA_BUNDLE_GCS_BUCKET is not configured on the backend")
            raise HTTPException(status_code=503, detail="Activation is not currently available.")

        expiration_minutes = 15
        try:
            url, sha256, version = await asyncio.to_thread(
                get_bundle_signed_url,
                bucket,
                obj,
                expiration_minutes=expiration_minutes,
            )
        except Exception as e:
            logger.error("Failed to sign bundle URL for gs://%s/%s: %s", bucket, obj, e)
            raise HTTPException(status_code=503, detail="Activation is not currently available.")

        _stamp_resolution(row, req.fingerprint, req.install_type, default_type="desktop")
        db.commit()

        logger.info(
            "Issued bundle URL for key_lookup=%s user_id=%s ip=%s", row.key_lookup, row.user_id, ip
        )
        return BundleResponse(
            bundle_url=url,
            sha256=sha256,
            version=version,
            expires_in_seconds=expiration_minutes * 60,
        )
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Bundle failed: %s", e)
        raise HTTPException(status_code=500, detail="Activation failed.")
    finally:
        db.close()
