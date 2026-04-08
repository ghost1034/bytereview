from __future__ import annotations

# pyright: reportAttributeAccessIssue=false, reportGeneralTypeIssues=false, reportArgumentType=false

import asyncio
import json
import logging
import uuid
from collections.abc import AsyncGenerator
from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from starlette.responses import StreamingResponse

from core.database import get_db
from dependencies.auth import verify_firebase_token
from inkwise.schemas import (
    InkwisePredictionRequest,
    InkwisePredictionResponse,
    InkwiseRetryRequest,
    InkwiseWritingToolRequest,
)
from inkwise.services.document_sources import InkwiseDocumentSourceService
from inkwise.services.document_service import InkwiseDocumentService
from inkwise.services.generation_attempts import InkwiseGenerationAttemptService
from inkwise.services.citation_text import parse_citation_text
from inkwise.services.gemini import GeminiError, generate_content, generate_text
from inkwise.services.multimodal_evidence import build_multimodal_contents
from inkwise.services.retrieval_service import InkwiseRetrievalService, build_evidence_pack
from inkwise.services.retrieval_types import evidence_item_to_payload
from inkwise.services.writing_tools_service import (
    build_grounded_prediction_prompt,
    build_grounded_prediction_retrieval_query,
    build_grounded_writing_tool_prompt,
    build_prediction_prompt,
    build_writing_tool_prompt,
    build_writing_tool_retrieval_query,
    normalize_prediction_result,
)
from inkwise.settings import get_inkwise_settings

router = APIRouter(tags=["inkwise-writing-tools"])
logger = logging.getLogger(__name__)
document_service = InkwiseDocumentService()
document_source_service = InkwiseDocumentSourceService()
retrieval_service = InkwiseRetrievalService()
generation_attempt_service = InkwiseGenerationAttemptService()


def _sse(event: str, data: object) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=True)}\n\n".encode()


def _validate_writing_tool_request(body: InkwiseWritingToolRequest) -> None:
    selection_text = (body.selection_text or "").strip()
    if not selection_text and body.action != "other":
        raise HTTPException(status_code=400, detail="A text selection is required for preset inline tools")
    if not (body.instruction or "").strip():
        raise HTTPException(status_code=400, detail="Instruction is required")


