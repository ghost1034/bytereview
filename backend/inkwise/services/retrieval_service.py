"""Grounded retrieval pipeline for the Inkwise module."""

# pyright: reportAttributeAccessIssue=false, reportGeneralTypeIssues=false, reportArgumentType=false

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from inkwise.services.retrieval_types import EvidenceItem, build_evidence_pack as _build_evidence_pack
from inkwise.services.vector_retrieval_service import InkwiseVectorRetrievalService
from models.inkwise_models import InkwiseDocument, InkwiseRetrievalEvidence, InkwiseRetrievalRun, InkwiseSource, InkwiseSourceSegment


class InkwiseRetrievalService:
    def __init__(self) -> None:
        self.vector_retrieval_service = InkwiseVectorRetrievalService()

    def run_retrieval(
        self,
        db: Session,
        *,
        user_id: str,
        document_id: uuid.UUID,
        thread_id: uuid.UUID | None = None,
        query: str,
        bound_sources: list[tuple[uuid.UUID, str]],
        history_messages: list[dict[str, str]] | None = None,
        draft_selection_text: str | None = None,
        max_evidence: int = 12,
        max_total_chars: int = 90000,
    ) -> tuple[InkwiseRetrievalRun, list[EvidenceItem]]:
        document = (
            db.query(InkwiseDocument)
            .filter(InkwiseDocument.id == document_id, InkwiseDocument.user_id == user_id)
            .first()
        )
        if document is None:
            raise FileNotFoundError("Document not found")

        run = InkwiseRetrievalRun(
            user_id=user_id,
            document_id=document_id,
            thread_id=thread_id,
            query=query,
            bound_source_ids=[source_id for source_id, _title in bound_sources],
            strategy_version="vector-v1",
            meta={"engine": "vector"},
            created_at=datetime.utcnow(),
        )
        db.add(run)
        db.commit()
        db.refresh(run)

        clean_query = (query or "").strip()
        if not clean_query or not bound_sources:
            return run, []

        evidence, meta, strategy_version = self.vector_retrieval_service.retrieve_evidence(
            db,
            query=clean_query,
            bound_sources=bound_sources,
            history_messages=history_messages,
            draft_selection_text=draft_selection_text,
            document_language=document.language,
            document_purpose=document.init_prompt,
            max_evidence=max_evidence,
            max_total_chars=max_total_chars,
        )
        run.strategy_version = strategy_version
        run.meta = meta
        db.commit()

        self._persist_evidence(db, run=run, evidence=evidence)
        db.refresh(run)
        return run, evidence

    def _persist_evidence(
        self,
        db: Session,
        *,
        run: InkwiseRetrievalRun,
        evidence: list[EvidenceItem],
    ) -> None:
        db.query(InkwiseRetrievalEvidence).filter(InkwiseRetrievalEvidence.retrieval_run_id == run.id).delete()
        for item in evidence:
            db.add(
                InkwiseRetrievalEvidence(
                    retrieval_run_id=run.id,
                    evidence_id=item.evidence_id,
                    source_id=item.source_id,
                    segment_id=item.segment_id,
                    page_number=item.page_number,
                    locator_json=item.locator_json,
                    preview_bucket=item.preview_bucket,
                    preview_object=item.preview_object,
                    excerpt=item.excerpt,
                    score=item.score,
                )
            )
        db.commit()

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
            db.query(InkwiseRetrievalEvidence, InkwiseSource, InkwiseSourceSegment)
            .join(InkwiseSource, InkwiseSource.id == InkwiseRetrievalEvidence.source_id)
            .outerjoin(InkwiseSourceSegment, InkwiseSourceSegment.id == InkwiseRetrievalEvidence.segment_id)
            .filter(InkwiseRetrievalEvidence.retrieval_run_id == retrieval_run_id)
            .order_by(InkwiseRetrievalEvidence.evidence_id.asc())
            .all()
        )
        evidence = [
            EvidenceItem(
                evidence_id=item.evidence_id,
                source_id=item.source_id,
                source_title=source.title,
                page_number=_page_number(item.page_number, item.locator_json),
                excerpt=item.excerpt,
                score=float(item.score) if item.score is not None else None,
                modality=segment.modality if segment is not None else None,
                segment_type=segment.segment_type if segment is not None else None,
                segment_id=item.segment_id,
                segment_title=segment.title if segment is not None else None,
                locator_json=item.locator_json,
                preview_bucket=item.preview_bucket,
                preview_object=item.preview_object,
                bibliographic_metadata=source.bibliographic_metadata if isinstance(source.bibliographic_metadata, dict) else None,
            )
            for item, source, segment in rows
        ]
        return run, evidence


def build_evidence_pack(evidence: list[EvidenceItem]) -> str:
    return _build_evidence_pack(evidence)


def _page_number(page_number: object, locator_json: object) -> int:
    try:
        if page_number is not None:
            return int(page_number)
        if isinstance(locator_json, dict) and locator_json.get("page_start") is not None:
            return int(locator_json["page_start"])
    except Exception:
        pass
    return 0
