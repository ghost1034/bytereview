from sqlalchemy import select, inspect
from models.db_models import Client, User as PlatformUser
from firmcrm.models import Account
from firmcrm.core.errors import Forbidden, Conflict


def require_shared_write(db):
    actor = db.info['actor']
    platform = db.get(PlatformUser, actor.id)
    if getattr(platform.role, 'value', platform.role) not in ('admin','manager','analyst'):
        raise Forbidden('Shared client write permission is required')


def update_shared_fields(db, account, data):
    if account.shared_client_id and {'name', 'industry'} & data.keys():
        require_shared_write(db)
        client = db.get(Client, account.shared_client_id)
        for key in ('name','industry'):
            if key in data:
                setattr(client, key, data[key])


def require_client_unlinked(db, client_id):
    if not inspect(db.connection()).has_table("firmcrm_accounts"):
        return
    if db.scalar(select(Account.id).where(Account.shared_client_id == client_id).limit(1)) is not None:
        from fastapi import HTTPException
        raise HTTPException(status_code=409, detail='This client is linked to FirmCRM. Archive the CRM account instead of deleting the shared client.')
