from firmcrm.core.routing import FirmCrmRoute
from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from firmcrm.core.db import get_db
from firmcrm.core.deps import get_current_user, require_role
from firmcrm.core.audit import record
from firmcrm.schemas import FirmCrmUserOut
from models.db_models import Firm, User

router = APIRouter(route_class=FirmCrmRoute, tags=['firmcrm-context'])

class FirmCrmSettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra='forbid')
    default_currency: str = Field(default='USD', pattern='^[A-Z]{3}$')
    stale_opportunity_days: int = Field(default=21, ge=1, le=365)
    conflict_match_threshold: float = Field(default=0.82, ge=0.5, le=1)
    admin_bypasses_walls: bool = True

class FirmCrmContextOut(BaseModel):
    firm_id: str
    firm_name: str
    user: FirmCrmUserOut
    settings: FirmCrmSettingsOut
    access_revision: int
    can_share_clients: bool

@router.get('/context', response_model=FirmCrmContextOut)
def context(db=Depends(get_db), actor=Depends(get_current_user)):
    firm = db.get(Firm, db.info['firm_id'])
    platform = db.get(User, actor.id)
    return FirmCrmContextOut(access_revision=db.info["settings"].access_revision, firm_id=str(firm.id), firm_name=firm.name, user=FirmCrmUserOut.model_validate(actor), settings=FirmCrmSettingsOut.model_validate(db.info['settings']), can_share_clients=actor.role in ('manager','partner','admin') and getattr(platform.role,'value',platform.role) in ('admin','manager','analyst'))

@router.get('/settings', response_model=FirmCrmSettingsOut)
def settings(db=Depends(get_db)):
    return db.info['settings']

@router.patch('/settings', response_model=FirmCrmSettingsOut)
def update_settings(body: FirmCrmSettingsOut, db=Depends(get_db), actor=Depends(require_role('admin'))):
    settings = db.info['settings']
    before = FirmCrmSettingsOut.model_validate(settings).model_dump()
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(settings,key,value)
    record(db, actor_id=actor.id, action='settings.update', entity_type='settings', entity_id=None, before=before, after=body.model_dump())
    db.commit()
    return settings
