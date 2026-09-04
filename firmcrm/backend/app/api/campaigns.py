from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.common import SortDir, apply_sort, apply_updates, archive, get_or_404, paginate, restore
from app.core.audit import record
from app.core.db import get_db
from app.core.deps import at_least, get_current_user
from app.core.errors import Conflict
from app.enums import CampaignStatus
from app.models import Campaign, CampaignMember, Contact, Lead, Opportunity, User
from app.schemas import CampaignCreate, CampaignMemberIn, CampaignMemberOut, CampaignOut, CampaignUpdate, Page

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


def _enrich(db: Session, rows: list[Campaign]) -> list[CampaignOut]:
    ids = [c.id for c in rows]
    if not ids:
        return []
    members = dict(db.execute(select(CampaignMember.campaign_id, func.count()).where(CampaignMember.campaign_id.in_(ids))
                              .group_by(CampaignMember.campaign_id)).all())
    attended = dict(db.execute(select(CampaignMember.campaign_id, func.count())
                               .where(CampaignMember.campaign_id.in_(ids), CampaignMember.status == "attended")
                               .group_by(CampaignMember.campaign_id)).all())
    leads = dict(db.execute(select(Lead.campaign_id, func.count()).where(Lead.campaign_id.in_(ids)).group_by(Lead.campaign_id)).all())
    opps = db.scalars(select(Opportunity).where(Opportunity.campaign_id.in_(ids))).all()
    out = []
    for c in rows:
        d = CampaignOut.model_validate(c)
        d.member_count, d.attended_count, d.leads_generated = members.get(c.id, 0), attended.get(c.id, 0), leads.get(c.id, 0)
        d.influenced_pipeline = sum(o.amount for o in opps if o.campaign_id == c.id and o.status == "open")
        d.won_amount = sum(o.amount for o in opps if o.campaign_id == c.id and o.status == "won")
        out.append(d)
    return out


@router.get("", response_model=Page[CampaignOut])
def list_campaigns(status: CampaignStatus | None = None, include_archived: bool = False, sort: str | None = Query(None, max_length=40),
                   dir: SortDir = "asc", limit: int = Query(50, ge=1, le=500),
                   offset: int = Query(0, ge=0), db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    stmt = select(Campaign)
    if not include_archived:
        stmt = stmt.where(Campaign.is_archived.is_(False))
    if status:
        stmt = stmt.where(Campaign.status == status)
    stmt = apply_sort(stmt, sort, dir, {"name": Campaign.name, "kind": Campaign.kind, "status": Campaign.status, "start_date": Campaign.start_date,
                                        "budget": Campaign.budget, "actual_cost": Campaign.actual_cost}, [Campaign.start_date.desc(), Campaign.id.desc()])
    rows, total = paginate(db, stmt, limit, offset)
    return Page(items=_enrich(db, rows), total=total, limit=limit, offset=offset)


@router.post("/{campaign_id}/archive", response_model=CampaignOut)
def archive_campaign(campaign_id: int, db: Session = Depends(get_db), actor: User = Depends(at_least("manager"))):
    c = get_or_404(db, Campaign, campaign_id)
    archive(db, c, actor.id, "campaign")
    db.commit()
    return _enrich(db, [c])[0]


@router.post("/{campaign_id}/restore", response_model=CampaignOut)
def restore_campaign(campaign_id: int, db: Session = Depends(get_db), actor: User = Depends(at_least("manager"))):
    c = get_or_404(db, Campaign, campaign_id)
    restore(db, c, actor.id, "campaign")
    db.commit()
    return _enrich(db, [c])[0]


@router.post("", response_model=CampaignOut, status_code=201)
def create_campaign(body: CampaignCreate, db: Session = Depends(get_db), actor: User = Depends(get_current_user)):
    c = Campaign(**body.model_dump())
    if c.owner_id is None:
        c.owner_id = actor.id
    db.add(c)
    db.flush()
    record(db, actor_id=actor.id, action="campaign.create", entity_type="campaign", entity_id=c.id, after=body.model_dump())
    db.commit()
    return _enrich(db, [c])[0]


@router.get("/{campaign_id}", response_model=CampaignOut)
def get_campaign(campaign_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return _enrich(db, [get_or_404(db, Campaign, campaign_id)])[0]


@router.patch("/{campaign_id}", response_model=CampaignOut)
def update_campaign(campaign_id: int, body: CampaignUpdate, db: Session = Depends(get_db), actor: User = Depends(get_current_user)):
    c = get_or_404(db, Campaign, campaign_id)
    data = body.model_dump(exclude_unset=True)
    before = apply_updates(c, data)
    if before:
        record(db, actor_id=actor.id, action="campaign.update", entity_type="campaign", entity_id=c.id, before=before,
               after={k: data[k] for k in before})
    db.commit()
    return _enrich(db, [c])[0]


@router.get("/{campaign_id}/members", response_model=list[CampaignMemberOut])
def list_members(campaign_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    get_or_404(db, Campaign, campaign_id)
    rows = db.scalars(select(CampaignMember).where(CampaignMember.campaign_id == campaign_id)).all()
    out = []
    for m in rows:
        d = CampaignMemberOut.model_validate(m)
        d.contact_name, d.contact_email = m.contact.full_name, m.contact.email
        d.account_name = m.contact.account.name if m.contact.account else None
        out.append(d)
    return out


@router.post("/{campaign_id}/members", response_model=CampaignMemberOut, status_code=201)
def add_member(campaign_id: int, body: CampaignMemberIn, db: Session = Depends(get_db), actor: User = Depends(get_current_user)):
    get_or_404(db, Campaign, campaign_id)
    contact = get_or_404(db, Contact, body.contact_id)
    if db.scalars(select(CampaignMember).where(CampaignMember.campaign_id == campaign_id, CampaignMember.contact_id == contact.id)).first():
        raise Conflict("Contact already in campaign")
    m = CampaignMember(campaign_id=campaign_id, contact_id=contact.id, status=body.status)
    db.add(m)
    db.flush()
    record(db, actor_id=actor.id, action="campaign.add_member", entity_type="campaign", entity_id=campaign_id, after=body.model_dump())
    db.commit()
    d = CampaignMemberOut.model_validate(m)
    d.contact_name, d.contact_email = contact.full_name, contact.email
    d.account_name = contact.account.name if contact.account else None
    return d


@router.patch("/{campaign_id}/members/{member_id}", response_model=CampaignMemberOut)
def update_member(campaign_id: int, member_id: int, body: CampaignMemberIn, db: Session = Depends(get_db),
                  actor: User = Depends(get_current_user)):
    m = get_or_404(db, CampaignMember, member_id)
    before = {"status": m.status}
    m.status = body.status
    record(db, actor_id=actor.id, action="campaign.update_member", entity_type="campaign", entity_id=campaign_id, before=before,
           after={"status": body.status})
    db.commit()
    d = CampaignMemberOut.model_validate(m)
    d.contact_name, d.contact_email = m.contact.full_name, m.contact.email
    d.account_name = m.contact.account.name if m.contact.account else None
    return d


@router.delete("/{campaign_id}/members/{member_id}", status_code=204)
def remove_member(campaign_id: int, member_id: int, db: Session = Depends(get_db), actor: User = Depends(at_least("staff"))):
    m = get_or_404(db, CampaignMember, member_id)
    record(db, actor_id=actor.id, action="campaign.remove_member", entity_type="campaign", entity_id=campaign_id,
           before={"contact_id": m.contact_id})
    db.delete(m)
    db.commit()
