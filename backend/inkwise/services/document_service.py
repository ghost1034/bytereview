"""Document service for the Inkwise module."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from inkwise.schemas import InkwiseDocumentCreateRequest, InkwiseDocumentUpdateRequest
from models.inkwise_models import InkwiseDocument


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
        if "title" in fields:
            document.title = (body.title or "Untitled").strip() or "Untitled"
        if "content_json" in fields:
            document.content_json = body.content_json
        if "content_html" in fields:
            document.content_html = body.content_html
        if "init_prompt" in fields:
            document.init_prompt = body.init_prompt
        if "language" in fields:
            document.language = body.language

        document.version += 1
        document.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(document)
        return document

    def delete_document(self, db: Session, *, user_id: str, document_id: uuid.UUID) -> None:
        document = self.get_document_or_404(db, user_id=user_id, document_id=document_id)
        db.delete(document)
        db.commit()
