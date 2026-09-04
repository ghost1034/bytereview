from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.common import (
    SortDir,
    apply_sort,
    apply_updates,
    archive,
    assert_practice_area_active,
    get_or_404,
    paginate,
    practice_area_names,
    restore,
    user_names,
)
from app.core.audit import record
from app.core.db import get_db
from app.core.deps import at_least, get_current_user, require_role
from app.core.errors import DomainError
from app.enums import LEAD_STATUSES_ALL, LeadSource
from app.models import Lead, User
from app.schemas import LeadConvertIn, LeadConvertOut, LeadCreate, LeadOut, LeadUpdate, Page
from app.services import leads as lead_svc

router = APIRouter(prefix="/leads", tags=["leads"])


def _enrich(db: Session, rows: list[Lead]) -> list[LeadOut]:
    un = user_names(db, [l.owner_id for l in rows])
    pn = practice_area_names(db, [l.practice_area_id for l in rows])
    out = []
    for l in rows:
        o = LeadOut.model_validate(l)
        o.owner_name = un.get(l.owner_id)
        o.practice_area_name = pn.get(l.practice_area_id)
        out.append(o)
    return out


@router.get("", response_model=Page[LeadOut])
def list_leads(q: str | None = Query(None, max_length=200), status: str | None = Query(None, max_length=20),
               source: LeadSource | None = None, owner_id: int | None = None, include_converted: bool = False,
               include_archived: bool = False, sort: str | None = Query(None, max_length=40), dir: SortDir = "asc",
               limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0),
               db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    if status and status not in LEAD_STATUSES_ALL:
        raise DomainError(f"status must be one of {list(LEAD_STATUSES_ALL)}", code="validation_error", status_code=422)
    stmt = select(Lead)
    if not include_archived:
        stmt = stmt.where(Lead.is_archived.is_(False))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Lead.first_name.ilike(like), Lead.last_name.ilike(like), Lead.company.ilike(like), Lead.email.ilike(like)))
    if status:
        stmt = stmt.where(Lead.status == status)
    elif not include_converted:
        stmt = stmt.where(Lead.status != "converted")
    if source:
        stmt = stmt.where(Lead.source == source)
    if owner_id:
        stmt = stmt.where(Lead.owner_id == owner_id)
    stmt = apply_sort(stmt, sort, dir, {"last_name": Lead.last_name, "company": Lead.company, "status": Lead.status, "source": Lead.source,
                                        "score": Lead.score, "estimated_value": Lead.estimated_value, "created_at": Lead.created_at},
                      [Lead.score.desc(), Lead.created_at.desc()])
    rows, total = paginate(db, stmt, limit, offset)
    return Page(items=_enrich(db, rows), total=total, limit=limit, offset=offset)


@router.post("", response_model=LeadOut, status_code=201)
def create_lead(body: LeadCreate, db: Session = Depends(get_db), actor: User = Depends(get_current_user)):
    assert_practice_area_active(db, body.practice_area_id)
    l = Lead(**body.model_dump())
    if l.email:
        l.email = l.email.strip().lower()
    if l.owner_id is None:
        l.owner_id = actor.id
    db.add(l)
    db.flush()
    record(db, actor_id=actor.id, action="lead.create", entity_type="lead", entity_id=l.id, after=body.model_dump())
    db.commit()
    return _enrich(db, [l])[0]


@router.get("/{lead_id}", response_model=LeadOut)
def get_lead(lead_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return _enrich(db, [get_or_404(db, Lead, lead_id)])[0]


@router.patch("/{lead_id}", response_model=LeadOut)
def update_lead(lead_id: int, body: LeadUpdate, db: Session = Depends(get_db), actor: User = Depends(get_current_user)):
    l = get_or_404(db, Lead, lead_id)
    if l.status == "converted":
        raise DomainError("Converted leads are read-only", code="converted")
    data = body.model_dump(exclude_unset=True)
    if data.get("status") == "unqualified" and not (data.get("unqualified_reason") or l.unqualified_reason):
        raise DomainError("unqualified_reason is required", code="unqualified_reason")
    before = apply_updates(l, data)
    if before:
        record(db, actor_id=actor.id, action="lead.update", entity_type="lead", entity_id=l.id, before=before,
               after={k: data[k] for k in before})
    db.commit()
    return _enrich(db, [l])[0]


@router.post("/{lead_id}/convert", response_model=LeadConvertOut)
def convert_lead(lead_id: int, body: LeadConvertIn, db: Session = Depends(get_db), actor: User = Depends(get_current_user)):
    l = get_or_404(db, Lead, lead_id)
    account, contact, opp = lead_svc.convert(db, l, body, actor)
    db.commit()
    return LeadConvertOut(account_id=account.id, contact_id=contact.id, opportunity_id=opp.id if opp else None)


@router.post("/{lead_id}/archive", response_model=LeadOut)
def archive_lead(lead_id: int, db: Session = Depends(get_db), actor: User = Depends(at_least("manager"))):
    l = get_or_404(db, Lead, lead_id)
    archive(db, l, actor.id, "lead")
    db.commit()
    return _enrich(db, [l])[0]


@router.post("/{lead_id}/restore", response_model=LeadOut)
def restore_lead(lead_id: int, db: Session = Depends(get_db), actor: User = Depends(at_least("manager"))):
    l = get_or_404(db, Lead, lead_id)
    restore(db, l, actor.id, "lead")
    db.commit()
    return _enrich(db, [l])[0]


@router.delete("/{lead_id}", status_code=204)
def purge_lead(lead_id: int, db: Session = Depends(get_db), actor: User = Depends(require_role("admin"))):
    l = get_or_404(db, Lead, lead_id)
    if l.status == "converted":
        raise DomainError("Converted leads cannot be deleted", code="converted")
    record(db, actor_id=actor.id, action="lead.purge", entity_type="lead", entity_id=l.id, before={"name": f"{l.first_name} {l.last_name}"})
    db.delete(l)
    db.commit()
