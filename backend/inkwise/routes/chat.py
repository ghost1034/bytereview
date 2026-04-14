from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from services.user_service import DuplicatePhoneNumberError
from starlette.responses import StreamingResponse

from core.database import db_config, get_db
from dependencies.auth import verify_firebase_token
from inkwise.debug_access import can_access_inkwise_chat_debug
from inkwise.schemas import (
    InkwiseChatMessageOut,
    InkwiseGenerationAttemptDetailOut,
    InkwiseGenerationAttemptOut,
    InkwiseMessageResponse,
    InkwiseRetryRequest,
    InkwiseChatSendRequest,
    InkwiseChatThreadCreateRequest,
    InkwiseChatThreadOut,
    InkwiseChatThreadsResponse,
    InkwisePaginatedChatMessages,
)
from inkwise.services.chat_service import (
    InkwiseChatService,
    build_thread_title_prompt,
    build_grounded_chat_prompt,
    normalize_thread_title_candidate,
    prepare_grounded_chat_history,
    truncate_text,
)
from inkwise.services.citation_text import parse_citation_text
from inkwise.services.document_sources import InkwiseDocumentSourceService
from inkwise.services.generation_attempts import InkwiseGenerationAttemptService
from inkwise.services.gemini import (
    GeminiError,
    generate_content_stream,
    generate_text,
    generate_text_stream,
)
from inkwise.services.multimodal_evidence import build_multimodal_contents
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
_STREAM_SSE_CHARS = 48
logger = logging.getLogger(__name__)
_STREAM_HEADERS = {
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _stage_start(*, stage: str, label: str, details: dict[str, Any] | None = None) -> tuple[dict[str, Any], float, str]:
    started_at = _now_iso()
    return (
        {
            "stage": stage,
            "label": label,
            "status": "started",
            "started_at": started_at,
            "details": details or {},
        },
        time.perf_counter(),
        started_at,
    )


def _stage_finish(
    *,
    timeline: list[dict[str, Any]],
    stage: str,
    label: str,
    started_perf: float,
    started_at: str,
    status: str = "completed",
    details: dict[str, Any] | None = None,
    error: str | None = None,
) -> dict[str, Any]:
    payload = {
        "stage": stage,
        "label": label,
        "status": status,
        "started_at": started_at,
        "finished_at": _now_iso(),
        "duration_ms": int((time.perf_counter() - started_perf) * 1000),
        "details": details or {},
    }
    if error:
        payload["error"] = error[:1000]
    timeline.append(payload)
    return payload


async def _maybe_auto_name_thread(
    *,
    db: Session,
    settings: Any,
    thread: Any,
    document: Any,
    user_message: str,
) -> dict[str, Any]:
    if normalize_thread_title_candidate(getattr(thread, "title", None)):
        return {"skipped": True, "reason": "thread_already_named"}

    prompt = build_thread_title_prompt(document=document, user_message=user_message)
    try:
        result = await generate_text(
            model=settings.grounded_model,
            prompt=prompt,
            temperature=0.2,
            max_output_tokens=65536,
            timeout_seconds=10,
        )
    except Exception as exc:
        return {"skipped": True, "reason": "title_generation_failed", "error": str(exc)[:300]}

    title = normalize_thread_title_candidate(result.text)
    if title:
        chat_service.update_thread_title(db, thread=thread, title=title)
        return {"updated": True, "title": title}
    return {"skipped": True, "reason": "empty_title_candidate"}


async def _auto_name_thread_after_response(
    *,
    user_id: str,
    thread_id: uuid.UUID,
    user_message: str,
) -> None:
    db = db_config.get_session()
    try:
        thread = chat_service.get_thread_or_404(db, user_id=user_id, thread_id=thread_id)
        document = chat_service.get_document_or_404(db, user_id=user_id, document_id=cast(uuid.UUID, thread.document_id))
        await _maybe_auto_name_thread(
            db=db,
            settings=get_inkwise_settings(),
            thread=thread,
            document=document,
            user_message=user_message,
        )
    except Exception:
        logger.exception("inkwise thread auto-name failed", extra={"thread_id": str(thread_id), "user_id": user_id})
    finally:
        db.close()


def _schedule_thread_auto_name_after_response(
    *,
    thread: Any,
    user_id: str,
    thread_id: uuid.UUID,
    user_message: str,
) -> None:
    if normalize_thread_title_candidate(getattr(thread, "title", None)):
        return
    asyncio.create_task(
        _auto_name_thread_after_response(
            user_id=user_id,
            thread_id=thread_id,
            user_message=user_message,
        )
    )


def _sse(event: str, data: object) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=True)}\n\n".encode()


