"""Template service for the Inkwise module."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from inkwise.schemas import InkwiseTemplateCreateRequest, InkwiseTemplateUpdateRequest
from models.inkwise_models import InkwiseSystemTemplate, InkwiseSystemTemplateCategory, InkwiseTemplate


class InkwiseTemplateService:
    def list_templates(self, db: Session, *, user_id: str, page: int, limit: int) -> tuple[list[InkwiseTemplate], int]:
        if page < 1 or limit < 1 or limit > 100:
            raise ValueError("Invalid pagination")

        query = db.query(InkwiseTemplate).filter(InkwiseTemplate.user_id == user_id)
        total = query.count()
        items = (
            query.order_by(InkwiseTemplate.updated_at.desc(), InkwiseTemplate.created_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
            .all()
        )
        return items, total

    def create_template(self, db: Session, *, user_id: str, body: InkwiseTemplateCreateRequest) -> InkwiseTemplate:
        now = datetime.utcnow()
        template = InkwiseTemplate(
            user_id=user_id,
            title=body.title.strip(),
            icon=body.icon,
            description=body.description,
            content_json=body.content_json,
            created_at=now,
            updated_at=now,
        )
        db.add(template)
        db.commit()
        db.refresh(template)
        return template

    def get_template_or_404(self, db: Session, *, user_id: str, template_id: uuid.UUID) -> InkwiseTemplate:
        template = (
            db.query(InkwiseTemplate)
            .filter(InkwiseTemplate.id == template_id, InkwiseTemplate.user_id == user_id)
            .first()
        )
        if template is None:
            raise FileNotFoundError("Template not found")
        return template

    def update_template(
        self,
        db: Session,
        *,
        user_id: str,
        template_id: uuid.UUID,
        body: InkwiseTemplateUpdateRequest,
    ) -> InkwiseTemplate:
        template = self.get_template_or_404(db, user_id=user_id, template_id=template_id)
        fields = body.model_fields_set
        if "title" in fields and body.title is not None:
            template.title = body.title.strip() or template.title
        if "icon" in fields:
            template.icon = body.icon
        if "description" in fields:
            template.description = body.description
        if "content_json" in fields and body.content_json is not None:
            template.content_json = body.content_json
        template.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(template)
        return template

    def delete_template(self, db: Session, *, user_id: str, template_id: uuid.UUID) -> None:
        template = self.get_template_or_404(db, user_id=user_id, template_id=template_id)
        db.delete(template)
        db.commit()

    def list_system_template_categories(self, db: Session) -> list[InkwiseSystemTemplateCategory]:
        return db.query(InkwiseSystemTemplateCategory).order_by(InkwiseSystemTemplateCategory.name.asc()).all()

    def list_system_templates(self, db: Session, *, category_id: int | None = None) -> list[InkwiseSystemTemplate]:
        query = db.query(InkwiseSystemTemplate)
        if category_id is not None:
            query = query.filter(InkwiseSystemTemplate.category_id == category_id)
        return query.order_by(InkwiseSystemTemplate.title.asc()).all()

    def get_system_template_or_404(self, db: Session, *, system_template_id: uuid.UUID) -> InkwiseSystemTemplate:
        template = db.query(InkwiseSystemTemplate).filter(InkwiseSystemTemplate.id == system_template_id).first()
        if template is None:
            raise FileNotFoundError("System template not found")
        return template
