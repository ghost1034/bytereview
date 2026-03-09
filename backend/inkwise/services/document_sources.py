"""Document-source binding helpers for the Inkwise module."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy.orm import Session

from models.inkwise_models import (
    InkwiseDocument,
    InkwiseDocumentSourceBinding,
    InkwiseSource,
    InkwiseSourceIngestion,
    InkwiseSourcePage,
    InkwiseSourceTreeNode,
)


@dataclass(frozen=True)
class BoundSourceStatus:
    binding_id: uuid.UUID
    source: InkwiseSource
    is_active: bool
    grounded_chat_ready: bool
    grounded_chat_reason: str | None


class InkwiseDocumentSourceService:
    def get_document_or_404(self, db: Session, *, user_id: str, document_id: uuid.UUID) -> InkwiseDocument:
        document = (
            db.query(InkwiseDocument)
            .filter(InkwiseDocument.id == document_id, InkwiseDocument.user_id == user_id)
            .first()
        )
        if document is None:
            raise FileNotFoundError("Document not found")
        return document

    def grounded_ready_status(self, db: Session, *, source_id: uuid.UUID) -> tuple[bool, str | None]:
        ingestion = (
            db.query(InkwiseSourceIngestion)
            .filter(
                InkwiseSourceIngestion.source_id == source_id,
                InkwiseSourceIngestion.pipeline == "treegen",
            )
            .order_by(InkwiseSourceIngestion.created_at.desc())
            .first()
        )
        if ingestion is None:
            return False, "Not ingested"
        if ingestion.status != "completed":
            return False, f"Ingestion {ingestion.status}"

        page = db.query(InkwiseSourcePage.id).filter(InkwiseSourcePage.source_id == source_id).first()
        if page is None:
            return False, "Missing extracted pages"

        node = db.query(InkwiseSourceTreeNode.id).filter(InkwiseSourceTreeNode.source_id == source_id).first()
        if node is None:
            return False, "Missing tree nodes"

        return True, None

    def list_bound_source_statuses(
        self,
        db: Session,
        *,
        document_id: uuid.UUID,
        user_id: str,
    ) -> list[BoundSourceStatus]:
        rows = (
            db.query(InkwiseDocumentSourceBinding, InkwiseSource)
            .join(InkwiseSource, InkwiseSource.id == InkwiseDocumentSourceBinding.source_id)
            .filter(
                InkwiseDocumentSourceBinding.document_id == document_id,
                InkwiseDocumentSourceBinding.is_active.is_(True),
                InkwiseSource.user_id == user_id,
                InkwiseSource.status != "deleted",
            )
            .order_by(InkwiseDocumentSourceBinding.created_at.desc())
            .all()
        )

        out: list[BoundSourceStatus] = []
        for binding, source in rows:
            ready, reason = self.grounded_ready_status(db, source_id=source.id)
            out.append(
                BoundSourceStatus(
                    binding_id=binding.id,
                    source=source,
                    is_active=binding.is_active,
                    grounded_chat_ready=ready,
                    grounded_chat_reason=reason,
                )
            )
        return out

    def list_ready_bound_sources(
        self,
        db: Session,
        *,
        document_id: uuid.UUID,
        user_id: str,
    ) -> list[tuple[uuid.UUID, str]]:
        statuses = self.list_bound_source_statuses(db, document_id=document_id, user_id=user_id)
        return [(status.source.id, status.source.title) for status in statuses if status.grounded_chat_ready]

    def bind_sources(
        self,
        db: Session,
        *,
        user_id: str,
        document_id: uuid.UUID,
        source_ids: list[uuid.UUID],
    ) -> list[uuid.UUID]:
        self.get_document_or_404(db, user_id=user_id, document_id=document_id)
        if not source_ids:
            raise ValueError("source_ids required")

        unique_source_ids = list(dict.fromkeys(source_ids))

        bound: list[uuid.UUID] = []
        for source_id in unique_source_ids:
            source = (
                db.query(InkwiseSource)
                .filter(
                    InkwiseSource.id == source_id,
                    InkwiseSource.user_id == user_id,
                    InkwiseSource.status != "deleted",
                )
                .first()
            )
            if source is None:
                raise FileNotFoundError("Source not found")

            binding = (
                db.query(InkwiseDocumentSourceBinding)
                .filter(
                    InkwiseDocumentSourceBinding.document_id == document_id,
                    InkwiseDocumentSourceBinding.source_id == source_id,
                )
                .first()
            )
            if binding is None:
                binding = InkwiseDocumentSourceBinding(
                    document_id=document_id,
                    source_id=source_id,
                    is_active=True,
                )
                db.add(binding)
            else:
                binding.is_active = True
            bound.append(source_id)

        db.commit()
        return bound

    def unbind_sources(
        self,
        db: Session,
        *,
        user_id: str,
        document_id: uuid.UUID,
        source_ids: list[uuid.UUID],
    ) -> list[uuid.UUID]:
        self.get_document_or_404(db, user_id=user_id, document_id=document_id)
        if not source_ids:
            raise ValueError("source_ids required")

        unique_source_ids = list(dict.fromkeys(source_ids))

        for source_id in unique_source_ids:
            binding = (
                db.query(InkwiseDocumentSourceBinding)
                .filter(
                    InkwiseDocumentSourceBinding.document_id == document_id,
                    InkwiseDocumentSourceBinding.source_id == source_id,
                )
                .first()
            )
            if binding is not None:
                db.delete(binding)

        db.commit()
        remaining = (
            db.query(InkwiseDocumentSourceBinding.source_id)
            .filter(
                InkwiseDocumentSourceBinding.document_id == document_id,
                InkwiseDocumentSourceBinding.is_active.is_(True),
            )
            .all()
        )
        return [row[0] for row in remaining]
