"""Visibility helpers layered over the mandatory CrmSession read policy."""
from sqlalchemy.orm import object_session
from firmcrm.models import Account, Opportunity, EthicalWall
from firmcrm.core.errors import NotFound
from sqlalchemy import select


def bypasses(user):
    return user.role == 'admin' and user._settings.admin_bypasses_walls

def hidden_ids(user, entity_type):
    db = object_session(user)
    return tuple(db.info.get('hidden', {}).get(entity_type, ()))

def account_clause(user):
    return Account.id.not_in(hidden_ids(user, 'account'))

def contact_clause(user):
    return None

def opportunity_clause(user):
    return Opportunity.id.not_in(hidden_ids(user, 'opportunity'))

def engagement_clause(user):
    return None

def activity_clause(user):
    return None

def apply(stmt, clause):
    return stmt if clause is None else stmt.where(clause)

def can_see_account(db, user, account_id):
    return account_id is None or db.get(Account, account_id) is not None

def can_see_opportunity(db, user, opp):
    return db.get(Opportunity, opp.id) is not None

def assert_account_visible(db, user, account_id):
    if not can_see_account(db, user, account_id):
        raise NotFound('Account not found')

def assert_opportunity_visible(db, user, opp):
    if not can_see_opportunity(db, user, opp):
        raise NotFound('Opportunity not found')

def is_walled(db, entity_type, entity_id):
    with db.include_restricted():
        return db.scalar(select(EthicalWall.id).where(EthicalWall.entity_type == entity_type, EthicalWall.entity_id == entity_id, EthicalWall.is_active.is_(True))) is not None

def redact_matches(db, user, matches):
    hidden = db.info.get('hidden', {})
    result = []
    for original in matches:
        match = dict(original)
        kind = match.get('source_type') if match.get('entity') == 'adverse_party' else match.get('entity')
        if match.get('entity_id') in hidden.get(kind, ()):
            match.update(entity_id=None, matched_name='Restricted matter', relationship='restricted', context='Restricted matter — contact a CRM partner', restricted=True, source_type=None)
        result.append(match)
    return result
