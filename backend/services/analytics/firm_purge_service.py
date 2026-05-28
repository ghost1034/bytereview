"""Cascading delete of every firm-scoped row.

Used by the "Purge firm data" button in Settings. Most child tables already
declare `ondelete='CASCADE'` on their `firm_id` FK, but we explicitly delete
the children first so that audit-log writes from in-flight transactions can't
re-create rows under a partially deleted firm, and so the order is auditable.

After purging children, the firm row itself is deleted. Users keep their
accounts but have `firm_id` cleared (via `ondelete='SET NULL'`).
"""

from __future__ import annotations

import logging

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.db_models import (
    Amortization,
    Analysis,
    AnalyticsAuditLog,
    AnalyticsComment,
    ChatSession,
    Client,
    Firm,
    JournalEntry,
    Project,
    Reconciliation,
)

logger = logging.getLogger(__name__)

# Delete order: children before parents so any FK without CASCADE still works.
_PURGE_MODELS = (
    JournalEntry,
    Amortization,
    Reconciliation,
    Analysis,
    AnalyticsComment,
    AnalyticsAuditLog,
    ChatSession,
    Project,
    Client,
)


def purge_firm(db: Session, firm_id) -> None:
    firm = db.query(Firm).filter(Firm.id == firm_id).first()
    if firm is None:
        raise HTTPException(status_code=404, detail="Firm not found")

    try:
        for model in _PURGE_MODELS:
            db.query(model).filter(model.firm_id == firm_id).delete(synchronize_session=False)

        db.delete(firm)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to purge firm %s", firm_id)
        raise
