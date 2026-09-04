from firmcrm.core.routing import FirmCrmRoute
from fastapi import APIRouter, Depends
from sqlalchemy import select
from pydantic import BaseModel, ConfigDict
from firmcrm.core.db import get_db
from firmcrm.core.deps import get_current_user, require_role
from firmcrm.core.errors import NotFound, Forbidden
from firmcrm.core.audit import record
from firmcrm.models import User
from firmcrm.schemas import FirmCrmUserOut
from firmcrm.enums import Role
from models.db_models import User as PlatformUser

router = APIRouter(route_class=FirmCrmRoute, prefix='/users', tags=['firmcrm-members'])

class FirmCrmMemberUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    role: Role
    practice_area_id: int | None = None
    is_active: bool = True

@router.get('', response_model=list[FirmCrmUserOut])
def list_users(include_inactive: bool = False, db=Depends(get_db), actor=Depends(get_current_user)):
    stmt = select(User).order_by(User.full_name)
    if not include_inactive:
        stmt = stmt.where(User.is_active.is_(True))
    members = db.scalars(stmt).all()
    admins = set(db.scalars(select(PlatformUser.id).where(PlatformUser.firm_id == db.info["firm_id"], PlatformUser.role == "admin")).all())
    result = []
    for member in members:
        output = FirmCrmUserOut.model_validate(member)
        if member.id in admins:
            output.role = "admin"
        result.append(output)
    return result

@router.patch('/{user_id}', response_model=FirmCrmUserOut)
def update_user(user_id: str, body: FirmCrmMemberUpdate, db=Depends(get_db), actor=Depends(require_role('admin'))):
    member = db.get(User, user_id)
    if member is None:
        raise NotFound('Member not found')
    platform = db.get(PlatformUser, user_id)
    if getattr(platform.role, 'value', platform.role) == 'admin' or user_id == actor.id:
        raise Forbidden('Firm administrators and your own access must be managed through firm settings')
    before = {key: getattr(member, key) for key in body.model_fields_set}
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(member, key, value)
    record(db, actor_id=actor.id, action='member.update', entity_type='user', entity_id=user_id, before=before, after=body.model_dump(exclude_unset=True))
    db.commit()
    return member
