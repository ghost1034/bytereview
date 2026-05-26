"""AI Assistant + Document Extract routes — streaming chat with module context."""

from __future__ import annotations

import json
import logging
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from core.database import db_config, get_db
from dependencies.auth import get_current_user_id
from models.analytics import (
    AssistantStreamRequest,
    BasicChatRequest,
    ChatSessionListResponse,
    ChatSessionResponse,
    ChatSessionUpdateRequest,
    DocumentExtractRequest,
    DocumentExtractResponse,
    UsageMetadata,
)
from services import analytics_ai_service
from services.analytics import chat_sessions_service
from services.analytics.billing_guard import preflight_check, record_call
from services.analytics.firm_scope import require_firm_id
from services.billing_service import tokens_to_pages

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/analytics/assistant", tags=["analytics-assistant"])


def _usage(prompt_tokens, output_tokens) -> UsageMetadata:
    return UsageMetadata(
        prompt_tokens=prompt_tokens,
        output_tokens=output_tokens,
        total_tokens=(prompt_tokens or 0) + (output_tokens or 0) or None,
        pages=tokens_to_pages(prompt_tokens, output_tokens) or None,
    )


def _session_to_response(row) -> ChatSessionResponse:
    return ChatSessionResponse(
        id=str(row.id),
        firm_id=str(row.firm_id),
        user_id=row.user_id,
        client_id=str(row.client_id) if row.client_id else None,
        bot_type=row.bot_type,
        title=row.title,
        messages=row.messages or [],
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


async def _assistant_event_stream(
    user_id: str,
    firm_id,
    payload: AssistantStreamRequest,
) -> AsyncGenerator[bytes, None]:
    messages = [m.model_dump() for m in payload.messages]

    accumulated: list[str] = []
    final_usage: dict | None = None
    try:
        async for kind, value in analytics_ai_service.stream_ai_assistant(
            messages,
            context=payload.context,
        ):
            if kind == "chunk":
                accumulated.append(value)
                yield f"data: {json.dumps({'text': value})}\n\n".encode("utf-8")
            elif kind == "usage":
                final_usage = value
                yield f"data: {json.dumps({'usage': value})}\n\n".encode("utf-8")
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Assistant stream failure for user %s", user_id)
        yield f"data: {json.dumps({'error': str(exc)})}\n\n".encode("utf-8")
        yield b"data: [DONE]\n\n"
        return

    full_text = "".join(accumulated)
    persistence_db: Session = db_config.get_session()
    try:
        if final_usage:
            try:
                record_call(
                    persistence_db,
                    user_id,
                    "analytics_chat_assistant",
                    final_usage.get("prompt_tokens"),
                    final_usage.get("output_tokens"),
                )
            except HTTPException as billing_exc:
                logger.warning("Analytics billing failed: %s", billing_exc.detail)

        try:
            if payload.session_id:
                chat_sessions_service.append_messages(
                    persistence_db,
                    firm_id,
                    user_id,
                    payload.session_id,
                    [
                        *messages,
                        {"role": "model", "content": full_text},
                    ],
                )
            else:
                chat_sessions_service.create_session(
                    persistence_db,
                    firm_id,
                    user_id,
                    bot_type="assistant",
                    title=payload.title or _derive_title(payload),
                    client_id=payload.client_id,
                    messages=[
                        *messages,
                        {"role": "model", "content": full_text},
                    ],
                )
        except Exception:
            logger.exception("Failed to persist assistant chat session for user %s", user_id)
    finally:
        persistence_db.close()

    yield b"data: [DONE]\n\n"


def _derive_title(payload: AssistantStreamRequest) -> str:
    for m in payload.messages:
        if m.role == "user" and m.content:
            return m.content.strip().splitlines()[0][:200]
    return "Assistant session"


@router.post("/stream")
async def stream_assistant(
    payload: AssistantStreamRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, user_id)
    preflight_check(db, user_id, "analytics_chat_assistant")
    return StreamingResponse(
        _assistant_event_stream(user_id, firm_id, payload),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


# ---------------------------------------------------------------------------
# Basic chat (non-streaming fallback) — matches CPAAnalytics `/api/chat`
# ---------------------------------------------------------------------------


@router.post("/chat")
async def basic_chat(
    payload: BasicChatRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Aggregates the streamed response into a single JSON envelope.

    This route exists for compatibility with the original CPAAnalytics
    `/api/chat`. Front-end code that needs incremental tokens should use
    `/api/analytics/assistant/stream` instead.
    """
    preflight_check(db, user_id, "analytics_chat_basic")
    messages = [m.model_dump() for m in payload.messages]
    chunks: list[str] = []
    usage_meta: dict = {}
    async for kind, value in analytics_ai_service.stream_basic_chat(messages):
        if kind == "chunk":
            chunks.append(value)
        elif kind == "usage":
            usage_meta = value

    record_call(
        db,
        user_id,
        "analytics_chat_basic",
        usage_meta.get("prompt_tokens"),
        usage_meta.get("output_tokens"),
    )
    return {
        "text": "".join(chunks),
        "usage": _usage(usage_meta.get("prompt_tokens"), usage_meta.get("output_tokens")).model_dump(),
    }


# ---------------------------------------------------------------------------
# Document extraction (used by both research bots before chat)
# ---------------------------------------------------------------------------


@router.post("/document-extract", response_model=DocumentExtractResponse)
async def extract_document(
    payload: DocumentExtractRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    preflight_check(db, user_id, "analytics_document_extract")
    doc_type = "IRS" if payload.type in ("IRS", "Tax") else "GAAP"
    parsed, usage = await analytics_ai_service.extract_document(
        payload.document_text, doc_type
    )
    record_call(
        db,
        user_id,
        "analytics_document_extract",
        usage.get("prompt_tokens"),
        usage.get("output_tokens"),
    )
    return DocumentExtractResponse.model_validate(
        {
            "summary": parsed.get("summary", ""),
            "extractedData": parsed.get("extractedData", {}),
            "usage": _usage(usage.get("prompt_tokens"), usage.get("output_tokens")).model_dump(),
        }
    )


# ---------------------------------------------------------------------------
# Assistant chat session CRUD
# ---------------------------------------------------------------------------


@router.get("/sessions", response_model=ChatSessionListResponse)
async def list_assistant_sessions(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, user_id)
    rows = chat_sessions_service.list_sessions(db, firm_id, user_id, bot_type="assistant")
    return ChatSessionListResponse(sessions=[_session_to_response(r) for r in rows])


@router.get("/sessions/{session_id}", response_model=ChatSessionResponse)
async def get_assistant_session(
    session_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, user_id)
    row = chat_sessions_service.get_session(db, firm_id, user_id, session_id)
    if row.bot_type != "assistant":
        raise HTTPException(status_code=404, detail="Chat session not found")
    return _session_to_response(row)


@router.put("/sessions/{session_id}", response_model=ChatSessionResponse)
async def update_assistant_session(
    session_id: str,
    payload: ChatSessionUpdateRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, user_id)
    row = chat_sessions_service.get_session(db, firm_id, user_id, session_id)
    if row.bot_type != "assistant":
        raise HTTPException(status_code=404, detail="Chat session not found")
    updated = chat_sessions_service.update_session(
        db,
        firm_id,
        user_id,
        session_id,
        title=payload.title,
        client_id=payload.client_id,
        messages=payload.messages,
    )
    return _session_to_response(updated)


@router.delete("/sessions/{session_id}")
async def delete_assistant_session(
    session_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, user_id)
    row = chat_sessions_service.get_session(db, firm_id, user_id, session_id)
    if row.bot_type != "assistant":
        raise HTTPException(status_code=404, detail="Chat session not found")
    chat_sessions_service.delete_session(db, firm_id, user_id, session_id)
    return {"success": True}
