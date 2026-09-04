from __future__ import annotations
from firmcrm.core.routing import FirmCrmRoute

from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from firmcrm.api.common import account_names, get_or_404, opportunity_names, paginate, user_names
from firmcrm.core.audit import record
from firmcrm.core.db import get_db
from firmcrm.core.deps import at_least, get_current_user
from firmcrm.core.errors import DomainError, NotFound
from firmcrm.enums import CheckType
from firmcrm.models import ConflictCheck, Opportunity, User, utcnow
from firmcrm.schemas import FirmCrmConflictCheckCreate, FirmCrmConflictCheckOut, FirmCrmConflictMatch, FirmCrmConflictResolveIn, FirmCrmConflictSearchIn, FirmCrmPage
from firmcrm.services import conflicts as svc
from firmcrm.services import visibility

CheckStatus = Literal["pending", "clear", "conflict", "waived"]
router = APIRouter(route_class=FirmCrmRoute, prefix="/conflict-checks", tags=["conflict-checks"])


def _enrich(db: Session, rows: list[ConflictCheck]) -> list[FirmCrmConflictCheckOut]:
    un = user_names(db, [c.requested_by_id for c in rows] + [c.resolved_by_id for c in rows])
    on = opportunity_names(db, [c.opportunity_id for c in rows])
    an = account_names(db, [c.account_id for c in rows])
    out = []
    for c in rows:
        d = FirmCrmConflictCheckOut.model_validate(c)
        d.matches = [FirmCrmConflictMatch.model_validate(item) for item in visibility.redact_matches(db, db.info["actor"], c.matches)]
        d.requested_by_name, d.resolved_by_name = un.get(c.requested_by_id), un.get(c.resolved_by_id)
        d.opportunity_name, d.account_name = on.get(c.opportunity_id), an.get(c.account_id)
        out.append(d)
    return out


@router.post("/search", response_model=list[FirmCrmConflictMatch])
def search(body: FirmCrmConflictSearchIn, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Ad-hoc search without recording a check. Walled matters are matched but redacted for non-members."""
    return visibility.redact_matches(db, _, svc.search(db, body.parties))


@router.get("", response_model=FirmCrmPage[FirmCrmConflictCheckOut])
def list_checks(status: CheckStatus | None = None, opportunity_id: int | None = None, account_id: int | None = None,
                check_type: CheckType | None = None, limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0),
                db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    ha = visibility.hidden_ids(_, "account")
    stmt = select(ConflictCheck) if ha is None else select(ConflictCheck).where(or_(ConflictCheck.account_id.is_(None), ConflictCheck.account_id.not_in(ha)))
    if status:
        stmt = stmt.where(ConflictCheck.status == status)
    if opportunity_id:
        stmt = stmt.where(ConflictCheck.opportunity_id == opportunity_id)
    if account_id:
        stmt = stmt.where(ConflictCheck.account_id == account_id)
    if check_type:
        stmt = stmt.where(ConflictCheck.check_type == check_type)
    rows, total = paginate(db, stmt.order_by(ConflictCheck.created_at.desc(), ConflictCheck.id.desc()), limit, offset)
    return FirmCrmPage(items=_enrich(db, rows), total=total, limit=limit, offset=offset)


@router.post("", response_model=FirmCrmConflictCheckOut, status_code=201)
def run_check(body: FirmCrmConflictCheckCreate, db: Session = Depends(get_db), actor: User = Depends(get_current_user)):
    if not (body.opportunity_id or body.account_id):
        raise DomainError("Provide opportunity_id or account_id")
    account_id = body.account_id
    if body.opportunity_id:
        opp = get_or_404(db, Opportunity, body.opportunity_id)
        visibility.assert_opportunity_visible(db, actor, opp)
        account_id = account_id or opp.account_id
    visibility.assert_account_visible(db, actor, account_id)
    # Exclude self-matches: the prospect account itself and adverse parties typed on this very opportunity.
    matches = svc.filter_self(svc.search(db, body.parties), account_id=account_id, opportunity_id=body.opportunity_id)
    status = "pending" if matches else "clear"
    if body.check_type == "independence":
        if body.independence_attestation is None or any(bool(v) for v in body.independence_attestation.values()):
            status = "pending"  # any disclosed relationship requires review
    c = ConflictCheck(check_type=body.check_type, opportunity_id=body.opportunity_id, account_id=account_id,
                      requested_by_id=actor.id, parties=body.parties, matches=matches, status=status,
                      independence_attestation=body.independence_attestation)
    if status == "clear":
        c.resolved_by_id, c.resolved_at, c.resolution_note = actor.id, utcnow(), "Auto-cleared: no matches"
    db.add(c)
    db.flush()
    record(db, actor_id=actor.id, action="conflict_check.run", entity_type="conflict_check", entity_id=c.id,
           after={"parties": body.parties, "matches": len(matches), "status": status})
    db.commit()
    return _enrich(db, [c])[0]


def _visible_check(db: Session, user: User, check_id: int) -> ConflictCheck:
    c = get_or_404(db, ConflictCheck, check_id)
    if not visibility.can_see_account(db, user, c.account_id):
        raise NotFound("Check not found")
    return c


@router.get("/{check_id}", response_model=FirmCrmConflictCheckOut)
def get_check(check_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _enrich(db, [_visible_check(db, user, check_id)])[0]


@router.post("/{check_id}/resolve", response_model=FirmCrmConflictCheckOut)
def resolve(check_id: int, body: FirmCrmConflictResolveIn, db: Session = Depends(get_db), actor: User = Depends(at_least("manager"))):
    """Human review point: clear, flag as conflict, or waive (waiver requires partner+ and a note)."""
    c = _visible_check(db, actor, check_id)
    is_partner = actor.role in ("partner", "admin")
    disclosed = bool(c.independence_attestation) and any(bool(v) for v in c.independence_attestation.values())
    if disclosed and not is_partner:
        raise DomainError("This check has a disclosed independence relationship; partner review is required", code="partner_required", status_code=403)
    if c.status != "pending":
        # Decisions are final for managers. Partners may override, but must document why; the prior decision stays in the audit log.
        if not is_partner:
            raise DomainError("This check has already been resolved; only a partner or admin can change the decision", code="already_resolved", status_code=403)
        if not body.resolution_note:
            raise DomainError("Changing a resolved decision requires a note explaining the override", code="override_note_required")
    if body.status == "waived":
        if not is_partner:
            raise DomainError("Only a partner or admin can waive", status_code=403)
        if not body.resolution_note:
            raise DomainError("A waiver requires a resolution note (basis / consent obtained)")
    if body.status == "clear" and c.matches and not body.resolution_note:
        raise DomainError("Clearing a check with matches requires a note explaining why each match is not a conflict")
    before = {"status": c.status, "resolution_note": c.resolution_note, "resolved_by_id": c.resolved_by_id}
    override = c.status != "pending"
    c.status, c.resolution_note, c.resolved_by_id, c.resolved_at = body.status, body.resolution_note, actor.id, utcnow()
    record(db, actor_id=actor.id, action="conflict_check.override" if override else "conflict_check.resolve", entity_type="conflict_check",
           entity_id=c.id, before=before, after={"status": body.status}, note=body.resolution_note)
    db.commit()
    return _enrich(db, [c])[0]
