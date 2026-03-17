from __future__ import annotations

# pyright: reportAttributeAccessIssue=false, reportGeneralTypeIssues=false, reportArgumentType=false

import asyncio
import json
import uuid
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from starlette.responses import StreamingResponse

from core.database import get_db
from dependencies.auth import verify_firebase_token
from inkwise.schemas import (
    InkwisePredictionRequest,
    InkwisePredictionResponse,
    InkwiseWritingToolRequest,
)
from inkwise.services.document_sources import InkwiseDocumentSourceService
from inkwise.services.document_service import InkwiseDocumentService
from inkwise.services.gemini import GeminiError, generate_text
from inkwise.services.retrieval_service import InkwiseRetrievalService, build_evidence_pack
from inkwise.services.retrieval_types import evidence_item_to_payload
from inkwise.services.writing_tools_service import (
    build_grounded_writing_tool_prompt,
    build_prediction_prompt,
    build_writing_tool_prompt,
    build_writing_tool_retrieval_query,
    normalize_prediction_text,
)
from inkwise.settings import get_inkwise_settings

router = APIRouter(tags=["inkwise-writing-tools"])
document_service = InkwiseDocumentService()
document_source_service = InkwiseDocumentSourceService()
retrieval_service = InkwiseRetrievalService()


def _sse(event: str, data: object) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=True)}\n\n".encode()


@router.post("/documents/{document_id}/predictions", response_model=InkwisePredictionResponse)
async def create_prediction(
    document_id: uuid.UUID,
    body: InkwisePredictionRequest,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwisePredictionResponse:
    settings = get_inkwise_settings()
    try:
        document = document_service.get_document_or_404(db, user_id=token_data["uid"], document_id=document_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    prompt = build_prediction_prompt(body=body, document=document)
    try:
        result = await generate_text(
            model=settings.gemini_model,
            prompt=prompt,
            temperature=0.2,
            max_output_tokens=65536,
            timeout_seconds=20,
        )
    except GeminiError as exc:
        raise HTTPException(status_code=502, detail=f"Prediction provider error: {exc}") from exc

    suggestion_text = normalize_prediction_text(raw_text=result.text, body=body)
    return InkwisePredictionResponse(
        suggestion_text=suggestion_text,
        grounded=False,
        provider="vertex_ai",
        model=settings.gemini_model,
    )


@router.post("/writing-tools:stream")
async def stream_writing_tool_output(
    body: InkwiseWritingToolRequest,
    request: Request,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    user_id = token_data["uid"]
    settings = get_inkwise_settings()

    document = None
    if body.document_id is not None:
        try:
            document = document_service.get_document_or_404(db, user_id=user_id, document_id=body.document_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    ready_bound_sources: list[tuple[uuid.UUID, str]] = []
    if document is not None:
        ready_bound_sources = document_source_service.list_ready_bound_sources(
            db,
            document_id=document.id,
            user_id=user_id,
        )

    scoped_sources = ready_bound_sources
    if body.source_ids is not None:
        if document is None:
            raise HTTPException(status_code=400, detail="document_id is required when source_ids are provided")
        if not body.source_ids:
            scoped_sources = []
        else:
            ready_ids = [source_id for source_id, _title in ready_bound_sources]
            ready_set = set(ready_ids)
            invalid = [source_id for source_id in body.source_ids if source_id not in ready_set]
            if invalid:
                raise HTTPException(
                    status_code=400,
                    detail="One or more selected sources are not ready or not bound to this document",
                )
            title_by_id = {source_id: title for source_id, title in ready_bound_sources}
            scoped_sources = [(source_id, title_by_id[source_id]) for source_id in body.source_ids]

    base_prompt = build_writing_tool_prompt(body=body, document=document)

    async def gen() -> AsyncGenerator[bytes, None]:
        retrieval_run_id: uuid.UUID | None = None
        evidence: list[Any] = []
        resolved_source_ids = [str(source_id) for source_id, _title in scoped_sources]
        grounded = False

        yield _sse(
            "meta",
            {
                "provider": {"name": "vertex_ai", "model": settings.gemini_model},
                "grounded": False,
                "sources": resolved_source_ids,
            },
        )

        current_prompt = base_prompt
        if scoped_sources and document is not None:
            try:
                retrieval_run, evidence = retrieval_service.run_retrieval(
                    db,
                    user_id=user_id,
                    document_id=document.id,
                    thread_id=None,
                    query=build_writing_tool_retrieval_query(body=body),
                    bound_sources=scoped_sources,
                    draft_selection_text=body.surrounding_text,
                )
                retrieval_run_id = retrieval_run.id
            except Exception:
                retrieval_run_id = None
                evidence = []
                yield _sse(
                    "meta",
                    {
                        "grounded": False,
                        "grounding_fallback": "retrieval_error",
                        "sources": resolved_source_ids,
                    },
                )
            else:
                if evidence:
                    grounded = True
                    current_prompt = build_grounded_writing_tool_prompt(
                        body=body,
                        document=document,
                        evidence_pack=build_evidence_pack(evidence),
                    )
                    yield _sse(
                        "meta",
                        {
                            "grounded": True,
                            "retrieval_run_id": str(retrieval_run_id),
                            "evidence_count": len(evidence),
                            "evidence": [evidence_item_to_payload(item) for item in evidence],
                            "sources": resolved_source_ids,
                        },
                    )
                else:
                    yield _sse(
                        "meta",
                        {
                            "grounded": False,
                            "grounding_fallback": "no_evidence",
                            "retrieval_run_id": str(retrieval_run_id) if retrieval_run_id is not None else None,
                            "evidence": [],
                            "sources": resolved_source_ids,
                        },
                    )

        try:
            result = await generate_text(
                model=settings.gemini_model,
                prompt=current_prompt,
                temperature=0.3,
                timeout_seconds=60,
            )
        except GeminiError:
            yield _sse("meta", {"error": "provider_error"})
            yield _sse("done", {"ok": False})
            return

        text = result.text
        for idx in range(0, len(text), 80):
            if await request.is_disconnected():
                return
            yield _sse("token", {"text": text[idx : idx + 80]})
            await asyncio.sleep(0)

        done_payload: dict[str, Any] = {"ok": True, "grounded": grounded}
        if retrieval_run_id is not None:
            done_payload["retrieval_run_id"] = str(retrieval_run_id)
        yield _sse("done", done_payload)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
