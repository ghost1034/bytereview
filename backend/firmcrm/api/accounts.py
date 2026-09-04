from __future__ import annotations
from firmcrm.core.routing import FirmCrmRoute

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from firmcrm.api.common import SortDir, apply_sort, apply_updates, archive, get_or_404, paginate, restore, user_names
from firmcrm.core.audit import record
from firmcrm.core.db import get_db
from firmcrm.core.deps import at_least, get_current_user, require_role
from firmcrm.core.errors import DomainError
from firmcrm.enums import AccountType
from firmcrm.models import Account, Activity, Contact, Engagement, Opportunity, User
from firmcrm.schemas import FirmCrmAccountCreate, FirmCrmAccountOut, FirmCrmAccountUpdate, FirmCrmPage
from firmcrm.services import visibility

router = APIRouter(route_class=FirmCrmRoute, prefix="/accounts", tags=["accounts"])


def _enrich(db: Session, rows: list[Account]) -> list[FirmCrmAccountOut]:
    ids = [a.id for a in rows]
    unames = user_names(db, [a.owner_id for a in rows] + [a.originating_partner_id for a in rows])
    pipe = dict(db.execute(select(Opportunity.account_id, func.sum(Opportunity.amount))
                           .where(Opportunity.account_id.in_(ids), Opportunity.status == "open")
                           .group_by(Opportunity.account_id)).all()) if ids else {}
    ccount = dict(db.execute(select(Contact.account_id, func.count()).where(Contact.account_id.in_(ids))
                             .group_by(Contact.account_id)).all()) if ids else {}
    ecount = dict(db.execute(select(Engagement.account_id, func.count()).where(Engagement.account_id.in_(ids))
                             .group_by(Engagement.account_id)).all()) if ids else {}
    last_act = dict(db.execute(select(Activity.account_id, func.max(Activity.occurred_at))
                               .where(Activity.account_id.in_(ids)).group_by(Activity.account_id)).all()) if ids else {}
    out = []
    for a in rows:
        o = FirmCrmAccountOut.model_validate(a)
        o.owner_name = unames.get(a.owner_id)
        o.originating_partner_name = unames.get(a.originating_partner_id)
        o.open_pipeline = float(pipe.get(a.id) or 0)
        o.contact_count = ccount.get(a.id, 0)
        o.engagement_count = ecount.get(a.id, 0)
        o.last_activity_at = last_act.get(a.id)
        out.append(o)
    return out


@router.get("", response_model=FirmCrmPage[FirmCrmAccountOut])
def list_accounts(q: str | None = Query(None, max_length=200), account_type: AccountType | None = None, owner_id: str | None = None,
                  industry: str | None = Query(None, max_length=80), include_archived: bool = False,
                  sort: str | None = Query(None, max_length=40), dir: SortDir = "asc",
                  limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0),
                  db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    stmt = visibility.apply(select(Account), visibility.account_clause(_))
    if not include_archived:
        stmt = stmt.where(Account.is_archived.is_(False))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Account.name.ilike(like), Account.aliases.ilike(like), Account.industry.ilike(like)))
    if account_type:
        stmt = stmt.where(Account.account_type == account_type)
    if owner_id:
        stmt = stmt.where(Account.owner_id == owner_id)
    if industry:
        stmt = stmt.where(Account.industry == industry)
    open_pipeline = select(func.coalesce(func.sum(Opportunity.amount), 0.0)).where(
        Opportunity.account_id == Account.id, Opportunity.status == "open", Opportunity.is_archived.is_(False)).scalar_subquery()
    last_activity = select(func.max(Activity.occurred_at)).where(Activity.account_id == Account.id).scalar_subquery()
    stmt = apply_sort(stmt, sort, dir, {"name": Account.name, "account_type": Account.account_type, "industry": Account.industry,
                                        "created_at": Account.created_at, "client_since": Account.client_since,
                                        "open_pipeline": open_pipeline, "last_activity_at": last_activity}, Account.name)
    rows, total = paginate(db, stmt, limit, offset)
    return FirmCrmPage(items=_enrich(db, rows), total=total, limit=limit, offset=offset)


