"""Grounded retrieval pipeline for the Inkwise module."""

from __future__ import annotations

import json
import logging
import re
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import desc, func, select, text
from sqlalchemy.orm import Session

from inkwise.services.json_utils import extract_first_json_object
from inkwise.services.query_rewrite import QueryRewriteConfig, rewrite_retrieval_query
from inkwise.services.vertex_ai import VertexAIError, generate_text_sync
from inkwise.settings import get_inkwise_settings
from models.inkwise_models import (
    InkwiseDocument,
    InkwiseRetrievalEvidence,
    InkwiseRetrievalRun,
    InkwiseSource,
    InkwiseSourcePage,
    InkwiseSourceTreeNode,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class EvidenceItem:
    evidence_id: str
    source_id: uuid.UUID
    source_title: str
    page_number: int
    node_id: str | None
    node_title: str | None
    excerpt: str
    score: float | None


@dataclass(frozen=True)
class TreeSearchConfig:
    enabled: bool
    model: str
    min_evidence: int = 4
    max_sources: int = 3
    max_rounds: int = 3
    max_frontier: int = 40
    max_pick: int = 8
    timeout_seconds: float = 30.0


@dataclass(frozen=True)
class SourcePrefilterConfig:
    enabled: bool
    trigger_count: int = 20
    top_k: int = 10
    stage_b_enabled: bool = True


def _evidence_id(index: int) -> str:
    return f"E{index:02d}"


def _query_keywords(query: str) -> list[str]:
    words = re.findall(r"[A-Za-z0-9]{3,}", (query or "").lower())
    out: list[str] = []
    seen: set[str] = set()
    for word in words:
        if word in seen:
            continue
        seen.add(word)
        out.append(word)
    return out[:12]


def _score_candidate_text(*, keywords: list[str], text_value: str) -> int:
    if not keywords:
        return 0
    lower = (text_value or "").lower()
    return sum(1 for keyword in keywords if keyword in lower)


def _frontier_candidates(
    *,
    frontier: list[InkwiseSourceTreeNode],
    query: str,
    max_frontier: int,
) -> list[InkwiseSourceTreeNode]:
    if len(frontier) <= max_frontier:
        return list(frontier)

    keywords = _query_keywords(query)
    scored: list[tuple[int, int, str, InkwiseSourceTreeNode]] = []
    for node in frontier:
        text_value = f"{node.title or ''}\n{node.node_summary or ''}"
        score = _score_candidate_text(keywords=keywords, text_value=text_value)
        scored.append((score, int(node.page_start), str(node.node_id), node))
    scored.sort(key=lambda item: (-item[0], item[1], item[2]))
    return [node for *_ignored, node in scored[: int(max_frontier)]]


def _parse_node_list_response(*, response_text: str, allowed_node_ids: set[str], max_pick: int) -> list[str]:
    data = extract_first_json_object(response_text)
    raw = data.get("node_list")
    if isinstance(raw, str):
        raw_list: list[str] = [raw]
    elif isinstance(raw, list):
        raw_list = [str(item) for item in raw]
    else:
        raw_list = []

    out: list[str] = []
    seen: set[str] = set()
    for node_id in raw_list:
        node_id = (node_id or "").strip()
        if not node_id or node_id not in allowed_node_ids or node_id in seen:
            continue
        seen.add(node_id)
        out.append(node_id)
        if len(out) >= int(max_pick):
            break
    return out


def _merge_source_prefilter_results(
    *,
    bound_sources: list[tuple[uuid.UUID, str]],
    stage_a: list[tuple[uuid.UUID, float]],
    stage_b: list[tuple[uuid.UUID, float]],
    top_k: int,
) -> tuple[list[tuple[uuid.UUID, str]], dict[str, Any]]:
    limit = max(1, int(top_k))
    bound_ids = [source_id for source_id, _title in bound_sources]
    bound_set = set(bound_ids)

    a_scores = {source_id: float(score) for source_id, score in stage_a if source_id in bound_set}
    b_scores = {source_id: float(score) for source_id, score in stage_b if source_id in bound_set}
    a_order = [source_id for source_id, _score in stage_a if source_id in bound_set]
    b_order = [source_id for source_id, _score in stage_b if source_id in bound_set]

    selected: list[uuid.UUID] = []
    seen: set[uuid.UUID] = set()

    def add(source_id: uuid.UUID) -> None:
        if source_id in seen:
            return
        selected.append(source_id)
        seen.add(source_id)

    for source_id in a_order:
        if len(selected) >= limit:
            break
        add(source_id)

    for source_id in b_order:
        if len(selected) >= limit:
            break
        add(source_id)

    for source_id in bound_ids:
        if len(selected) >= limit:
            break
        add(source_id)

    title_by_id = {source_id: title for source_id, title in bound_sources}
    merged = [(source_id, title_by_id.get(source_id, "")) for source_id in selected]
    meta = {
        "input_count": len(bound_sources),
        "output_count": len(merged),
        "top_k": limit,
        "stage_a_hits": len(a_order),
        "stage_b_hits": len(b_order),
        "selected_source_ids": [str(source_id) for source_id, _title in merged],
        "scores": {
            "stage_a": {str(source_id): a_scores[source_id] for source_id in a_order if source_id in a_scores},
            "stage_b": {str(source_id): b_scores[source_id] for source_id in b_order if source_id in b_scores},
        },
    }
    return merged, meta


class InkwiseRetrievalService:
    def _rank_sources_by_node_fts(
        self,
        db: Session,
        *,
        query: str,
        source_ids: list[uuid.UUID],
        limit: int,
    ) -> list[tuple[uuid.UUID, float]]:
        if not source_ids or not query.strip() or limit <= 0:
            return []

        tsq = func.websearch_to_tsquery("english", query)
        score = func.max(func.ts_rank(InkwiseSourceTreeNode.node_text_tsv, tsq)).label("score")
        stmt = (
            select(InkwiseSourceTreeNode.source_id, score)
            .where(InkwiseSourceTreeNode.source_id.in_(source_ids))
            .where(InkwiseSourceTreeNode.node_text_tsv.op("@@")(tsq))
            .group_by(InkwiseSourceTreeNode.source_id)
            .order_by(desc(score))
            .limit(int(limit))
        )
        return [(source_id, float(score_value)) for source_id, score_value in db.execute(stmt).all() if source_id and score_value is not None]

    def _rank_sources_by_page_fts(
        self,
        db: Session,
        *,
        query: str,
        source_ids: list[uuid.UUID],
        limit: int,
    ) -> list[tuple[uuid.UUID, float]]:
        if not source_ids or not query.strip() or limit <= 0:
            return []

        tsq = func.websearch_to_tsquery("english", query)
        score = func.max(func.ts_rank(InkwiseSourcePage.text_tsv, tsq)).label("score")
        stmt = (
            select(InkwiseSourcePage.source_id, score)
            .where(InkwiseSourcePage.source_id.in_(source_ids))
            .where(InkwiseSourcePage.text_tsv.op("@@")(tsq))
            .group_by(InkwiseSourcePage.source_id)
            .order_by(desc(score))
            .limit(int(limit))
        )
        return [(source_id, float(score_value)) for source_id, score_value in db.execute(stmt).all() if source_id and score_value is not None]

    def _prefilter_sources(
        self,
        db: Session,
        *,
        query: str,
        bound_sources: list[tuple[uuid.UUID, str]],
        cfg: SourcePrefilterConfig,
    ) -> tuple[list[tuple[uuid.UUID, str]], dict[str, Any]]:
        meta: dict[str, Any] = {
            "enabled": bool(cfg.enabled),
            "triggered": False,
            "trigger_count": int(cfg.trigger_count),
            "top_k": int(cfg.top_k),
            "stage_b_enabled": bool(cfg.stage_b_enabled),
        }
        if not cfg.enabled or len(bound_sources) < int(cfg.trigger_count):
            meta["selected_source_ids"] = [str(source_id) for source_id, _title in bound_sources]
            return bound_sources, meta

        source_ids = [source_id for source_id, _title in bound_sources]
        stage_a = self._rank_sources_by_node_fts(db, query=query, source_ids=source_ids, limit=int(cfg.top_k))
        stage_b = (
            self._rank_sources_by_page_fts(db, query=query, source_ids=source_ids, limit=int(cfg.top_k))
            if cfg.stage_b_enabled
            else []
        )
        filtered, merged_meta = _merge_source_prefilter_results(
            bound_sources=bound_sources,
            stage_a=stage_a,
            stage_b=stage_b,
            top_k=int(cfg.top_k),
        )
        meta.update(merged_meta)
        meta["triggered"] = len(filtered) < len(bound_sources)
        return filtered, meta

    def _gemini_tree_search_pick(
        self,
        *,
        cfg: TreeSearchConfig,
        query: str,
        candidates: list[InkwiseSourceTreeNode],
    ) -> tuple[list[str], dict[str, Any]]:
        if not cfg.enabled or not candidates:
            return [], {"enabled": False, "candidate_count": len(candidates)}

        payload = [
            {
                "node_id": str(node.node_id),
                "title": str(node.title),
                "summary": (node.node_summary or "")[:500],
                "page_start": int(node.page_start),
                "page_end": int(node.page_end),
                "depth": int(node.depth),
                "path_titles": list(node.path_titles or []),
            }
            for node in candidates
        ]
        allowed_ids = {str(node.node_id) for node in candidates}
        keywords = _query_keywords(query)[:10]
        prompt = "\n".join(
            [
                "You are an expert document navigator.",
                "Given a user query and a list of candidate document sections, select the node_ids most likely to contain the answer.",
                "Prefer more specific sections over broad ones when both apply.",
                "Only choose node_ids from the provided candidates.",
                f"Query: {query}",
                ("Keywords: " + ", ".join(keywords)) if keywords else "",
                "Candidates (JSON):",
                json.dumps(payload, ensure_ascii=True),
                'Return ONLY valid JSON: {"node_list": ["0006"], "thinking": "optional"}',
            ]
        ).strip() + "\n"

        meta: dict[str, Any] = {"candidate_count": len(candidates), "max_pick": int(cfg.max_pick)}
        try:
            result = generate_text_sync(
                model=cfg.model,
                prompt=prompt,
                temperature=0.0,
                max_output_tokens=65536,
            )
        except VertexAIError as exc:
            meta["error"] = str(exc)[:500]
            return [], meta

        picked = _parse_node_list_response(
            response_text=result.text,
            allowed_node_ids=allowed_ids,
            max_pick=cfg.max_pick,
        )
        meta["picked"] = picked
        return picked, meta

    def _tree_search_nodes_for_source(
        self,
        db: Session,
        *,
        source_id: uuid.UUID,
        query: str,
        cfg: TreeSearchConfig,
    ) -> tuple[list[str], dict[str, Any]]:
        nodes = (
            db.query(InkwiseSourceTreeNode)
            .filter(InkwiseSourceTreeNode.source_id == source_id)
            .order_by(InkwiseSourceTreeNode.page_start.asc(), InkwiseSourceTreeNode.node_id.asc())
            .all()
        )
        by_id = {str(node.node_id): node for node in nodes}
        parent = {str(node.node_id): (str(node.parent_node_id) if node.parent_node_id else None) for node in nodes}
        children: dict[str | None, list[str]] = {}
        for node in nodes:
            parent_id = str(node.parent_node_id) if node.parent_node_id else None
            children.setdefault(parent_id, []).append(str(node.node_id))

        roots = [by_id[node_id] for node_id in children.get(None, []) if node_id in by_id]
        if not roots:
            return [], {"rounds": [], "selected": []}

        frontier: list[InkwiseSourceTreeNode] = roots
        selected: set[str] = set()
        rounds_meta: list[dict[str, Any]] = []

        for round_idx in range(int(cfg.max_rounds)):
            if not frontier:
                break
            candidates = _frontier_candidates(frontier=frontier, query=query, max_frontier=cfg.max_frontier)
            picked, meta = self._gemini_tree_search_pick(cfg=cfg, query=query, candidates=candidates)
            meta["round"] = round_idx + 1
            meta["frontier_count"] = len(frontier)
            rounds_meta.append(meta)
            if not picked:
                break
            for node_id in picked:
                selected.add(node_id)

            next_frontier_ids: list[str] = []
            seen_ids: set[str] = set()
            for node_id in picked:
                for child_id in children.get(node_id, []):
                    if child_id in seen_ids:
                        continue
                    seen_ids.add(child_id)
                    next_frontier_ids.append(child_id)
            if not next_frontier_ids:
                break
            frontier = [by_id[child_id] for child_id in next_frontier_ids if child_id in by_id]

        ancestors: set[str] = set()
        for node_id in list(selected):
            current = parent.get(node_id)
            while current:
                ancestors.add(current)
                current = parent.get(current)
        final_ids = sorted(
            [node_id for node_id in selected if node_id not in ancestors],
            key=lambda node_id: int(by_id[node_id].page_start) if node_id in by_id else 10**9,
        )
        return final_ids, {"rounds": rounds_meta, "selected": final_ids}

    def run_retrieval(
        self,
        db: Session,
        *,
        user_id: str,
        document_id: uuid.UUID,
        query: str,
        bound_sources: list[tuple[uuid.UUID, str]],
        history_messages: list[dict[str, str]] | None = None,
        draft_selection_text: str | None = None,
        max_nodes_per_source: int = 12,
        max_pages_per_node: int = 5,
        max_evidence: int = 12,
        max_total_chars: int = 18000,
    ) -> tuple[InkwiseRetrievalRun, list[EvidenceItem]]:
        document = (
            db.query(InkwiseDocument)
            .filter(InkwiseDocument.id == document_id, InkwiseDocument.user_id == user_id)
            .first()
        )
        if document is None:
            raise FileNotFoundError("Document not found")

        settings = get_inkwise_settings()
        clean_query = (query or "").strip()

        source_prefilter_cfg = SourcePrefilterConfig(
            enabled=bool(settings.source_prefilter_enabled),
            trigger_count=int(settings.source_prefilter_trigger_count),
            top_k=int(settings.source_prefilter_top_k),
            stage_b_enabled=bool(settings.source_prefilter_stage_b_enabled),
        )
        query_rewrite_cfg = QueryRewriteConfig(
            enabled=bool(settings.query_rewrite_enabled and settings.vertex_enabled),
            model=settings.query_rewrite_model,
            max_history_messages=int(settings.query_rewrite_max_history_messages),
            max_queries=int(settings.query_rewrite_max_queries),
            max_query_chars=int(settings.query_rewrite_max_query_chars),
            timeout_seconds=float(settings.query_rewrite_timeout_seconds),
        )
        tree_search_cfg = TreeSearchConfig(
            enabled=bool(settings.tree_search_enabled and settings.vertex_enabled),
            model=settings.tree_search_model,
            min_evidence=int(settings.tree_search_min_evidence),
            max_sources=int(settings.tree_search_max_sources),
            max_rounds=int(settings.tree_search_max_rounds),
            max_frontier=int(settings.tree_search_max_frontier),
            max_pick=int(settings.tree_search_max_pick),
            timeout_seconds=float(settings.tree_search_timeout_seconds),
        )

        active_sources, pf_meta = self._prefilter_sources(
            db,
            query=clean_query,
            bound_sources=bound_sources,
            cfg=source_prefilter_cfg,
        )
        prefilter_triggered = bool(pf_meta.get("triggered")) and len(active_sources) < len(bound_sources)
        strategy_bits = ["fts"]
        if prefilter_triggered:
            strategy_bits.append("sp")
        if query_rewrite_cfg.enabled:
            strategy_bits.append("qr")
        if tree_search_cfg.enabled:
            strategy_bits.append("tree")

        run = InkwiseRetrievalRun(
            user_id=user_id,
            document_id=document_id,
            thread_id=None,
            query=query,
            bound_source_ids=[source_id for source_id, _title in bound_sources],
            strategy_version="+".join(strategy_bits) + "-v1",
            meta={
                "source_prefilter": pf_meta,
                "query_rewrite": {"enabled": query_rewrite_cfg.enabled, "triggered": False},
                "tree_search": {"enabled": tree_search_cfg.enabled, "triggered": False},
            },
            created_at=datetime.utcnow(),
        )
        db.add(run)
        db.commit()
        db.refresh(run)

        if not clean_query or not bound_sources:
            return run, []

        evidence: list[EvidenceItem] = []
        used_chars = 0
        evidence_index = 1
        seen_pages: set[tuple[uuid.UUID, int]] = set()
        retrieval_sources = list(active_sources)
        per_source_count: dict[uuid.UUID, int] = {source_id: 0 for source_id, _title in retrieval_sources}

        nodes_sql = text(
            """
            select
              node_id,
              title,
              page_start,
              page_end,
              ts_rank(node_text_tsv, websearch_to_tsquery('english', :q)) as score
            from inkwise_source_tree_nodes
            where source_id = :source_id
              and node_text_tsv @@ websearch_to_tsquery('english', :q)
            order by score desc
            limit :limit
            """
        )
        pages_in_node_sql = text(
            """
            select
              page_number,
              ts_rank(text_tsv, websearch_to_tsquery('english', :q)) as score,
              ts_headline(
                'english',
                text,
                websearch_to_tsquery('english', :q),
                'MaxFragments=1, MaxWords=80, MinWords=20, ShortWord=3, HighlightAll=FALSE'
              ) as excerpt
            from inkwise_source_pages
            where source_id = :source_id
              and page_number between :page_start and :page_end
              and text_tsv @@ websearch_to_tsquery('english', :q)
            order by score desc
            limit :limit
            """
        )
        pages_fallback_sql = text(
            """
            select
              page_number,
              ts_rank(text_tsv, websearch_to_tsquery('english', :q)) as score,
              ts_headline(
                'english',
                text,
                websearch_to_tsquery('english', :q),
                'MaxFragments=1, MaxWords=80, MinWords=20, ShortWord=3, HighlightAll=FALSE'
              ) as excerpt
            from inkwise_source_pages
            where source_id = :source_id
              and text_tsv @@ websearch_to_tsquery('english', :q)
            order by score desc
            limit :limit
            """
        )

        def add_evidence(
            *,
            source_id: uuid.UUID,
            source_title: str,
            page_number: int,
            excerpt: str,
            node_id: str | None,
            node_title: str | None,
            score: float | None,
        ) -> None:
            nonlocal used_chars, evidence_index
            if len(evidence) >= max_evidence or used_chars >= max_total_chars:
                return
            key = (source_id, int(page_number))
            if key in seen_pages:
                return
            seen_pages.add(key)

            clean_excerpt = re.sub(r"<[^>]+>", "", (excerpt or "").strip()).strip()
            if not clean_excerpt:
                return
            clean_excerpt = clean_excerpt[:1200]
            used_chars += len(clean_excerpt)
            evidence.append(
                EvidenceItem(
                    evidence_id=_evidence_id(evidence_index),
                    source_id=source_id,
                    source_title=source_title,
                    page_number=int(page_number),
                    node_id=node_id,
                    node_title=node_title,
                    excerpt=clean_excerpt,
                    score=score,
                )
            )
            per_source_count[source_id] = per_source_count.get(source_id, 0) + 1
            evidence_index += 1

        def lexical_retrieve(*, sources: list[tuple[uuid.UUID, str]], search_query: str, phase: str) -> None:
            search_query = (search_query or "").strip()
            if not search_query:
                return
            logger.debug("Inkwise retrieval phase=%s run_id=%s query=%s", phase, run.id, search_query)
            for source_id, source_title in sources:
                if len(evidence) >= max_evidence or used_chars >= max_total_chars:
                    break

                node_rows = db.execute(
                    nodes_sql,
                    {"q": search_query, "source_id": source_id, "limit": int(max_nodes_per_source)},
                ).all()
                if not node_rows:
                    page_rows = db.execute(
                        pages_fallback_sql,
                        {"q": search_query, "source_id": source_id, "limit": int(max_pages_per_node)},
                    ).all()
                    for page_number, score, excerpt in page_rows:
                        if len(evidence) >= max_evidence or used_chars >= max_total_chars:
                            break
                        add_evidence(
                            source_id=source_id,
                            source_title=source_title,
                            page_number=int(page_number),
                            excerpt=str(excerpt or ""),
                            node_id=None,
                            node_title=None,
                            score=float(score) if score is not None else None,
                        )
                    continue

                for node_id, node_title, page_start, page_end, node_score in node_rows:
                    if len(evidence) >= max_evidence or used_chars >= max_total_chars:
                        break
                    page_start_int = int(page_start)
                    page_end_int = int(page_end)
                    if page_end_int < page_start_int:
                        continue
                    page_end_int = min(page_end_int, page_start_int + 7)
                    page_rows = db.execute(
                        pages_in_node_sql,
                        {
                            "q": search_query,
                            "source_id": source_id,
                            "page_start": page_start_int,
                            "page_end": page_end_int,
                            "limit": int(max_pages_per_node),
                        },
                    ).all()
                    for page_number, score, excerpt in page_rows:
                        if len(evidence) >= max_evidence or used_chars >= max_total_chars:
                            break
                        combined_score: float | None = None
                        try:
                            combined_score = float(node_score or 0.0) + float(score or 0.0)
                        except Exception:
                            combined_score = None
                        add_evidence(
                            source_id=source_id,
                            source_title=source_title,
                            page_number=int(page_number),
                            excerpt=str(excerpt or ""),
                            node_id=str(node_id),
                            node_title=str(node_title),
                            score=combined_score,
                        )

        lexical_retrieve(sources=retrieval_sources, search_query=clean_query, phase="initial")

        if prefilter_triggered and not evidence and len(active_sources) < len(bound_sources):
            active_ids = {source_id for source_id, _title in active_sources}
            remaining_sources = [(source_id, title) for source_id, title in bound_sources if source_id not in active_ids]
            if remaining_sources:
                pf_meta["widened_to_full"] = True
                for source_id, _title in remaining_sources:
                    per_source_count.setdefault(source_id, 0)
                retrieval_sources.extend(remaining_sources)
                lexical_retrieve(sources=remaining_sources, search_query=clean_query, phase="prefilter_widen")

        rewrite_meta: dict[str, Any] = {"enabled": query_rewrite_cfg.enabled, "triggered": False}
        tree_query = clean_query
        if query_rewrite_cfg.enabled and not evidence:
            rewrite_meta["triggered"] = True
            try:
                rewrite = rewrite_retrieval_query(
                    cfg=query_rewrite_cfg,
                    current_question=query,
                    history_messages=history_messages,
                    doc_language=document.language,
                    doc_purpose=document.init_prompt,
                    scoped_source_titles=[title for _source_id, title in retrieval_sources],
                    draft_selection_text=draft_selection_text,
                )
                rewrite_meta.update(rewrite.meta)
                rewrite_meta["standalone_question"] = rewrite.standalone_question
                rewrite_meta["fts_query"] = rewrite.fts_query
                rewrite_meta["subqueries"] = list(rewrite.subqueries)

                attempts: list[str] = []
                if rewrite.fts_query:
                    attempts.append(rewrite.fts_query)
                attempts.extend(rewrite.subqueries)

                deduped: list[str] = []
                seen_attempts: set[str] = set()
                for attempt in attempts:
                    attempt = (attempt or "").strip()
                    if not attempt or attempt in seen_attempts:
                        continue
                    seen_attempts.add(attempt)
                    deduped.append(attempt)
                    if len(deduped) >= int(query_rewrite_cfg.max_queries):
                        break

                rewrite_meta["attempts"] = deduped
                rewrite_meta["attempt_results"] = []
                target = min(int(max_evidence), 8)
                for attempt in deduped:
                    if len(evidence) >= max_evidence or used_chars >= max_total_chars:
                        break
                    before = len(evidence)
                    lexical_retrieve(sources=retrieval_sources, search_query=attempt, phase="query_rewrite")
                    added = len(evidence) - before
                    rewrite_meta["attempt_results"].append({"query": attempt, "added": added})
                    if len(evidence) >= target:
                        rewrite_meta["stop_reason"] = "target_reached"
                        break

                if rewrite.standalone_question:
                    tree_query = rewrite.standalone_question
            except Exception as exc:
                rewrite_meta["error"] = str(exc)[:500]

        tree_meta: dict[str, Any] = {"enabled": tree_search_cfg.enabled, "triggered": False, "sources": []}
        tree_triggered = False
        if tree_search_cfg.enabled and len(evidence) < int(tree_search_cfg.min_evidence):
            empty_sources = [(source_id, title) for source_id, title in retrieval_sources if per_source_count.get(source_id, 0) == 0]
            if empty_sources:
                tree_triggered = True
                tree_meta["triggered"] = True
                tree_meta["min_evidence"] = int(tree_search_cfg.min_evidence)
                for source_id, source_title in empty_sources[: int(tree_search_cfg.max_sources)]:
                    if len(evidence) >= max_evidence or used_chars >= max_total_chars:
                        break
                    picked_ids, meta = self._tree_search_nodes_for_source(
                        db,
                        source_id=source_id,
                        query=tree_query,
                        cfg=tree_search_cfg,
                    )
                    src_entry: dict[str, Any] = {
                        "source_id": str(source_id),
                        "picked_node_ids": picked_ids,
                        "meta": meta,
                    }
                    if not picked_ids:
                        tree_meta["sources"].append(src_entry)
                        continue

                    chosen_nodes = (
                        db.query(InkwiseSourceTreeNode)
                        .filter(
                            InkwiseSourceTreeNode.source_id == source_id,
                            InkwiseSourceTreeNode.node_id.in_(picked_ids),
                        )
                        .order_by(InkwiseSourceTreeNode.page_start.asc())
                        .all()
                    )
                    for node in chosen_nodes:
                        if len(evidence) >= max_evidence or used_chars >= max_total_chars:
                            break
                        page_start_int = int(node.page_start)
                        page_end_int = int(node.page_end)
                        if page_end_int < page_start_int:
                            continue
                        page_end_int = min(page_end_int, page_start_int + 7)
                        page_rows = db.execute(
                            pages_in_node_sql,
                            {
                                "q": tree_query,
                                "source_id": source_id,
                                "page_start": page_start_int,
                                "page_end": page_end_int,
                                "limit": int(max_pages_per_node),
                            },
                        ).all()
                        for page_number, score, excerpt in page_rows:
                            if len(evidence) >= max_evidence or used_chars >= max_total_chars:
                                break
                            add_evidence(
                                source_id=source_id,
                                source_title=source_title,
                                page_number=int(page_number),
                                excerpt=str(excerpt or ""),
                                node_id=str(node.node_id),
                                node_title=str(node.title),
                                score=float(score) if score is not None else None,
                            )
                    tree_meta["sources"].append(src_entry)

        pf_meta["used_source_ids"] = [str(source_id) for source_id, _title in retrieval_sources]
        bits = ["fts"]
        if prefilter_triggered:
            bits.append("sp")
        if bool(rewrite_meta.get("triggered")):
            bits.append("qr")
        if tree_triggered:
            bits.append("tree")
        run.strategy_version = "+".join(bits) + "-v1"
        run.meta = {
            "source_prefilter": pf_meta,
            "query_rewrite": rewrite_meta,
            "tree_search": tree_meta,
        }
        db.commit()

        for item in evidence:
            db.add(
                InkwiseRetrievalEvidence(
                    retrieval_run_id=run.id,
                    evidence_id=item.evidence_id,
                    source_id=item.source_id,
                    page_number=item.page_number,
                    node_id=item.node_id,
                    node_title=item.node_title,
                    excerpt=item.excerpt,
                    score=item.score,
                )
            )
        db.commit()
        db.refresh(run)
        return run, evidence

    def get_retrieval_run_for_user(
        self,
        db: Session,
        *,
        user_id: str,
        retrieval_run_id: uuid.UUID,
    ) -> tuple[InkwiseRetrievalRun, list[EvidenceItem]]:
        run = (
            db.query(InkwiseRetrievalRun)
            .filter(
                InkwiseRetrievalRun.id == retrieval_run_id,
                InkwiseRetrievalRun.user_id == user_id,
            )
            .first()
        )
        if run is None:
            raise FileNotFoundError("Retrieval run not found")

        rows = (
            db.query(InkwiseRetrievalEvidence, InkwiseSource)
            .join(InkwiseSource, InkwiseSource.id == InkwiseRetrievalEvidence.source_id)
            .filter(InkwiseRetrievalEvidence.retrieval_run_id == retrieval_run_id)
            .order_by(InkwiseRetrievalEvidence.evidence_id.asc())
            .all()
        )
        evidence = [
            EvidenceItem(
                evidence_id=item.evidence_id,
                source_id=item.source_id,
                source_title=source.title,
                page_number=item.page_number,
                node_id=item.node_id,
                node_title=item.node_title,
                excerpt=item.excerpt,
                score=float(item.score) if item.score is not None else None,
            )
            for item, source in rows
        ]
        return run, evidence


def build_evidence_pack(evidence: list[EvidenceItem]) -> str:
    blocks: list[str] = []
    for item in evidence:
        header = f'[{item.evidence_id}] source="{item.source_title}" page={item.page_number}'
        if item.node_title:
            header += f' node="{item.node_title}"'
        blocks.append(header + "\n" + item.excerpt.strip())
    return ("\n\n".join(blocks).strip() + "\n") if blocks else ""
