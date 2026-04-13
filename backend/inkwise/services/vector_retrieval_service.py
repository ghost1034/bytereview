"""Vector-first retrieval for Inkwise grounded evidence."""

# pyright: reportAttributeAccessIssue=false, reportGeneralTypeIssues=false, reportArgumentType=false

from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from inkwise.services.embeddings import InkwiseEmbeddingService
from inkwise.services.json_utils import extract_first_json_object
from inkwise.services.query_rewrite import QueryRewriteConfig, QueryRewriteResult, rewrite_retrieval_query
from inkwise.services.retrieval_types import EvidenceItem, evidence_excerpt as _evidence_excerpt
from inkwise.services.vertex_ai import VertexAIError, generate_text_sync
from inkwise.settings import get_inkwise_settings


_RRF_K = 60.0


@dataclass
class RetrievalCandidate:
    segment_id: uuid.UUID
    source_id: uuid.UUID
    source_title: str
    modality: str | None
    segment_type: str | None
    segment_title: str | None
    text_content: str
    page_start: int | None
    page_end: int | None
    locator_json: dict[str, Any] | None
    preview_bucket: str | None
    preview_object: str | None
    bibliographic_metadata: dict[str, Any] | None = None
    vector_score: float | None = None
    lexical_score: float | None = None
    vector_rank: int | None = None
    lexical_rank: int | None = None
    fused_score: float = 0.0
    rerank_rank: int | None = None
    excerpt: str | None = None


