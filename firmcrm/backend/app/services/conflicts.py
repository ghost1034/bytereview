"""Conflict / independence search.

Normalises each party name and compares it against: account names + aliases, contact full names,
and adverse parties recorded on opportunities and engagements. Returns scored matches so a reviewer
can clear, flag, or waive. Fuzzy matching is a prototype heuristic (difflib); production would use a
dedicated entity-resolution service and include related-party / affiliate data.
"""

from __future__ import annotations

import re
from difflib import SequenceMatcher

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import Account, Contact, Engagement, Opportunity

_SUFFIXES = {"inc", "llc", "llp", "lp", "ltd", "corp", "corporation", "co", "company", "plc", "pc", "pllc", "the",
             "group", "holdings", "trust", "estate", "of"}


def normalize(name: str) -> str:
    s = re.sub(r"[^a-z0-9 ]+", " ", name.lower())
    toks = [t for t in s.split() if t and t not in _SUFFIXES]
    return " ".join(toks)


def score(a: str, b: str) -> float:
    na, nb = normalize(a), normalize(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    ta, tb = set(na.split()), set(nb.split())
    if ta and tb and (ta <= tb or tb <= ta):
        return 0.95
    return SequenceMatcher(None, na, nb).ratio()


def search(db: Session, parties: list[str]) -> list[dict]:
    threshold = get_settings().conflict_match_threshold
    # (name, entity, id, relationship, context, source_type)
    candidates: list[tuple[str, str, int | None, str, str | None, str | None]] = []

    for acc in db.scalars(select(Account)).all():  # archived accounts included on purpose
        rel = acc.account_type
        ctx = "archived" if acc.is_archived else None
        candidates.append((acc.name, "account", acc.id, rel, ctx, None))
        for alias in (acc.aliases or "").split(","):
            if alias.strip():
                candidates.append((alias.strip(), "account", acc.id, rel, f"alias of {acc.name}" + (" (archived)" if acc.is_archived else ""), None))
    for c in db.scalars(select(Contact)).all():
        ctx = c.account.name if c.account else None
        if c.is_archived:
            ctx = f"{ctx or ''} (archived)".strip()
        candidates.append((c.full_name, "contact", c.id, c.lifecycle, ctx, None))
    for opp in db.scalars(select(Opportunity)).all():
        for ap in opp.adverse_parties or []:
            candidates.append((ap, "adverse_party", opp.id, "adverse_party", f"adverse to {opp.account.name} in '{opp.name}'", "opportunity"))
    for eng in db.scalars(select(Engagement)).all():
        for ap in eng.adverse_parties or []:
            candidates.append((ap, "adverse_party", eng.id, "adverse_party", f"adverse to {eng.account.name} in '{eng.name}'", "engagement"))

    matches: list[dict] = []
    for party in parties:
        party = party.strip()
        if not party:
            continue
        for name, entity, eid, rel, ctx, src in candidates:
            s = score(party, name)
            if s >= threshold:
                matches.append({
                    "party": party, "matched_name": name, "entity": entity, "entity_id": eid,
                    "relationship": rel, "context": ctx, "score": round(s, 3), "source_type": src,
                })
    matches.sort(key=lambda m: -m["score"])
    return matches


def filter_self(matches: list[dict], *, account_id: int | None, opportunity_id: int | None) -> list[dict]:
    """Drop matches that are merely the prospect itself or the adverse parties typed on this same opportunity."""
    out = []
    for m in matches:
        if account_id and m["entity"] == "account" and m["entity_id"] == account_id:
            continue
        if opportunity_id and m["entity"] == "adverse_party" and m.get("source_type") == "opportunity" and m["entity_id"] == opportunity_id:
            continue
        out.append(m)
    return out


def latest_status_for_opportunity(db: Session, opportunity_id: int) -> str | None:
    from app.models import ConflictCheck

    row = db.scalars(
        select(ConflictCheck).where(ConflictCheck.opportunity_id == opportunity_id).order_by(ConflictCheck.id.desc())
    ).first()
    return row.status if row else None
