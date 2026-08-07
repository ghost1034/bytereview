"""Build a JSON-serializable snapshot of every analytics table for a firm.

Used by the GDPR-style "Export all firm data" button in Settings. Read-only —
nothing is mutated and no audit row is written here (the caller records the
event via `record_audit`).
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List

from sqlalchemy.orm import Session

from models.db_models import (
    Amortization,
    Analysis,
    AnalyticsAuditLog,
    ChatSession,
    Client,
    Firm,
    JournalEntry,
    Reconciliation,
    User,
)
from models.pbc import PbcAuditEvent, PbcComment, PbcContact, PbcDocument, PbcEngagement, PbcRequest, PbcTemplate


def _to_jsonable(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if hasattr(value, "value"):  # SQLAlchemy enums
        return value.value
    if isinstance(value, dict):
        return {k: _to_jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_to_jsonable(v) for v in value]
    return str(value)


def _row_to_dict(row, columns: tuple[str, ...]) -> Dict[str, Any]:
    return {col: _to_jsonable(getattr(row, col)) for col in columns}


_CLIENT_COLS = (
    "id", "firm_id", "name", "industry", "contact_name", "contact_email",
    "contact_phone", "fiscal_year_end", "notes", "created_at", "updated_at",
)
_ANALYSIS_COLS = (
    "id", "firm_id", "client_id", "created_by_user_id", "type", "name",
    "status", "config", "data", "results", "memo_content",
    "created_at", "updated_at",
)
_RECON_COLS = (
    "id", "firm_id", "client_id", "created_by_user_id", "name", "status",
    "source_a", "source_b", "rules", "match_groups",
    "created_at", "updated_at",
)
_AMORT_COLS = (
    "id", "firm_id", "client_id", "created_by_user_id", "asset_name",
    "asset_type", "cost_basis", "salvage_value", "useful_life_months",
    "gaap_method", "tax_method", "start_date", "vendor", "status",
    "approval_status", "type_specific", "schedule", "tax_schedule",
    "created_at", "updated_at",
)
_CHAT_COLS = (
    "id", "firm_id", "user_id", "client_id", "bot_type", "title",
    "messages", "uploaded_docs", "created_at", "updated_at",
)
_JOURNAL_COLS = (
    "id", "firm_id", "client_id", "amortization_id", "period", "entries",
    "created_at",
)
_AUDIT_COLS = ("id", "firm_id", "user_id", "action", "details", "created_at")


def build_firm_export(db: Session, firm: Firm) -> Dict[str, Any]:
    """Return a dict ready for `FirmExportResponse(**…)`."""

    members: List[User] = (
        db.query(User).filter(User.firm_id == firm.id).order_by(User.created_at.asc()).all()
    )
    member_payloads = [
        {
            "user_id": m.id,
            "email": m.email,
            "display_name": m.display_name,
            "photo_url": m.photo_url,
            "role": m.role.value if hasattr(m.role, "value") else (m.role or "analyst"),
            "persona": m.persona.value if hasattr(m.persona, "value") and m.persona else None,
            "title": m.title,
            "created_at": m.created_at,
        }
        for m in members
    ]

    def _scoped(model, cols: tuple[str, ...]) -> List[Dict[str, Any]]:
        rows = db.query(model).filter(model.firm_id == firm.id).all()
        return [_row_to_dict(r, cols) for r in rows]

    return {
        "firm": {
            "id": str(firm.id),
            "name": firm.name,
            "created_at": firm.created_at,
            "updated_at": firm.updated_at,
        },
        "members": member_payloads,
        "clients": _scoped(Client, _CLIENT_COLS),
        "analyses": _scoped(Analysis, _ANALYSIS_COLS),
        "reconciliations": _scoped(Reconciliation, _RECON_COLS),
        "amortizations": _scoped(Amortization, _AMORT_COLS),
        "chat_sessions": _scoped(ChatSession, _CHAT_COLS),
        "journal_entries": _scoped(JournalEntry, _JOURNAL_COLS),
        "audit_logs": _scoped(AnalyticsAuditLog, _AUDIT_COLS),
        "pbc": {
            "engagements": _scoped(PbcEngagement, tuple(column.name for column in PbcEngagement.__table__.columns)),
            "requests": _scoped(PbcRequest, tuple(column.name for column in PbcRequest.__table__.columns)),
            "contacts": _scoped(PbcContact, tuple(column.name for column in PbcContact.__table__.columns)),
            "documents": _scoped(PbcDocument, tuple(column.name for column in PbcDocument.__table__.columns)),
            "comments": _scoped(PbcComment, tuple(column.name for column in PbcComment.__table__.columns)),
            "templates": _scoped(PbcTemplate, tuple(column.name for column in PbcTemplate.__table__.columns)),
            "audit_events": _scoped(PbcAuditEvent, tuple(column.name for column in PbcAuditEvent.__table__.columns)),
        },
        "exported_at": datetime.utcnow(),
    }
