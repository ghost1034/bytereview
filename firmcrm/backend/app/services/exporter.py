"""CSV export. Streams rows; never loads entire tables into memory beyond a page at a time."""

from __future__ import annotations

import csv
import io
from collections.abc import Iterator

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import DomainError
from app.models import Account, Activity, Contact, Engagement, Lead, Opportunity, PracticeArea, Stage, User
from app.services import visibility

PAGE = 500

EXPORTS: dict[str, tuple[type, list[str]]] = {
    "accounts": (Account, ["id", "name", "aliases", "account_type", "entity_kind", "industry", "website", "phone", "city", "state",
                           "country", "revenue_band", "owner", "originating_partner", "client_since", "risk_rating",
                           "is_public_company", "tags", "is_archived", "created_at"]),
    "contacts": (Contact, ["id", "first_name", "last_name", "email", "phone", "title", "account", "role", "lifecycle", "owner",
                           "do_not_contact", "is_archived", "created_at"]),
    "leads": (Lead, ["id", "first_name", "last_name", "company", "email", "phone", "title", "source", "status", "practice_area",
                     "owner", "estimated_value", "score", "created_at", "converted_at"]),
    "opportunities": (Opportunity, ["id", "name", "account", "stage", "status", "practice_area", "owner", "originating_partner",
                                    "amount", "probability", "weighted", "fee_type", "is_recurring", "expected_close",
                                    "engagement_letter_status", "lost_reason", "created_at", "closed_at"]),
    "engagements": (Engagement, ["id", "name", "account", "practice_area", "status", "fee_type", "annual_value", "start_date",
                                 "end_date", "external_ref"]),
    "activities": (Activity, ["id", "kind", "subject", "owner", "account_id", "contact_id", "opportunity_id", "occurred_at",
                              "due_at", "completed_at", "priority"]),
}


def _lookups(db: Session) -> dict:
    return {
        "user": {u.id: u.full_name for u in db.scalars(select(User)).all()},
        "account": {a.id: a.name for a in db.scalars(select(Account)).all()},
        "pa": {p.id: p.name for p in db.scalars(select(PracticeArea)).all()},
        "stage": {s.id: s.name for s in db.scalars(select(Stage)).all()},
    }


def _row(entity: str, obj, lk: dict) -> dict:
    g = lambda k: getattr(obj, k, None)  # noqa: E731
    base = {c: g(c) for c in EXPORTS[entity][1]}
    base.update({k: v for k, v in {
        "owner": lk["user"].get(g("owner_id")), "originating_partner": lk["user"].get(g("originating_partner_id")),
        "account": lk["account"].get(g("account_id")), "practice_area": lk["pa"].get(g("practice_area_id")),
        "stage": lk["stage"].get(g("stage_id")),
    }.items() if k in base})
    if entity == "opportunities":
        base["weighted"] = round((g("amount") or 0) * (g("probability") or 0) / 100, 2)
    if "tags" in base and isinstance(base["tags"], list):
        base["tags"] = ";".join(base["tags"])
    return {k: ("" if v is None else v) for k, v in base.items()}


def stream(db: Session, entity: str, *, include_archived: bool, user=None) -> Iterator[str]:
    if entity not in EXPORTS:
        raise DomainError("Unknown export entity", status_code=404)
    model, cols = EXPORTS[entity]
    lk = _lookups(db)
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=cols)
    w.writeheader()
    yield buf.getvalue()
    buf.seek(0)
    buf.truncate()
    stmt = select(model).order_by(model.id)
    if not include_archived and hasattr(model, "is_archived"):
        stmt = stmt.where(model.is_archived.is_(False))
    if user is not None:
        stmt = visibility.apply(stmt, _clause_for(entity, user))
    offset = 0
    while True:
        rows = db.scalars(stmt.limit(PAGE).offset(offset)).all()
        if not rows:
            break
        for r in rows:
            w.writerow(_row(entity, r, lk))
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate()
        offset += PAGE


def _clause_for(entity: str, user):
    return {"accounts": visibility.account_clause, "contacts": visibility.contact_clause, "opportunities": visibility.opportunity_clause,
            "engagements": visibility.engagement_clause, "activities": visibility.activity_clause}.get(entity, lambda _u: None)(user)


def count(db: Session, entity: str, include_archived: bool, user=None) -> int:
    from sqlalchemy import func

    model = EXPORTS[entity][0]
    stmt = select(func.count()).select_from(model)
    if not include_archived and hasattr(model, "is_archived"):
        stmt = stmt.where(model.is_archived.is_(False))
    if user is not None:
        stmt = visibility.apply(stmt, _clause_for(entity, user))
    return db.scalar(stmt) or 0
