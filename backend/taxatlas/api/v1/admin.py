"""Admin data-maintenance endpoints.

Every write goes through `_audit`, which records a ChangeEvent (old/new diff, editor, reason) so the Changes feed
and watchlist notifications reflect manual corrections exactly like crawler-detected changes. Rates keep history:
creating a rate with `supersede=true` closes the currently open row the day before the new effective_from.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from taxatlas.api.deps import require_admin
from taxatlas.api.v1._util import resolve_jurisdiction
from taxatlas.core.db import get_db
from taxatlas.models import (
    ChangeType,
    CourtDecision,
    EntityType,
    Jurisdiction,
    Regulation,
    Tariff,
    TaxRate,
    User,
)
from taxatlas.schemas.admin import (
    CourtDecisionCreate,
    CourtDecisionPatch,
    JurisdictionPatch,
    RateCreate,
    RateCreated,
    RatePatch,
    RegulationCreate,
    RegulationPatch,
    TariffCreate,
    TariffPatch,
)
from taxatlas.schemas.common import Message
from taxatlas.schemas.jurisdiction import JurisdictionDetail
from taxatlas.schemas.tax import CourtDecisionOut, RegulationDetail, TariffOut, TaxRateOut
from taxatlas.services.changes import record_change

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])

_AUDIT_FIELDS = {
    TaxRate: [
        "rate",
        "threshold_amount",
        "threshold_currency",
        "description",
        "applies_to",
        "effective_from",
        "effective_to",
        "as_of",
        "confidence",
        "source_name",
        "source_url",
        "notes",
    ],
    Regulation: [
        "jurisdiction_id",
        "tax_type",
        "title",
        "summary",
        "authority",
        "doc_type",
        "status",
        "reference",
        "published_date",
        "effective_date",
        "tags",
    ],
    CourtDecision: [
        "jurisdiction_id",
        "court",
        "case_name",
        "citation",
        "docket",
        "decision_date",
        "tax_types",
        "summary",
        "holding",
        "significance",
        "outcome",
        "tags",
    ],
    Tariff: [
        "partner_jurisdiction_id",
        "partner_scope",
        "hs_code",
        "product_description",
        "measure_type",
        "rate",
        "rate_text",
        "legal_basis",
        "status",
        "effective_from",
        "effective_to",
        "source_url",
        "notes",
    ],
    Jurisdiction: [
        "name",
        "region",
        "currency",
        "lat",
        "lon",
        "tax_authority_name",
        "tax_authority_url",
        "summary",
        "has_subnational_taxes",
        "is_active",
    ],
}


def _snapshot(obj: Any, fields: list[str]) -> dict[str, Any]:
    out = {}
    for f in fields:
        v = getattr(obj, f)
        out[f] = v.isoformat() if isinstance(v, date) else v
    return out


def _apply_patch(obj: Any, data: dict[str, Any]) -> tuple[dict, dict]:
    """Apply provided fields; return (old, new) containing only fields that actually changed."""
    old, new = {}, {}
    for k, v in data.items():
        cur = getattr(obj, k)
        if cur != v:
            old[k] = cur.isoformat() if isinstance(cur, date) else cur
            new[k] = v.isoformat() if isinstance(v, date) else v
            setattr(obj, k, v)
    return old, new


def _audit(
    db: Session,
    *,
    entity_type: str,
    obj: Any,
    change_type: str,
    title: str,
    jurisdiction_id: int | None,
    tax_type: str | None,
    old: dict | None,
    new: dict | None,
    admin: User,
    reason: str | None,
    tax_types: list[str] | None = None,
):
    meta = {"edited_by": admin.email}
    if reason:
        meta["reason"] = reason
    record_change(
        db,
        entity_type=entity_type,
        entity_id=obj.id,
        change_type=change_type,
        title=title,
        jurisdiction_id=jurisdiction_id,
        tax_type=tax_type,
        old_value=old,
        new_value={**(new or {}), "_meta": meta},
        tax_types=tax_types,
    )


def _get_or_404(db: Session, model, obj_id: int, label: str):
    obj = db.get(model, obj_id)
    if not obj:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{label} not found")
    return obj


# ---------------------------------------------------------------- rates


@router.post("/rates", response_model=RateCreated, status_code=status.HTTP_201_CREATED)
def create_rate(body: RateCreate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    j = resolve_jurisdiction(db, body.jurisdiction_code)
    data = body.model_dump(exclude={"jurisdiction_code", "supersede", "supersede_rate_id"})
    if body.effective_from and body.effective_to and body.effective_to < body.effective_from:
        raise HTTPException(400, "effective_to must be on or after effective_from")
    superseded = None
    warnings: list[str] = []
    open_rows = list(
        db.scalars(
            select(TaxRate)
            .where(
                TaxRate.jurisdiction_id == j.id,
                TaxRate.tax_type == body.tax_type,
                TaxRate.rate_kind == body.rate_kind,
                TaxRate.effective_to.is_(None),
            )
            .order_by(TaxRate.effective_from.desc().nullslast(), TaxRate.id)
        )
    )
    key = f"({body.jurisdiction_code.upper()}, {body.tax_type}, {body.rate_kind})"
    if body.supersede and open_rows:
        if body.effective_from is None:
            raise HTTPException(400, "effective_from is required when superseding an open rate")
        if body.supersede_rate_id is not None:
            open_row = next((r for r in open_rows if r.id == body.supersede_rate_id), None)
            if open_row is None:
                raise HTTPException(
                    409,
                    f"supersede_rate_id={body.supersede_rate_id} is not an open row for {key}; "
                    f"open rows: {[r.id for r in open_rows]}",
                )
        elif len(open_rows) > 1:
            # several legitimate open rows (e.g. two reduced VAT rates): refuse to guess which one is replaced
            raise HTTPException(
                409,
                f"Several rows are open for {key}: ids {[r.id for r in open_rows]}. "
                "Pass supersede_rate_id to choose the one to close, or supersede=false to add alongside them.",
            )
        else:
            open_row = open_rows[0]
        if open_row.effective_from and open_row.effective_from >= body.effective_from:
            raise HTTPException(409, "New effective_from must be after the currently open row's effective_from")
        open_row.effective_to = body.effective_from - timedelta(days=1)
        superseded = open_row
    elif open_rows:
        warnings = [f"another open row exists: id={r.id}" for r in open_rows]
    rate = TaxRate(jurisdiction_id=j.id, **data)
    db.add(rate)
    db.flush()
    if superseded is not None:
        _audit(
            db,
            entity_type=EntityType.RATE,
            obj=rate,
            change_type=ChangeType.RATE_CHANGED,
            title=f"{j.name} {body.tax_type} {body.rate_kind} rate changed",
            jurisdiction_id=j.id,
            tax_type=body.tax_type,
            old=_snapshot(superseded, ["rate", "threshold_amount", "effective_from", "effective_to"]),
            new=_snapshot(rate, ["rate", "threshold_amount", "effective_from", "effective_to"]),
            admin=admin,
            reason=body.notes,
        )
    else:
        _audit(
            db,
            entity_type=EntityType.RATE,
            obj=rate,
            change_type=ChangeType.CREATED,
            title=f"{j.name} {body.tax_type} {body.rate_kind} rate added",
            jurisdiction_id=j.id,
            tax_type=body.tax_type,
            old=None,
            new=_snapshot(rate, _AUDIT_FIELDS[TaxRate]),
            admin=admin,
            reason=None,
        )
    db.commit()
    db.refresh(rate)
    return RateCreated(**TaxRateOut.model_validate(rate).model_dump(), warnings=warnings)


@router.patch("/rates/{rate_id}", response_model=TaxRateOut)
def patch_rate(rate_id: int, body: RatePatch, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    rate = _get_or_404(db, TaxRate, rate_id, "Rate")
    data = body.model_dump(exclude_unset=True, exclude={"reason"})
    old, new = _apply_patch(rate, data)
    if rate.effective_from and rate.effective_to and rate.effective_to < rate.effective_from:
        db.rollback()
        raise HTTPException(400, "effective_to must be on or after effective_from")
    if new:
        ct = ChangeType.RATE_CHANGED if ("rate" in new or "threshold_amount" in new) else ChangeType.UPDATED
        _audit(
            db,
            entity_type=EntityType.RATE,
            obj=rate,
            change_type=ct,
            title=f"{rate.jurisdiction.name} {rate.tax_type} {rate.rate_kind} rate corrected",
            jurisdiction_id=rate.jurisdiction_id,
            tax_type=rate.tax_type,
            old=old,
            new=new,
            admin=admin,
            reason=body.reason,
        )
    db.commit()
    db.refresh(rate)
    return rate


@router.delete("/rates/{rate_id}", response_model=Message)
def delete_rate(
    rate_id: int, reason: str | None = None, admin: User = Depends(require_admin), db: Session = Depends(get_db)
):
    rate = _get_or_404(db, TaxRate, rate_id, "Rate")
    _audit(
        db,
        entity_type=EntityType.RATE,
        obj=rate,
        change_type=ChangeType.REMOVED,
        title=f"{rate.jurisdiction.name} {rate.tax_type} {rate.rate_kind} rate removed",
        jurisdiction_id=rate.jurisdiction_id,
        tax_type=rate.tax_type,
        old=_snapshot(rate, _AUDIT_FIELDS[TaxRate]),
        new=None,
        admin=admin,
        reason=reason,
    )
    db.delete(rate)
    db.commit()
    return Message(detail="deleted")


# ---------------------------------------------------------------- regulations


@router.post("/regulations", response_model=RegulationDetail, status_code=status.HTTP_201_CREATED)
def create_regulation(body: RegulationCreate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if db.scalar(select(Regulation.id).where(Regulation.source_url == str(body.source_url))):
        raise HTTPException(409, "A regulation with this source_url already exists")
    jid = resolve_jurisdiction(db, body.jurisdiction_code).id if body.jurisdiction_code else None
    reg = Regulation(
        jurisdiction_id=jid,
        **body.model_dump(exclude={"jurisdiction_code", "source_url"}),
        source_url=str(body.source_url),
    )
    db.add(reg)
    db.flush()
    _audit(
        db,
        entity_type=EntityType.REGULATION,
        obj=reg,
        change_type=ChangeType.CREATED,
        title=reg.title,
        jurisdiction_id=jid,
        tax_type=reg.tax_type,
        old=None,
        new=_snapshot(reg, _AUDIT_FIELDS[Regulation]),
        admin=admin,
        reason=None,
    )
    db.commit()
    db.refresh(reg)
    return reg


@router.patch("/regulations/{reg_id}", response_model=RegulationDetail)
def patch_regulation(
    reg_id: int, body: RegulationPatch, admin: User = Depends(require_admin), db: Session = Depends(get_db)
):
    reg = _get_or_404(db, Regulation, reg_id, "Regulation")
    data = body.model_dump(exclude_unset=True, exclude={"reason", "jurisdiction_code"})
    if "jurisdiction_code" in body.model_fields_set:
        data["jurisdiction_id"] = (
            resolve_jurisdiction(db, body.jurisdiction_code).id if body.jurisdiction_code else None
        )
    old, new = _apply_patch(reg, data)
    if new:
        ct = ChangeType.STATUS_CHANGED if "status" in new else ChangeType.UPDATED
        _audit(
            db,
            entity_type=EntityType.REGULATION,
            obj=reg,
            change_type=ct,
            title=reg.title,
            jurisdiction_id=reg.jurisdiction_id,
            tax_type=reg.tax_type,
            old=old,
            new=new,
            admin=admin,
            reason=body.reason,
        )
    db.commit()
    db.refresh(reg)
    return reg


@router.delete("/regulations/{reg_id}", response_model=Message)
def delete_regulation(
    reg_id: int, reason: str | None = None, admin: User = Depends(require_admin), db: Session = Depends(get_db)
):
    reg = _get_or_404(db, Regulation, reg_id, "Regulation")
    _audit(
        db,
        entity_type=EntityType.REGULATION,
        obj=reg,
        change_type=ChangeType.REMOVED,
        title=reg.title,
        jurisdiction_id=reg.jurisdiction_id,
        tax_type=reg.tax_type,
        old=_snapshot(reg, _AUDIT_FIELDS[Regulation]),
        new=None,
        admin=admin,
        reason=reason,
    )
    db.delete(reg)
    db.commit()
    return Message(detail="deleted")


# ---------------------------------------------------------------- court decisions


@router.post("/court-decisions", response_model=CourtDecisionOut, status_code=status.HTTP_201_CREATED)
def create_decision(body: CourtDecisionCreate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if db.scalar(select(CourtDecision.id).where(CourtDecision.source_url == str(body.source_url))):
        raise HTTPException(409, "A decision with this source_url already exists")
    jid = resolve_jurisdiction(db, body.jurisdiction_code).id if body.jurisdiction_code else None
    dec = CourtDecision(
        jurisdiction_id=jid,
        **body.model_dump(exclude={"jurisdiction_code", "source_url"}),
        source_url=str(body.source_url),
    )
    db.add(dec)
    db.flush()
    _audit(
        db,
        entity_type=EntityType.COURT_DECISION,
        obj=dec,
        change_type=ChangeType.CREATED,
        title=dec.case_name,
        jurisdiction_id=jid,
        tax_type=(dec.tax_types or [None])[0],
        old=None,
        new=_snapshot(dec, _AUDIT_FIELDS[CourtDecision]),
        admin=admin,
        reason=None,
        tax_types=dec.tax_types,
    )
    db.commit()
    db.refresh(dec)
    return dec


@router.patch("/court-decisions/{decision_id}", response_model=CourtDecisionOut)
def patch_decision(
    decision_id: int, body: CourtDecisionPatch, admin: User = Depends(require_admin), db: Session = Depends(get_db)
):
    dec = _get_or_404(db, CourtDecision, decision_id, "Decision")
    data = body.model_dump(exclude_unset=True, exclude={"reason", "jurisdiction_code"})
    if "jurisdiction_code" in body.model_fields_set:
        data["jurisdiction_id"] = (
            resolve_jurisdiction(db, body.jurisdiction_code).id if body.jurisdiction_code else None
        )
    old, new = _apply_patch(dec, data)
    if new:
        ct = ChangeType.STATUS_CHANGED if "outcome" in new else ChangeType.UPDATED
        _audit(
            db,
            entity_type=EntityType.COURT_DECISION,
            obj=dec,
            change_type=ct,
            title=dec.case_name,
            jurisdiction_id=dec.jurisdiction_id,
            tax_type=(dec.tax_types or [None])[0],
            old=old,
            new=new,
            admin=admin,
            reason=body.reason,
            tax_types=dec.tax_types,
        )
    db.commit()
    db.refresh(dec)
    return dec


@router.delete("/court-decisions/{decision_id}", response_model=Message)
def delete_decision(
    decision_id: int, reason: str | None = None, admin: User = Depends(require_admin), db: Session = Depends(get_db)
):
    dec = _get_or_404(db, CourtDecision, decision_id, "Decision")
    _audit(
        db,
        entity_type=EntityType.COURT_DECISION,
        obj=dec,
        change_type=ChangeType.REMOVED,
        title=dec.case_name,
        jurisdiction_id=dec.jurisdiction_id,
        tax_type=(dec.tax_types or [None])[0],
        old=_snapshot(dec, _AUDIT_FIELDS[CourtDecision]),
        new=None,
        admin=admin,
        reason=reason,
        tax_types=dec.tax_types,
    )
    db.delete(dec)
    db.commit()
    return Message(detail="deleted")


# ---------------------------------------------------------------- tariffs


@router.post("/tariffs", response_model=TariffOut, status_code=status.HTTP_201_CREATED)
def create_tariff(body: TariffCreate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    imp = resolve_jurisdiction(db, body.importing_jurisdiction_code)
    partner = resolve_jurisdiction(db, body.partner_jurisdiction_code) if body.partner_jurisdiction_code else None
    t = Tariff(
        importing_jurisdiction_id=imp.id,
        partner_jurisdiction_id=partner.id if partner else None,
        **body.model_dump(exclude={"importing_jurisdiction_code", "partner_jurisdiction_code"}),
    )
    db.add(t)
    db.flush()
    _audit(
        db,
        entity_type=EntityType.TARIFF,
        obj=t,
        change_type=ChangeType.CREATED,
        title=f"{imp.name}: {t.product_description}",
        jurisdiction_id=imp.id,
        tax_type="customs_tariff",
        old=None,
        new=_snapshot(t, _AUDIT_FIELDS[Tariff]),
        admin=admin,
        reason=None,
    )
    db.commit()
    db.refresh(t)
    return t


@router.patch("/tariffs/{tariff_id}", response_model=TariffOut)
def patch_tariff(
    tariff_id: int, body: TariffPatch, admin: User = Depends(require_admin), db: Session = Depends(get_db)
):
    t = _get_or_404(db, Tariff, tariff_id, "Tariff")
    data = body.model_dump(exclude_unset=True, exclude={"reason", "partner_jurisdiction_code"})
    if "partner_jurisdiction_code" in body.model_fields_set:
        data["partner_jurisdiction_id"] = (
            resolve_jurisdiction(db, body.partner_jurisdiction_code).id if body.partner_jurisdiction_code else None
        )
    old, new = _apply_patch(t, data)
    if new:
        ct = (
            ChangeType.STATUS_CHANGED
            if "status" in new
            else (ChangeType.RATE_CHANGED if "rate" in new else ChangeType.UPDATED)
        )
        _audit(
            db,
            entity_type=EntityType.TARIFF,
            obj=t,
            change_type=ct,
            title=f"{t.importing_jurisdiction.name}: {t.product_description}",
            jurisdiction_id=t.importing_jurisdiction_id,
            tax_type="customs_tariff",
            old=old,
            new=new,
            admin=admin,
            reason=body.reason,
        )
    db.commit()
    db.refresh(t)
    return t


@router.delete("/tariffs/{tariff_id}", response_model=Message)
def delete_tariff(
    tariff_id: int, reason: str | None = None, admin: User = Depends(require_admin), db: Session = Depends(get_db)
):
    t = _get_or_404(db, Tariff, tariff_id, "Tariff")
    _audit(
        db,
        entity_type=EntityType.TARIFF,
        obj=t,
        change_type=ChangeType.REMOVED,
        title=f"{t.importing_jurisdiction.name}: {t.product_description}",
        jurisdiction_id=t.importing_jurisdiction_id,
        tax_type="customs_tariff",
        old=_snapshot(t, _AUDIT_FIELDS[Tariff]),
        new=None,
        admin=admin,
        reason=reason,
    )
    db.delete(t)
    db.commit()
    return Message(detail="deleted")


# ---------------------------------------------------------------- jurisdictions


@router.patch("/jurisdictions/{code}", response_model=JurisdictionDetail)
def patch_jurisdiction(
    code: str, body: JurisdictionPatch, admin: User = Depends(require_admin), db: Session = Depends(get_db)
):
    j = resolve_jurisdiction(db, code)
    data = body.model_dump(exclude_unset=True, exclude={"reason"})
    old, new = _apply_patch(j, data)
    if new:
        _audit(
            db,
            entity_type=EntityType.JURISDICTION,
            obj=j,
            change_type=ChangeType.UPDATED,
            title=f"{j.name} profile updated",
            jurisdiction_id=j.id,
            tax_type=None,
            old=old,
            new=new,
            admin=admin,
            reason=body.reason,
        )
    db.commit()
    from taxatlas.api.v1.jurisdictions import get_jurisdiction

    return get_jurisdiction(code, db)
