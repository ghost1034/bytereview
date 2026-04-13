"""Persistence helpers for Inkwise generation attempts."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from models.inkwise_models import InkwiseGenerationAttempt


class InkwiseGenerationAttemptService:
    def create_attempt(
        self,
        db: Session,
        *,
        user_id: str,
        kind: str,
        request_json: dict[str, Any],
        document_id: uuid.UUID | None = None,
        thread_id: uuid.UUID | None = None,
        parent_attempt_id: uuid.UUID | None = None,
        generation_group_id: uuid.UUID | None = None,
        retrieval_run_id: uuid.UUID | None = None,
        provider: str | None = None,
        model: str | None = None,
        meta_json: dict[str, Any] | None = None,
    ) -> InkwiseGenerationAttempt:
        resolved_group_id = generation_group_id or uuid.uuid4()
        attempt_number = 1
        if generation_group_id is not None:
            previous = (
                db.query(InkwiseGenerationAttempt)
                .filter(InkwiseGenerationAttempt.generation_group_id == generation_group_id)
                .order_by(InkwiseGenerationAttempt.attempt_number.desc())
                .first()
            )
            if previous is not None:
                attempt_number = int(previous.attempt_number or 0) + 1

        attempt = InkwiseGenerationAttempt(
            user_id=user_id,
            document_id=document_id,
            thread_id=thread_id,
            retrieval_run_id=retrieval_run_id,
            parent_attempt_id=parent_attempt_id,
            generation_group_id=resolved_group_id,
            kind=kind,
            status="processing",
            attempt_number=attempt_number,
            provider=provider,
            model=model,
            request_json=request_json,
            meta_json=meta_json or {},
            created_at=datetime.utcnow(),
        )
        db.add(attempt)
        db.commit()
        db.refresh(attempt)
        return attempt

    def complete_attempt(
        self,
        db: Session,
        *,
        attempt_id: uuid.UUID,
        response_text: str,
        citations_json: dict[str, Any] | None = None,
        retrieval_run_id: uuid.UUID | None = None,
        chat_message_id: uuid.UUID | None = None,
        meta_json: dict[str, Any] | None = None,
    ) -> InkwiseGenerationAttempt:
        attempt = self.get_attempt_or_404(db, attempt_id=attempt_id)
        attempt.status = "completed"
        attempt.response_text = response_text
        attempt.citations_json = citations_json
        attempt.retrieval_run_id = retrieval_run_id
        attempt.chat_message_id = chat_message_id
        attempt.meta_json = meta_json or attempt.meta_json or {}
        attempt.completed_at = datetime.utcnow()
        db.commit()
        db.refresh(attempt)
        return attempt

    def fail_attempt(
        self,
        db: Session,
        *,
        attempt_id: uuid.UUID,
        message: str,
        retrieval_run_id: uuid.UUID | None = None,
        meta_json: dict[str, Any] | None = None,
    ) -> InkwiseGenerationAttempt:
        attempt = self.get_attempt_or_404(db, attempt_id=attempt_id)
        attempt.status = "failed"
        attempt.retrieval_run_id = retrieval_run_id
        attempt.meta_json = {
            **(attempt.meta_json or {}),
            **(meta_json or {}),
            "error": (message or "")[:1000],
        }
        attempt.completed_at = datetime.utcnow()
        db.commit()
        db.refresh(attempt)
        return attempt

    def attach_chat_message(
        self,
        db: Session,
        *,
        attempt_id: uuid.UUID,
        chat_message_id: uuid.UUID,
    ) -> InkwiseGenerationAttempt:
        attempt = self.get_attempt_or_404(db, attempt_id=attempt_id)
        attempt.chat_message_id = chat_message_id
        db.commit()
        db.refresh(attempt)
        return attempt

    def get_attempt_or_404(self, db: Session, *, attempt_id: uuid.UUID) -> InkwiseGenerationAttempt:
        attempt = db.query(InkwiseGenerationAttempt).filter(InkwiseGenerationAttempt.id == attempt_id).first()
        if attempt is None:
            raise FileNotFoundError("Generation attempt not found")
        return attempt

    def get_attempt_for_user(self, db: Session, *, user_id: str, attempt_id: uuid.UUID) -> InkwiseGenerationAttempt:
        attempt = (
            db.query(InkwiseGenerationAttempt)
            .filter(
                InkwiseGenerationAttempt.id == attempt_id,
                InkwiseGenerationAttempt.user_id == user_id,
            )
            .first()
        )
        if attempt is None:
            raise FileNotFoundError("Generation attempt not found")
        return attempt
