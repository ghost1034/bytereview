"""Routes for generic analytics comment threads — see `analytics_comments`
table. Reused across modules (variance rows today; recon match groups,
amortization assets etc. in future).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from core.database import get_db
from dependencies.analytics_rbac import READER_ROLES, WRITER_ROLES, require_role
from models.analytics import (
    CommentCreateRequest,
    CommentListResponse,
    CommentResponse,
    CommentUpdateRequest,
)
from models.db_models import User
from services.analytics import comments_service
from services.analytics.firm_scope import require_firm_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/analytics/comments", tags=["analytics-comments"])


def _to_response(row) -> CommentResponse:
    return CommentResponse(
        id=str(row.id),
        firm_id=str(row.firm_id),
        entity_type=row.entity_type,
        entity_id=row.entity_id,
        parent_comment_id=str(row.parent_comment_id) if row.parent_comment_id else None,
        author_user_id=row.author_user_id,
        body=row.body,
        mentioned_user_ids=list(row.mentioned_user_ids or []),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=CommentListResponse)
async def list_comments_route(
    entity_type: str = Query(..., min_length=1, max_length=48),
    entity_id: str = Query(..., min_length=1, max_length=128),
    actor: User = Depends(require_role(*READER_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    rows = comments_service.list_comments(
        db, firm_id, entity_type=entity_type, entity_id=entity_id
    )
    return CommentListResponse(comments=[_to_response(r) for r in rows])


@router.post("", response_model=CommentResponse)
async def create_comment_route(
    payload: CommentCreateRequest,
    actor: User = Depends(require_role(*WRITER_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    row = comments_service.create_comment(db, firm_id, actor.id, payload=payload)
    return _to_response(row)


@router.patch("/{comment_id}", response_model=CommentResponse)
async def update_comment_route(
    comment_id: str,
    payload: CommentUpdateRequest,
    actor: User = Depends(require_role(*WRITER_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    row = comments_service.update_comment(
        db, firm_id, comment_id, payload=payload, actor_user_id=actor.id
    )
    return _to_response(row)


@router.delete("/{comment_id}")
async def delete_comment_route(
    comment_id: str,
    actor: User = Depends(require_role(*WRITER_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    comments_service.soft_delete_comment(
        db, firm_id, comment_id, actor_user_id=actor.id
    )
    return {"success": True}