def _debug_sse(debug_enabled: bool, data: object) -> list[bytes]:
    return [_sse("debug", data)] if debug_enabled else []


def _attempt_meta_json(*, base_meta: dict[str, Any], debug_timeline: list[dict[str, Any]], debug_enabled: bool) -> dict[str, Any]:
    if not debug_enabled:
        return base_meta
    return {**base_meta, "debug_timeline": debug_timeline}


def _drain_stream_text_buffer(buffer: str, *, final: bool = False) -> tuple[list[str], str]:
    pieces: list[str] = []
    while len(buffer) >= _STREAM_SSE_CHARS:
        pieces.append(buffer[:_STREAM_SSE_CHARS])
        buffer = buffer[_STREAM_SSE_CHARS:]
    if final and buffer:
        pieces.append(buffer)
        buffer = ""
    return pieces, buffer


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
    debug_timeline: list[dict[str, Any]] | None = None,
    debug_enabled: bool = False,
) -> AsyncGenerator[bytes, None]:
    debug_timeline = debug_timeline if debug_timeline is not None else []
    assistant_text = ""
    retrieval_run_id: uuid.UUID | None = None
    evidence: list[Any] = []
    multimodal_attached_evidence_ids: list[str] = []
    parsed_citation_text = None
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

        retrieval_start_event, retrieval_started, retrieval_started_at = _stage_start(
            stage="retrieval",
            label="Retrieve evidence",
            details={"fresh_retrieval": bool(fresh_retrieval), "reused": bool(reuse_retrieval_run_id and not fresh_retrieval)},
        )
        for debug_chunk in _debug_sse(debug_enabled, retrieval_start_event):
            yield debug_chunk
        if reuse_retrieval_run_id is not None and not fresh_retrieval:
            retrieval_run, evidence = retrieval_service.get_retrieval_run_for_user(
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
        retrieval_meta = cast(dict[str, Any], getattr(retrieval_run, "meta", {}) or {})
        for debug_chunk in _debug_sse(
            debug_enabled,
            _stage_finish(
                timeline=debug_timeline,
                stage="retrieval",
                label="Retrieve evidence",
                started_perf=retrieval_started,
                started_at=retrieval_started_at,
                details={
                    "retrieval_run_id": str(retrieval_run_id) if retrieval_run_id else None,
                    "strategy_version": str(getattr(retrieval_run, "strategy_version", "") or ""),
                    "evidence_count": len(evidence),
                    "query_rewrite_triggered": bool((retrieval_meta.get("query_rewrite") or {}).get("triggered")),
                    "rerank_triggered": bool((retrieval_meta.get("rerank") or {}).get("triggered")),
                    "search_attempt_count": len(retrieval_meta.get("search_attempts") or []),
                    "retrieval_duration_ms": retrieval_meta.get("retrieval_duration_ms") or retrieval_meta.get("total_duration_ms"),
                },
            ),
        ):
            yield debug_chunk

        if not evidence:
            assistant_text = (
                "I couldn't find any relevant evidence in the bound sources for that question. "
                "Try the section heading, an exact defined term, or a page or clause number."
            )
            no_evidence_start_event, no_evidence_started, no_evidence_started_at = _stage_start(
                stage="no_evidence_response",
                label="Return no-evidence response",
            )
            for debug_chunk in _debug_sse(debug_enabled, no_evidence_start_event):
                yield debug_chunk
            chunks, _ = _drain_stream_text_buffer(assistant_text, final=True)
            for chunk in chunks:
                if await request.is_disconnected():
                    raise asyncio.CancelledError
                yield _sse("token", {"text": chunk})
                await asyncio.sleep(0)

            for debug_chunk in _debug_sse(
                debug_enabled,
                _stage_finish(
                    timeline=debug_timeline,
                    stage="no_evidence_response",
                    label="Return no-evidence response",
                    started_perf=no_evidence_started,
                    started_at=no_evidence_started_at,
                    details={"chunk_count": len(chunks)},
                ),
            ):
                yield debug_chunk
            assistant_meta = {
                **assistant_provider_meta,
                "reason": "no_evidence",
                "attempt_id": str(attempt_id),
            }
            persist_start_event, persist_started, persist_started_at = _stage_start(
                stage="persist_assistant_message",
                label="Persist assistant message",
                details={"provider": "system"},
            )
            for debug_chunk in _debug_sse(debug_enabled, persist_start_event):
                yield debug_chunk
            assistant_message = chat_service.create_assistant_message(
                db,
                thread_id=thread_db_id,
                content=assistant_text,
                content_with_citations=assistant_text,
                citations=[],
                segments=[],
                retrieval_run_id=retrieval_run_id,
                provider="system",
                provider_meta=assistant_meta,
            )
            for debug_chunk in _debug_sse(
                debug_enabled,
                _stage_finish(
                    timeline=debug_timeline,
                    stage="persist_assistant_message",
                    label="Persist assistant message",
                    started_perf=persist_started,
                    started_at=persist_started_at,
                    details={"message_id": str(assistant_message.id), "provider": "system"},
                ),
            ):
                yield debug_chunk
            complete_start_event, complete_started, complete_started_at = _stage_start(
                stage="complete_attempt",
                label="Complete generation attempt",
            )
            for debug_chunk in _debug_sse(debug_enabled, complete_start_event):
                yield debug_chunk
            generation_attempt_service.complete_attempt(
                db,
                attempt_id=attempt_id,
                response_text=assistant_text,
                citations_json={"retrieval_run_id": str(retrieval_run_id) if retrieval_run_id else None, "citations": [], "segments": []},
                retrieval_run_id=retrieval_run_id,
                chat_message_id=cast(uuid.UUID, assistant_message.id),
                meta_json=_attempt_meta_json(base_meta=assistant_meta, debug_timeline=debug_timeline, debug_enabled=debug_enabled),
            )
            for debug_chunk in _debug_sse(
                debug_enabled,
                _stage_finish(
                    timeline=debug_timeline,
                    stage="complete_attempt",
                    label="Complete generation attempt",
                    started_perf=complete_started,
                    started_at=complete_started_at,
                    details={"attempt_id": str(attempt_id), "status": "completed", "reason": "no_evidence"},
                ),
            ):
                yield debug_chunk
            yield _sse("meta", {"citations": [], "evidence": [], "segments": [], "content_with_citations": assistant_text, "retrieval_run_id": str(retrieval_run_id), "attempt_id": str(attempt_id)})
            yield _sse("done", {"message_id": str(assistant_message.id), "retrieval_run_id": str(retrieval_run_id), "attempt_id": str(attempt_id)})
            return

        prompt_start_event, prompt_started, prompt_started_at = _stage_start(
            stage="build_prompt",
            label="Build grounded prompt",
            details={"evidence_count": len(evidence)},
        )
        for debug_chunk in _debug_sse(debug_enabled, prompt_start_event):
            yield debug_chunk
        evidence_pack = build_evidence_pack(evidence)
        allowed_ids = [item.evidence_id for item in evidence]
        prompt = build_grounded_chat_prompt(
            question=prompt_question,
            document=document,
            evidence_pack=evidence_pack,
            allowed_ids=allowed_ids,
            draft_selection_text=draft_text or None,
            history_messages=grounded_history_messages,
        )
        for debug_chunk in _debug_sse(
            debug_enabled,
            _stage_finish(
                timeline=debug_timeline,
                stage="build_prompt",
                label="Build grounded prompt",
                started_perf=prompt_started,
                started_at=prompt_started_at,
                details={
                    "allowed_evidence_ids": allowed_ids,
                    "history_message_count": grounded_history_meta.get("message_count"),
                    "history_truncated": grounded_history_meta.get("truncated"),
                    "prompt_char_count": len(prompt),
                },
            ),
        ):
            yield debug_chunk
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

        multimodal_start_event, multimodal_started, multimodal_started_at = _stage_start(
            stage="build_multimodal_bundle",
            label="Build multimodal request",
        )
        for debug_chunk in _debug_sse(debug_enabled, multimodal_start_event):
            yield debug_chunk
        multimodal_bundle = build_multimodal_contents(
            prompt=prompt,
            evidence=evidence,
            max_files=100,
        )
        multimodal_attached_evidence_ids = list(multimodal_bundle.attached_evidence_ids)
        for debug_chunk in _debug_sse(
            debug_enabled,
            _stage_finish(
                timeline=debug_timeline,
                stage="build_multimodal_bundle",
                label="Build multimodal request",
                started_perf=multimodal_started,
                started_at=multimodal_started_at,
                details={
                    "has_attachments": bool(multimodal_bundle.has_attachments),
                    "attached_evidence_ids": multimodal_attached_evidence_ids,
                    "content_part_count": len(multimodal_bundle.contents),
                },
            ),
        ):
            yield debug_chunk
        raw_response_text = ""
        pending_text = ""
        if multimodal_bundle.has_attachments:
            stream = generate_content_stream(
                model=settings.grounded_model,
                contents=multimodal_bundle.contents,
                generation_config={
                    "temperature": 0.2,
                    "max_output_tokens": 65536,
                },
                timeout_seconds=120,
            )
        else:
            stream = generate_text_stream(
                model=settings.grounded_model,
                prompt=prompt,
                temperature=0.2,
                max_output_tokens=65536,
                timeout_seconds=120,
            )
        generation_start_event, generation_started, generation_started_at = _stage_start(
            stage="generate_answer",
            label="Generate grounded answer",
            details={
                "model": settings.grounded_model,
                "transport": "multimodal" if multimodal_bundle.has_attachments else "text",
            },
        )
        for debug_chunk in _debug_sse(debug_enabled, generation_start_event):
            yield debug_chunk
        first_token_sent = False
        token_events = 0
        async for chunk in stream:
            if await request.is_disconnected():
                raise asyncio.CancelledError
            if not chunk.text:
                continue
            raw_response_text += chunk.text
            pending_text += chunk.text
            if not first_token_sent:
                first_token_sent = True
                for debug_chunk in _debug_sse(
                    debug_enabled,
                    _stage_finish(
                        timeline=debug_timeline,
                        stage="first_token",
                        label="Receive first model token",
                        started_perf=generation_started,
                        started_at=generation_started_at,
                        details={"transport": "multimodal" if multimodal_bundle.has_attachments else "text"},
                    ),
                ):
                    yield debug_chunk
            pieces, pending_text = _drain_stream_text_buffer(pending_text)
            for piece in pieces:
                if await request.is_disconnected():
                    raise asyncio.CancelledError
                token_events += 1
                yield _sse("token", {"text": piece})
                await asyncio.sleep(0)

        pieces, pending_text = _drain_stream_text_buffer(pending_text, final=True)
        for piece in pieces:
            if await request.is_disconnected():
                raise asyncio.CancelledError
            token_events += 1
            yield _sse("token", {"text": piece})
            await asyncio.sleep(0)

        for debug_chunk in _debug_sse(
            debug_enabled,
            _stage_finish(
                timeline=debug_timeline,
                stage="generate_answer",
                label="Generate grounded answer",
                started_perf=generation_started,
                started_at=generation_started_at,
                details={
                    "response_char_count": len(raw_response_text),
                    "token_event_count": token_events,
                    "transport": "multimodal" if multimodal_bundle.has_attachments else "text",
                },
            ),
        ):
            yield debug_chunk

        citation_start_event, citation_started, citation_started_at = _stage_start(
            stage="parse_citations",
            label="Parse citation markers",
            details={"evidence_count": len(evidence)},
        )
        for debug_chunk in _debug_sse(debug_enabled, citation_start_event):
            yield debug_chunk
        parsed_citation_text = parse_citation_text(text=raw_response_text, evidence=evidence)
        assistant_text = parsed_citation_text.plain_text
        for debug_chunk in _debug_sse(
            debug_enabled,
            _stage_finish(
                timeline=debug_timeline,
                stage="parse_citations",
                label="Parse citation markers",
                started_perf=citation_started,
                started_at=citation_started_at,
                details={
                    "citation_count": len(parsed_citation_text.citations),
                    "segment_count": len(parsed_citation_text.segments),
                },
            ),
        ):
            yield debug_chunk

    except asyncio.CancelledError:
        generation_attempt_service.fail_attempt(
            db,
            attempt_id=attempt_id,
            message="cancelled",
            retrieval_run_id=retrieval_run_id,
            meta_json=_attempt_meta_json(base_meta=assistant_provider_meta, debug_timeline=debug_timeline, debug_enabled=debug_enabled),
        )
        return
    except GeminiError as exc:
        debug_timeline.append(
            {
                "stage": "generate_answer",
                "label": "Generate grounded answer",
                "status": "failed",
                "finished_at": _now_iso(),
                "details": {},
                "error": str(exc)[:1000],
            }
        )
        generation_attempt_service.fail_attempt(
            db,
            attempt_id=attempt_id,
            message=str(exc),
            retrieval_run_id=retrieval_run_id,
            meta_json=_attempt_meta_json(base_meta=assistant_provider_meta, debug_timeline=debug_timeline, debug_enabled=debug_enabled),
        )
        for debug_chunk in _debug_sse(
            debug_enabled,
            {
                "stage": "generate_answer",
                "label": "Generate grounded answer",
                "status": "failed",
                "finished_at": _now_iso(),
                "details": {},
                "error": str(exc)[:1000],
            },
        ):
            yield debug_chunk
        yield _sse("meta", {"error": "provider_error", "message": str(exc), "attempt_id": str(attempt_id)})
        return
    except Exception as exc:
        debug_timeline.append(
            {
                "stage": "chat_request",
                "label": "Chat request",
                "status": "failed",
                "finished_at": _now_iso(),
                "details": {},
                "error": str(exc)[:1000],
            }
        )
        generation_attempt_service.fail_attempt(
            db,
            attempt_id=attempt_id,
            message=str(exc),
            retrieval_run_id=retrieval_run_id,
            meta_json=_attempt_meta_json(base_meta=assistant_provider_meta, debug_timeline=debug_timeline, debug_enabled=debug_enabled),
        )
        for debug_chunk in _debug_sse(
            debug_enabled,
            {
                "stage": "chat_request",
                "label": "Chat request",
                "status": "failed",
                "finished_at": _now_iso(),
                "details": {},
                "error": str(exc)[:1000],
            },
        ):
            yield debug_chunk
        yield _sse("meta", {"error": "provider_error", "message": str(exc), "attempt_id": str(attempt_id)})
        return

    if retrieval_run_id is None:
        generation_attempt_service.fail_attempt(
            db,
            attempt_id=attempt_id,
            message="Missing retrieval_run_id",
            meta_json=_attempt_meta_json(base_meta=assistant_provider_meta, debug_timeline=debug_timeline, debug_enabled=debug_enabled),
        )
        yield _sse("meta", {"error": "internal_error", "message": "Missing retrieval_run_id", "attempt_id": str(attempt_id)})
        return

    if parsed_citation_text is None:
        generation_attempt_service.fail_attempt(
            db,
            attempt_id=attempt_id,
            message="Missing parsed_citation_text",
            retrieval_run_id=retrieval_run_id,
            meta_json=_attempt_meta_json(base_meta=assistant_provider_meta, debug_timeline=debug_timeline, debug_enabled=debug_enabled),
        )
        yield _sse("meta", {"error": "internal_error", "message": "Missing parsed_citation_text", "attempt_id": str(attempt_id)})
        return

    citations = parsed_citation_text.citations
    assistant_meta = {
        **assistant_provider_meta,
        "attempt_id": str(attempt_id),
        "multimodal_evidence_ids": multimodal_attached_evidence_ids,
    }
    persist_start_event, persist_started, persist_started_at = _stage_start(
        stage="persist_assistant_message",
        label="Persist assistant message",
        details={"provider": "vertex_ai"},
    )
    for debug_chunk in _debug_sse(debug_enabled, persist_start_event):
        yield debug_chunk
    assistant_message = chat_service.create_assistant_message(
        db,
        thread_id=thread_db_id,
        content=parsed_citation_text.plain_text,
        content_with_citations=parsed_citation_text.content_with_citations,
        citations=citations,
        segments=parsed_citation_text.segments,
        retrieval_run_id=retrieval_run_id,
        provider="vertex_ai",
        provider_meta=assistant_meta,
    )
    for debug_chunk in _debug_sse(
        debug_enabled,
        _stage_finish(
            timeline=debug_timeline,
            stage="persist_assistant_message",
            label="Persist assistant message",
            started_perf=persist_started,
            started_at=persist_started_at,
            details={"message_id": str(assistant_message.id), "provider": "vertex_ai"},
        ),
    ):
        yield debug_chunk
    complete_start_event, complete_started, complete_started_at = _stage_start(
        stage="complete_attempt",
        label="Complete generation attempt",
    )
    for debug_chunk in _debug_sse(debug_enabled, complete_start_event):
        yield debug_chunk
    generation_attempt_service.complete_attempt(
        db,
        attempt_id=attempt_id,
        response_text=parsed_citation_text.plain_text,
        citations_json={
            "retrieval_run_id": str(retrieval_run_id),
            "citations": citations,
            "segments": parsed_citation_text.segments,
            "content_with_citations": parsed_citation_text.content_with_citations,
        },
        retrieval_run_id=retrieval_run_id,
        chat_message_id=cast(uuid.UUID, assistant_message.id),
        meta_json=_attempt_meta_json(base_meta=assistant_meta, debug_timeline=debug_timeline, debug_enabled=debug_enabled),
    )
    for debug_chunk in _debug_sse(
        debug_enabled,
        _stage_finish(
            timeline=debug_timeline,
            stage="complete_attempt",
            label="Complete generation attempt",
            started_perf=complete_started,
            started_at=complete_started_at,
            details={"attempt_id": str(attempt_id), "status": "completed"},
        ),
    ):
        yield debug_chunk
    yield _sse(
        "meta",
        {
            "citations": citations,
            "evidence": [evidence_item_to_payload(item) for item in evidence],
            "segments": parsed_citation_text.segments,
            "content_with_citations": parsed_citation_text.content_with_citations,
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
    except DuplicatePhoneNumberError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create thread: {exc}") from exc


@router.delete("/threads/{thread_id}", response_model=InkwiseMessageResponse)
def delete_thread(
    thread_id: uuid.UUID,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseMessageResponse:
    try:
        chat_service.delete_thread(db, user_id=token_data["uid"], thread_id=thread_id)
        return InkwiseMessageResponse(message="Thread deleted successfully")
    except FileNotFoundError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete thread: {exc}") from exc


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


@router.get("/attempts/{attempt_id}", response_model=InkwiseGenerationAttemptDetailOut)
def get_chat_attempt(
    attempt_id: uuid.UUID,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseGenerationAttemptDetailOut:
    if not can_access_inkwise_chat_debug(user_id=token_data["uid"]):
        raise HTTPException(status_code=403, detail="Debug access not allowed")
    try:
        attempt = generation_attempt_service.get_attempt_for_user(db, user_id=token_data["uid"], attempt_id=attempt_id)
        if str(attempt.kind) != "chat":
            raise HTTPException(status_code=400, detail="This generation attempt is not a chat attempt")
        meta_json = cast(dict[str, Any], attempt.meta_json or {})
        raw_timeline = meta_json.get("debug_timeline") if isinstance(meta_json, dict) else []
        timeline = [item for item in raw_timeline if isinstance(item, dict)] if isinstance(raw_timeline, list) else []
        return InkwiseGenerationAttemptDetailOut(
            attempt=InkwiseGenerationAttemptOut.model_validate(attempt),
            debug_timeline=timeline,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


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
    debug_enabled = can_access_inkwise_chat_debug(user_id=user_id)

    try:
        thread = chat_service.get_thread_or_404(db, user_id=user_id, thread_id=thread_id)
        thread_db_id = cast(uuid.UUID, thread.id)
        thread_document_id = cast(uuid.UUID, thread.document_id)
        document = chat_service.get_document_or_404(db, user_id=user_id, document_id=thread_document_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    draft_text = (body.draft_selection_text or "").strip()
    draft_text, draft_truncated = truncate_text(draft_text, 8000)
    draft_label = (body.draft_selection_label or "").strip()[:80] or None

    async def gen() -> AsyncGenerator[bytes, None]:
        debug_timeline: list[dict[str, Any]] = []
        try:
            source_start_event, source_started, source_started_at = _stage_start(
                stage="resolve_sources",
                label="Resolve ready sources",
                details={"requested_source_count": len(body.source_ids or [])},
            )
            for debug_chunk in _debug_sse(debug_enabled, source_start_event):
                yield debug_chunk
            ready_bound_sources = document_source_service.list_ready_bound_sources(
                db,
                document_id=thread_document_id,
                user_id=user_id,
            )
            if not ready_bound_sources:
                for debug_chunk in _debug_sse(
                    debug_enabled,
                    _stage_finish(
                        timeline=debug_timeline,
                        stage="resolve_sources",
                        label="Resolve ready sources",
                        started_perf=source_started,
                        started_at=source_started_at,
                        status="failed",
                        error="No grounded sources are ready. Ingest and bind at least one completed source.",
                    ),
                ):
                    yield debug_chunk
                yield _sse("meta", {"error": "no_ready_sources", "message": "No grounded sources are ready. Ingest and bind at least one completed source."})
                return

            scoped_source_ids, bound_sources = _resolve_scoped_chat_sources(
                ready_bound_sources=ready_bound_sources,
                scoped_ids=body.source_ids,
            )
            for debug_chunk in _debug_sse(
                debug_enabled,
                _stage_finish(
                    timeline=debug_timeline,
                    stage="resolve_sources",
                    label="Resolve ready sources",
                    started_perf=source_started,
                    started_at=source_started_at,
                    details={"ready_source_count": len(ready_bound_sources), "scoped_source_ids": [str(source_id) for source_id in scoped_source_ids]},
                ),
            ):
                yield debug_chunk

            user_message_start_event, user_message_started, user_message_started_at = _stage_start(
                stage="persist_user_message",
                label="Persist user message",
            )
            for debug_chunk in _debug_sse(debug_enabled, user_message_start_event):
                yield debug_chunk
            user_message = chat_service.create_user_message(
                db,
                thread_id=thread_db_id,
                content=body.content,
                scoped_source_ids=scoped_source_ids,
                draft_selection_label=draft_label,
                draft_selection_text=draft_text or None,
                draft_selection_truncated=draft_truncated,
            )
            for debug_chunk in _debug_sse(
                debug_enabled,
                _stage_finish(
                    timeline=debug_timeline,
                    stage="persist_user_message",
                    label="Persist user message",
                    started_perf=user_message_started,
                    started_at=user_message_started_at,
                    details={"message_id": str(user_message.id), "draft_selection_attached": bool(draft_text), "draft_selection_truncated": bool(draft_truncated)},
                ),
            ):
                yield debug_chunk

            history_start_event, history_started, history_started_at = _stage_start(
                stage="prepare_history",
                label="Prepare grounded chat history",
            )
            for debug_chunk in _debug_sse(debug_enabled, history_start_event):
                yield debug_chunk
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
            for debug_chunk in _debug_sse(
                debug_enabled,
                _stage_finish(
                    timeline=debug_timeline,
                    stage="prepare_history",
                    label="Prepare grounded chat history",
                    started_perf=history_started,
                    started_at=history_started_at,
                    details={
                        "history_limit": history_limit,
                        "loaded_message_count": len(history_messages),
                        "grounded_message_count": grounded_history_meta.get("message_count"),
                        "grounded_char_count": grounded_history_meta.get("char_count"),
                        "history_truncated": grounded_history_meta.get("truncated"),
                    },
                ),
            ):
                yield debug_chunk

            attempt_start_event, attempt_started, attempt_started_at = _stage_start(
                stage="create_attempt",
                label="Create generation attempt",
                details={"kind": "chat"},
            )
            for debug_chunk in _debug_sse(debug_enabled, attempt_start_event):
                yield debug_chunk
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
            for debug_chunk in _debug_sse(
                debug_enabled,
                _stage_finish(
                    timeline=debug_timeline,
                    stage="create_attempt",
                    label="Create generation attempt",
                    started_perf=attempt_started,
                    started_at=attempt_started_at,
                    details={"attempt_id": str(attempt.id), "fresh_retrieval": True},
                ),
            ):
                yield debug_chunk

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
                debug_timeline=debug_timeline,
                debug_enabled=debug_enabled,
            ):
                yield chunk
            _schedule_thread_auto_name_after_response(
                thread=thread,
                user_id=user_id,
                thread_id=thread_db_id,
                user_message=body.content,
            )
        except HTTPException as exc:
            yield _sse("meta", {"error": "invalid_request", "message": str(exc.detail)})
            return
        except Exception as exc:
            yield _sse("meta", {"error": "internal_error", "message": str(exc)[:1000]})
            return

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers=_STREAM_HEADERS,
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
    debug_enabled = can_access_inkwise_chat_debug(user_id=user_id)

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

    source_meta = source_message.provider_meta or {}
    draft_text = str(source_meta.get("draft_selection_text") or "")

    assistant_provider_meta = cast(dict[str, Any], assistant_message.provider_meta or {})
    prior_attempt_id = str(assistant_provider_meta.get("attempt_id") or "").strip() or None
    prior_attempt_uuid = uuid.UUID(prior_attempt_id) if prior_attempt_id else None
    prior_citations = cast(dict[str, Any], assistant_message.citations_json or {})

    async def gen() -> AsyncGenerator[bytes, None]:
        debug_timeline: list[dict[str, Any]] = []
        try:
            source_start_event, source_started, source_started_at = _stage_start(
                stage="resolve_sources",
                label="Resolve ready sources",
                details={"retry_of_message_id": str(message_id)},
            )
            for debug_chunk in _debug_sse(debug_enabled, source_start_event):
                yield debug_chunk
            ready_bound_sources = document_source_service.list_ready_bound_sources(
                db,
                document_id=cast(uuid.UUID, thread.document_id),
                user_id=user_id,
            )
            if not ready_bound_sources:
                for debug_chunk in _debug_sse(
                    debug_enabled,
                    _stage_finish(
                        timeline=debug_timeline,
                        stage="resolve_sources",
                        label="Resolve ready sources",
                        started_perf=source_started,
                        started_at=source_started_at,
                        status="failed",
                        error="No grounded sources are ready. Ingest and bind at least one completed source.",
                    ),
                ):
                    yield debug_chunk
                yield _sse("meta", {"error": "no_ready_sources", "message": "No grounded sources are ready. Ingest and bind at least one completed source."})
                return

            scoped_source_ids = [uuid.UUID(value) for value in (source_meta.get("scoped_source_ids") or [])]
            scoped_source_ids_or_none = scoped_source_ids or None
            resolved_source_ids, bound_sources = _resolve_scoped_chat_sources(
                ready_bound_sources=ready_bound_sources,
                scoped_ids=scoped_source_ids_or_none,
            )
            for debug_chunk in _debug_sse(
                debug_enabled,
                _stage_finish(
                    timeline=debug_timeline,
                    stage="resolve_sources",
                    label="Resolve ready sources",
                    started_perf=source_started,
                    started_at=source_started_at,
                    details={"ready_source_count": len(ready_bound_sources), "scoped_source_ids": [str(source_id) for source_id in resolved_source_ids]},
                ),
            ):
                yield debug_chunk

            history_start_event, history_started, history_started_at = _stage_start(
                stage="prepare_history",
                label="Prepare grounded chat history",
            )
            for debug_chunk in _debug_sse(debug_enabled, history_start_event):
                yield debug_chunk
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
            for debug_chunk in _debug_sse(
                debug_enabled,
                _stage_finish(
                    timeline=debug_timeline,
                    stage="prepare_history",
                    label="Prepare grounded chat history",
                    started_perf=history_started,
                    started_at=history_started_at,
                    details={
                        "history_limit": history_limit,
                        "loaded_message_count": len(history_messages),
                        "grounded_message_count": grounded_history_meta.get("message_count"),
                        "grounded_char_count": grounded_history_meta.get("char_count"),
                        "history_truncated": grounded_history_meta.get("truncated"),
                    },
                ),
            ):
                yield debug_chunk

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

            attempt_start_event, attempt_started, attempt_started_at = _stage_start(
                stage="create_attempt",
                label="Create generation attempt",
                details={"kind": "chat_retry"},
            )
            for debug_chunk in _debug_sse(debug_enabled, attempt_start_event):
                yield debug_chunk
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
            for debug_chunk in _debug_sse(
                debug_enabled,
                _stage_finish(
                    timeline=debug_timeline,
                    stage="create_attempt",
                    label="Create generation attempt",
                    started_perf=attempt_started,
                    started_at=attempt_started_at,
                    details={"attempt_id": str(attempt.id), "fresh_retrieval": bool(body.fresh_retrieval), "reused_retrieval_run_id": str(reuse_retrieval_run_id) if reuse_retrieval_run_id else None},
                ),
            ):
                yield debug_chunk

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
                debug_timeline=debug_timeline,
                debug_enabled=debug_enabled,
            ):
                yield chunk
            _schedule_thread_auto_name_after_response(
                thread=thread,
                user_id=user_id,
                thread_id=thread_id,
                user_message=str(source_message.content),
            )
        except HTTPException as exc:
            yield _sse("meta", {"error": "invalid_request", "message": str(exc.detail)})
            return
        except Exception as exc:
            yield _sse("meta", {"error": "internal_error", "message": str(exc)[:1000]})
            return

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers=_STREAM_HEADERS,
    )
