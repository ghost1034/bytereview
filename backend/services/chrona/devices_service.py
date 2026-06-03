"""Chrona device pairing, token minting, device CRUD, and card ingestion.

Token scheme mirrors ActivationKey (see routes/activation.py): the full token
``chrona_dev_<token_urlsafe(32)>`` is returned exactly once at pairing time;
only a SHA-256 hash is stored, with ``token_lookup`` (non-secret prefix of the
random part) for an indexed lookup and ``token_prefix`` as a masked display
value.
"""

from __future__ import annotations

import hashlib
import logging
import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from models.chrona import SyncCard
from models.db_models import ChronaDevice, ChronaPairingCode, ChronaTimelineCard

logger = logging.getLogger(__name__)

TOKEN_PREFIX = "chrona_dev_"
LOOKUP_LEN = 12

PAIRING_CODE_LEN = 8
PAIRING_CODE_TTL = timedelta(minutes=15)
# Uppercase + digits minus ambiguous characters (0/O, 1/I/L) — codes are typed by hand.
_PAIRING_ALPHABET = "".join(
    c for c in string.ascii_uppercase + string.digits if c not in "0O1IL"
)


# ---------------------------------------------------------------------------
# Token helpers (shared with dependencies/chrona_device_auth.py)
# ---------------------------------------------------------------------------

def hash_token(full_token: str) -> str:
    return hashlib.sha256(full_token.encode("utf-8")).hexdigest()


def generate_token() -> Tuple[str, str, str, str]:
    """Return (full_token, token_lookup, token_hash, token_prefix)."""
    secret_part = secrets.token_urlsafe(32)
    full_token = TOKEN_PREFIX + secret_part
    token_lookup = secret_part[:LOOKUP_LEN]
    token_hash = hash_token(full_token)
    token_prefix = f"{TOKEN_PREFIX}{secret_part[:4]}…"
    return full_token, token_lookup, token_hash, token_prefix


def lookup_from_submitted(full_token: str) -> str:
    """Extract the indexed lookup handle from a submitted token (best-effort)."""
    if not full_token.startswith(TOKEN_PREFIX):
        return ""
    return full_token[len(TOKEN_PREFIX):][:LOOKUP_LEN]


# ---------------------------------------------------------------------------
# Pairing codes (manager-facing)
# ---------------------------------------------------------------------------

def _generate_pairing_code_value() -> str:
    return "".join(secrets.choice(_PAIRING_ALPHABET) for _ in range(PAIRING_CODE_LEN))


def mint_pairing_code(
    db: Session, firm_id, *, created_by_user_id: str, display_name: str
) -> ChronaPairingCode:
    """Create a short-lived single-use pairing code with collision retry."""
    trimmed = (display_name or "").strip()
    if not trimmed:
        raise HTTPException(status_code=400, detail="Device name is required")

    for _ in range(10):
        code = _generate_pairing_code_value()
        existing = db.query(ChronaPairingCode).filter(ChronaPairingCode.code == code).first()
        if existing is None:
            row = ChronaPairingCode(
                code=code,
                firm_id=firm_id,
                created_by_user_id=created_by_user_id,
                display_name=trimmed,
                expires_at=datetime.now(timezone.utc) + PAIRING_CODE_TTL,
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            return row

    raise HTTPException(status_code=500, detail="Failed to generate a unique pairing code")


def list_active_pairing_codes(db: Session, firm_id) -> List[ChronaPairingCode]:
    """Unconsumed, unexpired codes for this firm."""
    now = datetime.now(timezone.utc)
    return (
        db.query(ChronaPairingCode)
        .filter(
            ChronaPairingCode.firm_id == firm_id,
            ChronaPairingCode.consumed_at.is_(None),
            ChronaPairingCode.expires_at > now,
        )
        .order_by(ChronaPairingCode.created_at.desc())
        .all()
    )


def consume_pairing_code(
    db: Session,
    raw_code: str,
    *,
    platform: Optional[str],
    app_version: Optional[str],
) -> Tuple[ChronaDevice, str]:
    """Redeem a pairing code: create the device, mint its token, mark the code consumed.

    Returns (device, full_token). The full token is never stored — only its hash.
    """
    code = (raw_code or "").strip().upper()
    row = db.query(ChronaPairingCode).filter(ChronaPairingCode.code == code).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Invalid pairing code")
    if row.consumed_at is not None:
        raise HTTPException(status_code=409, detail="Pairing code already used")
    if row.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=404, detail="Invalid pairing code")

    full_token, token_lookup, token_hash, token_prefix = generate_token()
    device = ChronaDevice(
        firm_id=row.firm_id,
        paired_by_user_id=row.created_by_user_id,
        display_name=row.display_name,
        token_lookup=token_lookup,
        token_hash=token_hash,
        token_prefix=token_prefix,
        platform=platform,
        app_version=app_version,
    )
    db.add(device)
    db.flush()

    row.consumed_at = datetime.now(timezone.utc)
    row.consumed_device_id = device.id
    db.commit()
    db.refresh(device)
    logger.info(
        "Paired Chrona device id=%s firm_id=%s token_lookup=%s",
        device.id, device.firm_id, token_lookup,
    )
    return device, full_token


