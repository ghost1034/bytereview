"""CRUD service for `analytics_comments` rows — generic threads keyed by
(firm_id, entity_type, entity_id) with @mention support and soft delete.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.db_models import AnalyticsComment, User
from services.analytics.audit_service import record_audit


def list_comments(
    db: Session,
    firm_id,
    *,
    entity_type: str,
    entity_id: str,
) -> List[AnalyticsComment]:
    return (
        db.query(AnalyticsComment)
        .filter(
            AnalyticsComment.firm_id == firm_id,
            AnalyticsComment.entity_type == entity_type,
            AnalyticsComment.entity_id == entity_id,
            AnalyticsComment.deleted_at.is_(None),
        )
        .order_by(AnalyticsComment.created_at.asc())
        .all()
    )


def get_comment(db: Session, firm_id, comment_id: str) -> AnalyticsComment:
    row = (
        db.query(AnalyticsComment)
        .filter(
            AnalyticsComment.id == comment_id,
            AnalyticsComment.firm_id == firm_id,
            AnalyticsComment.deleted_at.is_(None),
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Comment not found")
    return row


def _validate_mentioned_users(db: Session, firm_id, user_ids: List[str]) -> List[str]:
    """Filter mentioned user IDs to those who actually belong to the firm.

    Silently drops UIDs that don't match a firm member rather than erroring —
    the frontend autocomplete should already enforce this, so a bad ID likely
    means a stale tab; we don't want to lose the comment text over it.
    """
    if not user_ids:
        return []
    valid = (
        db.query(User.id)
        .filter(User.firm_id == firm_id, User.id.in_(user_ids))
        .all()
    )
    valid_ids = {row[0] for row in valid}
    return [uid for uid in user_ids if uid in valid_ids]


def create_comment(
    db: Session,
    firm_id,
    user_id: str,
    *,
    payload,
) -> AnalyticsComment:
    parent_id = payload.parent_comment_id
    if parent_id:
        parent = get_comment(db, firm_id, parent_id)
        if parent.entity_type != payload.entity_type or parent.entity_id != payload.entity_id:
            raise HTTPException(
                status_code=400,
                detail="Reply must target the same entity as its parent",
            )

    mentioned = _validate_mentioned_users(db, firm_id, payload.mentioned_user_ids or [])

    row = AnalyticsComment(
        id=uuid.uuid4(),
        firm_id=firm_id,
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        parent_comment_id=parent_id,
        author_user_id=user_id,
        body=payload.body,
        mentioned_user_ids=mentioned,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    record_audit(
        db,
        firm_id=firm_id,
        user_id=user_id,
        action="comment.created",
        details={
            "comment_id": str(row.id),
            "entity_type": row.entity_type,
            "entity_id": row.entity_id,
            "mentioned": mentioned,
        },
    )
    return row


def update_comment(
    db: Session,
    firm_id,
    comment_id: str,
    *,
    payload,
    actor_user_id: str,
) -> AnalyticsComment:
    row = get_comment(db, firm_id, comment_id)
    if row.author_user_id != actor_user_id:
        raise HTTPException(
            status_code=403, detail="You can only edit your own comments"
        )

    data = payload.model_dump(exclude_unset=True)
    if "body" in data:
        row.body = data["body"]
    if "mentioned_user_ids" in data:
        row.mentioned_user_ids = _validate_mentioned_users(
            db, firm_id, data["mentioned_user_ids"] or []
        )

    db.commit()
    db.refresh(row)

    record_audit(
        db,
        firm_id=firm_id,
        user_id=actor_user_id,
        action="comment.updated",
        details={"comment_id": str(row.id)},
    )
    return row


def soft_delete_comment(
    db: Session,
    firm_id,
    comment_id: str,
    *,
    actor_user_id: str,
) -> None:
    row = get_comment(db, firm_id, comment_id)
    if row.author_user_id != actor_user_id:
        raise HTTPException(
            status_code=403, detail="You can only delete your own comments"
        )

    row.deleted_at = datetime.now(timezone.utc)
    db.commit()

    record_audit(
        db,
        firm_id=firm_id,
        user_id=actor_user_id,
        action="comment.deleted",
        details={
            "comment_id": str(row.id),
            "entity_type": row.entity_type,
            "entity_id": row.entity_id,
        },
    )
