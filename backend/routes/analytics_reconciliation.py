"""Reconciliation routes — LLM rule generation, matching, and CRUD."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from core.database import get_db
from dependencies.analytics_rbac import LLM_ROLES, READER_ROLES, WRITER_ROLES, require_role
from models.analytics import (
    ReconciliationAdditionalPassRequest,
    ReconciliationAdditionalPassResponse,
    ReconciliationBasicRequest,
    ReconciliationCreateRequest,
    ReconciliationListResponse,
    ReconciliationMatchRequest,
    ReconciliationMatchResponse,
    ReconciliationRecord,
    ReconciliationRulesGenerateRequest,
    ReconciliationRulesGenerateResponse,
    ReconciliationUpdateRequest,
    UsageMetadata,
)
from models.db_models import User
from services import analytics_ai_service
from services.analytics import reconciliations_service
from services.analytics.billing_guard import preflight_check, record_call
from services.analytics.firm_scope import require_firm_id
from services.billing_service import tokens_to_pages

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/analytics/reconciliation", tags=["analytics-reconciliation"])


def _record_to_response(row) -> ReconciliationRecord:
    return ReconciliationRecord(
        id=str(row.id),
        firm_id=str(row.firm_id),
        client_id=str(row.client_id) if row.client_id else None,
        created_by_user_id=row.created_by_user_id,
        name=row.name,
        status=row.status,
        source_a=row.source_a,
        source_b=row.source_b,
        rules=row.rules,
        match_groups=row.match_groups,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _usage(prompt_tokens, output_tokens) -> UsageMetadata:
    return UsageMetadata(
        prompt_tokens=prompt_tokens,
        output_tokens=output_tokens,
        total_tokens=(prompt_tokens or 0) + (output_tokens or 0) or None,
        pages=tokens_to_pages(prompt_tokens, output_tokens) or None,
    )


# ---------------------------------------------------------------------------
# LLM endpoints
# ---------------------------------------------------------------------------


@router.post("/rules/generate", response_model=ReconciliationRulesGenerateResponse)
async def generate_rules(
    payload: ReconciliationRulesGenerateRequest,
    actor: User = Depends(require_role(*LLM_ROLES)),
    db: Session = Depends(get_db),
):
    preflight_check(db, actor.id, "analytics_recon_rules")
    passes, usage = await analytics_ai_service.generate_reconciliation_rules(
        payload.headers, payload.available_rules
    )
    record_call(
        db,
        actor.id,
        "analytics_recon_rules",
        usage.get("prompt_tokens"),
        usage.get("output_tokens"),
    )
    return ReconciliationRulesGenerateResponse(
        passes=passes,
        usage=_usage(usage.get("prompt_tokens"), usage.get("output_tokens")),
    )


@router.post("/rules/additional", response_model=ReconciliationAdditionalPassResponse)
async def generate_additional_pass(
    payload: ReconciliationAdditionalPassRequest,
    actor: User = Depends(require_role(*LLM_ROLES)),
    db: Session = Depends(get_db),
):
    preflight_check(db, actor.id, "analytics_recon_additional_pass")
    pass_, usage = await analytics_ai_service.generate_additional_reconciliation_pass(
        payload.instructions, payload.available_rules
    )
    record_call(
        db,
        actor.id,
        "analytics_recon_additional_pass",
        usage.get("prompt_tokens"),
        usage.get("output_tokens"),
    )
    return ReconciliationAdditionalPassResponse.model_validate(
        {
            "pass": pass_,
            "usage": _usage(usage.get("prompt_tokens"), usage.get("output_tokens")),
        }
    )


@router.post("/match", response_model=ReconciliationMatchResponse)
async def perform_match(
    payload: ReconciliationMatchRequest,
    actor: User = Depends(require_role(*LLM_ROLES)),
    db: Session = Depends(get_db),
):
    preflight_check(db, actor.id, "analytics_recon_match")
    groups, usage = await analytics_ai_service.perform_ai_assisted_match(
        payload.source_a, payload.source_b, payload.rules
    )
    record_call(
        db,
        actor.id,
        "analytics_recon_match",
        usage.get("prompt_tokens"),
        usage.get("output_tokens"),
    )
    return ReconciliationMatchResponse.model_validate(
        {
            "matchGroups": groups,
            "usage": _usage(usage.get("prompt_tokens"), usage.get("output_tokens")),
        }
    )


@router.post("/basic", response_model=ReconciliationMatchResponse)
async def reconcile_basic(
    payload: ReconciliationBasicRequest,
    actor: User = Depends(require_role(*LLM_ROLES)),
    db: Session = Depends(get_db),
):
    preflight_check(db, actor.id, "analytics_recon_basic")
    groups, usage = await analytics_ai_service.reconcile_basic(
        payload.source_a, payload.source_b
    )
    record_call(
        db,
        actor.id,
        "analytics_recon_basic",
        usage.get("prompt_tokens"),
        usage.get("output_tokens"),
    )
    return ReconciliationMatchResponse.model_validate(
        {
            "matchGroups": groups,
            "usage": _usage(usage.get("prompt_tokens"), usage.get("output_tokens")),
        }
    )


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


@router.get("", response_model=ReconciliationListResponse)
async def list_reconciliations_route(
    actor: User = Depends(require_role(*READER_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    rows = reconciliations_service.list_reconciliations(db, firm_id)
    return ReconciliationListResponse(reconciliations=[_record_to_response(r) for r in rows])


@router.post("", response_model=ReconciliationRecord)
async def create_reconciliation_route(
    payload: ReconciliationCreateRequest,
    actor: User = Depends(require_role(*WRITER_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    row = reconciliations_service.create_reconciliation(db, firm_id, actor.id, payload=payload)
    return _record_to_response(row)


@router.get("/{reconciliation_id}", response_model=ReconciliationRecord)
async def get_reconciliation_route(
    reconciliation_id: str,
    actor: User = Depends(require_role(*READER_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    return _record_to_response(
        reconciliations_service.get_reconciliation(db, firm_id, reconciliation_id)
    )


@router.put("/{reconciliation_id}", response_model=ReconciliationRecord)
async def update_reconciliation_route(
    reconciliation_id: str,
    payload: ReconciliationUpdateRequest,
    actor: User = Depends(require_role(*WRITER_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    return _record_to_response(
        reconciliations_service.update_reconciliation(
            db, firm_id, reconciliation_id, payload=payload
        )
    )


@router.delete("/{reconciliation_id}")
async def delete_reconciliation_route(
    reconciliation_id: str,
    actor: User = Depends(require_role(*WRITER_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    reconciliations_service.delete_reconciliation(db, firm_id, reconciliation_id)
    return {"success": True}
