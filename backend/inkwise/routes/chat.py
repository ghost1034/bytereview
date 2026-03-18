from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import AsyncGenerator
from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from starlette.responses import StreamingResponse

from core.database import get_db
from dependencies.auth import verify_firebase_token
from inkwise.schemas import (
    InkwiseChatMessageOut,
    InkwiseRetryRequest,
    InkwiseChatSendRequest,
    InkwiseChatThreadCreateRequest,
    InkwiseChatThreadOut,
    InkwiseChatThreadsResponse,
    InkwisePaginatedChatMessages,
)
from inkwise.services.chat_service import (
    InkwiseChatService,
    build_grounded_chat_prompt,
    extract_citations,
    prepare_grounded_chat_history,
    truncate_text,
)
from inkwise.services.document_sources import InkwiseDocumentSourceService
from inkwise.services.generation_attempts import InkwiseGenerationAttemptService
from inkwise.services.gemini import GeminiError, generate_text
from inkwise.services.retrieval_service import InkwiseRetrievalService, build_evidence_pack
from inkwise.services.retrieval_types import evidence_item_to_payload
from inkwise.services.source_service import InkwiseSourceService
from inkwise.settings import get_inkwise_settings

router = APIRouter(prefix="/chat", tags=["inkwise-chat"])
chat_service = InkwiseChatService()
document_source_service = InkwiseDocumentSourceService()
retrieval_service = InkwiseRetrievalService()
generation_attempt_service = InkwiseGenerationAttemptService()
user_support = InkwiseSourceService()


def _sse(event: str, data: object) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=True)}\n\n".encode()


def _resolve_scoped_chat_sources(
    *,
    ready_bound_sources: list[tuple[uuid.UUID, str]],
    scoped_ids: list[uuid.UUID] | None,
) -> tuple[list[uuid.UUID], list[tuple[uuid.UUID, str]]]:
    ready_ids = [source_id for source_id, _title in ready_bound_sources]
    ready_set = set(ready_ids)
    title_by_id = {source_id: title for source_id, title in ready_bound_sources}

    resolved_ids = ready_ids
    if scoped_ids is not None:
        if not scoped_ids:
            raise HTTPException(status_code=400, detail="source_ids must include at least one source")
        invalid = [source_id for source_id in scoped_ids if source_id not in ready_set]
        if invalid:
            raise HTTPException(
                status_code=400,
                detail="One or more selected sources are not ready or not bound to this document",
            )
        resolved_ids = list(scoped_ids)
    return resolved_ids, [(source_id, title_by_id.get(source_id, "")) for source_id in resolved_ids]


