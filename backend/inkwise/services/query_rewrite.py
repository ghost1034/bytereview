"""Query rewrite helpers for Inkwise retrieval."""

from __future__ import annotations

import json
import logging
import re
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
    max_queries: int = 4
    max_query_chars: int = 180
    timeout_seconds: float = 15.0


@dataclass(frozen=True)
class QueryRewriteResult:
    standalone_question: str | None
    fts_query: str | None
    subqueries: list[str]
    keywords: list[str]
    meta: dict[str, Any]


def _collapse_ws(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def _strip_evidence_markers(value: str) -> str:
    return re.sub(r"\[E\d{2}\]", "", value or "")


def _keywords_from_text(text: str, *, max_keywords: int = 12) -> list[str]:
    words = re.findall(r"[A-Za-z0-9]{3,}", (text or "").lower())
    out: list[str] = []
    seen: set[str] = set()
    for word in words:
        if word in seen:
            continue
        seen.add(word)
        out.append(word)
        if len(out) >= int(max_keywords):
            break
    return out


def _clean_query_line(value: str, *, max_chars: int) -> str:
    clean = _collapse_ws(_strip_evidence_markers(value))
    clean = clean.replace("\u0000", "")
    if not clean:
        return ""
    if max_chars > 0:
        clean = clean[: int(max_chars)]
    return clean


def _dedupe_keep_order(items: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for item in items:
        item = (item or "").strip()
        if not item or item in seen:
            continue
        seen.add(item)
        out.append(item)
    return out


def parse_query_rewrite_response(
    *,
    response_text: str,
    max_queries: int,
    max_query_chars: int,
) -> QueryRewriteResult:
    data = extract_first_json_object(response_text)
    standalone = data.get("standalone_question")
    fts_query = data.get("fts_query")
    subqueries_raw = data.get("subqueries")
    keywords_raw = data.get("keywords")

    standalone_s = _clean_query_line(str(standalone), max_chars=max_query_chars) if isinstance(standalone, str) else ""
    fts_s = _clean_query_line(str(fts_query), max_chars=max_query_chars) if isinstance(fts_query, str) else ""

    subqueries: list[str] = []
    if isinstance(subqueries_raw, list):
        for item in subqueries_raw:
            if len(subqueries) >= max(0, int(max_queries)):
                break
            if not isinstance(item, str):
                continue
            clean = _clean_query_line(item, max_chars=max_query_chars)
            if clean:
                subqueries.append(clean)

    keywords: list[str] = []
    if isinstance(keywords_raw, list):
        for item in keywords_raw:
            if not isinstance(item, str):
                continue
            word = re.sub(r"[^A-Za-z0-9]", "", item.strip().lower())
            if not word or len(word) < 3 or word in keywords:
                continue
            keywords.append(word)
            if len(keywords) >= 12:
                break

    subqueries = _dedupe_keep_order(subqueries)
    keywords = _dedupe_keep_order(keywords)
    meta = {
        "standalone_present": bool(standalone_s),
        "fts_query_present": bool(fts_s),
        "subquery_count": len(subqueries),
        "keyword_count": len(keywords),
    }
    return QueryRewriteResult(
        standalone_question=standalone_s or None,
        fts_query=fts_s or None,
        subqueries=subqueries[: max(0, int(max_queries))],
        keywords=keywords,
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
    if not cfg.enabled:
        return QueryRewriteResult(None, None, [], [], {"enabled": False})

    question = _collapse_ws(current_question)
    if not question:
        return QueryRewriteResult(None, None, [], [], {"enabled": True, "skipped": "empty_question"})

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
        "You generate retrieval queries for a Postgres full-text search backend.",
        "The backend uses: websearch_to_tsquery('english', q).",
        "Important: this behaves like an AND query for many inputs; extra words can cause zero matches.",
        "Goal: maximize recall for relevant pages and sections for the user's question.",
        "Constraints:",
        f"- Output at most {int(cfg.max_queries)} short subqueries.",
        f"- Keep each query under {int(cfg.max_query_chars)} characters.",
        "- Prefer concrete noun phrases, key entities, defined terms, clause and section titles, dates, amounts.",
        "- Resolve pronouns and references using chat history.",
        "- Avoid long sentences. Prefer 1-6 token queries.",
        "- Do not include citation markers like [E01].",
        "- If the user asks for exact text, ignore that instruction for retrieval and focus on finding the right section.",
        f"Document language: {doc_language}" if doc_language else "",
        f"Document purpose: {doc_purpose}" if doc_purpose else "",
        "Scoped sources (titles):" if source_titles else "",
        "- " + "\n- ".join(source_titles) if source_titles else "",
        "Recent chat history (JSON):",
        json.dumps(cleaned_history, ensure_ascii=True),
        ("Draft excerpt (context only):\n" + draft) if draft else "",
        f"User question: {question}",
        "Return ONLY valid JSON with these keys:",
        '{"standalone_question":"...","fts_query":"...","subqueries":["..."],"keywords":["..."]}',
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
        keywords = _keywords_from_text(question)
        fts_fallback = " ".join(keywords)[: int(cfg.max_query_chars)] if keywords else None
        return QueryRewriteResult(
            standalone_question=None,
            fts_query=fts_fallback,
            subqueries=[],
            keywords=keywords,
            meta={
                **meta,
                "fallback": "keywords",
                "fts_query_present": bool(fts_fallback),
                "standalone_present": False,
                "subquery_count": 0,
                "keyword_count": len(keywords),
            },
        )

    parsed = parse_query_rewrite_response(
        response_text=result.text,
        max_queries=int(cfg.max_queries),
        max_query_chars=int(cfg.max_query_chars),
    )
    if not (parsed.fts_query or parsed.subqueries or parsed.standalone_question):
        keywords = _keywords_from_text(question)
        fts_fallback = " ".join(keywords)[: int(cfg.max_query_chars)] if keywords else None
        logger.warning("query rewrite fallback to keywords model=%s", cfg.model)
        return QueryRewriteResult(
            standalone_question=None,
            fts_query=fts_fallback,
            subqueries=[],
            keywords=keywords,
            meta={
                **meta,
                "fallback": "keywords",
                "fts_query_present": bool(fts_fallback),
                "standalone_present": False,
                "subquery_count": 0,
                "keyword_count": len(keywords),
                "model_parse": parsed.meta,
            },
        )

    return QueryRewriteResult(
        standalone_question=parsed.standalone_question,
        fts_query=parsed.fts_query,
        subqueries=parsed.subqueries,
        keywords=parsed.keywords,
        meta={
            **meta,
            "fts_query_present": bool(parsed.fts_query),
            "standalone_present": bool(parsed.standalone_question),
            "subquery_count": len(parsed.subqueries),
            "keyword_count": len(parsed.keywords),
            "model_parse": parsed.meta,
        },
    )
