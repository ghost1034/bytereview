"""Ethical walls: create/lift restrictions and manage members. Partners and admins manage; members can view theirs."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.common import get_or_404, paginate, user_names
from app.core.audit import record
from app.core.db import get_db
from app.core.deps import get_current_user, require_role
from app.core.errors import DomainError, NotFound
from app.models import Account, EthicalWall, EthicalWallMember, Opportunity, User, utcnow
from app.schemas import Page
from app.services import visibility

router = APIRouter(prefix="/walls", tags=["ethical-walls"])
EntityType = Literal["account", "opportunity"]


class MemberOut(BaseModel):
    user_id: int
    full_name: str
    role: str
    added_at: str


class WallOut(BaseModel):
    id: int
    entity_type: str
    entity_id: int
    entity_name: str | None
    reason: str
    is_active: bool
    created_by_id: int | None
    created_by_name: str | None
    created_at: str
    deactivated_at: str | None
    members: list[MemberOut]


class WallCreate(BaseModel):
    entity_type: EntityType
    entity_id: int
    reason: str = Field(min_length=5, max_length=2000)
    member_ids: list[int] = Field(default_factory=list, max_length=200)


class MemberIn(BaseModel):
    user_id: int


def _entity_name(db: Session, w: EthicalWall) -> str | None:
    obj = db.get(Account if w.entity_type == "account" else Opportunity, w.entity_id)
    return obj.name if obj else None


def _out(db: Session, walls: list[EthicalWall]) -> list[WallOut]:
    un = user_names(db, [w.created_by_id for w in walls])
    out = []
    for w in walls:
        out.append(WallOut(id=w.id, entity_type=w.entity_type, entity_id=w.entity_id, entity_name=_entity_name(db, w), reason=w.reason,
                           is_active=w.is_active, created_by_id=w.created_by_id, created_by_name=un.get(w.created_by_id),
                           created_at=w.created_at.isoformat(), deactivated_at=w.deactivated_at.isoformat() if w.deactivated_at else None,
                           members=[MemberOut(user_id=m.user_id, full_name=m.user.full_name, role=m.user.role, added_at=m.added_at.isoformat())
                                    for m in sorted(w.members, key=lambda m: m.user.full_name)]))
    return out


def _can_manage(user: User) -> bool:
    return user.role in ("partner", "admin")


def _member(w: EthicalWall, user: User) -> bool:
    return any(m.user_id == user.id for m in w.members)


def _load(db: Session, wall_id: int, user: User) -> EthicalWall:
    w = get_or_404(db, EthicalWall, wall_id, "Wall")
    if not (_can_manage(user) or _member(w, user)):
        raise NotFound("Wall not found")
    return w


@router.get("", response_model=Page[WallOut])
def list_walls(include_inactive: bool = False, entity_type: EntityType | None = None, limit: int = Query(50, ge=1, le=500),
               offset: int = Query(0, ge=0), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    stmt = select(EthicalWall)
    if not include_inactive:
        stmt = stmt.where(EthicalWall.is_active.is_(True))
    if entity_type:
        stmt = stmt.where(EthicalWall.entity_type == entity_type)
    if not _can_manage(user):
        stmt = stmt.where(EthicalWall.id.in_(select(EthicalWallMember.wall_id).where(EthicalWallMember.user_id == user.id)))
    rows, total = paginate(db, stmt.order_by(EthicalWall.is_active.desc(), EthicalWall.created_at.desc()), limit, offset)
    return Page(items=_out(db, rows), total=total, limit=limit, offset=offset)


@router.get("/for/{entity_type}/{entity_id}", response_model=WallOut | None)
def wall_for(entity_type: EntityType, entity_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Active wall on a record, for the record page. Non-members of a walled record cannot see the record at all (404)."""
    if entity_type == "account":
        visibility.assert_account_visible(db, user, entity_id)
    else:
        opp = get_or_404(db, Opportunity, entity_id)
        visibility.assert_opportunity_visible(db, user, opp)
    w = db.scalars(select(EthicalWall).where(EthicalWall.entity_type == entity_type, EthicalWall.entity_id == entity_id,
                                              EthicalWall.is_active.is_(True))).first()
    return _out(db, [w])[0] if w else None