def find_duplicates(db: Session, name: str, exclude_id: int | None = None) -> list[Account]:
    """Case-insensitive match on name or alias. Archived accounts count: re-creating a former client is a duplicate."""
    n = name.strip().lower()
    stmt = select(Account).where(or_(func.lower(Account.name) == n, func.lower(Account.aliases).like(f"%{n}%")))
    if exclude_id:
        stmt = stmt.where(Account.id != exclude_id)
    return db.scalars(stmt).all()


@router.get("/duplicates", response_model=list[FirmCrmAccountOut])
def duplicates(name: str = Query(min_length=2, max_length=200), db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return _enrich(db, find_duplicates(db, name))


@router.post("", response_model=FirmCrmAccountOut, status_code=201)
def create_account(body: FirmCrmAccountCreate, db: Session = Depends(get_db), actor: User = Depends(get_current_user)):
    dups = find_duplicates(db, body.name)
    if dups and not body.allow_duplicate:
        d = dups[0]
        raise DomainError(f"An account named '{d.name}' already exists (id {d.id}{', archived' if d.is_archived else ''}). "
                          "Set allow_duplicate=true to create anyway.", code="duplicate", status_code=409)
    a = Account(**body.model_dump(exclude={"allow_duplicate"}))
    a.name = a.name.strip()
    if a.owner_id is None:
        a.owner_id = actor.id
    db.add(a)
    db.flush()
    record(db, actor_id=actor.id, action="account.create", entity_type="account", entity_id=a.id, after=body.model_dump())
    db.commit()
    return _enrich(db, [a])[0]


def get_visible(db: Session, user: User, account_id: int) -> Account:
    a = get_or_404(db, Account, account_id)
    visibility.assert_account_visible(db, user, a.id)
    return a


@router.get("/{account_id}", response_model=FirmCrmAccountOut)
def get_account(account_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _enrich(db, [get_visible(db, user, account_id)])[0]


@router.patch("/{account_id}", response_model=FirmCrmAccountOut)
def update_account(account_id: int, body: FirmCrmAccountUpdate, db: Session = Depends(get_db), actor: User = Depends(get_current_user)):
    a = get_visible(db, actor, account_id)
    data = body.model_dump(exclude_unset=True)
    from firmcrm.services.shared_clients import update_shared_fields
    update_shared_fields(db, a, data)
    before = apply_updates(a, data)
    if before:
        record(db, actor_id=actor.id, action="account.update", entity_type="account", entity_id=a.id, before=before,
               after={k: data[k] for k in before})
    db.commit()
    return _enrich(db, [a])[0]


@router.post("/{account_id}/archive", response_model=FirmCrmAccountOut)
def archive_account(account_id: int, db: Session = Depends(get_db), actor: User = Depends(at_least("manager"))):
    a = get_visible(db, actor, account_id)
    if db.scalars(select(Opportunity).where(Opportunity.account_id == a.id, Opportunity.status == "open", Opportunity.is_archived.is_(False))).first():
        raise DomainError("Account has open opportunities; close or archive them first", code="in_use")
    archive(db, a, actor.id, "account")
    db.commit()
    return _enrich(db, [a])[0]


@router.post("/{account_id}/restore", response_model=FirmCrmAccountOut)
def restore_account(account_id: int, db: Session = Depends(get_db), actor: User = Depends(at_least("manager"))):
    a = get_visible(db, actor, account_id)
    restore(db, a, actor.id, "account")
    db.commit()
    return _enrich(db, [a])[0]


@router.delete("/{account_id}", status_code=204)
def purge_account(account_id: int, db: Session = Depends(get_db), actor: User = Depends(require_role("admin"))):
    """Hard delete. Admin only, and only when nothing references the account. Prefer archive."""
    a = get_or_404(db, Account, account_id)
    if db.scalars(select(Opportunity).where(Opportunity.account_id == a.id)).first() or \
       db.scalars(select(Contact).where(Contact.account_id == a.id)).first():
        raise DomainError("Account has contacts or opportunities; archive instead of deleting", code="in_use")
    record(db, actor_id=actor.id, action="account.purge", entity_type="account", entity_id=a.id, before={"name": a.name})
    db.delete(a)
    db.commit()
