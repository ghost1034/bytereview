"""AI Assistant + Document Extract routes — streaming chat with module context."""

from __future__ import annotations

import json
import logging
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from core.database import db_config, get_db
from dependencies.analytics_rbac import LLM_ROLES, require_role
from models.analytics import (
    AssistantStreamRequest,
    BasicChatRequest,
    DocumentExtractRequest,
    DocumentExtractResponse,
    UsageMetadata,
)
from models.db_models import User
from services import analytics_ai_service
from services.analytics.billing_guard import preflight_check, record_call

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/analytics/assistant", tags=["analytics-assistant"])


def _usage(prompt_tokens, output_tokens) -> UsageMetadata:
    return UsageMetadata(
        prompt_tokens=prompt_tokens,
        output_tokens=output_tokens,
        total_tokens=(prompt_tokens or 0) + (output_tokens or 0) or None,
    )


async def _assistant_event_stream(
    user_id: str,
    payload: AssistantStreamRequest,
) -> AsyncGenerator[bytes, None]:
    """Stream the assistant response.

    The AI assistant is ephemeral (matching CPAAnalytics): it never persists a
    chat session. Token usage is still billed once the stream completes.
    """
    messages = [m.model_dump() for m in payload.messages]

    final_usage: dict | None = None
    try:
        async for kind, value in analytics_ai_service.stream_ai_assistant(
            messages,
            context=payload.context,
        ):
            if kind == "chunk":
                yield f"data: {json.dumps({'text': value})}\n\n".encode("utf-8")
            elif kind == "usage":
                final_usage = value
                yield f"data: {json.dumps({'usage': value})}\n\n".encode("utf-8")
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Assistant stream failure for user %s", user_id)
        yield f"data: {json.dumps({'error': str(exc)})}\n\n".encode("utf-8")
        yield b"data: [DONE]\n\n"
        return

    if final_usage:
        # The request-scoped session is gone by the time the generator runs, so
        # open a fresh one solely to record usage.
        billing_db: Session = db_config.get_session()
        try:
            record_call(
                billing_db,
                user_id,
                "analytics_chat_assistant",
                final_usage.get("prompt_tokens"),
                final_usage.get("output_tokens"),
                final_usage.get("total_tokens"),
            )
        except HTTPException as billing_exc:
            logger.warning("Analytics billing failed: %s", billing_exc.detail)
        except Exception:  # pragma: no cover - defensive
            logger.exception("Failed to record assistant usage for user %s", user_id)
        finally:
            billing_db.close()

    yield b"data: [DONE]\n\n"


@router.post("/stream")
async def stream_assistant(
    payload: AssistantStreamRequest,
    actor: User = Depends(require_role(*LLM_ROLES)),
    db: Session = Depends(get_db),
):
    preflight_check(db, actor.id, "analytics_chat_assistant")
    return StreamingResponse(
        _assistant_event_stream(actor.id, payload),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


# ---------------------------------------------------------------------------
# Basic chat (non-streaming fallback) — matches CPAAnalytics `/api/chat`
# ---------------------------------------------------------------------------


@router.post("/chat")
async def basic_chat(
    payload: BasicChatRequest,
    actor: User = Depends(require_role(*LLM_ROLES)),
    db: Session = Depends(get_db),
):
    """Aggregates the streamed response into a single JSON envelope.

    This route exists for compatibility with the original CPAAnalytics
    `/api/chat`. Front-end code that needs incremental tokens should use
    `/api/analytics/assistant/stream` instead.
    """
    preflight_check(db, actor.id, "analytics_chat_basic")
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
        actor.id,
        "analytics_chat_basic",
        usage_meta.get("prompt_tokens"),
        usage_meta.get("output_tokens"),
        usage_meta.get("total_tokens"),
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
    actor: User = Depends(require_role(*LLM_ROLES)),
    db: Session = Depends(get_db),
):
    preflight_check(db, actor.id, "analytics_document_extract")
    doc_type = "IRS" if payload.type in ("IRS", "Tax") else "GAAP"
    try:
        parsed, usage = await analytics_ai_service.extract_document(
            payload.document_text, doc_type
        )
    except HTTPException:
        raise
    except ValueError as exc:
        logger.exception("Document extract invalid model output for user %s", actor.id)
        raise HTTPException(
            status_code=502,
            detail=f"AI could not parse extraction results: {exc}",
        ) from exc
    except Exception as exc:
        logger.exception("Document extract failed for user %s", actor.id)
        raise HTTPException(
            status_code=502,
            detail=f"Document extraction failed: {exc}",
        ) from exc

    try:
        record_call(
            db,
            actor.id,
            "analytics_document_extract",
            usage.get("prompt_tokens"),
            usage.get("output_tokens"),
            usage.get("total_tokens"),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Document extract billing failed for user %s", actor.id)
        raise HTTPException(
            status_code=500,
            detail="Extraction succeeded but usage could not be recorded. Please try again.",
        ) from exc

    return DocumentExtractResponse.model_validate(
        {
            "summary": parsed.get("summary", ""),
            "extractedData": parsed.get("extractedData", {}),
            "usage": _usage(usage.get("prompt_tokens"), usage.get("output_tokens")).model_dump(),
        }
    )
