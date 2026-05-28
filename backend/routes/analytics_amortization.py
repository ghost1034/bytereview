"""Amortization routes — LLM extraction, deterministic schedule generation,
compliance check, and CRUD on `amortizations` + `journal_entries` rows.
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from core.database import get_db
from dependencies.analytics_rbac import LLM_ROLES, READER_ROLES, WRITER_ROLES, require_role
from models.analytics import (
    AmortizationComplianceRequest,
    AmortizationComplianceResponse,
    AmortizationCreateRequest,
    AmortizationExtractRequest,
    AmortizationExtractResponse,
    AmortizationListResponse,
    AmortizationResponse,
    AmortizationScheduleRequest,
    AmortizationScheduleResponse,
    AmortizationUpdateRequest,
    JournalEntryCreateRequest,
    JournalEntryListResponse,
    JournalEntryResponse,
    UsageMetadata,
)
from models.db_models import User
from services import amortization_math, analytics_ai_service
from services.analytics import amortizations_service
from services.analytics.billing_guard import preflight_check, record_call
from services.analytics.firm_scope import require_firm_id
from services.billing_service import tokens_to_pages

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/analytics/amortization", tags=["analytics-amortization"])


def _usage(prompt_tokens, output_tokens) -> UsageMetadata:
    return UsageMetadata(
        prompt_tokens=prompt_tokens,
        output_tokens=output_tokens,
        total_tokens=(prompt_tokens or 0) + (output_tokens or 0) or None,
        pages=tokens_to_pages(prompt_tokens, output_tokens) or None,
    )


def _to_response(row) -> AmortizationResponse:
    return AmortizationResponse(
        id=str(row.id),
        firm_id=str(row.firm_id),
        client_id=str(row.client_id) if row.client_id else None,
        created_by_user_id=row.created_by_user_id,
        asset_name=row.asset_name,
        asset_type=row.asset_type,
        cost_basis=float(row.cost_basis) if row.cost_basis is not None else None,
        salvage_value=float(row.salvage_value) if row.salvage_value is not None else None,
        useful_life_months=row.useful_life_months,
        gaap_method=row.gaap_method,
        tax_method=row.tax_method,
        start_date=row.start_date,
        vendor=row.vendor,
        status=row.status,
        approval_status=row.approval_status,
        type_specific=row.type_specific,
        schedule=row.schedule,
        tax_schedule=row.tax_schedule,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _journal_entry_to_response(row) -> JournalEntryResponse:
    return JournalEntryResponse(
        id=str(row.id),
        firm_id=str(row.firm_id),
        client_id=str(row.client_id) if row.client_id else None,
        amortization_id=str(row.amortization_id) if row.amortization_id else None,
        period=row.period,
        entries=row.entries or [],
        created_at=row.created_at,
    )


# ---------------------------------------------------------------------------
# LLM endpoints
# ---------------------------------------------------------------------------


@router.post("/extract", response_model=AmortizationExtractResponse)
async def extract_amortization(
    payload: AmortizationExtractRequest,
    actor: User = Depends(require_role(*LLM_ROLES)),
    db: Session = Depends(get_db),
):
    preflight_check(db, actor.id, "analytics_amort_extract")
    parsed, usage = await analytics_ai_service.extract_amortization(payload.document_text)
    record_call(
        db,
        actor.id,
        "analytics_amort_extract",
        usage.get("prompt_tokens"),
        usage.get("output_tokens"),
    )
    return AmortizationExtractResponse.model_validate(
        {
            "form": parsed.get("form", {}) if isinstance(parsed, dict) else {},
            "confidenceScores": parsed.get("confidenceScores", {}) if isinstance(parsed, dict) else {},
            "usage": _usage(usage.get("prompt_tokens"), usage.get("output_tokens")),
        }
    )


@router.post("/compliance", response_model=AmortizationComplianceResponse)
async def compliance_check(
    payload: AmortizationComplianceRequest,
    actor: User = Depends(require_role(*LLM_ROLES)),
    db: Session = Depends(get_db),
):
    preflight_check(db, actor.id, "analytics_amort_compliance")
    insight, usage = await analytics_ai_service.amortization_compliance_check(payload.form)
    record_call(
        db,
        actor.id,
        "analytics_amort_compliance",
        usage.get("prompt_tokens"),
        usage.get("output_tokens"),
    )
    return AmortizationComplianceResponse(
        insight=insight,
        usage=_usage(usage.get("prompt_tokens"), usage.get("output_tokens")),
    )


# ---------------------------------------------------------------------------
# Deterministic schedule generation (no LLM)
# ---------------------------------------------------------------------------


@router.post("/schedule", response_model=AmortizationScheduleResponse)
async def generate_schedule(
    payload: AmortizationScheduleRequest,
    actor: User = Depends(require_role(*READER_ROLES)),  # noqa: ARG001 (auth-only)
    db: Session = Depends(get_db),  # noqa: ARG001
):
    try:
        schedule = amortization_math.generate_schedule(
            payload.method,
            asset_type=payload.asset_type,
            cost_basis=payload.cost_basis,
            salvage_value=payload.salvage_value,
            useful_life_months=payload.useful_life_months,
            start_date=payload.start_date,
            declining_multiplier=payload.declining_multiplier,
            annual_rate=payload.annual_rate,
            payment_amount=payload.payment_amount,
            ibr=payload.ibr,
            direct_costs=payload.direct_costs,
            prepaid=payload.prepaid,
            incentives=payload.incentives,
            property_class=payload.property_class,
            bonus_percent=payload.bonus_percent,
            section_179=payload.section179,
            start_year=payload.start_year,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return AmortizationScheduleResponse(schedule=schedule)


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


@router.get("", response_model=AmortizationListResponse)
async def list_amortizations_route(
    actor: User = Depends(require_role(*READER_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    rows = amortizations_service.list_amortizations(db, firm_id)
    return AmortizationListResponse(amortizations=[_to_response(r) for r in rows])


@router.post("", response_model=AmortizationResponse)
async def create_amortization_route(
    payload: AmortizationCreateRequest,
    actor: User = Depends(require_role(*WRITER_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    return _to_response(
        amortizations_service.create_amortization(db, firm_id, actor.id, payload=payload)
    )


@router.get("/{amortization_id}", response_model=AmortizationResponse)
async def get_amortization_route(
    amortization_id: str,
    actor: User = Depends(require_role(*READER_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    return _to_response(amortizations_service.get_amortization(db, firm_id, amortization_id))


@router.put("/{amortization_id}", response_model=AmortizationResponse)
async def update_amortization_route(
    amortization_id: str,
    payload: AmortizationUpdateRequest,
    actor: User = Depends(require_role(*WRITER_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    return _to_response(
        amortizations_service.update_amortization(
            db, firm_id, amortization_id, payload=payload, actor_user_id=actor.id
        )
    )


@router.delete("/{amortization_id}")
async def delete_amortization_route(
    amortization_id: str,
    actor: User = Depends(require_role(*WRITER_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    amortizations_service.delete_amortization(
        db, firm_id, amortization_id, actor_user_id=actor.id
    )
    return {"success": True}


# ---------------------------------------------------------------------------
# Journal entries
# ---------------------------------------------------------------------------


@router.get("/journal-entries/list", response_model=JournalEntryListResponse)
async def list_journal_entries_route(
    amortization_id: Optional[str] = Query(default=None),
    actor: User = Depends(require_role(*READER_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    rows = amortizations_service.list_journal_entries(db, firm_id, amortization_id)
    return JournalEntryListResponse(
        journal_entries=[_journal_entry_to_response(r) for r in rows]
    )


@router.post("/journal-entries", response_model=JournalEntryResponse)
async def create_journal_entry_route(
    payload: JournalEntryCreateRequest,
    actor: User = Depends(require_role(*WRITER_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    row = amortizations_service.create_journal_entry(
        db, firm_id, payload=payload, actor_user_id=actor.id
    )
    return _journal_entry_to_response(row)
