"""Lead conversion: Lead -> Account + Contact (+ Opportunity), mirroring the Salesforce convert flow."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import record
from app.core.errors import DomainError, NotFound
from app.models import Account, Contact, Lead, Opportunity, Pipeline, User, utcnow
from app.schemas import LeadConvertIn


def default_pipeline(db: Session) -> Pipeline:
    p = db.scalars(select(Pipeline).where(Pipeline.is_default.is_(True))).first() or db.scalars(select(Pipeline)).first()
    if not p or not p.stages:
        raise DomainError("No pipeline configured", code="no_pipeline")
    return p


def convert(db: Session, lead: Lead, body: LeadConvertIn, actor: User) -> tuple[Account, Contact, Opportunity | None]:
    if lead.status == "converted":
        raise DomainError("Lead already converted", code="already_converted")
    if lead.status == "unqualified":
        raise DomainError("Unqualified leads cannot be converted", code="unqualified")

    if body.existing_account_id:
        account = db.get(Account, body.existing_account_id)
        if not account:
            raise NotFound("Account not found")
    else:
        account = Account(
            name=lead.company or f"{lead.first_name} {lead.last_name}",
            entity_kind="company" if lead.company else "individual",
            account_type="prospect", owner_id=lead.owner_id or actor.id,
            originating_partner_id=lead.owner_id if (lead.owner and lead.owner.role == "partner") else None,
            referral_contact_id=lead.referral_contact_id,
        )
        db.add(account)
        db.flush()

    contact = Contact(
        first_name=lead.first_name, last_name=lead.last_name, email=lead.email, phone=lead.phone, title=lead.title,
        account_id=account.id, owner_id=lead.owner_id or actor.id, lifecycle="prospect", role="decision_maker",
    )
    db.add(contact)
    db.flush()

    opp = None
    if body.create_opportunity:
        pipeline = db.get(Pipeline, body.pipeline_id) if body.pipeline_id else default_pipeline(db)
        if not pipeline:
            raise NotFound("Pipeline not found")
        first_stage = sorted(pipeline.stages, key=lambda s: s.position)[0]
        opp = Opportunity(
            name=body.opportunity_name or f"{account.name} – {lead.need_summary[:40] if lead.need_summary else 'New engagement'}",
            account_id=account.id, primary_contact_id=contact.id, pipeline_id=pipeline.id, stage_id=first_stage.id,
            practice_area_id=lead.practice_area_id, owner_id=lead.owner_id or actor.id,
            originating_partner_id=account.originating_partner_id, referral_contact_id=lead.referral_contact_id,
            campaign_id=lead.campaign_id, amount=body.amount if body.amount is not None else (lead.estimated_value or 0.0),
            probability=first_stage.probability, expected_close=body.expected_close,
        )
        db.add(opp)
        db.flush()

    lead.status = "converted"
    lead.converted_at = utcnow()
    lead.converted_account_id = account.id
    lead.converted_contact_id = contact.id
    lead.converted_opportunity_id = opp.id if opp else None
    record(db, actor_id=actor.id, action="lead.convert", entity_type="lead", entity_id=lead.id,
           after={"account_id": account.id, "contact_id": contact.id, "opportunity_id": opp.id if opp else None})
    return account, contact, opp
