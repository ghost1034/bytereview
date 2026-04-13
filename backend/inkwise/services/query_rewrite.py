"""Query rewrite helpers for Inkwise retrieval."""

from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass
from typing import Any

from inkwise.services.json_utils import extract_first_json_object
from inkwise.services.vertex_ai import VertexAIError, generate_text_sync

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class QueryRewriteConfig:
    enabled: bool
    model: str
    max_history_messages: int = 12
    max_query_chars: int = 180
    timeout_seconds: float = 15.0


@dataclass(frozen=True)
class QueryRewriteResult:
    standalone_question: str | None
    fts_query: str | None
    meta: dict[str, Any]


def _collapse_ws(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def _strip_evidence_markers(value: str) -> str:
    return re.sub(r"\[E\d{2}\]", "", value or "")


def _clean_query_line(value: str, *, max_chars: int) -> str:
    clean = _collapse_ws(_strip_evidence_markers(value))
    clean = clean.replace("\u0000", "")
    if not clean:
        return ""
    if max_chars > 0:
        clean = clean[: int(max_chars)]
    return clean


def parse_query_rewrite_response(
    *,
    response_text: str,
    max_query_chars: int,
) -> QueryRewriteResult:
    data = extract_first_json_object(response_text)
    standalone = data.get("standalone_question")
    fts_query = data.get("fts_query")

    standalone_s = _clean_query_line(str(standalone), max_chars=max_query_chars) if isinstance(standalone, str) else ""
    fts_s = _clean_query_line(str(fts_query), max_chars=max_query_chars) if isinstance(fts_query, str) else ""

    meta = {
        "standalone_present": bool(standalone_s),
        "fts_query_present": bool(fts_s),
    }
    return QueryRewriteResult(
        standalone_question=standalone_s or None,
        fts_query=fts_s or None,
        meta=meta,
    )


def rewrite_retrieval_query(
    *,
    cfg: QueryRewriteConfig,
    current_question: str,
    history_messages: list[dict[str, str]] | None,
    doc_language: str | None = None,
    doc_purpose: str | None = None,
    scoped_source_titles: list[str] | None = None,
    draft_selection_text: str | None = None,
) -> QueryRewriteResult:
    started = time.perf_counter()

    if not cfg.enabled:
        return QueryRewriteResult(None, None, {"enabled": False, "duration_ms": int((time.perf_counter() - started) * 1000)})

    question = _collapse_ws(current_question)
    if not question:
        return QueryRewriteResult(None, None, {"enabled": True, "skipped": "empty_question", "duration_ms": int((time.perf_counter() - started) * 1000)})

    history = list(history_messages or [])
    if cfg.max_history_messages >= 0:
        history = history[-int(cfg.max_history_messages) :]

    cleaned_history: list[dict[str, str]] = []
    for message in history:
        role = str(message.get("role") or "").strip()
        content = _clean_query_line(str(message.get("content") or ""), max_chars=800)
        if role not in ("user", "assistant", "system"):
            continue
        if not content:
            continue
        cleaned_history.append({"role": role, "content": content})

    source_titles = [
        _clean_query_line(title, max_chars=160)
        for title in (scoped_source_titles or [])
        if isinstance(title, str) and title.strip()
    ][:20]
    draft = _clean_query_line(draft_selection_text or "", max_chars=800)

    prompt_parts: list[str] = [
        "You rewrite a user's chat question into retrieval queries for a document Q&A system.",
        "",
        "You produce exactly two outputs:",
        '1. "standalone_question": A fully self-contained reformulation of the user\'s question.',
        "   - Resolve ALL pronouns, references, and ellipses using the chat history so the question makes sense in isolation.",
        "   - Preserve the user's original intent and specificity.",
        "   - This will be used for semantic / vector similarity search.",
        f"   - Keep under {int(cfg.max_query_chars)} characters.",
        "",
        '2. "fts_query": A short query optimized for PostgreSQL websearch_to_tsquery(\'english\', q).',
        "   - websearch_to_tsquery behaves like AND: extra words reduce matches. Fewer tokens = better recall.",
        "   - Use 1-6 concrete tokens: key entities, defined terms, section/clause titles, dates, amounts.",
        "   - Do NOT repeat filler words or the full question.",
        f"   - Keep under {int(cfg.max_query_chars)} characters.",
        "",
        "Rules:",
        "- Do not include citation markers like [E01].",
        "- If the user asks for exact text, focus on finding the right section, not echoing the text.",
        f"Document language: {doc_language}" if doc_language else "",
        f"Document purpose: {doc_purpose}" if doc_purpose else "",
        "Scoped sources (titles):" if source_titles else "",
        "- " + "\n- ".join(source_titles) if source_titles else "",
        "Recent chat history (JSON):",
        json.dumps(cleaned_history, ensure_ascii=True),
        ("Draft excerpt (context only):\n" + draft) if draft else "",
        f"User question: {question}",
        "Return ONLY valid JSON with these keys:",
        '{"standalone_question":"...","fts_query":"..."}',
    ]
    prompt = "\n".join([part for part in prompt_parts if part]).strip() + "\n"

    meta: dict[str, Any] = {
        "enabled": True,
        "model": cfg.model,
        "history_count": len(cleaned_history),
        "source_title_count": len(source_titles),
        "draft_attached": bool(draft),
    }

    try:
        result = generate_text_sync(
            model=cfg.model,
            prompt=prompt,
            temperature=0.0,
            max_output_tokens=65536,
        )
    except VertexAIError as exc:
        meta["error"] = str(exc)[:500]
        fts_fallback = _clean_query_line(question, max_chars=int(cfg.max_query_chars)) or None
        return QueryRewriteResult(
            standalone_question=None,
            fts_query=fts_fallback,
            meta={
                **meta,
                "fallback": "original_question",
                "fts_query_present": bool(fts_fallback),
                "standalone_present": False,
                "duration_ms": int((time.perf_counter() - started) * 1000),
            },
        )

    parsed = parse_query_rewrite_response(
        response_text=result.text,
        max_query_chars=int(cfg.max_query_chars),
    )
    if not (parsed.fts_query or parsed.standalone_question):
        fts_fallback = _clean_query_line(question, max_chars=int(cfg.max_query_chars)) or None
        logger.warning("query rewrite fallback to original question model=%s", cfg.model)
        return QueryRewriteResult(
            standalone_question=None,
            fts_query=fts_fallback,
            meta={
                **meta,
                "fallback": "original_question",
                "fts_query_present": bool(fts_fallback),
                "standalone_present": False,
                "model_parse": parsed.meta,
                "duration_ms": int((time.perf_counter() - started) * 1000),
            },
        )

    return QueryRewriteResult(
        standalone_question=parsed.standalone_question,
        fts_query=parsed.fts_query,
        meta={
            **meta,
            "fts_query_present": bool(parsed.fts_query),
            "standalone_present": bool(parsed.standalone_question),
            "model_parse": parsed.meta,
            "duration_ms": int((time.perf_counter() - started) * 1000),
        },
    )
