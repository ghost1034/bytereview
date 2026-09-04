"""Opportunity lifecycle: stage transitions, clearance gate, won/lost side-effects."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from firmcrm.core.audit import record
from firmcrm.core.config import settings_for
from firmcrm.core.errors import DomainError, NotFound
from firmcrm.models import Account, Engagement, Opportunity, Stage, StageHistory, User, utcnow
from firmcrm.services import conflicts


def clearance_state(db: Session, opp: Opportunity) -> tuple[str | None, str | None]:
    """Return (required clearance type, latest check status)."""
    ctype = opp.practice_area.clearance_type if opp.practice_area else None
    status = conflicts.latest_status_for_opportunity(db, opp.id, ctype) if ctype else None
    return ctype, status


def change_stage(db: Session, opp: Opportunity, new_stage_id: int, actor: User, *, lost_reason: str | None = None,
                 competitor: str | None = None, note: str | None = None) -> Opportunity:
    stage = db.get(Stage, new_stage_id)
    if not stage or stage.pipeline_id != opp.pipeline_id:
        raise NotFound("Stage not found in this opportunity's pipeline")
    if opp.status != "open":
        raise DomainError("Opportunity is closed; reopen it before changing stage", code="closed")
    if stage.id == opp.stage_id:
        return opp

    if stage.is_won:
        ctype, cstatus = clearance_state(db, opp)
        if ctype and cstatus not in ("clear", "waived"):
            label = "Conflict check" if ctype == "conflict" else "Independence check"
            raise DomainError(
                f"{label} must be cleared or waived before this opportunity can be marked won "
                f"(current: {cstatus or 'none run'}).",
                code="clearance_required",
            )
        if opp.engagement_letter_status != "signed":
            raise DomainError("Engagement letter must be marked signed before Closed Won.", code="engagement_letter")
    if stage.is_lost and not lost_reason:
        raise DomainError("A lost reason is required when marking an opportunity lost.", code="lost_reason")

    prev = opp.stage_id
    days_prev = (utcnow() - opp.stage_entered_at).total_seconds() / 86400 if opp.stage_entered_at else None
    db.add(StageHistory(opportunity_id=opp.id, from_stage_id=prev, to_stage_id=stage.id, changed_by_id=actor.id,
                        days_in_previous=round(days_prev, 2) if days_prev is not None else None))
    before = {"stage_id": prev, "status": opp.status, "probability": opp.probability}
    opp.stage_id = stage.id
    opp.stage_entered_at = utcnow()
    opp.probability = stage.probability
    if stage.is_won:
        opp.status = "won"
        opp.closed_at = utcnow()
        opp.probability = 100
        _on_won(db, opp, actor)
    elif stage.is_lost:
        opp.status = "lost"
        opp.closed_at = utcnow()
        opp.probability = 0
        opp.lost_reason = lost_reason
        opp.competitor = competitor or opp.competitor
        _on_lost(db, opp, actor)
    record(db, actor_id=actor.id, action="opportunity.stage_change", entity_type="opportunity", entity_id=opp.id,
           before=before, after={"stage_id": stage.id, "status": opp.status, "probability": opp.probability}, note=note)
    return opp


def _engagement_for(db: Session, opp: Opportunity) -> Engagement | None:
    return db.scalars(select(Engagement).where(Engagement.opportunity_id == opp.id)).first()


def _on_won(db: Session, opp: Opportunity, actor: User) -> None:
    acc = db.get(Account, opp.account_id)
    if acc and acc.account_type in ("prospect", "former_client", "other"):
        before = {"account_type": acc.account_type, "client_since": acc.client_since}
        acc.account_type = "client"
        if not acc.client_since:
            acc.client_since = datetime.now(UTC).date()
        record(db, actor_id=actor.id, action="account.became_client", entity_type="account", entity_id=acc.id, before=before,
               after={"account_type": "client", "client_since": acc.client_since}, note=f"won opportunity {opp.id}", opportunity_id=opp.id)
    if acc and not acc.originating_partner_id and opp.originating_partner_id:
        acc.originating_partner_id = opp.originating_partner_id
    # One engagement per opportunity: a re-win after a reopen reactivates the existing matter instead of duplicating it.
    eng = _engagement_for(db, opp)
    if eng:
        eng.status = "active"
        eng.end_date = None
        eng.annual_value = opp.amount
        eng.fee_type = opp.fee_type
        eng.adverse_parties = list(opp.adverse_parties or [])
        record(db, actor_id=actor.id, action="engagement.reactivate", entity_type="engagement", entity_id=eng.id,
               after={"annual_value": opp.amount})
        return
    eng = Engagement(
        name=opp.name, account_id=opp.account_id, opportunity_id=opp.id, practice_area_id=opp.practice_area_id,
        responsible_partner_id=opp.responsible_partner_id or opp.owner_id,
        originating_partner_id=opp.originating_partner_id, fee_type=opp.fee_type, annual_value=opp.amount,
        start_date=datetime.now(UTC).date(), adverse_parties=list(opp.adverse_parties or []),
    )
    db.add(eng)
    db.flush()
    record(db, actor_id=actor.id, action="engagement.create", entity_type="engagement", entity_id=eng.id,
           after={"opportunity_id": opp.id, "annual_value": opp.amount}, note="auto-created at Closed Won")


def _revert_client_status_if_unsupported(db: Session, opp: Opportunity, actor: User) -> None:
    """If this was the only won work for the account, the 'client' flip made at Closed Won is undone."""
    acc = db.get(Account, opp.account_id)
    if not acc or acc.account_type != "client":
        return
    other_won = db.scalar(select(func.count()).select_from(Opportunity).where(
        Opportunity.account_id == acc.id, Opportunity.id != opp.id, Opportunity.status == "won"))
    other_active = db.scalar(select(func.count()).select_from(Engagement).where(
        Engagement.account_id == acc.id, Engagement.status == "active",
        or_(Engagement.opportunity_id.is_(None), Engagement.opportunity_id != opp.id)))
    if other_won or other_active:
        return
    before = {"account_type": acc.account_type, "client_since": acc.client_since}
    acc.account_type = "prospect"
    acc.client_since = None
    record(db, actor_id=actor.id, action="account.client_status_reverted", entity_type="account", entity_id=acc.id,
           before=before, after={"account_type": "prospect", "client_since": None}, note=f"opportunity {opp.id} no longer won", opportunity_id=opp.id)


def _on_lost(db: Session, opp: Opportunity, actor: User) -> None:
    eng = _engagement_for(db, opp)
    if eng and eng.status != "terminated":
        eng.status = "terminated"
        eng.end_date = datetime.now(UTC).date()
        record(db, actor_id=actor.id, action="engagement.terminate", entity_type="engagement", entity_id=eng.id,
               note=f"opportunity {opp.id} marked lost after being won")
    _revert_client_status_if_unsupported(db, opp, actor)


def reopen(db: Session, opp: Opportunity, stage_id: int, actor: User) -> Opportunity:
    stage = db.get(Stage, stage_id)
    if opp.status == "open":
        raise DomainError("Opportunity is already open", code="not_closed")
    if not stage or stage.pipeline_id != opp.pipeline_id or stage.is_won or stage.is_lost:
        raise DomainError("Reopen target must be an open stage in the same pipeline")
    before = {"stage_id": opp.stage_id, "status": opp.status}
    if opp.status == "won":
        eng = _engagement_for(db, opp)
        if eng and eng.status == "active":
            eng.status = "on_hold"
            record(db, actor_id=actor.id, action="engagement.on_hold", entity_type="engagement", entity_id=eng.id,
                   note=f"opportunity {opp.id} reopened")
        _revert_client_status_if_unsupported(db, opp, actor)
    db.add(StageHistory(opportunity_id=opp.id, from_stage_id=opp.stage_id, to_stage_id=stage.id, changed_by_id=actor.id))
    opp.stage_id, opp.status, opp.closed_at, opp.lost_reason = stage.id, "open", None, None
    opp.probability = stage.probability
    opp.stage_entered_at = utcnow()
    record(db, actor_id=actor.id, action="opportunity.reopen", entity_type="opportunity", entity_id=opp.id,
           before=before, after={"stage_id": stage.id, "status": "open"})
    return opp


def is_stale(db: Session, opp: Opportunity) -> bool:
    if opp.status != "open":
        return False
    ref = opp.last_activity_at or opp.stage_entered_at or opp.created_at
    return (utcnow() - ref).days >= settings_for(db).stale_opportunity_days
