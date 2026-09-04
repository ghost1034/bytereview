from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import record
from app.core.db import get_db
from app.core.deps import get_current_user, require_role
from app.core.errors import Conflict
from app.core.security import hash_password, validate_password_policy
from app.models import User
from app.schemas import UserCreate, UserOut, UserUpdate
from app.services import auth as auth_svc

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_users(include_inactive: bool = False, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    q = select(User).order_by(User.full_name)
    if not include_inactive:
        q = q.where(User.is_active.is_(True))
    return db.scalars(q).all()


@router.post("", response_model=UserOut, status_code=201)
def create_user(body: UserCreate, db: Session = Depends(get_db), actor: User = Depends(require_role("admin"))):
    if db.scalars(select(User).where(User.email == body.email.lower())).first():
        raise Conflict("Email already exists")
    validate_password_policy(body.password, email=body.email)
    u = User(email=body.email.lower(), full_name=body.full_name, password_hash=hash_password(body.password),
             role=body.role, title=body.title, practice_area_id=body.practice_area_id, must_change_password=True)
    db.add(u)
    db.flush()
    record(db, actor_id=actor.id, action="user.create", entity_type="user", entity_id=u.id, after={"email": u.email, "role": u.role})
    db.commit()
    return u


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserUpdate, db: Session = Depends(get_db), actor: User = Depends(require_role("admin"))):
    u = db.get(User, user_id)
    if not u:
        from app.core.errors import NotFound

        raise NotFound("User not found")
    data = body.model_dump(exclude_unset=True)
    pw = data.pop("password", None)
    before = {k: getattr(u, k) for k in data}
    for k, v in data.items():
        setattr(u, k, v)
    if pw:
        auth_svc.admin_set_password(db, u, pw, actor)
    if data.get("is_active") is False:
        auth_svc.revoke_all_sessions(db, u)
    record(db, actor_id=actor.id, action="user.update", entity_type="user", entity_id=u.id, before=before, after=data)
    db.commit()
    return u
