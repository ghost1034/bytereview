from firmcrm.core.routing import FirmCrmRoute
from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from models.db_models import Client
from firmcrm.models import Account, Contact
from firmcrm.core.db import get_db
from firmcrm.core.deps import at_least
from firmcrm.core.errors import Conflict, NotFound
from firmcrm.core.audit import record
from firmcrm.services.shared_clients import require_shared_write
from firmcrm.services.visibility import is_walled
from firmcrm.api.accounts import _enrich
from firmcrm.schemas import FirmCrmAccountOut

router = APIRouter(route_class=FirmCrmRoute, tags=['firmcrm-shared-clients'])

class FirmCrmClientChoice(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    industry: str | None
    contact_name: str | None
    contact_email: str | None
    contact_phone: str | None

class FirmCrmClientLinkIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    client_id: UUID | None = None
    contact_id: int | None = None

@router.get('/shared-clients', response_model=list[FirmCrmClientChoice])
def choices(q: str = Query('', max_length=255), db=Depends(get_db), actor=Depends(at_least('manager'))):
    require_shared_write(db)
    return db.scalars(select(Client).where(Client.firm_id == db.info['firm_id'], Client.name.ilike(f'%{q}%')).order_by(Client.name).limit(100)).all()

@router.post('/accounts/{account_id}/shared-client', response_model=FirmCrmAccountOut)
def share(account_id: int, body: FirmCrmClientLinkIn, db=Depends(get_db), actor=Depends(at_least('manager'))):
    require_shared_write(db)
    account = db.get(Account, account_id)
    if account is None:
        raise NotFound('Account not found')
    if account.shared_client_id:
        if body.client_id and body.client_id != account.shared_client_id:
            raise Conflict('This account already has a permanent client link')
        return _enrich(db, [account])[0]
    if is_walled(db, 'account', account_id):
        raise Conflict('Accounts with an ethical wall cannot be shared')
    if body.client_id:
        client = db.get(Client, body.client_id)
        if client is None or client.firm_id != db.info['firm_id']:
            raise NotFound('Client not found')
        if db.scalar(select(Account.id).where(Account.shared_client_id == client.id)):
            raise Conflict('Client is already linked to a CRM account')
    else:
        client = Client(id=uuid4(), firm_id=db.info['firm_id'], name=account.name, industry=account.industry)
        if body.contact_id:
            contact = db.get(Contact, body.contact_id)
            if contact is None or contact.account_id != account.id:
                raise NotFound('Contact not found')
            client.contact_name, client.contact_email, client.contact_phone = contact.full_name, contact.email, contact.phone
        db.add(client)
        db.flush()
    account.shared_client_id = client.id
    account.name, account.industry = client.name, client.industry
    record(db, actor_id=actor.id, action='account.share_client', entity_type='account', entity_id=account.id, after={'client_id':str(client.id)})
    db.commit()
    return _enrich(db,[account])[0]
