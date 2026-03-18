"""Document service for the Inkwise module."""

from __future__ import annotations

import uuid
from typing import Any
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from inkwise.schemas import InkwiseDocumentCreateRequest, InkwiseDocumentUpdateRequest
from models.inkwise_models import InkwiseDocument, InkwiseDocumentRevision


class InkwiseDocumentService:
    def list_documents(self, db: Session, *, user_id: str, page: int, limit: int) -> tuple[list[InkwiseDocument], int]:
        if page < 1 or limit < 1 or limit > 100:
            raise ValueError("Invalid pagination")

        query = db.query(InkwiseDocument).filter(InkwiseDocument.user_id == user_id)
        total = query.count()
        items = (
            query.order_by(InkwiseDocument.updated_at.desc(), InkwiseDocument.created_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
            .all()
        )
        return items, total

    def create_document(self, db: Session, *, user_id: str, body: InkwiseDocumentCreateRequest) -> InkwiseDocument:
        now = datetime.utcnow()
        document = InkwiseDocument(
            user_id=user_id,
            title=(body.title or "Untitled").strip() or "Untitled",
            content_json=body.content_json,
            content_html=body.content_html,
            init_prompt=body.init_prompt,
            language=body.language,
            version=1,
            created_at=now,
            updated_at=now,
        )
        db.add(document)
        db.flush()
        self._create_revision(
            db,
            document=document,
            source_kind="create",
            source_meta={"reason": "initial_document"},
        )
        db.commit()
        db.refresh(document)
        return document

    def get_document_or_404(self, db: Session, *, user_id: str, document_id: uuid.UUID) -> InkwiseDocument:
        document = (
            db.query(InkwiseDocument)
            .filter(InkwiseDocument.id == document_id, InkwiseDocument.user_id == user_id)
            .first()
        )
        if document is None:
            raise FileNotFoundError("Document not found")
        return document

    def update_document(
        self,
        db: Session,
        *,
        user_id: str,
        document_id: uuid.UUID,
        body: InkwiseDocumentUpdateRequest,
    ) -> InkwiseDocument:
        document = self.get_document_or_404(db, user_id=user_id, document_id=document_id)
        if document.version != body.version:
            raise RuntimeError("Document version conflict")

        fields = body.model_fields_set
        previous_state = self._snapshot_document(document)
        changed = False
        if "title" in fields:
            next_title = (body.title or "Untitled").strip() or "Untitled"
            changed = changed or next_title != document.title
            document.title = next_title
        if "content_json" in fields:
            changed = changed or body.content_json != document.content_json
            document.content_json = body.content_json
        if "content_html" in fields:
            changed = changed or body.content_html != document.content_html
            document.content_html = body.content_html
        if "init_prompt" in fields:
            changed = changed or body.init_prompt != document.init_prompt
            document.init_prompt = body.init_prompt
        if "language" in fields:
            changed = changed or body.language != document.language
            document.language = body.language

        if not changed:
            return document

        document.version += 1
        document.updated_at = datetime.utcnow()
        self._create_revision(
            db,
            document=document,
            source_kind="save",
            source_meta={
                "changed_fields": sorted(list(fields)),
                "previous_version": previous_state["version"],
            },
        )
        db.commit()
        db.refresh(document)
        return document

    def list_revisions(self, db: Session, *, user_id: str, document_id: uuid.UUID, limit: int = 100) -> list[InkwiseDocumentRevision]:
        self.get_document_or_404(db, user_id=user_id, document_id=document_id)
        return (
            db.query(InkwiseDocumentRevision)
            .filter(
                InkwiseDocumentRevision.document_id == document_id,
                InkwiseDocumentRevision.user_id == user_id,
            )
            .order_by(InkwiseDocumentRevision.revision_number.desc(), InkwiseDocumentRevision.created_at.desc())
            .limit(limit)
            .all()
        )

    def get_revision_or_404(
        self,
        db: Session,
        *,
        user_id: str,
        document_id: uuid.UUID,
        revision_id: uuid.UUID,
    ) -> InkwiseDocumentRevision:
        revision = (
            db.query(InkwiseDocumentRevision)
            .filter(
                InkwiseDocumentRevision.id == revision_id,
                InkwiseDocumentRevision.document_id == document_id,
                InkwiseDocumentRevision.user_id == user_id,
            )
            .first()
        )
        if revision is None:
            raise FileNotFoundError("Revision not found")
        return revision

    def restore_revision(
        self,
        db: Session,
        *,
        user_id: str,
        document_id: uuid.UUID,
        revision_id: uuid.UUID,
    ) -> InkwiseDocument:
        document = self.get_document_or_404(db, user_id=user_id, document_id=document_id)
        revision = self.get_revision_or_404(db, user_id=user_id, document_id=document_id, revision_id=revision_id)

        document.title = revision.title
        document.content_json = revision.content_json
        document.content_html = revision.content_html
        document.init_prompt = revision.init_prompt
        document.language = revision.language
        document.version += 1
        document.updated_at = datetime.utcnow()
        self._create_revision(
            db,
            document=document,
            source_kind="restore",
            source_meta={
                "restored_from_revision_id": str(revision.id),
                "restored_from_revision_number": revision.revision_number,
            },
        )
        db.commit()
        db.refresh(document)
        return document

    def delete_document(self, db: Session, *, user_id: str, document_id: uuid.UUID) -> None:
        document = self.get_document_or_404(db, user_id=user_id, document_id=document_id)
        db.delete(document)
        db.commit()

    def _create_revision(
        self,
        db: Session,
        *,
        document: InkwiseDocument,
        source_kind: str,
        source_meta: dict[str, Any] | None = None,
    ) -> InkwiseDocumentRevision:
        next_revision_number = (
            db.query(func.coalesce(func.max(InkwiseDocumentRevision.revision_number), 0))
            .filter(InkwiseDocumentRevision.document_id == document.id)
            .scalar()
            or 0
        )
        revision = InkwiseDocumentRevision(
            document_id=document.id,
            user_id=document.user_id,
            revision_number=int(next_revision_number) + 1,
            title=document.title,
            content_json=document.content_json,
            content_html=document.content_html,
            init_prompt=document.init_prompt,
            language=document.language,
            document_version=document.version,
            source_kind=source_kind,
            source_meta=source_meta or {},
            created_at=datetime.utcnow(),
        )
        db.add(revision)
        db.flush()
        return revision

    def _snapshot_document(self, document: InkwiseDocument) -> dict[str, Any]:
        return {
            "title": document.title,
            "content_json": document.content_json,
            "content_html": document.content_html,
            "init_prompt": document.init_prompt,
            "language": document.language,
            "version": document.version,
        }
