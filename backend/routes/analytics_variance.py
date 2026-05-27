"""Variance analysis routes — LLM threshold/analyze/memo + CRUD on `analyses` rows."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from dependencies.analytics_rbac import LLM_ROLES, READER_ROLES, WRITER_ROLES, require_role
from models.analytics import (
    AnalysisCreateRequest,
    AnalysisListResponse,
    AnalysisResponse,
    AnalysisUpdateRequest,
    UsageMetadata,
    VarianceAnalyzeRequest,
    VarianceAnalyzeResponse,
    VarianceMemoRequest,
    VarianceMemoResponse,
    VarianceThresholdRequest,
    VarianceThresholdResponse,
)
from models.db_models import User
from services import analytics_ai_service
from services.analytics import analyses_service
from services.analytics.billing_guard import preflight_check, record_call
from services.analytics.firm_scope import require_firm_id
from services.billing_service import tokens_to_pages

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/analytics/variance", tags=["analytics-variance"])


def _usage(prompt_tokens, output_tokens) -> UsageMetadata:
    return UsageMetadata(
        prompt_tokens=prompt_tokens,
        output_tokens=output_tokens,
        total_tokens=(prompt_tokens or 0) + (output_tokens or 0) or None,
        pages=tokens_to_pages(prompt_tokens, output_tokens) or None,
    )


def _to_response(row) -> AnalysisResponse:
    return AnalysisResponse(
        id=str(row.id),
        firm_id=str(row.firm_id),
        client_id=str(row.client_id) if row.client_id else None,
        created_by_user_id=row.created_by_user_id,
        type=row.type,
        name=row.name,
        status=row.status,
        config=row.config,
        data=row.data,
        results=row.results,
        memo_content=row.memo_content,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


# ---------------------------------------------------------------------------
# LLM endpoints
# ---------------------------------------------------------------------------


@router.post("/threshold", response_model=VarianceThresholdResponse)
async def suggest_threshold(
    payload: VarianceThresholdRequest,
    actor: User = Depends(require_role(*LLM_ROLES)),
    db: Session = Depends(get_db),
):
    preflight_check(db, actor.id, "analytics_variance_threshold")
    parsed, usage = await analytics_ai_service.variance_suggest_threshold(payload.data)
    record_call(
        db,
        actor.id,
        "analytics_variance_threshold",
        usage.get("prompt_tokens"),
        usage.get("output_tokens"),
    )
    return VarianceThresholdResponse.model_validate(
        {
            **parsed,
            "usage": _usage(usage.get("prompt_tokens"), usage.get("output_tokens")).model_dump(),
        }
    )


@router.post("/analyze", response_model=VarianceAnalyzeResponse)
async def analyze_variance(
    payload: VarianceAnalyzeRequest,
    actor: User = Depends(require_role(*LLM_ROLES)),
    db: Session = Depends(get_db),
):
    preflight_check(db, actor.id, "analytics_variance_analyze")
    explanations, usage = await analytics_ai_service.variance_analyze(payload.data)
    record_call(
        db,
        actor.id,
        "analytics_variance_analyze",
        usage.get("prompt_tokens"),
        usage.get("output_tokens"),
    )
    return VarianceAnalyzeResponse(
        explanations=explanations,
        usage=_usage(usage.get("prompt_tokens"), usage.get("output_tokens")),
    )


@router.post("/memo", response_model=VarianceMemoResponse)
async def generate_memo(
    payload: VarianceMemoRequest,
    actor: User = Depends(require_role(*LLM_ROLES)),
    db: Session = Depends(get_db),
):
    preflight_check(db, actor.id, "analytics_variance_memo")
    text, usage = await analytics_ai_service.variance_memo(payload.data, payload.config)
    record_call(
        db,
        actor.id,
        "analytics_variance_memo",
        usage.get("prompt_tokens"),
        usage.get("output_tokens"),
    )
    return VarianceMemoResponse(
        text=text,
        usage=_usage(usage.get("prompt_tokens"), usage.get("output_tokens")),
    )


# ---------------------------------------------------------------------------
# CRUD over `analyses` rows where type='variance'
# ---------------------------------------------------------------------------


@router.get("", response_model=AnalysisListResponse)
async def list_variance_route(
    actor: User = Depends(require_role(*READER_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    rows = analyses_service.list_analyses(db, firm_id, type_="variance")
    return AnalysisListResponse(analyses=[_to_response(r) for r in rows])


@router.post("", response_model=AnalysisResponse)
async def create_variance_route(
    payload: AnalysisCreateRequest,
    actor: User = Depends(require_role(*WRITER_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    if payload.type != "variance":
        raise HTTPException(status_code=400, detail="Analysis type must be 'variance' for this route")
    row = analyses_service.create_analysis(
        db, firm_id, actor.id, payload=payload, expected_type="variance"
    )
    return _to_response(row)


@router.get("/{analysis_id}", response_model=AnalysisResponse)
async def get_variance_route(
    analysis_id: str,
    actor: User = Depends(require_role(*READER_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    row = analyses_service.get_analysis(db, firm_id, analysis_id)
    if row.type != "variance":
        raise HTTPException(status_code=404, detail="Analysis not found")
    return _to_response(row)


@router.put("/{analysis_id}", response_model=AnalysisResponse)
async def update_variance_route(
    analysis_id: str,
    payload: AnalysisUpdateRequest,
    actor: User = Depends(require_role(*WRITER_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    row = analyses_service.get_analysis(db, firm_id, analysis_id)
    if row.type != "variance":
        raise HTTPException(status_code=404, detail="Analysis not found")
    updated = analyses_service.update_analysis(db, firm_id, analysis_id, payload=payload)
    return _to_response(updated)


@router.delete("/{analysis_id}")
async def delete_variance_route(
    analysis_id: str,
    actor: User = Depends(require_role(*WRITER_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    row = analyses_service.get_analysis(db, firm_id, analysis_id)
    if row.type != "variance":
        raise HTTPException(status_code=404, detail="Analysis not found")
    analyses_service.delete_analysis(db, firm_id, analysis_id)
    return {"success": True}