async def _stream_chat_attempt(
    *,
    db: Session,
    request: Request,
    user_id: str,
    settings: Any,
    thread_db_id: uuid.UUID,
    thread_document_id: uuid.UUID,
    document: Any,
    prompt_question: str,
    scoped_source_ids: list[uuid.UUID],
    bound_sources: list[tuple[uuid.UUID, str]],
    draft_text: str,
    grounded_history_messages: list[dict[str, str]],
    grounded_history_meta: dict[str, Any],
    history_messages: list[dict[str, str]],
    assistant_provider_meta: dict[str, Any],
    attempt_id: uuid.UUID,
    fresh_retrieval: bool = False,
    reuse_retrieval_run_id: uuid.UUID | None = None,
) -> AsyncGenerator[bytes, None]:
    assistant_text = ""
    retrieval_run_id: uuid.UUID | None = None
    evidence: list[Any] = []
    try:
        yield _sse(
            "meta",
            {
                "provider": {"name": "vertex_ai", "model": settings.grounded_model},
                "grounded": True,
                "sources": [str(source_id) for source_id in scoped_source_ids],
                "draft_selection_attached": bool(draft_text),
                "attempt_id": str(attempt_id),
            },
        )

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
                document_id=thread_document_id,
                thread_id=thread_db_id,
                query=prompt_question,
                bound_sources=bound_sources,
                history_messages=history_messages,
                draft_selection_text=draft_text,
            )
            retrieval_run_id = cast(uuid.UUID, retrieval_run.id)

        if not evidence:
            assistant_text = (
                "I couldn't find any relevant evidence in the bound sources for that question. "
                "Try the section heading, an exact defined term, or a page or clause number."
            )
            for idx in range(0, len(assistant_text), 80):
                if await request.is_disconnected():
                    raise asyncio.CancelledError
                yield _sse("token", {"text": assistant_text[idx : idx + 80]})
                await asyncio.sleep(0)

            assistant_meta = {
                **assistant_provider_meta,
                "reason": "no_evidence",
                "attempt_id": str(attempt_id),
            }
            assistant_message = chat_service.create_assistant_message(
                db,
                thread_id=thread_db_id,
                content=assistant_text,
                citations=[],
                retrieval_run_id=retrieval_run_id,
                provider="system",
                provider_meta=assistant_meta,
            )
            generation_attempt_service.complete_attempt(
                db,
                attempt_id=attempt_id,
                response_text=assistant_text,
                citations_json={"retrieval_run_id": str(retrieval_run_id) if retrieval_run_id else None, "citations": []},
                retrieval_run_id=retrieval_run_id,
                chat_message_id=cast(uuid.UUID, assistant_message.id),
                meta_json=assistant_meta,
            )
            yield _sse("meta", {"citations": [], "evidence": [], "retrieval_run_id": str(retrieval_run_id), "attempt_id": str(attempt_id)})
            yield _sse("done", {"message_id": str(assistant_message.id), "retrieval_run_id": str(retrieval_run_id), "attempt_id": str(attempt_id)})
            return

        evidence_pack = build_evidence_pack(evidence)
        allowed_ids = [item.evidence_id for item in evidence]
        yield _sse(
            "meta",
            {
                "retrieval_run_id": str(retrieval_run_id),
                "evidence_count": len(evidence),
                "evidence_ids": allowed_ids,
                "evidence": [evidence_item_to_payload(item) for item in evidence],
                "attempt_id": str(attempt_id),
            },
        )

        prompt = build_grounded_chat_prompt(
            question=prompt_question,
            document=document,
            evidence_pack=evidence_pack,
            allowed_ids=allowed_ids,
            draft_selection_text=draft_text or None,
            history_messages=grounded_history_messages,
        )
        result = await generate_text(
            model=settings.grounded_model,
            prompt=prompt,
            temperature=0.2,
            max_output_tokens=65536,
            timeout_seconds=120,
        )
        assistant_text = result.text

        for idx in range(0, len(assistant_text), 80):
            if await request.is_disconnected():
                raise asyncio.CancelledError
            yield _sse("token", {"text": assistant_text[idx : idx + 80]})
            await asyncio.sleep(0)

    except asyncio.CancelledError:
        generation_attempt_service.fail_attempt(db, attempt_id=attempt_id, message="cancelled", retrieval_run_id=retrieval_run_id)
        return
    except GeminiError as exc:
        generation_attempt_service.fail_attempt(db, attempt_id=attempt_id, message=str(exc), retrieval_run_id=retrieval_run_id)
        yield _sse("meta", {"error": "provider_error", "message": str(exc), "attempt_id": str(attempt_id)})
        return
    except Exception as exc:
        generation_attempt_service.fail_attempt(db, attempt_id=attempt_id, message=str(exc), retrieval_run_id=retrieval_run_id)
        yield _sse("meta", {"error": "provider_error", "message": str(exc), "attempt_id": str(attempt_id)})
        return

    if retrieval_run_id is None:
        generation_attempt_service.fail_attempt(db, attempt_id=attempt_id, message="Missing retrieval_run_id")
        yield _sse("meta", {"error": "internal_error", "message": "Missing retrieval_run_id", "attempt_id": str(attempt_id)})
        return

    citations = extract_citations(assistant_text=assistant_text, evidence=evidence)
    assistant_meta = {**assistant_provider_meta, "attempt_id": str(attempt_id)}
    assistant_message = chat_service.create_assistant_message(
        db,
        thread_id=thread_db_id,
        content=assistant_text,
        citations=citations,
        retrieval_run_id=retrieval_run_id,
        provider="vertex_ai",
        provider_meta=assistant_meta,
    )
    generation_attempt_service.complete_attempt(
        db,
        attempt_id=attempt_id,
        response_text=assistant_text,
        citations_json={
            "retrieval_run_id": str(retrieval_run_id),
            "citations": citations,
        },
        retrieval_run_id=retrieval_run_id,
        chat_message_id=cast(uuid.UUID, assistant_message.id),
        meta_json=assistant_meta,
    )
    yield _sse(
        "meta",
        {
            "citations": citations,
            "evidence": [evidence_item_to_payload(item) for item in evidence],
            "retrieval_run_id": str(retrieval_run_id),
            "attempt_id": str(attempt_id),
        },
    )
    yield _sse("done", {"message_id": str(assistant_message.id), "retrieval_run_id": str(retrieval_run_id), "attempt_id": str(attempt_id)})


