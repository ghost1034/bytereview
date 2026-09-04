"""Record-level visibility (ethical walls).

All list endpoints apply `account_clause` / `opportunity_clause`; all detail/mutation endpoints call
`assert_account_visible` / `assert_opportunity_visible`, which raise NotFound (never 403) so the existence of a
restricted record is not disclosed.
"""

from __future__ import annotations

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import NotFound
from app.models import Account, Activity, Contact, Engagement, EthicalWall, EthicalWallMember, Opportunity, User


def bypasses(user: User) -> bool:
    return user.role == "admin" and get_settings().admin_bypasses_walls


def hidden_ids(user: User, entity_type: str):
    """Subquery of entity ids walled away from this user, or None when nothing is hidden."""
    if bypasses(user):
        return None
    member_walls = select(EthicalWallMember.wall_id).where(EthicalWallMember.user_id == user.id)
    return select(EthicalWall.entity_id).where(EthicalWall.entity_type == entity_type, EthicalWall.is_active.is_(True),
                                               EthicalWall.id.not_in(member_walls))


def account_clause(user: User):
    h = hidden_ids(user, "account")
    return None if h is None else Account.id.not_in(h)


def contact_clause(user: User):
    h = hidden_ids(user, "account")
    return None if h is None else or_(Contact.account_id.is_(None), Contact.account_id.not_in(h))


def opportunity_clause(user: User):
    ha, ho = hidden_ids(user, "account"), hidden_ids(user, "opportunity")
    if ha is None:
        return None
    return and_(Opportunity.account_id.not_in(ha), Opportunity.id.not_in(ho))


def engagement_clause(user: User):
    ha, ho = hidden_ids(user, "account"), hidden_ids(user, "opportunity")
    if ha is None:
        return None
    return and_(Engagement.account_id.not_in(ha), or_(Engagement.opportunity_id.is_(None), Engagement.opportunity_id.not_in(ho)))


def activity_clause(user: User):
    ha, ho = hidden_ids(user, "account"), hidden_ids(user, "opportunity")
    if ha is None:
        return None
    return and_(or_(Activity.account_id.is_(None), Activity.account_id.not_in(ha)),
                or_(Activity.opportunity_id.is_(None), Activity.opportunity_id.not_in(ho)))


def apply(stmt, clause):
    return stmt if clause is None else stmt.where(clause)


def can_see_account(db: Session, user: User, account_id: int | None) -> bool:
    if account_id is None or bypasses(user):
        return True
    h = hidden_ids(user, "account")
    return db.scalar(select(Account.id).where(Account.id == account_id, Account.id.not_in(h))) is not None


def can_see_opportunity(db: Session, user: User, opp: Opportunity) -> bool:
    if bypasses(user):
        return True
    ho = hidden_ids(user, "opportunity")
    if db.scalar(select(EthicalWall.entity_id).where(ho.whereclause, EthicalWall.entity_id == opp.id)) is not None:
        return False
    return can_see_account(db, user, opp.account_id)


def assert_account_visible(db: Session, user: User, account_id: int | None) -> None:
    if not can_see_account(db, user, account_id):
        raise NotFound("Account not found")


def assert_opportunity_visible(db: Session, user: User, opp: Opportunity) -> None:
    if not can_see_opportunity(db, user, opp):
        raise NotFound("Opportunity not found")


def is_walled(db: Session, entity_type: str, entity_id: int) -> bool:
    return db.scalar(select(EthicalWall.id).where(EthicalWall.entity_type == entity_type, EthicalWall.entity_id == entity_id,
                                                  EthicalWall.is_active.is_(True))) is not None


def redact_matches(db: Session, user: User, matches: list[dict]) -> list[dict]:
    """Conflict search must still surface walled parties, but non-members must not learn the matter."""
    if bypasses(user):
        return matches
    ha, ho = hidden_ids(user, "account"), hidden_ids(user, "opportunity")
    hidden_accounts = set(db.scalars(ha).all())
    hidden_opps = set(db.scalars(ho).all())
    # Opportunities under a walled account are hidden too.
    hidden_opps |= set(db.scalars(select(Opportunity.id).where(Opportunity.account_id.in_(hidden_accounts or {-1}))).all())
    hidden_eng = set(db.scalars(select(Engagement.id).where(or_(Engagement.account_id.in_(hidden_accounts or {-1}),
                                                                  Engagement.opportunity_id.in_(hidden_opps or {-1})))).all())
    hidden_contacts = set(db.scalars(select(Contact.id).where(Contact.account_id.in_(hidden_accounts or {-1}))).all())
    out = []
    for m in matches:
        m = dict(m)
        restricted = (m["entity"] == "account" and m["entity_id"] in hidden_accounts) or \
                     (m["entity"] == "contact" and m["entity_id"] in hidden_contacts) or \
                     (m["entity"] == "adverse_party" and m.get("source_type") == "opportunity" and m["entity_id"] in hidden_opps) or \
                     (m["entity"] == "adverse_party" and m.get("source_type") == "engagement" and m["entity_id"] in hidden_eng)
        if restricted:
            m["context"] = "Restricted matter (ethical wall) — contact Risk / General Counsel"
            m["entity_id"] = None
            m["restricted"] = True
        out.append(m)
    return out
