"""Waterfall analysis routes — LLM contract extraction + CRUD on `analyses` rows."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from dependencies.auth import get_current_user_id
from models.analytics import (
    AnalysisCreateRequest,
    AnalysisListResponse,
    AnalysisResponse,
    AnalysisUpdateRequest,
    UsageMetadata,
    WaterfallExtractRequest,
    WaterfallExtractResponse,
)
from services import analytics_ai_service
from services.analytics import analyses_service
from services.analytics.billing_guard import preflight_check, record_call
from services.analytics.firm_scope import require_firm_id
from services.billing_service import tokens_to_pages

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/analytics/waterfall", tags=["analytics-waterfall"])


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


@router.post("/extract", response_model=WaterfallExtractResponse)
async def extract_waterfall(
    payload: WaterfallExtractRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    preflight_check(db, user_id, "analytics_waterfall_extract")
    parsed, usage = await analytics_ai_service.extract_waterfall(payload.document_text)
    record_call(
        db,
        user_id,
        "analytics_waterfall_extract",
        usage.get("prompt_tokens"),
        usage.get("output_tokens"),
    )
    return WaterfallExtractResponse.model_validate(
        {
            **parsed,
            "usage": _usage(usage.get("prompt_tokens"), usage.get("output_tokens")).model_dump(),
        }
    )


# ---------------------------------------------------------------------------
# CRUD (over `analyses` table where type='waterfall')
# ---------------------------------------------------------------------------


@router.get("", response_model=AnalysisListResponse)
async def list_waterfalls_route(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, user_id)
    rows = analyses_service.list_analyses(db, firm_id, type_="waterfall")
    return AnalysisListResponse(analyses=[_to_response(r) for r in rows])


@router.post("", response_model=AnalysisResponse)
async def create_waterfall_route(
    payload: AnalysisCreateRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, user_id)
    if payload.type != "waterfall":
        raise HTTPException(status_code=400, detail="Analysis type must be 'waterfall' for this route")
    row = analyses_service.create_analysis(
        db, firm_id, user_id, payload=payload, expected_type="waterfall"
    )
    return _to_response(row)


@router.get("/{analysis_id}", response_model=AnalysisResponse)
async def get_waterfall_route(
    analysis_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, user_id)
    row = analyses_service.get_analysis(db, firm_id, analysis_id)
    if row.type != "waterfall":
        raise HTTPException(status_code=404, detail="Analysis not found")
    return _to_response(row)


@router.put("/{analysis_id}", response_model=AnalysisResponse)
async def update_waterfall_route(
    analysis_id: str,
    payload: AnalysisUpdateRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, user_id)
    row = analyses_service.get_analysis(db, firm_id, analysis_id)
    if row.type != "waterfall":
        raise HTTPException(status_code=404, detail="Analysis not found")
    updated = analyses_service.update_analysis(db, firm_id, analysis_id, payload=payload)
    return _to_response(updated)


@router.delete("/{analysis_id}")
async def delete_waterfall_route(
    analysis_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, user_id)
    row = analyses_service.get_analysis(db, firm_id, analysis_id)
    if row.type != "waterfall":
        raise HTTPException(status_code=404, detail="Analysis not found")
    analyses_service.delete_analysis(db, firm_id, analysis_id)
    return {"success": True}
