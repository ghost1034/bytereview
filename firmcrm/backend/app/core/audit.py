"""Audit trail: every state-changing action records actor, entity, before/after."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditLog


def record(db: Session, *, actor_id: int | None, action: str, entity_type: str, entity_id: int | str | None,
           before: Any = None, after: Any = None, note: str | None = None) -> AuditLog:
    row = AuditLog(
        actor_id=actor_id, action=action, entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        before_json=json.dumps(before, default=str) if before is not None else None,
        after_json=json.dumps(after, default=str) if after is not None else None,
        note=note,
    )
    db.add(row)
    return row
