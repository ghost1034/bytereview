"""Shared helpers for routers: lookups, name enrichment, pagination."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import record
from app.core.errors import DomainError, NotFound
from app.models import Account, Contact, Lead, Opportunity, PracticeArea, Stage, User, utcnow


def get_or_404(db: Session, model, id_: int, label: str | None = None):
    obj = db.get(model, id_)
    if not obj:
        raise NotFound(f"{label or model.__name__} {id_} not found")
    return obj


def name_map(db: Session, model, ids: Iterable[int | None], attr: str = "name") -> dict[int, str]:
    ids = {i for i in ids if i is not None}
    if not ids:
        return {}
    rows = db.scalars(select(model).where(model.id.in_(ids))).all()
    return {r.id: getattr(r, attr) for r in rows}


def user_names(db: Session, ids: Iterable[int | None]) -> dict[int, str]:
    return name_map(db, User, ids, "full_name")


def account_names(db: Session, ids: Iterable[int | None]) -> dict[int, str]:
    return name_map(db, Account, ids)


def contact_names(db: Session, ids: Iterable[int | None]) -> dict[int, str]:
    ids = {i for i in ids if i is not None}
    if not ids:
        return {}
    return {c.id: c.full_name for c in db.scalars(select(Contact).where(Contact.id.in_(ids))).all()}


def opportunity_names(db: Session, ids: Iterable[int | None]) -> dict[int, str]:
    return name_map(db, Opportunity, ids)


def lead_names(db: Session, ids: Iterable[int | None]) -> dict[int, str]:
    ids = {i for i in ids if i is not None}
    if not ids:
        return {}
    return {l.id: f"{l.first_name} {l.last_name}" for l in db.scalars(select(Lead).where(Lead.id.in_(ids))).all()}


def practice_area_names(db: Session, ids: Iterable[int | None]) -> dict[int, str]:
    return name_map(db, PracticeArea, ids)


def stage_map(db: Session) -> dict[int, Stage]:
    return {s.id: s for s in db.scalars(select(Stage)).all()}


def paginate(db: Session, stmt, limit: int, offset: int) -> tuple[list, int]:
    """Return (rows, total) for a select() statement."""
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.limit(limit).offset(offset)).all()
    return rows, total


def archive(db: Session, obj, actor_id: int, entity_type: str) -> None:
    if obj.is_archived:
        raise DomainError(f"{entity_type} is already archived", code="already_archived")
    obj.is_archived = True
    obj.archived_at = utcnow()
    record(db, actor_id=actor_id, action=f"{entity_type}.archive", entity_type=entity_type, entity_id=obj.id)


def restore(db: Session, obj, actor_id: int, entity_type: str) -> None:
    if not obj.is_archived:
        raise DomainError(f"{entity_type} is not archived", code="not_archived")
    obj.is_archived = False
    obj.archived_at = None
    record(db, actor_id=actor_id, action=f"{entity_type}.restore", entity_type=entity_type, entity_id=obj.id)


def assert_practice_area_active(db: Session, pa_id: int | None) -> None:
    if pa_id is None:
        return
    pa = db.get(PracticeArea, pa_id)
    if not pa:
        raise NotFound("Practice area not found")
    if not pa.is_active:
        raise DomainError(f"Practice area '{pa.name}' is inactive and cannot be used on new records", code="inactive_practice_area")


SortDir = Literal["asc", "desc"]


def apply_sort(stmt, sort: str | None, direction: str, allowed: dict, default):
    """Server-side ordering. `allowed` maps API field -> SQLAlchemy expression; unknown fields are a 422."""
    if not sort:
        return stmt.order_by(*default) if isinstance(default, (list, tuple)) else stmt.order_by(default)
    if sort not in allowed:
        raise DomainError(f"sort must be one of {sorted(allowed)}", code="validation_error", status_code=422)
    expr = allowed[sort]
    ordered = expr.desc().nulls_last() if direction == "desc" else expr.asc().nulls_first()
    return stmt.order_by(ordered, *([default] if not isinstance(default, (list, tuple)) else default))


def apply_updates(obj, data: dict) -> dict:
    """Apply a partial update; return the before-image of changed fields."""
    before = {}
    for k, v in data.items():
        if getattr(obj, k) != v:
            before[k] = getattr(obj, k)
            setattr(obj, k, v)
    return before
