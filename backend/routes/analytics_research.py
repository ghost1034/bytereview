"""IRS / GAAP research routes — streaming + chat session persistence.

Streaming wire format mirrors the original CPAAnalytics server: each chunk is
emitted as `data: {"text": "..."}\\n\\n` and the stream terminates with
`data: [DONE]\\n\\n`. A trailing `data: {"usage": {...}}\\n\\n` event is sent
before `[DONE]` so the client can render token totals if desired.
"""

from __future__ import annotations

import json
import logging
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from core.database import get_db, db_config
from dependencies.analytics_rbac import LLM_ROLES, READER_ROLES, WRITER_ROLES, require_role
from models.analytics import (
    ChatSessionListResponse,
    ChatSessionResponse,
    ChatSessionUpdateRequest,
    ResearchStreamRequest,
)
from models.db_models import User
from services import analytics_ai_service
from services.analytics import chat_sessions_service
from services.analytics.billing_guard import preflight_check, record_call
from services.analytics.firm_scope import require_firm_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/analytics/research", tags=["analytics-research"])


def _session_to_response(row) -> ChatSessionResponse:
    return ChatSessionResponse(
        id=str(row.id),
        firm_id=str(row.firm_id),
        user_id=row.user_id,
        client_id=str(row.client_id) if row.client_id else None,
        bot_type=row.bot_type,
        title=row.title,
        messages=row.messages or [],
        uploaded_docs=row.uploaded_docs or [],
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _stream_source(bot: str) -> str:
    return "analytics_chat_irs" if bot == "irs" else "analytics_chat_gaap"


async def _research_event_stream(
    bot: str,
    user_id: str,
    firm_id,
    payload: ResearchStreamRequest,
) -> AsyncGenerator[bytes, None]:
    """Forward Gemini chunks as SSE events; persist final transcript on close."""
    source = _stream_source(bot)
    messages = [m.model_dump() for m in payload.messages]
    uploaded_docs = [d.model_dump() for d in payload.uploaded_docs]

    accumulated: list[str] = []
    final_usage: dict | None = None
    try:
        async for kind, value in analytics_ai_service.stream_research(
            bot,
            messages,
            output_style=payload.output_style,
            document_context=payload.document_context,
        ):
            if kind == "chunk":
                accumulated.append(value)
                yield f"data: {json.dumps({'text': value})}\n\n".encode("utf-8")
            elif kind == "usage":
                final_usage = value
                yield f"data: {json.dumps({'usage': value})}\n\n".encode("utf-8")
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Research stream failure for user %s bot %s", user_id, bot)
        yield f"data: {json.dumps({'error': str(exc)})}\n\n".encode("utf-8")
        yield b"data: [DONE]\n\n"
        return

    # Persistence + billing happen after the stream completes successfully.
    full_text = "".join(accumulated)
    session_event: dict | None = None
    persistence_db: Session = db_config.get_session()
    try:
        # Record billing
        if final_usage:
            try:
                record_call(
                    persistence_db,
                    user_id,
                    source,
                    final_usage.get("prompt_tokens"),
                    final_usage.get("output_tokens"),
                )
            except HTTPException as billing_exc:
                logger.warning("Analytics billing failed: %s", billing_exc.detail)

        # Persist chat session
        try:
            if payload.session_id:
                row = chat_sessions_service.append_messages(
                    persistence_db,
                    firm_id,
                    user_id,
                    payload.session_id,
                    [
                        *[m.model_dump() for m in payload.messages],
                        {"role": "model", "content": full_text},
                    ],
                    uploaded_docs=uploaded_docs or None,
                )
            else:
                title = payload.title or await _generate_title(messages, user_id, persistence_db)
                row = chat_sessions_service.create_session(
                    persistence_db,
                    firm_id,
                    user_id,
                    bot_type=bot,
                    title=title,
                    client_id=payload.client_id,
                    messages=[
                        *messages,
                        {"role": "model", "content": full_text},
                    ],
                    uploaded_docs=uploaded_docs,
                )
            session_event = {"id": str(row.id), "title": row.title}
        except Exception:
            logger.exception("Failed to persist research chat session for user %s", user_id)
    finally:
        persistence_db.close()

    # Tell the client which session this transcript belongs to so subsequent
    # turns append instead of creating a duplicate session.
    if session_event:
        yield f"data: {json.dumps({'session': session_event})}\n\n".encode("utf-8")
    yield b"data: [DONE]\n\n"


def _first_user_message(messages: list[dict]) -> str:
    for m in messages:
        if m.get("role") == "user" and m.get("content"):
            return str(m["content"])
    return ""


async def _generate_title(messages: list[dict], user_id: str, db: Session) -> str:
    """LLM-generated concise title with a truncated fallback."""
    first = _first_user_message(messages)
    try:
        title, usage = await analytics_ai_service.generate_session_title(first)
        if title:
            try:
                record_call(
                    db,
                    user_id,
                    "analytics_chat_title",
                    usage.get("prompt_tokens"),
                    usage.get("output_tokens"),
                )
            except HTTPException as billing_exc:
                logger.warning("Title billing failed: %s", billing_exc.detail)
            return title
    except Exception:
        logger.exception("LLM title generation failed; using truncated fallback")
    return first.strip().splitlines()[0][:200] if first.strip() else "Research session"


@router.post("/irs/stream")
async def stream_irs_research(
    payload: ResearchStreamRequest,
    actor: User = Depends(require_role(*LLM_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    preflight_check(db, actor.id, "analytics_chat_irs")
    return StreamingResponse(
        _research_event_stream("irs", actor.id, firm_id, payload),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.post("/gaap/stream")
async def stream_gaap_research(
    payload: ResearchStreamRequest,
    actor: User = Depends(require_role(*LLM_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    preflight_check(db, actor.id, "analytics_chat_gaap")
    return StreamingResponse(
        _research_event_stream("gaap", actor.id, firm_id, payload),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


# ---------------------------------------------------------------------------
# Chat session CRUD (IRS + GAAP)
# ---------------------------------------------------------------------------


@router.get("/sessions/{bot}", response_model=ChatSessionListResponse)
async def list_research_sessions(
    bot: str,
    actor: User = Depends(require_role(*READER_ROLES)),
    db: Session = Depends(get_db),
):
    if bot not in ("irs", "gaap"):
        raise HTTPException(status_code=400, detail="bot must be 'irs' or 'gaap'")
    firm_id = require_firm_id(db, actor.id)
    rows = chat_sessions_service.list_sessions(db, firm_id, actor.id, bot_type=bot)
    return ChatSessionListResponse(sessions=[_session_to_response(r) for r in rows])


@router.get("/sessions/{bot}/{session_id}", response_model=ChatSessionResponse)
async def get_research_session(
    bot: str,
    session_id: str,
    actor: User = Depends(require_role(*READER_ROLES)),
    db: Session = Depends(get_db),
):
    if bot not in ("irs", "gaap"):
        raise HTTPException(status_code=400, detail="bot must be 'irs' or 'gaap'")
    firm_id = require_firm_id(db, actor.id)
    row = chat_sessions_service.get_session(db, firm_id, actor.id, session_id)
    if row.bot_type != bot:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return _session_to_response(row)


@router.put("/sessions/{bot}/{session_id}", response_model=ChatSessionResponse)
async def update_research_session(
    bot: str,
    session_id: str,
    payload: ChatSessionUpdateRequest,
    actor: User = Depends(require_role(*WRITER_ROLES)),
    db: Session = Depends(get_db),
):
    if bot not in ("irs", "gaap"):
        raise HTTPException(status_code=400, detail="bot must be 'irs' or 'gaap'")
    firm_id = require_firm_id(db, actor.id)
    row = chat_sessions_service.get_session(db, firm_id, actor.id, session_id)
    if row.bot_type != bot:
        raise HTTPException(status_code=404, detail="Chat session not found")
    updated = chat_sessions_service.update_session(
        db,
        firm_id,
        actor.id,
        session_id,
        title=payload.title,
        client_id=payload.client_id,
        messages=payload.messages,
        uploaded_docs=payload.uploaded_docs,
    )
    return _session_to_response(updated)


@router.delete("/sessions/{bot}/{session_id}")
async def delete_research_session(
    bot: str,
    session_id: str,
    actor: User = Depends(require_role(*WRITER_ROLES)),
    db: Session = Depends(get_db),
):
    if bot not in ("irs", "gaap"):
        raise HTTPException(status_code=400, detail="bot must be 'irs' or 'gaap'")
    firm_id = require_firm_id(db, actor.id)
    row = chat_sessions_service.get_session(db, firm_id, actor.id, session_id)
    if row.bot_type != bot:
        raise HTTPException(status_code=404, detail="Chat session not found")
    chat_sessions_service.delete_session(db, firm_id, actor.id, session_id)
    return {"success": True}
