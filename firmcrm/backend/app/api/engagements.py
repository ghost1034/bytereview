from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.common import (
    SortDir,
    account_names,
    apply_sort,
    apply_updates,
    get_or_404,
    paginate,
    practice_area_names,
    user_names,
)
from app.core.audit import record
from app.core.db import get_db
from app.core.deps import at_least, get_current_user
from app.core.errors import NotFound
from app.enums import EngagementStatus
from app.models import Account, Engagement, Opportunity, User
from app.schemas import EngagementCreate, EngagementOut, EngagementUpdate, Page
from app.services import visibility

router = APIRouter(prefix="/engagements", tags=["engagements"])


def _enrich(db: Session, rows: list[Engagement]) -> list[EngagementOut]:
    an = account_names(db, [e.account_id for e in rows])
    pn = practice_area_names(db, [e.practice_area_id for e in rows])
    un = user_names(db, [e.responsible_partner_id for e in rows])
    out = []
    for e in rows:
        d = EngagementOut.model_validate(e)
        d.account_name, d.practice_area_name, d.responsible_partner_name = an.get(e.account_id), pn.get(e.practice_area_id), un.get(e.responsible_partner_id)
        out.append(d)
    return out


@router.get("", response_model=Page[EngagementOut])
def list_engagements(account_id: int | None = None, status: EngagementStatus | None = None,
                     sort: str | None = Query(None, max_length=40), dir: SortDir = "asc",
                     limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0), db: Session = Depends(get_db),
                     _: User = Depends(get_current_user)):
    stmt = visibility.apply(select(Engagement), visibility.engagement_clause(_))
    if account_id:
        stmt = stmt.where(Engagement.account_id == account_id)
    if status:
        stmt = stmt.where(Engagement.status == status)
    stmt = apply_sort(stmt, sort, dir, {"name": Engagement.name, "status": Engagement.status, "annual_value": Engagement.annual_value,
                                        "start_date": Engagement.start_date}, [Engagement.start_date.desc(), Engagement.id.desc()])
    rows, total = paginate(db, stmt, limit, offset)
    return Page(items=_enrich(db, rows), total=total, limit=limit, offset=offset)


@router.post("", response_model=EngagementOut, status_code=201)
def create_engagement(body: EngagementCreate, db: Session = Depends(get_db), actor: User = Depends(at_least("manager"))):
    get_or_404(db, Account, body.account_id, "Account")
    visibility.assert_account_visible(db, actor, body.account_id)
    e = Engagement(**body.model_dump())
    db.add(e)
    db.flush()
    record(db, actor_id=actor.id, action="engagement.create", entity_type="engagement", entity_id=e.id, after=body.model_dump())
    db.commit()
    return _enrich(db, [e])[0]


@router.patch("/{eng_id}", response_model=EngagementOut)
def update_engagement(eng_id: int, body: EngagementUpdate, db: Session = Depends(get_db), actor: User = Depends(at_least("manager"))):
    e = get_or_404(db, Engagement, eng_id)
    visibility.assert_account_visible(db, actor, e.account_id)
    if e.opportunity_id and not visibility.can_see_opportunity(db, actor, db.get(Opportunity, e.opportunity_id)):
        raise NotFound("Engagement not found")
    data = body.model_dump(exclude_unset=True)
    before = apply_updates(e, data)
    if before:
        record(db, actor_id=actor.id, action="engagement.update", entity_type="engagement", entity_id=e.id, before=before,
               after={k: data[k] for k in before})
    db.commit()
    return _enrich(db, [e])[0]
