from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.common import (
    SortDir,
    account_names,
    apply_sort,
    apply_updates,
    archive,
    get_or_404,
    paginate,
    restore,
    user_names,
)
from app.core.audit import record
from app.core.db import get_db
from app.core.deps import at_least, get_current_user, require_role
from app.core.errors import DomainError, NotFound
from app.enums import ContactRole, Lifecycle
from app.models import Contact, User
from app.schemas import ContactCreate, ContactOut, ContactUpdate, Page
from app.services import visibility

router = APIRouter(prefix="/contacts", tags=["contacts"])


def _enrich(db: Session, rows: list[Contact]) -> list[ContactOut]:
    an = account_names(db, [c.account_id for c in rows])
    un = user_names(db, [c.owner_id for c in rows])
    out = []
    for c in rows:
        o = ContactOut.model_validate(c)
        o.account_name = an.get(c.account_id)
        o.owner_name = un.get(c.owner_id)
        out.append(o)
    return out


@router.get("", response_model=Page[ContactOut])
def list_contacts(q: str | None = Query(None, max_length=200), account_id: int | None = None, lifecycle: Lifecycle | None = None,
                  role: ContactRole | None = None, owner_id: int | None = None, include_archived: bool = False,
                  sort: str | None = Query(None, max_length=40), dir: SortDir = "asc",
                  limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0),
                  db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    stmt = visibility.apply(select(Contact), visibility.contact_clause(_))
    if not include_archived:
        stmt = stmt.where(Contact.is_archived.is_(False))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Contact.first_name.ilike(like), Contact.last_name.ilike(like), Contact.email.ilike(like),
                              Contact.title.ilike(like)))
    if account_id:
        stmt = stmt.where(Contact.account_id == account_id)
    if lifecycle:
        stmt = stmt.where(Contact.lifecycle == lifecycle)
    if role:
        stmt = stmt.where(Contact.role == role)
    if owner_id:
        stmt = stmt.where(Contact.owner_id == owner_id)
    stmt = apply_sort(stmt, sort, dir, {"last_name": Contact.last_name, "email": Contact.email, "lifecycle": Contact.lifecycle, "role": Contact.role,
                                        "created_at": Contact.created_at, "last_activity_at": Contact.last_activity_at},
                      [Contact.last_name, Contact.first_name])
    rows, total = paginate(db, stmt, limit, offset)
    return Page(items=_enrich(db, rows), total=total, limit=limit, offset=offset)


def _check_email(db: Session, email: str | None, exclude_id: int | None = None) -> str | None:
    if not email:
        return None
    email = email.strip().lower()
    stmt = select(Contact).where(func.lower(Contact.email) == email, Contact.is_archived.is_(False))
    if exclude_id:
        stmt = stmt.where(Contact.id != exclude_id)
    dup = db.scalars(stmt).first()
    if dup:
        raise DomainError(f"A contact with email {email} already exists: {dup.full_name} (id {dup.id})", code="duplicate", status_code=409)
    return email


@router.post("", response_model=ContactOut, status_code=201)
def create_contact(body: ContactCreate, db: Session = Depends(get_db), actor: User = Depends(get_current_user)):
    data = body.model_dump()
    data["email"] = _check_email(db, data.get("email"))
    visibility.assert_account_visible(db, actor, data.get("account_id"))
    c = Contact(**data)
    if c.owner_id is None:
        c.owner_id = actor.id
    db.add(c)
    db.flush()
    record(db, actor_id=actor.id, action="contact.create", entity_type="contact", entity_id=c.id, after=body.model_dump())
    db.commit()
    return _enrich(db, [c])[0]


def get_visible(db: Session, user: User, contact_id: int) -> Contact:
    c = get_or_404(db, Contact, contact_id)
    if not visibility.can_see_account(db, user, c.account_id):
        raise NotFound("Contact not found")
    return c


@router.get("/{contact_id}", response_model=ContactOut)
def get_contact(contact_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _enrich(db, [get_visible(db, user, contact_id)])[0]


@router.patch("/{contact_id}", response_model=ContactOut)
def update_contact(contact_id: int, body: ContactUpdate, db: Session = Depends(get_db), actor: User = Depends(get_current_user)):
    c = get_visible(db, actor, contact_id)
    data = body.model_dump(exclude_unset=True)
    if "account_id" in data:
        visibility.assert_account_visible(db, actor, data["account_id"])
    if "email" in data:
        data["email"] = _check_email(db, data["email"], exclude_id=c.id)
    before = apply_updates(c, data)
    if before:
        record(db, actor_id=actor.id, action="contact.update", entity_type="contact", entity_id=c.id, before=before,
               after={k: data[k] for k in before})
    db.commit()
    return _enrich(db, [c])[0]


@router.post("/{contact_id}/archive", response_model=ContactOut)
def archive_contact(contact_id: int, db: Session = Depends(get_db), actor: User = Depends(at_least("manager"))):
    c = get_visible(db, actor, contact_id)
    archive(db, c, actor.id, "contact")
    db.commit()
    return _enrich(db, [c])[0]


@router.post("/{contact_id}/restore", response_model=ContactOut)
def restore_contact(contact_id: int, db: Session = Depends(get_db), actor: User = Depends(at_least("manager"))):
    c = get_visible(db, actor, contact_id)
    _check_email(db, c.email, exclude_id=c.id)  # restoring must not reintroduce a duplicate active email
    restore(db, c, actor.id, "contact")
    db.commit()
    return _enrich(db, [c])[0]


@router.delete("/{contact_id}", status_code=204)
def purge_contact(contact_id: int, db: Session = Depends(get_db), actor: User = Depends(require_role("admin"))):
    c = get_or_404(db, Contact, contact_id)
    record(db, actor_id=actor.id, action="contact.purge", entity_type="contact", entity_id=c.id, before={"name": c.full_name})
    db.delete(c)
    db.commit()