class InkwiseVectorRetrievalService:
    def __init__(self) -> None:
        self.embedding_service = InkwiseEmbeddingService()

    def retrieve_evidence(
        self,
        db: Session,
        *,
        query: str,
        bound_sources: list[tuple[uuid.UUID, str]],
        history_messages: list[dict[str, str]] | None = None,
        draft_selection_text: str | None = None,
        document_language: str | None = None,
        document_purpose: str | None = None,
        max_evidence: int = 12,
        max_total_chars: int = 90000,
    ) -> tuple[list[EvidenceItem], dict[str, Any], str]:
        started = time.perf_counter()
        settings = get_inkwise_settings()
        clean_query = (query or "").strip()
        if not clean_query or not bound_sources:
            return [], {"engine": "vector", "empty": True, "total_duration_ms": int((time.perf_counter() - started) * 1000)}, "vector-v1"

        rewrite_cfg = QueryRewriteConfig(
            enabled=bool(settings.query_rewrite_enabled and settings.vertex_enabled),
            model=settings.query_rewrite_model,
            max_history_messages=int(settings.query_rewrite_max_history_messages),
            max_query_chars=int(settings.query_rewrite_max_query_chars),
            timeout_seconds=float(settings.query_rewrite_timeout_seconds),
        )

        has_chat_history = bool(history_messages)
        rewrite_meta: dict[str, Any] = {"enabled": rewrite_cfg.enabled, "triggered": False, "has_chat_history": has_chat_history}
        rewrite: QueryRewriteResult | None = None
        if rewrite_cfg.enabled:
            try:
                rewrite = rewrite_retrieval_query(
                    cfg=rewrite_cfg,
                    current_question=clean_query,
                    history_messages=history_messages,
                    doc_language=document_language,
                    doc_purpose=document_purpose,
                    scoped_source_titles=[title for _source_id, title in bound_sources],
                    draft_selection_text=draft_selection_text,
                )
                rewrite_meta["triggered"] = bool(rewrite.standalone_question or rewrite.fts_query)
                rewrite_meta["standalone_question"] = rewrite.standalone_question
                rewrite_meta["fts_query"] = rewrite.fts_query
            except Exception as exc:
                rewrite = None
                rewrite_meta["error"] = str(exc)[:500]

        # Build search attempts.
        # When query rewrite produced a standalone_question AND there is chat history,
        # the original query may contain unresolved references (pronouns, "it", "that
        # section", etc.) so we lead with the rewritten standalone_question for vector
        # search and use fts_query for lexical search.  The original query is kept as
        # a fallback in case the rewritten queries return zero candidates.
        # When there is no chat history the original query is self-contained, so we
        # use it directly (standalone_question would be near-identical).
        attempts: list[dict[str, str | None]] = []
        if rewrite and rewrite.standalone_question and has_chat_history:
            attempts.append({
                "vector_query": rewrite.standalone_question,
                "lexical_query": rewrite.fts_query,
            })
            # Fallback: original query (in case rewrite missed the intent)
            attempts.append({
                "vector_query": clean_query,
                "lexical_query": None,
            })
        else:
            # No chat history or rewrite failed/disabled — use original query.
            fts_override = rewrite.fts_query if rewrite and rewrite.fts_query else None
            attempts.append({
                "vector_query": clean_query,
                "lexical_query": fts_override,
            })

        rewrite_meta["attempts"] = attempts

        candidate_map: dict[uuid.UUID, RetrievalCandidate] = {}
        search_attempt_meta: list[dict[str, Any]] = []
        for idx, attempt in enumerate(attempts):
            attempt_started = time.perf_counter()
            candidates, meta = self._search_attempt(
                db,
                query=attempt["vector_query"],
                lexical_query=attempt.get("lexical_query"),
                bound_sources=bound_sources,
                vector_top_k=int(settings.vector_search_top_k),
                lexical_top_k=int(settings.lexical_search_top_k),
                use_lexical_fusion=bool(settings.use_lexical_fusion),
            )
            meta["attempt_index"] = idx + 1
            meta["duration_ms"] = int((time.perf_counter() - attempt_started) * 1000)
            search_attempt_meta.append(meta)
            for candidate in candidates:
                existing = candidate_map.get(candidate.segment_id)
                if existing is None or candidate.fused_score > existing.fused_score:
                    candidate_map[candidate.segment_id] = candidate
            if candidate_map:
                break

        ordered_candidates = sorted(candidate_map.values(), key=lambda item: item.fused_score, reverse=True)
        rerank_meta: dict[str, Any] = {"enabled": bool(settings.use_vector_rerank), "triggered": False}
        if settings.use_vector_rerank and ordered_candidates:
            reranked, rerank_meta = self._rerank_candidates(
                query=clean_query,
                candidates=ordered_candidates,
                limit=min(len(ordered_candidates), int(settings.rerank_top_k)),
                model=settings.vector_rerank_model,
            )
            if reranked:
                ordered_candidates = reranked + [c for c in ordered_candidates if c.segment_id not in {r.segment_id for r in reranked}]

        evidence_pack_started = time.perf_counter()
        evidence = self._candidates_to_evidence(
            ordered_candidates,
            max_evidence=max_evidence,
            max_total_chars=max_total_chars,
        )
        evidence_pack_duration_ms = int((time.perf_counter() - evidence_pack_started) * 1000)
        strategy_bits = ["vector"]
        if settings.use_lexical_fusion:
            strategy_bits.append("fusion")
        if bool(rerank_meta.get("triggered")):
            strategy_bits.append("rerank")
        if bool(rewrite_meta.get("triggered")):
            strategy_bits.append("qr")
        return evidence, {
            "engine": "vector",
            "search_attempts": search_attempt_meta,
            "query_rewrite": rewrite_meta,
            "rerank": rerank_meta,
            "candidate_count": len(ordered_candidates),
            "evidence_count": len(evidence),
            "evidence_pack_duration_ms": evidence_pack_duration_ms,
            "total_duration_ms": int((time.perf_counter() - started) * 1000),
        }, "+".join(strategy_bits) + "-v1"

    def _search_attempt(
        self,
        db: Session,
        *,
        query: str,
        lexical_query: str | None = None,
        bound_sources: list[tuple[uuid.UUID, str]],
        vector_top_k: int,
        lexical_top_k: int,
        use_lexical_fusion: bool,
    ) -> tuple[list[RetrievalCandidate], dict[str, Any]]:
        embedding_started = time.perf_counter()
        query_embedding = self.embedding_service.embed_query_text_sync(query)
        embedding_duration_ms = int((time.perf_counter() - embedding_started) * 1000)

        vector_started = time.perf_counter()
        vector_candidates = self._vector_candidates(
            db,
            embedding=query_embedding.values,
            source_ids=[source_id for source_id, _title in bound_sources],
            limit=vector_top_k,
        )
        vector_duration_ms = int((time.perf_counter() - vector_started) * 1000)

        fts_q = lexical_query if lexical_query is not None else query
        lexical_started = time.perf_counter()
        lexical_candidates = (
            self._lexical_candidates(
                db,
                query=fts_q,
                source_ids=[source_id for source_id, _title in bound_sources],
                limit=lexical_top_k,
            )
            if use_lexical_fusion
            else []
        )
        lexical_duration_ms = int((time.perf_counter() - lexical_started) * 1000)

        merge_started = time.perf_counter()
        merged = self._merge_candidates(vector_candidates=vector_candidates, lexical_candidates=lexical_candidates)
        merge_duration_ms = int((time.perf_counter() - merge_started) * 1000)
        return merged, {
            "vector_count": len(vector_candidates),
            "vector_query": query,
            "lexical_count": len(lexical_candidates),
            "lexical_query": fts_q,
            "merged_count": len(merged),
            "prompt_token_count": query_embedding.usage.prompt_token_count,
            "truncated": query_embedding.usage.truncated,
            "embedding_duration_ms": embedding_duration_ms,
            "vector_search_duration_ms": vector_duration_ms,
            "lexical_search_duration_ms": lexical_duration_ms,
            "merge_duration_ms": merge_duration_ms,
        }

    def _vector_candidates(
        self,
        db: Session,
        *,
        embedding: list[float],
        source_ids: list[uuid.UUID],
        limit: int,
    ) -> list[RetrievalCandidate]:
        if not source_ids or not embedding:
            return []
        stmt = text(
            """
            select
              s.id as segment_id,
              s.source_id as source_id,
              src.title as source_title,
              s.modality as modality,
              s.segment_type as segment_type,
              s.title as segment_title,
              coalesce(s.text_content, '') as text_content,
              s.page_start as page_start,
              s.page_end as page_end,
              s.locator_json as locator_json,
              s.preview_bucket as preview_bucket,
              s.preview_object as preview_object,
              src.bibliographic_metadata as bibliographic_metadata,
              (1 - (e.embedding <=> cast(:embedding as vector))) as vector_score
            from inkwise_source_segment_embeddings e
            join inkwise_source_segments s on s.id = e.segment_id
            join inkwise_sources src on src.id = s.source_id
            where e.is_active = true
              and s.source_id in :source_ids
            order by e.embedding <=> cast(:embedding as vector) asc
            limit :limit
            """
        ).bindparams(bindparam("source_ids", expanding=True))
        rows = db.execute(
            stmt,
            {
                "embedding": self._vector_literal(embedding),
                "source_ids": source_ids,
                "limit": int(limit),
            },
        ).mappings().all()
        out: list[RetrievalCandidate] = []
        for rank, row in enumerate(rows, start=1):
            out.append(
                RetrievalCandidate(
                    segment_id=self._uuid(row.get("segment_id")),
                    source_id=self._uuid(row.get("source_id")),
                    source_title=str(row.get("source_title") or ""),
                    modality=_text_or_none(row.get("modality")),
                    segment_type=_text_or_none(row.get("segment_type")),
                    segment_title=_text_or_none(row.get("segment_title")),
                    text_content=str(row.get("text_content") or ""),
                    page_start=_int_or_none(row.get("page_start")),
                    page_end=_int_or_none(row.get("page_end")),
                    locator_json=row.get("locator_json") if isinstance(row.get("locator_json"), dict) else None,
                    preview_bucket=_text_or_none(row.get("preview_bucket")),
                    preview_object=_text_or_none(row.get("preview_object")),
                    bibliographic_metadata=row.get("bibliographic_metadata") if isinstance(row.get("bibliographic_metadata"), dict) else None,
                    vector_score=_float_or_none(row.get("vector_score")),
                    vector_rank=rank,
                    excerpt=_make_excerpt(str(row.get("text_content") or "")),
                )
            )
        return out

    def _lexical_candidates(
        self,
        db: Session,
        *,
        query: str,
        source_ids: list[uuid.UUID],
        limit: int,
    ) -> list[RetrievalCandidate]:
        if not source_ids or not (query or "").strip():
            return []
        stmt = text(
            """
            select
              s.id as segment_id,
              s.source_id as source_id,
              src.title as source_title,
              s.modality as modality,
              s.segment_type as segment_type,
              s.title as segment_title,
              coalesce(s.text_content, '') as text_content,
              s.page_start as page_start,
              s.page_end as page_end,
              s.locator_json as locator_json,
              s.preview_bucket as preview_bucket,
              s.preview_object as preview_object,
              src.bibliographic_metadata as bibliographic_metadata,
              ts_rank(s.text_tsv, websearch_to_tsquery('english', :query)) as lexical_score,
              ts_headline(
                'english',
                coalesce(s.text_content, ''),
                websearch_to_tsquery('english', :query),
                'MaxFragments=1, MaxWords=80, MinWords=20, ShortWord=3, HighlightAll=FALSE'
              ) as excerpt
            from inkwise_source_segments s
            join inkwise_sources src on src.id = s.source_id
            where s.source_id in :source_ids
              and s.text_content is not null
              and s.text_tsv @@ websearch_to_tsquery('english', :query)
            order by lexical_score desc
            limit :limit
            """
        ).bindparams(bindparam("source_ids", expanding=True))
        rows = db.execute(
            stmt,
            {"query": query, "source_ids": source_ids, "limit": int(limit)},
        ).mappings().all()
        out: list[RetrievalCandidate] = []
        for rank, row in enumerate(rows, start=1):
            out.append(
                RetrievalCandidate(
                    segment_id=self._uuid(row.get("segment_id")),
                    source_id=self._uuid(row.get("source_id")),
                    source_title=str(row.get("source_title") or ""),
                    modality=_text_or_none(row.get("modality")),
                    segment_type=_text_or_none(row.get("segment_type")),
                    segment_title=_text_or_none(row.get("segment_title")),
                    text_content=str(row.get("text_content") or ""),
                    page_start=_int_or_none(row.get("page_start")),
                    page_end=_int_or_none(row.get("page_end")),
                    locator_json=row.get("locator_json") if isinstance(row.get("locator_json"), dict) else None,
                    preview_bucket=_text_or_none(row.get("preview_bucket")),
                    preview_object=_text_or_none(row.get("preview_object")),
                    bibliographic_metadata=row.get("bibliographic_metadata") if isinstance(row.get("bibliographic_metadata"), dict) else None,
                    lexical_score=_float_or_none(row.get("lexical_score")),
                    lexical_rank=rank,
                    excerpt=_make_excerpt(str(row.get("excerpt") or row.get("text_content") or "")),
                )
            )
        return out

    def _merge_candidates(
        self,
        *,
        vector_candidates: list[RetrievalCandidate],
        lexical_candidates: list[RetrievalCandidate],
    ) -> list[RetrievalCandidate]:
        merged: dict[uuid.UUID, RetrievalCandidate] = {}
        for item in vector_candidates:
            merged[item.segment_id] = item
        for item in lexical_candidates:
            existing = merged.get(item.segment_id)
            if existing is None:
                merged[item.segment_id] = item
                continue
            existing.lexical_score = item.lexical_score
            existing.lexical_rank = item.lexical_rank
            if item.excerpt and not existing.excerpt:
                existing.excerpt = item.excerpt

        for item in merged.values():
            score = 0.0
            if item.vector_rank is not None:
                score += 1.0 / (_RRF_K + float(item.vector_rank))
            if item.lexical_rank is not None:
                score += 1.0 / (_RRF_K + float(item.lexical_rank))
            if item.vector_rank is None and item.lexical_rank is None:
                score = float(item.vector_score or item.lexical_score or 0.0)
            item.fused_score = score

        return sorted(
            merged.values(),
            key=lambda item: (
                float(item.fused_score),
                float(item.vector_score or 0.0),
                float(item.lexical_score or 0.0),
            ),
            reverse=True,
        )

    def _rerank_candidates(
        self,
        *,
        query: str,
        candidates: list[RetrievalCandidate],
        limit: int,
        model: str,
    ) -> tuple[list[RetrievalCandidate], dict[str, Any]]:
        started = time.perf_counter()
        top = candidates[:limit]
        if not top:
            return [], {"enabled": True, "triggered": False, "candidate_count": 0, "duration_ms": int((time.perf_counter() - started) * 1000)}

        candidate_map = {f"C{idx:02d}": candidate for idx, candidate in enumerate(top, start=1)}
        prompt_candidates = []
        for candidate_id, candidate in candidate_map.items():
            prompt_candidates.append(
                {
                    "candidate_id": candidate_id,
                    "source_title": candidate.source_title,
                    "modality": candidate.modality,
                    "segment_type": candidate.segment_type,
                    "segment_title": candidate.segment_title,
                    "page_start": candidate.page_start,
                    "page_end": candidate.page_end,
                    "excerpt": _candidate_excerpt(candidate)[:800],
                }
            )

        prompt = "\n".join(
            [
                "You are ranking retrieved evidence candidates for a RAG system.",
                "Select the candidates that are most useful for answering the user query.",
                "Prefer candidates with direct, specific evidence over broad background context.",
                f"User query: {query}",
                "Candidates (JSON):",
                json.dumps(prompt_candidates, ensure_ascii=True),
                'Return ONLY valid JSON like {"candidate_ids": ["C01", "C03"]}.',
            ]
        )

        meta: dict[str, Any] = {"enabled": True, "triggered": True, "candidate_count": len(top)}
        try:
            result = generate_text_sync(
                model=model,
                prompt=prompt,
                temperature=0.0,
                max_output_tokens=2048,
            )
            data = extract_first_json_object(result.text)
            ordered_ids = data.get("candidate_ids")
            if not isinstance(ordered_ids, list):
                meta["duration_ms"] = int((time.perf_counter() - started) * 1000)
                return [], meta
        except (VertexAIError, ValueError) as exc:
            meta["error"] = str(exc)[:500]
            meta["duration_ms"] = int((time.perf_counter() - started) * 1000)
            return [], meta

        ranked: list[RetrievalCandidate] = []
        seen: set[str] = set()
        for rank, candidate_id in enumerate(ordered_ids, start=1):
            key = str(candidate_id).strip()
            candidate = candidate_map.get(key)
            if candidate is None or key in seen:
                continue
            seen.add(key)
            candidate.rerank_rank = rank
            ranked.append(candidate)
        meta["selected_candidate_ids"] = list(seen)
        meta["duration_ms"] = int((time.perf_counter() - started) * 1000)
        return ranked, meta

    def _candidates_to_evidence(
        self,
        candidates: list[RetrievalCandidate],
        *,
        max_evidence: int,
        max_total_chars: int,
    ) -> list[EvidenceItem]:
        evidence: list[EvidenceItem] = []
        used_chars = 0
        for index, candidate in enumerate(candidates, start=1):
            excerpt = _make_excerpt(_candidate_excerpt(candidate))
            if not excerpt:
                continue
            if used_chars >= max_total_chars or len(evidence) >= max_evidence:
                break
            used_chars += len(excerpt)
            evidence.append(
                EvidenceItem(
                    evidence_id=f"E{index:02d}",
                    source_id=candidate.source_id,
                    source_title=candidate.source_title,
                    page_number=int(candidate.page_start or 0),
                    excerpt=excerpt,
                    score=candidate.fused_score,
                    modality=candidate.modality,
                    segment_type=candidate.segment_type,
                    segment_id=candidate.segment_id,
                    segment_title=candidate.segment_title,
                    locator_json=candidate.locator_json,
                    preview_bucket=candidate.preview_bucket,
                    preview_object=candidate.preview_object,
                    bibliographic_metadata=candidate.bibliographic_metadata,
                )
            )
        return evidence

    def _vector_literal(self, values: list[float]) -> str:
        return "[" + ",".join(str(float(value)) for value in values) + "]"

    def _uuid(self, value: Any) -> uuid.UUID:
        return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))


