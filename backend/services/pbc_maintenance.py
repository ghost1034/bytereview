"""Idempotent scheduled maintenance for PBC reminders and expiring artifacts."""

from __future__ import annotations

from core.database import db_config
from services.pbc_service import cleanup_expired, deliver_notifications, queue_reminders


async def run_pbc_maintenance() -> dict:
    db = db_config.get_session()
    try:
        queued = queue_reminders(db)
        cleanup = cleanup_expired(db)
        db.commit()
        delivery = deliver_notifications(db)
        db.commit()
        return {"queued": queued, **cleanup, **delivery}
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