async def _stream_writing_tool_attempt(
    *,
    db: Session,
    request: Request,
    settings: Any,
    user_id: str,
    body: InkwiseWritingToolRequest,
    document: Any,
    scoped_sources: list[tuple[uuid.UUID, str]],
    attempt_id: uuid.UUID,
    fresh_retrieval: bool,
    reuse_retrieval_run_id: uuid.UUID | None,
    attempt_meta: dict[str, Any],
) -> AsyncGenerator[bytes, None]:
    retrieval_run_id: uuid.UUID | None = reuse_retrieval_run_id if (reuse_retrieval_run_id and not fresh_retrieval) else None
    evidence: list[Any] = []
    resolved_source_ids = [str(source_id) for source_id, _title in scoped_sources]
    grounded = False
    multimodal_attached_evidence_ids: list[str] = []

    yield _sse(
        "meta",
        {
            "provider": {"name": "vertex_ai", "model": settings.gemini_model},
            "grounded": False,
            "sources": resolved_source_ids,
            "attempt_id": str(attempt_id),
        },
    )

    current_prompt = build_writing_tool_prompt(body=body, document=document)
    if scoped_sources and document is not None:
        try:
            if reuse_retrieval_run_id is not None and not fresh_retrieval:
                _run, evidence = retrieval_service.get_retrieval_run_for_user(
                    db,
                    user_id=user_id,
                    retrieval_run_id=reuse_retrieval_run_id,
                )
                retrieval_run_id = reuse_retrieval_run_id
            else:
                retrieval_run, evidence = retrieval_service.run_retrieval(
                    db,
                    user_id=user_id,
                    document_id=document.id,
                    thread_id=None,
                    query=build_writing_tool_retrieval_query(body=body),
                    bound_sources=scoped_sources,
                    draft_selection_text=body.surrounding_text,
                )
                retrieval_run_id = cast(uuid.UUID, retrieval_run.id)
        except Exception as exc:
            generation_attempt_service.fail_attempt(db, attempt_id=attempt_id, message=str(exc), retrieval_run_id=retrieval_run_id)
            yield _sse(
                "meta",
                {
                    "grounded": False,
                    "grounding_fallback": "retrieval_error",
                    "sources": resolved_source_ids,
                    "attempt_id": str(attempt_id),
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
                        "attempt_id": str(attempt_id),
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
                        "attempt_id": str(attempt_id),
                    },
                )

    try:
        multimodal_bundle = build_multimodal_contents(
            prompt=current_prompt,
            evidence=evidence,
            max_files=100,
        )
        multimodal_attached_evidence_ids = list(multimodal_bundle.attached_evidence_ids)
        if multimodal_bundle.has_attachments:
            result = await generate_content(
                model=settings.gemini_model,
                contents=multimodal_bundle.contents,
                generation_config={"temperature": 0.3},
                timeout_seconds=60,
            )
        else:
            result = await generate_text(
                model=settings.gemini_model,
                prompt=current_prompt,
                temperature=0.3,
                timeout_seconds=60,
            )
    except GeminiError as exc:
        generation_attempt_service.fail_attempt(db, attempt_id=attempt_id, message=str(exc), retrieval_run_id=retrieval_run_id)
        yield _sse("meta", {"error": "provider_error", "attempt_id": str(attempt_id)})
        yield _sse("done", {"ok": False, "attempt_id": str(attempt_id)})
        return

    parsed_citation_text = parse_citation_text(text=result.text, evidence=evidence)
    text = parsed_citation_text.plain_text
    for idx in range(0, len(text), 80):
        if await request.is_disconnected():
            generation_attempt_service.fail_attempt(db, attempt_id=attempt_id, message="cancelled", retrieval_run_id=retrieval_run_id)
            return
        yield _sse("token", {"text": text[idx : idx + 80]})
        await asyncio.sleep(0)

    generation_attempt_service.complete_attempt(
        db,
        attempt_id=attempt_id,
        response_text=text,
        citations_json={
            "evidence": [evidence_item_to_payload(item) for item in evidence],
            "citations": parsed_citation_text.citations,
            "segments": parsed_citation_text.segments,
            "content_with_citations": parsed_citation_text.content_with_citations,
        },
        retrieval_run_id=retrieval_run_id,
        meta_json={**attempt_meta, "multimodal_evidence_ids": multimodal_attached_evidence_ids},
    )

    done_payload: dict[str, Any] = {"ok": True, "grounded": grounded, "attempt_id": str(attempt_id)}
    if retrieval_run_id is not None:
        done_payload["retrieval_run_id"] = str(retrieval_run_id)
    done_payload["content_with_citations"] = parsed_citation_text.content_with_citations
    done_payload["segments"] = parsed_citation_text.segments
    done_payload["citations"] = parsed_citation_text.citations
    yield _sse("done", done_payload)


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

    ready_bound_sources = document_source_service.list_ready_bound_sources(
        db,
        document_id=document_id,
        user_id=token_data["uid"],
    )
    attempt = generation_attempt_service.create_attempt(
        db,
        user_id=token_data["uid"],
        kind="prediction",
        document_id=document_id,
        request_json={
            "before_text_len": len(body.before_text),
            "after_text_len": len(body.after_text or ""),
            "current_block_text": body.current_block_text,
            "source_ids": [str(source_id) for source_id, _title in ready_bound_sources],
        },
        provider="vertex_ai",
        model=settings.gemini_model,
    )

    prompt = build_prediction_prompt(body=body, document=document)
    grounded = False
    retrieval_run_id: uuid.UUID | None = None
    evidence: list[Any] = []
    multimodal_attached_evidence_ids: list[str] = []
    if ready_bound_sources:
        try:
            retrieval_run, evidence = retrieval_service.run_retrieval(
                db,
                user_id=token_data["uid"],
                document_id=document_id,
                thread_id=None,
                query=build_grounded_prediction_retrieval_query(body=body, document=document),
                bound_sources=ready_bound_sources,
                draft_selection_text=(body.current_block_text or body.before_text[-3000:]).strip() or None,
                max_evidence=8,
                max_total_chars=12000,
            )
            retrieval_run_id = cast(uuid.UUID, retrieval_run.id)
            if evidence:
                grounded = True
                prompt = build_grounded_prediction_prompt(
                    body=body,
                    document=document,
                    evidence_pack=build_evidence_pack(evidence),
                )
        except Exception:
            logger.warning(
                "Inkwise prediction retrieval failed; falling back to ungrounded prediction",
                extra={"document_id": str(document_id), "attempt_id": str(attempt.id)},
                exc_info=True,
            )
            retrieval_run_id = None
            evidence = []
            grounded = False

    try:
        multimodal_bundle = build_multimodal_contents(
            prompt=prompt,
            evidence=evidence,
            max_files=100,
        )
        multimodal_attached_evidence_ids = list(multimodal_bundle.attached_evidence_ids)
        if multimodal_bundle.has_attachments:
            result = await generate_content(
                model=settings.gemini_model,
                contents=multimodal_bundle.contents,
                generation_config={
                    "temperature": 0.2,
                    "max_output_tokens": 65536,
                },
                timeout_seconds=20,
            )
        else:
            result = await generate_text(
                model=settings.gemini_model,
                prompt=prompt,
                temperature=0.2,
                max_output_tokens=65536,
                timeout_seconds=20,
            )
    except GeminiError as exc:
        generation_attempt_service.fail_attempt(db, attempt_id=cast(uuid.UUID, attempt.id), message=str(exc), retrieval_run_id=retrieval_run_id)
        raise HTTPException(status_code=502, detail=f"Prediction provider error: {exc}") from exc

    normalized_prediction = normalize_prediction_result(raw_text=result.text, body=body)
    parsed_prediction = parse_citation_text(text=normalized_prediction.text, evidence=evidence)
    suggestion_text = parsed_prediction.plain_text
    if not suggestion_text:
        logger.info(
            "Inkwise prediction returned no suggestion after normalization",
            extra={
                "document_id": str(document_id),
                "attempt_id": str(attempt.id),
                "grounded": grounded,
                "reason": normalized_prediction.reason,
            },
        )
    generation_attempt_service.complete_attempt(
        db,
        attempt_id=cast(uuid.UUID, attempt.id),
        response_text=suggestion_text,
        citations_json={
            "evidence": [evidence_item_to_payload(item) for item in evidence],
            "citations": parsed_prediction.citations,
            "segments": parsed_prediction.segments,
            "content_with_citations": parsed_prediction.content_with_citations,
        },
        retrieval_run_id=retrieval_run_id,
        meta_json={
            "grounded": grounded,
            "evidence_count": len(evidence),
            "multimodal_evidence_ids": multimodal_attached_evidence_ids,
            "normalization_reason": normalized_prediction.reason,
        },
    )
    return InkwisePredictionResponse(
        suggestion_text=suggestion_text,
        content_with_citations=parsed_prediction.content_with_citations,
        segments=parsed_prediction.segments,
        grounded=grounded,
        retrieval_run_id=retrieval_run_id,
        attempt_id=cast(uuid.UUID, attempt.id),
        evidence_count=len(evidence),
        evidence=[evidence_item_to_payload(item) for item in evidence],
        citations=parsed_prediction.citations,
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
    _validate_writing_tool_request(body)

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

    generation_group_id = uuid.uuid4()
    attempt = generation_attempt_service.create_attempt(
        db,
        user_id=user_id,
        kind="writing_tool",
        document_id=cast(uuid.UUID | None, document.id if document is not None else None),
        generation_group_id=generation_group_id,
        request_json={
            "action": body.action,
            "document_id": str(document.id) if document is not None else None,
            "source_ids": [str(source_id) for source_id, _title in scoped_sources],
            "selection_text": body.selection_text,
            "surrounding_text": body.surrounding_text,
            "instruction": body.instruction,
        },
        provider="vertex_ai",
        model=settings.gemini_model,
        meta_json={"fresh_retrieval": True},
    )

    async def gen() -> AsyncGenerator[bytes, None]:
        async for chunk in _stream_writing_tool_attempt(
            db=db,
            request=request,
            settings=settings,
            user_id=user_id,
            body=body,
            document=document,
            scoped_sources=scoped_sources,
            attempt_id=cast(uuid.UUID, attempt.id),
            fresh_retrieval=True,
            reuse_retrieval_run_id=None,
            attempt_meta={"fresh_retrieval": True},
        ):
            yield chunk

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/writing-tools/{attempt_id}:retry")
async def retry_writing_tool_output(
    attempt_id: uuid.UUID,
    body: InkwiseRetryRequest,
    request: Request,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    user_id = token_data["uid"]
    settings = get_inkwise_settings()

    try:
        prior_attempt = generation_attempt_service.get_attempt_for_user(db, user_id=user_id, attempt_id=attempt_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if str(prior_attempt.kind) != "writing_tool":
        raise HTTPException(status_code=400, detail="This generation attempt is not a writing tool attempt")

    request_json = cast(dict[str, Any], prior_attempt.request_json or {})
    document_id_value = request_json.get("document_id")
    document = None
    if document_id_value:
        try:
            document = document_service.get_document_or_404(db, user_id=user_id, document_id=uuid.UUID(str(document_id_value)))
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    retry_body = InkwiseWritingToolRequest(
        action=str(request_json.get("action") or "coherent"),
        document_id=uuid.UUID(str(document_id_value)) if document_id_value else None,
        source_ids=[uuid.UUID(str(value)) for value in (request_json.get("source_ids") or [])],
        selection_text=request_json.get("selection_text"),
        surrounding_text=request_json.get("surrounding_text"),
        instruction=str(request_json.get("instruction") or ""),
    )
    _validate_writing_tool_request(retry_body)

    ready_bound_sources: list[tuple[uuid.UUID, str]] = []
    if document is not None:
        ready_bound_sources = document_source_service.list_ready_bound_sources(
            db,
            document_id=cast(uuid.UUID, document.id),
            user_id=user_id,
        )

    scoped_sources = ready_bound_sources
    if retry_body.source_ids is not None:
        if document is None:
            raise HTTPException(status_code=400, detail="document_id is required when source_ids are provided")
        if not retry_body.source_ids:
            scoped_sources = []
        else:
            ready_ids = [source_id for source_id, _title in ready_bound_sources]
            ready_set = set(ready_ids)
            invalid = [source_id for source_id in retry_body.source_ids if source_id not in ready_set]
            if invalid:
                raise HTTPException(status_code=400, detail="One or more selected sources are not ready or not bound to this document")
            title_by_id = {source_id: title for source_id, title in ready_bound_sources}
            scoped_sources = [(source_id, title_by_id[source_id]) for source_id in retry_body.source_ids]

    retry_attempt = generation_attempt_service.create_attempt(
        db,
        user_id=user_id,
        kind="writing_tool",
        document_id=cast(uuid.UUID | None, document.id if document is not None else None),
        parent_attempt_id=attempt_id,
        generation_group_id=cast(uuid.UUID, prior_attempt.generation_group_id),
        retrieval_run_id=cast(uuid.UUID | None, prior_attempt.retrieval_run_id),
        request_json={
            **request_json,
            "fresh_retrieval": bool(body.fresh_retrieval),
            "retry_of_attempt_id": str(attempt_id),
        },
        provider="vertex_ai",
        model=settings.gemini_model,
        meta_json={"fresh_retrieval": bool(body.fresh_retrieval), "retry_of_attempt_id": str(attempt_id)},
    )

    async def gen() -> AsyncGenerator[bytes, None]:
        async for chunk in _stream_writing_tool_attempt(
            db=db,
            request=request,
            settings=settings,
            user_id=user_id,
            body=retry_body,
            document=document,
            scoped_sources=scoped_sources,
            attempt_id=cast(uuid.UUID, retry_attempt.id),
            fresh_retrieval=bool(body.fresh_retrieval),
            reuse_retrieval_run_id=None if body.fresh_retrieval else cast(uuid.UUID | None, prior_attempt.retrieval_run_id),
            attempt_meta={"fresh_retrieval": bool(body.fresh_retrieval), "retry_of_attempt_id": str(attempt_id)},
        ):
            yield chunk

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
