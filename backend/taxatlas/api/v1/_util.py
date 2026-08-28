from __future__ import annotations

from datetime import date
from enum import Enum

from fastapi import HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from taxatlas.models import Jurisdiction, TaxRate


def paginate(db: Session, stmt, limit: int, offset: int) -> tuple[list, int]:
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    items = list(db.scalars(stmt.limit(limit).offset(offset)))
    return items, total


def limit_q(default: int = 50, maximum: int = 500):
    return Query(default, ge=1, le=maximum)


def offset_q():
    return Query(0, ge=0)


def resolve_jurisdiction(db: Session, code: str) -> Jurisdiction:
    j = db.scalar(select(Jurisdiction).where(func.upper(Jurisdiction.code) == code.upper()))
    if not j:
        raise HTTPException(404, f"Jurisdiction '{code}' not found")
    return j


def descendant_ids(db: Session, root: Jurisdiction) -> list[int]:
    ids = [root.id]
    frontier = [root.id]
    while frontier:
        rows = list(db.scalars(select(Jurisdiction.id).where(Jurisdiction.parent_id.in_(frontier))))
        ids.extend(rows)
        frontier = rows
    return ids


def jurisdiction_scope(db: Session, code: str | None, include_children: bool) -> list[int] | None:
    """Resolve a jurisdiction *filter* to ids. Unknown codes yield an empty scope (→ empty page), not a 404:
    filters have set semantics and the UI sends partial codes while the user types."""
    if not code:
        return None
    j = db.scalar(select(Jurisdiction).where(func.upper(Jurisdiction.code) == code.upper()))
    if j is None:
        return []
    return descendant_ids(db, j) if include_children else [j.id]


def apply_sort(stmt, model, sort: str | None, direction: str | None, allowed: dict[str, str], default):
    """Whitelist-based ORDER BY. `allowed` maps public sort keys to model attribute names; `default` is a
    callable applying the default ordering when no/unknown sort is given."""
    d = sort_dir(direction)
    if sort and sort in allowed:
        col = getattr(model, allowed[sort])
        order = col.desc().nullslast() if d == "desc" else col.asc().nullsfirst()
        return stmt.order_by(order, model.id.desc())
    return default(stmt)


def _422(name: str, value: str, allowed) -> HTTPException:
    return HTTPException(
        422,
        [
            {
                "type": "enum",
                "loc": ["query", name],
                "msg": f"Input should be one of: {', '.join(allowed)}",
                "input": value,
            }
        ],
    )


def enum_filter(value: str | None, kind: type[Enum], name: str) -> str | None:
    """Validate a single enum-valued query filter. Empty/None → None; unknown value → 422 naming the value."""
    if value is None or value == "":
        return None
    allowed = [e.value for e in kind]
    if value not in allowed:
        raise _422(name, value, allowed)
    return value


def enum_list_filter(value: str | None, kind: type[Enum], name: str) -> list[str] | None:
    """Validate a comma-separated enum list filter (e.g. tax_type=vat,gst). Empty → None; any unknown part → 422."""
    if value is None or value.strip() == "":
        return None
    parts = [v.strip() for v in value.split(",") if v.strip()]
    allowed = [e.value for e in kind]
    for part in parts:
        if part not in allowed:
            raise _422(name, part, allowed)
    return parts or None


def sort_dir(direction: str | None) -> str:
    """Normalise the `dir` query param to 'asc' | 'desc' (default desc); anything else is 422."""
    if direction is None or direction == "":
        return "desc"
    d = direction.lower()
    if d not in ("asc", "desc"):
        raise _422("dir", direction, ["asc", "desc"])
    return d


def like_prefix(value: str) -> tuple[str, str]:
    """Escape LIKE metacharacters so a user-supplied prefix matches literally. Returns (pattern, escape_char)."""
    esc = "\\"
    escaped = value.replace(esc, esc + esc).replace("%", esc + "%").replace("_", esc + "_")
    return f"{escaped}%", esc


def current_rate_clause(today: date):
    """Rows effective today: started on/before today (or no start) and not yet ended (or no end).

    A scheduled future row (effective_from > today) is not current even when its effective_to is open.
    """
    return ((TaxRate.effective_from.is_(None)) | (TaxRate.effective_from <= today)) & (
        (TaxRate.effective_to.is_(None)) | (TaxRate.effective_to >= today)
    )