@router.post("", response_model=WallOut, status_code=201)
def create_wall(body: WallCreate, db: Session = Depends(get_db), actor: User = Depends(require_role("partner", "admin"))):
    model = Account if body.entity_type == "account" else Opportunity
    target = get_or_404(db, model, body.entity_id, body.entity_type.capitalize())
    if body.entity_type == "opportunity":
        visibility.assert_opportunity_visible(db, actor, target)
    else:
        visibility.assert_account_visible(db, actor, target.id)
    if visibility.is_walled(db, body.entity_type, body.entity_id):
        raise DomainError("An active wall already exists on this record", code="wall_exists", status_code=409)
    w = EthicalWall(entity_type=body.entity_type, entity_id=body.entity_id, reason=body.reason.strip(), created_by_id=actor.id)
    ids = set(body.member_ids) | {actor.id}  # creator is always inside the wall
    users = db.scalars(select(User).where(User.id.in_(ids), User.is_active.is_(True))).all()
    if len(users) != len(ids):
        raise DomainError("One or more member ids are unknown or inactive", code="bad_member")
    w.members = [EthicalWallMember(user_id=u.id, added_by_id=actor.id) for u in users]
    db.add(w)
    db.flush()
    record(db, actor_id=actor.id, action="wall.create", entity_type="ethical_wall", entity_id=w.id,
           after={"entity_type": w.entity_type, "entity_id": w.entity_id, "members": sorted(ids), "reason": w.reason})
    db.commit()
    return _out(db, [w])[0]


@router.get("/{wall_id}", response_model=WallOut)
def get_wall(wall_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _out(db, [_load(db, wall_id, user)])[0]


@router.post("/{wall_id}/members", response_model=WallOut)
def add_member(wall_id: int, body: MemberIn, db: Session = Depends(get_db), actor: User = Depends(require_role("partner", "admin"))):
    w = _load(db, wall_id, actor)
    if not w.is_active:
        raise DomainError("Wall is no longer active", code="inactive")
    u = db.get(User, body.user_id)
    if not u or not u.is_active:
        raise NotFound("User not found")
    if _member(w, u):
        raise DomainError("Already a member", code="duplicate", status_code=409)
    w.members.append(EthicalWallMember(user_id=u.id, added_by_id=actor.id))
    record(db, actor_id=actor.id, action="wall.add_member", entity_type="ethical_wall", entity_id=w.id, after={"user_id": u.id})
    db.commit()
    return _out(db, [w])[0]


@router.delete("/{wall_id}/members/{user_id}", response_model=WallOut)
def remove_member(wall_id: int, user_id: int, db: Session = Depends(get_db), actor: User = Depends(require_role("partner", "admin"))):
    w = _load(db, wall_id, actor)
    m = next((m for m in w.members if m.user_id == user_id), None)
    if not m:
        raise NotFound("Member not found")
    if len(w.members) == 1:
        raise DomainError("A wall must keep at least one member; lift the wall instead", code="last_member")
    if user_id == actor.id and not any(mm.user_id != actor.id and mm.user.role in ("partner", "admin") for mm in w.members):
        raise DomainError("You cannot remove yourself: no other partner or admin would be left to manage this wall. Add one first or lift the wall.",
                          code="self_lockout")
    w.members.remove(m)
    record(db, actor_id=actor.id, action="wall.remove_member", entity_type="ethical_wall", entity_id=w.id, before={"user_id": user_id})
    db.commit()
    return _out(db, [w])[0]


@router.post("/{wall_id}/lift", response_model=WallOut)
def lift_wall(wall_id: int, db: Session = Depends(get_db), actor: User = Depends(require_role("partner", "admin"))):
    w = _load(db, wall_id, actor)
    if not w.is_active:
        raise DomainError("Wall already lifted", code="inactive")
    w.is_active = False
    w.deactivated_at = utcnow()
    w.deactivated_by_id = actor.id
    record(db, actor_id=actor.id, action="wall.lift", entity_type="ethical_wall", entity_id=w.id)
    db.commit()
    return _out(db, [w])[0]