# ---------------------------------------------------------------------------
# Device CRUD (manager-facing)
# ---------------------------------------------------------------------------

def list_devices(db: Session, firm_id) -> List[ChronaDevice]:
    return (
        db.query(ChronaDevice)
        .filter(ChronaDevice.firm_id == firm_id)
        .order_by(ChronaDevice.created_at.asc())
        .all()
    )


def _get_firm_device(db: Session, firm_id, device_id: str) -> ChronaDevice:
    device = db.query(ChronaDevice).filter(ChronaDevice.id == device_id).first()
    if device is None or device.firm_id != firm_id:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


def rename_device(db: Session, firm_id, device_id: str, display_name: str) -> ChronaDevice:
    trimmed = (display_name or "").strip()
    if not trimmed:
        raise HTTPException(status_code=400, detail="Device name is required")
    device = _get_firm_device(db, firm_id, device_id)
    device.display_name = trimmed
    db.commit()
    db.refresh(device)
    return device


def revoke_device(db: Session, firm_id, device_id: str, *, purge: bool = False) -> None:
    """Revoke a device's token immediately; optionally delete its synced cards."""
    device = _get_firm_device(db, firm_id, device_id)
    if device.revoked_at is None:
        device.revoked_at = datetime.now(timezone.utc)
    if purge:
        db.query(ChronaTimelineCard).filter(
            ChronaTimelineCard.device_id == device.id
        ).delete(synchronize_session=False)
    db.commit()
    logger.info("Revoked Chrona device id=%s firm_id=%s purge=%s", device_id, firm_id, purge)


# ---------------------------------------------------------------------------
# Card ingestion (device-facing)
# ---------------------------------------------------------------------------

def upsert_cards(
    db: Session,
    device: ChronaDevice,
    *,
    cards: List[SyncCard],
    deleted_source_card_ids: List[int],
) -> Tuple[int, int]:
    """Idempotently ingest a batch of cards for a device.

    UPSERTs on (device_id, source_card_id); rows whose stored ``content_hash``
    and ``is_deleted`` already match are skipped so re-sent batches are no-ops.
    Returns (accepted, skipped_unchanged).
    """
    now = datetime.now(timezone.utc)
    accepted = 0
    skipped = 0

    incoming_ids = [c.source_card_id for c in cards] + list(deleted_source_card_ids)
    existing = {}
    if incoming_ids:
        rows = (
            db.query(
                ChronaTimelineCard.source_card_id,
                ChronaTimelineCard.content_hash,
                ChronaTimelineCard.is_deleted,
            )
            .filter(
                ChronaTimelineCard.device_id == device.id,
                ChronaTimelineCard.source_card_id.in_(incoming_ids),
            )
            .all()
        )
        existing = {r.source_card_id: (r.content_hash, r.is_deleted) for r in rows}

    for card in cards:
        prior = existing.get(card.source_card_id)
        if prior is not None and prior[0] == card.content_hash and prior[1] == card.is_deleted:
            skipped += 1
            continue

        values = {
            "device_id": device.id,
            "firm_id": device.firm_id,
            "source_card_id": card.source_card_id,
            "content_hash": card.content_hash,
            "title": card.title,
            "summary": card.summary,
            "detailed_summary": card.detailed_summary,
            "category": card.category,
            "subcategory": card.subcategory,
            "start_ts": card.start_ts,
            "end_ts": card.end_ts,
            "day_key": card.day_key,
            "is_deleted": card.is_deleted,
            "source_created_at": card.source_created_at,
            "synced_at": now,
        }
        # `id` is omitted — the column's Python-side uuid4 default applies on insert.
        stmt = pg_insert(ChronaTimelineCard).values(**values)
        update_cols = {k: v for k, v in values.items() if k not in ("device_id", "firm_id", "source_card_id")}
        stmt = stmt.on_conflict_do_update(
            index_elements=["device_id", "source_card_id"],
            set_=update_cols,
        )
        db.execute(stmt)
        accepted += 1

    if deleted_source_card_ids:
        flipped = (
            db.query(ChronaTimelineCard)
            .filter(
                ChronaTimelineCard.device_id == device.id,
                ChronaTimelineCard.source_card_id.in_(deleted_source_card_ids),
                ChronaTimelineCard.is_deleted.is_(False),
            )
            .update(
                {"is_deleted": True, "synced_at": now},
                synchronize_session=False,
            )
        )
        accepted += flipped
        skipped += len(set(deleted_source_card_ids)) - flipped

    device.last_seen_at = now
    device.last_sync_at = now
    device.sync_count = (device.sync_count or 0) + 1
    db.commit()
    return accepted, skipped
