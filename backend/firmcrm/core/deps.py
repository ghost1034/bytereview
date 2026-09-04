from fastapi import Depends
from firmcrm.core.db import get_db, CrmSession
from firmcrm.core.errors import Forbidden

ROLE_RANK = {'staff': 1, 'marketing': 1, 'manager': 2, 'partner': 3, 'admin': 4}

def get_current_user(db: CrmSession = Depends(get_db)):
    return db.info['actor']

def require_role(*roles):
    def guard(user=Depends(get_current_user)):
        if user.role not in roles:
            raise Forbidden('Insufficient CRM permissions')
        return user
    return guard

def at_least(role):
    def guard(user=Depends(get_current_user)):
        if ROLE_RANK.get(user.role, 0) < ROLE_RANK[role]:
            raise Forbidden('Insufficient CRM permissions')
        return user
    return guard
