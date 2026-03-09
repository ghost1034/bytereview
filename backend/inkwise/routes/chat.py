from __future__ import annotations

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
    InkwiseChatMessageOut,
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
    truncate_text,
)
from inkwise.services.document_sources import InkwiseDocumentSourceService
from inkwise.services.gemini import GeminiError, generate_text
from inkwise.services.retrieval_service import InkwiseRetrievalService, build_evidence_pack
from inkwise.services.source_service import InkwiseSourceService
from inkwise.settings import get_inkwise_settings

router = APIRouter(prefix="/chat", tags=["inkwise-chat"])
chat_service = InkwiseChatService()
document_source_service = InkwiseDocumentSourceService()
retrieval_service = InkwiseRetrievalService()
user_support = InkwiseSourceService()


def _sse(event: str, data: object) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=True)}\n\n".encode()


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
        user_support.ensure_user_record(db, user_id=user_id, email=token_data.get("email"))
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
        document = chat_service.get_document_or_404(db, user_id=user_id, document_id=thread.document_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    ready_bound_sources = document_source_service.list_ready_bound_sources(
        db,
        document_id=thread.document_id,
        user_id=user_id,
    )
    if not ready_bound_sources:
        raise HTTPException(
            status_code=400,
            detail="No grounded sources are ready. Ingest and bind at least one completed source.",
        )

    ready_ids = [source_id for source_id, _title in ready_bound_sources]
    ready_set = set(ready_ids)
    title_by_id = {source_id: title for source_id, title in ready_bound_sources}

    scoped_source_ids = ready_ids
    if body.source_ids is not None:
        if not body.source_ids:
            raise HTTPException(status_code=400, detail="source_ids must include at least one source")
        invalid = [source_id for source_id in body.source_ids if source_id not in ready_set]
        if invalid:
            raise HTTPException(
                status_code=400,
                detail="One or more selected sources are not ready or not bound to this document",
            )
        scoped_source_ids = list(body.source_ids)

    draft_text = (body.draft_selection_text or "").strip()
    draft_text, draft_truncated = truncate_text(draft_text, 8000)
    draft_label = (body.draft_selection_label or "").strip()[:80] or None

    user_message = chat_service.create_user_message(
        db,
        thread_id=thread.id,
        content=body.content,
        scoped_source_ids=scoped_source_ids,
        draft_selection_label=draft_label,
        draft_selection_text=draft_text or None,
        draft_selection_truncated=draft_truncated,
    )

    bound_sources = [(source_id, title_by_id.get(source_id, "")) for source_id in scoped_source_ids]
    history_limit = max(0, int(settings.query_rewrite_max_history_messages))
    history_messages = (
        chat_service.list_recent_history(
            db,
            thread_id=thread.id,
            exclude_message_id=user_message.id,
            limit=history_limit,
        )
        if history_limit > 0
        else []
    )

    async def gen() -> AsyncGenerator[bytes, None]:
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
                },
            )

            retrieval_run, evidence = retrieval_service.run_retrieval(
                db,
                user_id=user_id,
                document_id=thread.document_id,
                thread_id=thread.id,
                query=body.content,
                bound_sources=bound_sources,
                history_messages=history_messages,
                draft_selection_text=draft_text,
            )
            retrieval_run_id = retrieval_run.id

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

                assistant_message = chat_service.create_assistant_message(
                    db,
                    thread_id=thread.id,
                    content=assistant_text,
                    citations=[],
                    retrieval_run_id=retrieval_run_id,
                    provider="system",
                    provider_meta={
                        "reason": "no_evidence",
                        "scoped_source_ids": [str(source_id) for source_id in scoped_source_ids],
                        "draft_selection_attached": bool(draft_text),
                    },
                )
                yield _sse("meta", {"citations": [], "retrieval_run_id": str(retrieval_run_id)})
                yield _sse("done", {"message_id": str(assistant_message.id), "retrieval_run_id": str(retrieval_run_id)})
                return

            evidence_pack = build_evidence_pack(evidence)
            allowed_ids = [item.evidence_id for item in evidence]
            yield _sse(
                "meta",
                {
                    "retrieval_run_id": str(retrieval_run_id),
                    "evidence_count": len(evidence),
                    "evidence_ids": allowed_ids,
                },
            )

            prompt = build_grounded_chat_prompt(
                question=body.content,
                document=document,
                evidence_pack=evidence_pack,
                allowed_ids=allowed_ids,
                draft_selection_text=draft_text or None,
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
            return
        except GeminiError as exc:
            yield _sse("meta", {"error": "provider_error", "message": str(exc)})
            return
        except Exception as exc:
            yield _sse("meta", {"error": "provider_error", "message": str(exc)})
            return

        if retrieval_run_id is None:
            yield _sse("meta", {"error": "internal_error", "message": "Missing retrieval_run_id"})
            return

        citations = extract_citations(assistant_text=assistant_text, evidence=evidence)
        assistant_message = chat_service.create_assistant_message(
            db,
            thread_id=thread.id,
            content=assistant_text,
            citations=citations,
            retrieval_run_id=retrieval_run_id,
            provider="vertex_ai",
            provider_meta={
                "model": settings.grounded_model,
                "scoped_source_ids": [str(source_id) for source_id in scoped_source_ids],
                "draft_selection_attached": bool(draft_text),
            },
        )
        yield _sse("meta", {"citations": citations, "retrieval_run_id": str(retrieval_run_id)})
        yield _sse("done", {"message_id": str(assistant_message.id), "retrieval_run_id": str(retrieval_run_id)})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
