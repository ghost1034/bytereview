from __future__ import annotations
from firmcrm.core.routing import FirmCrmRoute

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from firmcrm.api.common import paginate, user_names
from firmcrm.core.db import get_db
from firmcrm.core.deps import at_least
from firmcrm.models import AuditLog, User
from firmcrm.schemas import FirmCrmAuditOut, FirmCrmPage

router = APIRouter(route_class=FirmCrmRoute, prefix="/admin", tags=["admin"])


@router.get("/audit", response_model=FirmCrmPage[FirmCrmAuditOut])
def audit(entity_type: str | None = Query(None, max_length=40), entity_id: str | None = Query(None, max_length=40),
          action: str | None = Query(None, max_length=60), actor_id: str | None = None,
          limit: int = Query(100, ge=1, le=1000), offset: int = Query(0, ge=0),
          db: Session = Depends(get_db), _: User = Depends(at_least("manager"))):
    stmt = select(AuditLog)
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if entity_id:
        stmt = stmt.where(AuditLog.entity_id == str(entity_id))
    if action:
        stmt = stmt.where(AuditLog.action.like(f"{action}%"))
    if actor_id:
        stmt = stmt.where(AuditLog.actor_id == actor_id)
    rows, total = paginate(db, stmt.order_by(AuditLog.at.desc(), AuditLog.id.desc()), limit, offset)
    un = user_names(db, [r.actor_id for r in rows])
    out = []
    for r in rows:
        d = FirmCrmAuditOut.model_validate(r)
        d.actor_name = un.get(r.actor_id)
        out.append(d)
    return FirmCrmPage(items=out, total=total, limit=limit, offset=offset)
