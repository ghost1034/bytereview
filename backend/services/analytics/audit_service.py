"""Persist and read firm-scoped action records in `analytics_audit_logs`.

The write helper is best-effort: it logs and swallows errors so a failed audit
insert cannot break the user-visible action that triggered it.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Mapping, Optional

from sqlalchemy.orm import Session

from models.db_models import AnalyticsAuditLog, User

logger = logging.getLogger(__name__)


def record_audit(
    db: Session,
    *,
    firm_id,
    user_id: Optional[str],
    action: str,
    details: Optional[Mapping[str, Any]] = None,
) -> None:
    """Insert a single audit-log row and commit.

    Caller is responsible for choosing `action` strings (e.g. 'client.created'
    or 'project.deleted'). `details` is stored as JSONB and should be a small
    dict — no large blobs.
    """
    try:
        row = AnalyticsAuditLog(
            id=uuid.uuid4(),
            firm_id=firm_id,
            user_id=user_id,
            action=action,
            details=dict(details) if details is not None else None,
        )
        db.add(row)
        db.commit()
    except Exception:
        logger.exception(
            "Failed to record audit log (firm_id=%s user_id=%s action=%s)",
            firm_id,
            user_id,
            action,
        )
        db.rollback()


def list_audit_logs(db: Session, firm_id, *, limit: int = 50) -> list[dict]:
    """Return the most recent audit log entries for a firm, newest first.

    Each row is enriched with the acting user's email + display name when
    available (LEFT JOIN, so deleted users still show their action).
    """
    rows = (
        db.query(
            AnalyticsAuditLog.id,
            AnalyticsAuditLog.action,
            AnalyticsAuditLog.details,
            AnalyticsAuditLog.user_id,
            AnalyticsAuditLog.created_at,
            User.email,
            User.display_name,
        )
        .outerjoin(User, User.id == AnalyticsAuditLog.user_id)
        .filter(AnalyticsAuditLog.firm_id == firm_id)
        .order_by(AnalyticsAuditLog.created_at.desc())
        .limit(max(1, min(limit, 500)))
        .all()
    )

    return [
        {
            "id": str(row.id),
            "action": row.action,
            "details": row.details,
            "user_id": row.user_id,
            "user_email": row.email,
            "user_display_name": row.display_name,
            "created_at": row.created_at,
        }
        for row in rows
    ]
