"""Record change events and fan out notifications to watchlist subscribers."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from taxatlas.models import ChangeEvent, Jurisdiction, Notification, User, WatchItem
from taxatlas.schemas.tax import ChangeEventOut

REDACTED_EDITOR = "admin"


def content_hash(payload: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()


def _ancestor_ids(db: Session, jurisdiction_id: int | None) -> set[int]:
    ids: set[int] = set()
    cur = db.get(Jurisdiction, jurisdiction_id) if jurisdiction_id else None
    while cur is not None:
        ids.add(cur.id)
        cur = db.get(Jurisdiction, cur.parent_id) if cur.parent_id else None
    return ids


def record_change(
    db: Session,
    *,
    entity_type: str,
    entity_id: int,
    change_type: str,
    title: str,
    jurisdiction_id: int | None = None,
    tax_type: str | None = None,
    old_value: dict | None = None,
    new_value: dict | None = None,
    source_id: int | None = None,
    crawl_run_id: int | None = None,
    notify: bool = True,
    tax_types: list[str] | None = None,
    title_en: str | None = None,
) -> ChangeEvent:
    """Record a change event and fan out notifications.

    `tax_type` is stored on the event; `tax_types` (e.g. a court decision tagged with several taxes) widens the
    watchlist match so a watch on any of them fires. `title_en` mirrors the entity's English rendering when the title
    is not English (docs/translation.md); None for English titles.
    """
    ev = ChangeEvent(
        entity_type=entity_type,
        entity_id=entity_id,
        change_type=change_type,
        title=title[:500],
        title_en=title_en[:2000] if title_en else None,
        jurisdiction_id=jurisdiction_id,
        tax_type=tax_type,
        old_value=old_value,
        new_value=new_value,
        source_id=source_id,
        crawl_run_id=crawl_run_id,
    )
    db.add(ev)
    db.flush()
    if notify:
        fan_out_notifications(db, ev, tax_types=tax_types)
    return ev


def redact_meta(value: dict | None, *, admin: bool) -> dict | None:
    """Hide the editing admin's e-mail (new_value._meta.edited_by) from non-admin principals."""
    if admin or not isinstance(value, dict):
        return value
    meta = value.get("_meta")
    if isinstance(meta, dict) and meta.get("edited_by"):
        return {**value, "_meta": {**meta, "edited_by": REDACTED_EDITOR}}
    return value


def change_event_out(ev: ChangeEvent, *, admin: bool) -> ChangeEventOut:
    """Serialise a change event for a principal, redacting editor identity unless the principal is an admin."""
    out = ChangeEventOut.model_validate(ev)
    out.old_value = redact_meta(out.old_value, admin=admin)
    out.new_value = redact_meta(out.new_value, admin=admin)
    return out


def fan_out_notifications(db: Session, ev: ChangeEvent, tax_types: list[str] | None = None) -> int:
    """Create one Notification per user whose watchlist matches this event (any of its tax types)."""
    jur_ids = _ancestor_ids(db, ev.jurisdiction_id)
    conds = [WatchItem.jurisdiction_id.is_(None)]
    if ev.jurisdiction_id is not None:
        conds.append(WatchItem.jurisdiction_id == ev.jurisdiction_id)
    parents = jur_ids - ({ev.jurisdiction_id} if ev.jurisdiction_id else set())
    if parents:
        conds.append((WatchItem.jurisdiction_id.in_(parents)) & (WatchItem.include_children.is_(True)))
    # Deactivated accounts must not accumulate notifications (their delivery channels would keep firing).
    q = select(WatchItem).join(User, User.id == WatchItem.user_id).where(or_(*conds))
    types = {str(t) for t in (tax_types or []) if t} | ({ev.tax_type} if ev.tax_type else set())
    if types:
        q = q.where(or_(WatchItem.tax_type.is_(None), WatchItem.tax_type.in_(sorted(types))))
    else:
        q = q.where(WatchItem.tax_type.is_(None))
    users = {w.user_id for w in db.scalars(q)}
    for uid in users:
        db.add(Notification(user_id=uid, change_event_id=ev.id))
    return len(users)