def _text_or_none(value: Any) -> str | None:
    text_value = str(value or "").strip()
    return text_value or None


def _int_or_none(value: Any) -> int | None:
    try:
        return int(value) if value is not None else None
    except Exception:
        return None


def _float_or_none(value: Any) -> float | None:
    try:
        return float(value) if value is not None else None
    except Exception:
        return None


def _make_excerpt(text: str) -> str:
    clean = " ".join((text or "").replace("\n", " ").split()).strip()
    return clean[:6000]


def _candidate_excerpt(candidate: RetrievalCandidate) -> str:
    excerpt = (candidate.excerpt or candidate.text_content or "").strip()
    if excerpt:
        return excerpt
    item = EvidenceItem(
        evidence_id="E00",
        source_id=candidate.source_id,
        source_title=candidate.source_title,
        page_number=int(candidate.page_start or 0),
        excerpt="",
        score=candidate.fused_score,
        modality=candidate.modality,
        segment_type=candidate.segment_type,
        segment_id=candidate.segment_id,
        segment_title=candidate.segment_title,
        locator_json=candidate.locator_json,
        preview_bucket=candidate.preview_bucket,
        preview_object=candidate.preview_object,
        bibliographic_metadata=candidate.bibliographic_metadata,
    )
    return _evidence_excerpt(item)
