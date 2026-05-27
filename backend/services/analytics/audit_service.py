"""Persist firm-scoped action records to `analytics_audit_logs`.

Write path only; read path will be added when an audit-log UI lands. The
helper is best-effort: it logs and swallows errors so a failed audit insert
cannot break the user-visible action that triggered it.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Mapping, Optional

from sqlalchemy.orm import Session

from models.db_models import AnalyticsAuditLog

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
