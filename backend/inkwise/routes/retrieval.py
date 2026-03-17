from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from dependencies.auth import verify_firebase_token
from inkwise.schemas import (
    InkwiseRetrievalEvidenceOut,
    InkwiseRetrievalRunDetailOut,
    InkwiseRetrievalRunSummaryOut,
    InkwiseRunRetrievalRequest,
)
from inkwise.services.document_sources import InkwiseDocumentSourceService
from inkwise.services.retrieval_service import InkwiseRetrievalService, build_evidence_pack

router = APIRouter(tags=["inkwise-retrieval"])
document_source_service = InkwiseDocumentSourceService()
retrieval_service = InkwiseRetrievalService()


@router.post("/documents/{document_id}/retrieval:run", response_model=InkwiseRetrievalRunDetailOut)
def run_document_retrieval(
    document_id: uuid.UUID,
    body: InkwiseRunRetrievalRequest,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseRetrievalRunDetailOut:
    user_id = token_data["uid"]
    try:
        ready_bound_sources = document_source_service.list_ready_bound_sources(
            db,
            document_id=document_id,
            user_id=user_id,
        )
        if body.source_ids is None:
            scoped_sources = ready_bound_sources
        else:
            ready_ids = {source_id for source_id, _title in ready_bound_sources}
            invalid = [source_id for source_id in body.source_ids if source_id not in ready_ids]
            if invalid:
                raise ValueError("One or more selected sources are not ready or not bound to this document")
            title_by_id = {source_id: title for source_id, title in ready_bound_sources}
            scoped_sources = [(source_id, title_by_id[source_id]) for source_id in body.source_ids]

        run, evidence = retrieval_service.run_retrieval(
            db,
            user_id=user_id,
            document_id=document_id,
            query=body.query,
            bound_sources=scoped_sources,
            history_messages=body.history_messages,
            draft_selection_text=body.draft_selection_text,
        )
        return InkwiseRetrievalRunDetailOut(
            run=InkwiseRetrievalRunSummaryOut.model_validate(run),
            evidence=[
                InkwiseRetrievalEvidenceOut(
                    evidence_id=item.evidence_id,
                    source_id=item.source_id,
                    source_title=item.source_title,
                    page_number=item.page_number,
                    segment_id=item.segment_id,
                    segment_title=item.segment_title,
                    locator_json=item.locator_json,
                    preview_bucket=item.preview_bucket,
                    preview_object=item.preview_object,
                    excerpt=item.excerpt,
                    score=item.score,
                )
                for item in evidence
            ],
            evidence_pack=build_evidence_pack(evidence),
        )
    except FileNotFoundError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to run retrieval: {exc}") from exc


@router.get("/retrieval-runs/{retrieval_run_id}", response_model=InkwiseRetrievalRunDetailOut)
def get_retrieval_run(
    retrieval_run_id: uuid.UUID,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseRetrievalRunDetailOut:
    try:
        run, evidence = retrieval_service.get_retrieval_run_for_user(
            db,
            user_id=token_data["uid"],
            retrieval_run_id=retrieval_run_id,
        )
        return InkwiseRetrievalRunDetailOut(
            run=InkwiseRetrievalRunSummaryOut.model_validate(run),
            evidence=[
                InkwiseRetrievalEvidenceOut(
                    evidence_id=item.evidence_id,
                    source_id=item.source_id,
                    source_title=item.source_title,
                    page_number=item.page_number,
                    segment_id=item.segment_id,
                    segment_title=item.segment_title,
                    locator_json=item.locator_json,
                    preview_bucket=item.preview_bucket,
                    preview_object=item.preview_object,
                    excerpt=item.excerpt,
                    score=item.score,
                )
                for item in evidence
            ],
            evidence_pack=build_evidence_pack(evidence),
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
