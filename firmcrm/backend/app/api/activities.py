from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.common import (
    account_names,
    apply_updates,
    contact_names,
    get_or_404,
    lead_names,
    opportunity_names,
    paginate,
    user_names,
)
from app.core.audit import record
from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.errors import DomainError, NotFound
from app.enums import ActivityKind
from app.models import Activity, Contact, Opportunity, User, utcnow
from app.schemas import ActivityCreate, ActivityOut, ActivityUpdate, Page
from app.services import visibility

router = APIRouter(prefix="/activities", tags=["activities"])


def _enrich(db: Session, rows: list[Activity]) -> list[ActivityOut]:
    un = user_names(db, [a.owner_id for a in rows])
    an = account_names(db, [a.account_id for a in rows])
    cn = contact_names(db, [a.contact_id for a in rows])
    on = opportunity_names(db, [a.opportunity_id for a in rows])
    ln = lead_names(db, [a.lead_id for a in rows])
    out = []
    for a in rows:
        d = ActivityOut.model_validate(a)
        d.owner_name, d.account_name, d.contact_name = un.get(a.owner_id), an.get(a.account_id), cn.get(a.contact_id)
        d.opportunity_name, d.lead_name = on.get(a.opportunity_id), ln.get(a.lead_id)
        out.append(d)
    return out


@router.get("", response_model=Page[ActivityOut])
def list_activities(kind: ActivityKind | None = None, account_id: int | None = None, contact_id: int | None = None,
                    opportunity_id: int | None = None, lead_id: int | None = None, owner_id: int | None = None,
                    open_tasks: bool = False, mine: bool = False, limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0),
                    db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    stmt = visibility.apply(select(Activity), visibility.activity_clause(user))
    if kind:
        stmt = stmt.where(Activity.kind == kind)
    for col, val in ((Activity.account_id, account_id), (Activity.contact_id, contact_id),
                     (Activity.opportunity_id, opportunity_id), (Activity.lead_id, lead_id), (Activity.owner_id, owner_id)):
        if val:
            stmt = stmt.where(col == val)
    if mine:
        stmt = stmt.where(Activity.owner_id == user.id)
    if open_tasks:
        stmt = stmt.where(Activity.kind == "task", Activity.completed_at.is_(None)).order_by(Activity.due_at.is_(None), Activity.due_at, Activity.id)
    else:
        stmt = stmt.order_by(Activity.occurred_at.desc(), Activity.id.desc())
    rows, total = paginate(db, stmt, limit, offset)
    return Page(items=_enrich(db, rows), total=total, limit=limit, offset=offset)


@router.post("", response_model=ActivityOut, status_code=201)
def create_activity(body: ActivityCreate, db: Session = Depends(get_db), actor: User = Depends(get_current_user)):
    if not any([body.account_id, body.contact_id, body.opportunity_id, body.lead_id]):
        raise DomainError("Activity must relate to an account, contact, opportunity, or lead")
    data = body.model_dump()
    if data.get("occurred_at") is None:
        data["occurred_at"] = utcnow()
    a = Activity(**data)
    if a.owner_id is None:
        a.owner_id = actor.id
    # Auto-link opportunity -> account; contact -> account
    if a.opportunity_id and not a.account_id:
        opp = db.get(Opportunity, a.opportunity_id)
        a.account_id = opp.account_id if opp else None
    if a.contact_id and not a.account_id:
        c = db.get(Contact, a.contact_id)
        a.account_id = c.account_id if c else None
    visibility.assert_account_visible(db, actor, a.account_id)
    if a.opportunity_id:
        visibility.assert_opportunity_visible(db, actor, db.get(Opportunity, a.opportunity_id))
    db.add(a)
    db.flush()
    if a.kind != "task":
        _touch(db, a)
    record(db, actor_id=actor.id, action="activity.create", entity_type="activity", entity_id=a.id, after=body.model_dump())
    db.commit()
    return _enrich(db, [a])[0]


def _touch(db: Session, a: Activity) -> None:
    ts = a.occurred_at or utcnow()
    if a.opportunity_id:
        opp = db.get(Opportunity, a.opportunity_id)
        if opp and (opp.last_activity_at is None or ts > opp.last_activity_at):
            opp.last_activity_at = ts
    if a.contact_id:
        c = db.get(Contact, a.contact_id)
        if c and (c.last_activity_at is None or ts > c.last_activity_at):
            c.last_activity_at = ts


def _visible_activity(db: Session, user: User, activity_id: int) -> Activity:
    a = get_or_404(db, Activity, activity_id)
    if not visibility.can_see_account(db, user, a.account_id):
        raise NotFound("Activity not found")
    if a.opportunity_id and not visibility.can_see_opportunity(db, user, db.get(Opportunity, a.opportunity_id)):
        raise NotFound("Activity not found")
    return a


@router.patch("/{activity_id}", response_model=ActivityOut)
def update_activity(activity_id: int, body: ActivityUpdate, db: Session = Depends(get_db), actor: User = Depends(get_current_user)):
    a = _visible_activity(db, actor, activity_id)
    data = body.model_dump(exclude_unset=True)
    completed = data.pop("completed", None)
    before = apply_updates(a, data)
    if completed is not None:
        before["completed_at"] = a.completed_at
        a.completed_at = utcnow() if completed else None
        if completed:
            _touch(db, a)
    if before:
        record(db, actor_id=actor.id, action="activity.update", entity_type="activity", entity_id=a.id, before=before, after=data)
    db.commit()
    return _enrich(db, [a])[0]


@router.delete("/{activity_id}", status_code=204)
def delete_activity(activity_id: int, db: Session = Depends(get_db), actor: User = Depends(get_current_user)):
    a = _visible_activity(db, actor, activity_id)
    if a.owner_id != actor.id and actor.role not in ("admin", "partner", "manager"):
        raise DomainError("Only the owner or a manager can delete this activity", status_code=403)
    record(db, actor_id=actor.id, action="activity.delete", entity_type="activity", entity_id=a.id, before={"subject": a.subject})
    db.delete(a)
    db.commit()