@router.get("/threads", response_model=InkwiseChatThreadsResponse)
def list_threads(
    document_id: uuid.UUID | None = None,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseChatThreadsResponse:
    user_id = token_data["uid"]
    try:
        if document_id is not None:
            chat_service.get_document_or_404(db, user_id=user_id, document_id=document_id)
        threads = chat_service.list_threads(db, user_id=user_id, document_id=document_id)
        return InkwiseChatThreadsResponse(
            document_id=document_id,
            threads=[InkwiseChatThreadOut.model_validate(thread) for thread in threads],
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/threads", response_model=InkwiseChatThreadOut, status_code=201)
def create_thread(
    body: InkwiseChatThreadCreateRequest,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseChatThreadOut:
    user_id = token_data["uid"]
    try:
        user_support.ensure_user_record(
            db,
            user_id=user_id,
            email=token_data.get("email"),
            phone_number=token_data.get("phone_number"),
        )
        thread = chat_service.create_thread(
            db,
            user_id=user_id,
            document_id=body.document_id,
            title=body.title,
        )
        return InkwiseChatThreadOut.model_validate(thread)
    except FileNotFoundError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create thread: {exc}") from exc


@router.get("/threads/{thread_id}/messages", response_model=InkwisePaginatedChatMessages)
def list_messages(
    thread_id: uuid.UUID,
    page: int = 1,
    limit: int = 50,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwisePaginatedChatMessages:
    try:
        items, total = chat_service.list_messages(
            db,
            user_id=token_data["uid"],
            thread_id=thread_id,
            page=page,
            limit=limit,
        )
        return InkwisePaginatedChatMessages(
            items=[InkwiseChatMessageOut.model_validate(item) for item in items],
            page=page,
            limit=limit,
            total=total,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/threads/{thread_id}/messages:stream")
async def stream_thread_message(
    thread_id: uuid.UUID,
    body: InkwiseChatSendRequest,
    request: Request,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    user_id = token_data["uid"]
    settings = get_inkwise_settings()

    try:
        thread = chat_service.get_thread_or_404(db, user_id=user_id, thread_id=thread_id)
        thread_db_id = cast(uuid.UUID, thread.id)
        thread_document_id = cast(uuid.UUID, thread.document_id)
        document = chat_service.get_document_or_404(db, user_id=user_id, document_id=thread_document_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    ready_bound_sources = document_source_service.list_ready_bound_sources(
        db,
        document_id=thread_document_id,
        user_id=user_id,
    )
    if not ready_bound_sources:
        raise HTTPException(
            status_code=400,
            detail="No grounded sources are ready. Ingest and bind at least one completed source.",
        )

    scoped_source_ids, bound_sources = _resolve_scoped_chat_sources(
        ready_bound_sources=ready_bound_sources,
        scoped_ids=body.source_ids,
    )

    draft_text = (body.draft_selection_text or "").strip()
    draft_text, draft_truncated = truncate_text(draft_text, 8000)
    draft_label = (body.draft_selection_label or "").strip()[:80] or None

    user_message = chat_service.create_user_message(
        db,
        thread_id=thread_db_id,
        content=body.content,
        scoped_source_ids=scoped_source_ids,
        draft_selection_label=draft_label,
        draft_selection_text=draft_text or None,
        draft_selection_truncated=draft_truncated,
    )

    query_rewrite_history_limit = max(0, int(settings.query_rewrite_max_history_messages))
    grounded_history_limit = (
        max(0, int(settings.grounded_chat_max_history_messages)) if settings.grounded_chat_history_enabled else 0
    )
    history_limit = max(query_rewrite_history_limit, grounded_history_limit)
    history_messages = (
        chat_service.list_recent_history(
            db,
            thread_id=thread_db_id,
            exclude_message_id=cast(uuid.UUID, user_message.id),
            limit=history_limit,
        )
        if history_limit > 0
        else []
    )
    grounded_history_messages, grounded_history_meta = prepare_grounded_chat_history(
        history_messages=history_messages,
        max_messages=grounded_history_limit,
        max_chars=max(0, int(settings.grounded_chat_max_history_chars)),
    )
    attempt = generation_attempt_service.create_attempt(
        db,
        user_id=user_id,
        kind="chat",
        document_id=thread_document_id,
        thread_id=thread_db_id,
        request_json={
            "content": body.content,
            "source_ids": [str(source_id) for source_id in scoped_source_ids],
            "draft_selection_label": draft_label,
            "draft_selection_text": draft_text or None,
            "draft_selection_truncated": draft_truncated,
        },
        provider="vertex_ai",
        model=settings.grounded_model,
        meta_json={"fresh_retrieval": True},
    )

    async def gen() -> AsyncGenerator[bytes, None]:
        async for chunk in _stream_chat_attempt(
            db=db,
            request=request,
            user_id=user_id,
            settings=settings,
            thread_db_id=thread_db_id,
            thread_document_id=thread_document_id,
            document=document,
            prompt_question=body.content,
            scoped_source_ids=scoped_source_ids,
            bound_sources=bound_sources,
            draft_text=draft_text,
            grounded_history_messages=grounded_history_messages,
            grounded_history_meta=grounded_history_meta,
            history_messages=history_messages,
            assistant_provider_meta={
                "model": settings.grounded_model,
                "scoped_source_ids": [str(source_id) for source_id in scoped_source_ids],
                "draft_selection_attached": bool(draft_text),
                "history_message_count": grounded_history_meta["message_count"],
                "history_char_count": grounded_history_meta["char_count"],
                "history_truncated": grounded_history_meta["truncated"],
                "reply_to_message_id": str(user_message.id),
            },
            attempt_id=cast(uuid.UUID, attempt.id),
            fresh_retrieval=True,
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


@router.post("/threads/{thread_id}/messages/{message_id}:retry")
async def retry_thread_message(
    thread_id: uuid.UUID,
    message_id: uuid.UUID,
    body: InkwiseRetryRequest,
    request: Request,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    user_id = token_data["uid"]
    settings = get_inkwise_settings()

    try:
        thread = chat_service.get_thread_or_404(db, user_id=user_id, thread_id=thread_id)
        document = chat_service.get_document_or_404(db, user_id=user_id, document_id=cast(uuid.UUID, thread.document_id))
        assistant_message = chat_service.get_message_or_404(db, user_id=user_id, thread_id=thread_id, message_id=message_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if str(assistant_message.role) != "assistant":
        raise HTTPException(status_code=400, detail="Only assistant messages can be retried")

    source_message = chat_service.find_reply_source_message(db, thread_id=thread_id, assistant_message_id=message_id)
    if source_message is None or str(source_message.role) != "user":
        raise HTTPException(status_code=400, detail="Could not locate the original user message for retry")

    ready_bound_sources = document_source_service.list_ready_bound_sources(
        db,
        document_id=cast(uuid.UUID, thread.document_id),
        user_id=user_id,
    )
    if not ready_bound_sources:
        raise HTTPException(status_code=400, detail="No grounded sources are ready. Ingest and bind at least one completed source.")

    source_meta = source_message.provider_meta or {}
    scoped_source_ids = [uuid.UUID(value) for value in (source_meta.get("scoped_source_ids") or [])]
    if not scoped_source_ids:
        scoped_source_ids = None  # type: ignore[assignment]
    resolved_source_ids, bound_sources = _resolve_scoped_chat_sources(
        ready_bound_sources=ready_bound_sources,
        scoped_ids=scoped_source_ids,
    )
    draft_text = str(source_meta.get("draft_selection_text") or "")

    query_rewrite_history_limit = max(0, int(settings.query_rewrite_max_history_messages))
    grounded_history_limit = max(0, int(settings.grounded_chat_max_history_messages)) if settings.grounded_chat_history_enabled else 0
    history_limit = max(query_rewrite_history_limit, grounded_history_limit)
    history_messages = (
        chat_service.list_recent_history_before_message(
            db,
            thread_id=thread_id,
            before_message_id=cast(uuid.UUID, source_message.id),
            exclude_message_id=cast(uuid.UUID, source_message.id),
            limit=history_limit,
        )
        if history_limit > 0
        else []
    )
    grounded_history_messages, grounded_history_meta = prepare_grounded_chat_history(
        history_messages=history_messages,
        max_messages=grounded_history_limit,
        max_chars=max(0, int(settings.grounded_chat_max_history_chars)),
    )

    assistant_provider_meta = cast(dict[str, Any], assistant_message.provider_meta or {})
    prior_attempt_id = str(assistant_provider_meta.get("attempt_id") or "").strip() or None
    prior_attempt_uuid = uuid.UUID(prior_attempt_id) if prior_attempt_id else None
    prior_citations = cast(dict[str, Any], assistant_message.citations_json or {})
    reuse_retrieval_run_id = None
    if not body.fresh_retrieval:
        retrieval_run_value = prior_citations.get("retrieval_run_id") if isinstance(prior_citations, dict) else None
        if retrieval_run_value:
            reuse_retrieval_run_id = uuid.UUID(str(retrieval_run_value))

    generation_group_id = None
    if prior_attempt_uuid is not None:
        try:
            prior_attempt = generation_attempt_service.get_attempt_for_user(db, user_id=user_id, attempt_id=prior_attempt_uuid)
            generation_group_id = cast(uuid.UUID, prior_attempt.generation_group_id)
        except FileNotFoundError:
            generation_group_id = uuid.uuid4()
    else:
        generation_group_id = uuid.uuid4()

    attempt = generation_attempt_service.create_attempt(
        db,
        user_id=user_id,
        kind="chat",
        document_id=cast(uuid.UUID, thread.document_id),
        thread_id=thread_id,
        parent_attempt_id=prior_attempt_uuid,
        generation_group_id=generation_group_id,
        retrieval_run_id=reuse_retrieval_run_id,
        request_json={
            "content": source_message.content,
            "source_ids": [str(source_id) for source_id in resolved_source_ids],
            "draft_selection_label": source_meta.get("draft_selection_label"),
            "draft_selection_text": draft_text or None,
            "retry_of_message_id": str(message_id),
            "fresh_retrieval": bool(body.fresh_retrieval),
        },
        provider="vertex_ai",
        model=settings.grounded_model,
        meta_json={"fresh_retrieval": bool(body.fresh_retrieval), "retry_of_message_id": str(message_id)},
    )

    async def gen() -> AsyncGenerator[bytes, None]:
        async for chunk in _stream_chat_attempt(
            db=db,
            request=request,
            user_id=user_id,
            settings=settings,
            thread_db_id=thread_id,
            thread_document_id=cast(uuid.UUID, thread.document_id),
            document=document,
            prompt_question=str(source_message.content),
            scoped_source_ids=resolved_source_ids,
            bound_sources=bound_sources,
            draft_text=draft_text,
            grounded_history_messages=grounded_history_messages,
            grounded_history_meta=grounded_history_meta,
            history_messages=history_messages,
            assistant_provider_meta={
                "model": settings.grounded_model,
                "scoped_source_ids": [str(source_id) for source_id in resolved_source_ids],
                "draft_selection_attached": bool(draft_text),
                "history_message_count": grounded_history_meta["message_count"],
                "history_char_count": grounded_history_meta["char_count"],
                "history_truncated": grounded_history_meta["truncated"],
                "reply_to_message_id": str(source_message.id),
                "retry_of_message_id": str(message_id),
            },
            attempt_id=cast(uuid.UUID, attempt.id),
            fresh_retrieval=bool(body.fresh_retrieval),
            reuse_retrieval_run_id=reuse_retrieval_run_id,
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
