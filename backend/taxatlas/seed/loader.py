"""Idempotent seed loader. Upserts by natural keys so re-running without --reset is safe.

Natural keys:
  jurisdiction  -> code
  tax rate      -> (jurisdiction, tax_type, rate_kind, effective_from, rate)   (rate included: several reduced VAT rates share a kind)
                   fallback: (jurisdiction, tax_type, rate_kind, effective_from) when exactly one unclaimed row
                   exists, so a corrected value updates the row instead of adding a second one
  regulation    -> source_url
  court decision-> source_url
  tariff        -> (importer, partner, hs_code, measure_type, effective_from)
                   fallback: (importer, source_url, product_description) for corrected keys
  source        -> slug

Admin corrections win over the seed: any row that carries an admin ChangeEvent (``new_value._meta.edited_by``,
written by /admin/*) — plus the rate row an admin superseded via POST /admin/rates — is left untouched on re-run
and reported as ``<entity>_protected`` in the counts.
"""

from __future__ import annotations

import logging
import random
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from taxatlas.models import (
    ChangeEvent,
    CourtDecision,
    Jurisdiction,
    Regulation,
    Source,
    Tariff,
    TaxRate,
)
from taxatlas.models.enums import ChangeType, EntityType
from taxatlas.services.changes import record_change

log = logging.getLogger("taxatlas.seed")

class Counts(dict):
    def bump(self, key: str, created: bool) -> None:
        self[f"{key}_created"] = self.get(f"{key}_created", 0) + (1 if created else 0)
        self[f"{key}_updated"] = self.get(f"{key}_updated", 0) + (0 if created else 1)

    def protect(self, key: str) -> None:
        self[f"{key}_protected"] = self.get(f"{key}_protected", 0) + 1


def _apply(obj, data: dict, skip: set[str]) -> None:
    for k, v in data.items():
        if k not in skip:
            setattr(obj, k, v)


def _admin_edited_ids(db: Session, entity_type: str) -> set[int]:
    """Entity ids touched through /admin/* (events carry new_value._meta.edited_by). The seed must not undo them."""
    ids: set[int] = set()
    for ev in db.scalars(select(ChangeEvent).where(ChangeEvent.entity_type == entity_type)):
        nv = ev.new_value if isinstance(ev.new_value, dict) else None
        if nv and isinstance(nv.get("_meta"), dict) and nv["_meta"].get("edited_by"):
            ids.add(ev.entity_id)
    return ids


def _superseded_rate_ids(db: Session, rates: list[TaxRate], admin_ids: set[int]) -> set[int]:
    """Rows an admin closed via POST /admin/rates?supersede: the RATE_CHANGED event is recorded against the *new*
    row, with the old row's effective_from in old_value — resolve that back to the closed row so a re-seed does not
    reopen it (effective_to -> None) and leave two open rows."""
    by_id = {r.id: r for r in rates}
    out: set[int] = set()
    stmt = select(ChangeEvent).where(
        ChangeEvent.entity_type == EntityType.RATE, ChangeEvent.change_type == ChangeType.RATE_CHANGED
    )
    for ev in db.scalars(stmt):
        if ev.entity_id not in admin_ids or not isinstance(ev.old_value, dict):
            continue
        new_row = by_id.get(ev.entity_id)
        old_from = ev.old_value.get("effective_from")
        if new_row is None or not old_from:
            continue
        for r in rates:
            if (
                r.id != new_row.id
                and r.jurisdiction_id == new_row.jurisdiction_id
                and r.tax_type == new_row.tax_type
                and r.rate_kind == new_row.rate_kind
                and str(r.effective_from) == str(old_from)
            ):
                out.add(r.id)
    return out


# ------------------------------------------------------------------------------------------------ jurisdictions
def load_jurisdictions(db: Session, rows: list[dict], counts: Counts) -> dict[str, int]:
    existing = {j.code: j for j in db.scalars(select(Jurisdiction))}
    protected = _admin_edited_ids(db, EntityType.JURISDICTION)
    ids: dict[str, int] = {}
    for row in rows:  # parents precede children in the data
        data = dict(row)
        parent_code = data.pop("parent_code")
        data["parent_id"] = ids.get(parent_code) if parent_code else None
        obj = existing.get(data["code"])
        created = obj is None
        if created:
            obj = Jurisdiction(**data)
            db.add(obj)
        elif obj.id in protected:
            counts.protect("jurisdictions")
        else:
            _apply(obj, data, skip={"code"})
        db.flush()
        existing[obj.code] = obj
        ids[obj.code] = obj.id
        counts.bump("jurisdictions", created)
    return ids


# ------------------------------------------------------------------------------------------------ rates
def _rate_key(jur_id: int, tax_type: str, kind: str, frm, rate) -> tuple:
    return (jur_id, str(tax_type), str(kind), frm, rate)


def load_rates(db: Session, rows: list[dict], jur_ids: dict[str, int], counts: Counts) -> list[tuple[TaxRate, bool]]:
    all_rates = list(db.scalars(select(TaxRate)))
    existing = {_rate_key(r.jurisdiction_id, r.tax_type, r.rate_kind, r.effective_from, r.rate): r for r in all_rates}
    admin_ids = _admin_edited_ids(db, EntityType.RATE)
    protected = admin_ids | _superseded_rate_ids(db, all_rates, admin_ids)

    prepared: list[tuple[dict, tuple]] = []
    for row in rows:
        data = dict(row)
        code = data.pop("jurisdiction_code")
        if code not in jur_ids:
            raise ValueError(f"rate references unknown jurisdiction {code!r}")
        data["jurisdiction_id"] = jur_ids[code]
        prepared.append(
            (
                data,
                _rate_key(
                    data["jurisdiction_id"], data["tax_type"], data["rate_kind"], data["effective_from"], data["rate"]
                ),
            )
        )

    # Pass 1: exact natural-key matches claim their rows.
    claimed: set[int] = set()
    matched: list[TaxRate | None] = []
    for _data, key in prepared:
        obj = existing.get(key)
        if obj is not None:
            claimed.add(obj.id)
        matched.append(obj)

    # Pass 2: a seed row whose *value* changed (data correction) still has the same (jur, type, kind, from).
    # If exactly one existing row with that 4-key is unclaimed, it is the same rate — update it, do not duplicate.
    unclaimed_by_4key: dict[tuple, list[TaxRate]] = {}
    for r in all_rates:
        if r.id not in claimed:
            unclaimed_by_4key.setdefault(
                _rate_key(r.jurisdiction_id, r.tax_type, r.rate_kind, r.effective_from, None)[:4], []
            ).append(r)

    out: list[tuple[TaxRate, bool]] = []
    for (data, key), obj in zip(prepared, matched, strict=True):
        if obj is None:
            candidates = unclaimed_by_4key.get(key[:4], [])
            if len(candidates) == 1:
                obj = candidates[0]
                claimed.add(obj.id)
                unclaimed_by_4key[key[:4]] = []
        created = obj is None
        if created:
            obj = TaxRate(**data)
            db.add(obj)
            existing[key] = obj
        elif obj.id in protected:
            counts.protect("rates")
        else:
            _apply(obj, data, skip=set())
        counts.bump("rates", created)
        out.append((obj, created))
    db.flush()
    return out


# ------------------------------------------------------------------------------------------------ regulations / courts / tariffs
def load_regulations(
    db: Session, rows: list[dict], jur_ids: dict[str, int], counts: Counts
) -> list[tuple[Regulation, bool]]:
    existing = {r.source_url: r for r in db.scalars(select(Regulation))}
    protected = _admin_edited_ids(db, EntityType.REGULATION)
    out = []
    for row in rows:
        data = dict(row)
        code = data.pop("jurisdiction_code")
        data["jurisdiction_id"] = jur_ids[code] if code else None
        obj = existing.get(data["source_url"])
        created = obj is None
        if created:
            obj = Regulation(**data)
            db.add(obj)
            existing[obj.source_url] = obj
        elif obj.id in protected:
            counts.protect("regulations")
        else:
            _apply(obj, data, skip={"source_url"})
        counts.bump("regulations", created)
        out.append((obj, created))
    db.flush()
    return out


def load_court_decisions(
    db: Session, rows: list[dict], jur_ids: dict[str, int], counts: Counts
) -> list[tuple[CourtDecision, bool]]:
    existing = {c.source_url: c for c in db.scalars(select(CourtDecision))}
    protected = _admin_edited_ids(db, EntityType.COURT_DECISION)
    out = []
    for row in rows:
        data = dict(row)
        code = data.pop("jurisdiction_code")
        data["jurisdiction_id"] = jur_ids[code] if code else None
        obj = existing.get(data["source_url"])
        created = obj is None
        if created:
            obj = CourtDecision(**data)
            db.add(obj)
            existing[obj.source_url] = obj
        elif obj.id in protected:
            counts.protect("court_decisions")
        else:
            _apply(obj, data, skip={"source_url"})
        counts.bump("court_decisions", created)
        out.append((obj, created))
    db.flush()
    return out


def _tariff_key(t_or_d) -> tuple:
    g = (lambda k: t_or_d[k]) if isinstance(t_or_d, dict) else (lambda k: getattr(t_or_d, k))
    return (
        g("importing_jurisdiction_id"),
        g("partner_jurisdiction_id"),
        g("hs_code"),
        str(g("measure_type")),
        g("effective_from"),
    )


def load_tariffs(db: Session, rows: list[dict], jur_ids: dict[str, int], counts: Counts) -> list[tuple[Tariff, bool]]:
    all_tariffs = list(db.scalars(select(Tariff)))
    existing = {_tariff_key(t): t for t in all_tariffs}
    protected = _admin_edited_ids(db, EntityType.TARIFF)
    prepared: list[tuple[dict, tuple]] = []
    for row in rows:
        data = dict(row)
        imp = data.pop("importing_jurisdiction_code")
        partner = data.pop("partner_jurisdiction_code")
        data["importing_jurisdiction_id"] = jur_ids[imp]
        data["partner_jurisdiction_id"] = jur_ids[partner] if partner else None
        prepared.append((data, _tariff_key(data)))

    claimed = {existing[k].id for _d, k in prepared if k in existing}
    # Fallback for corrected key fields (hs_code, partner, effective_from): same importer + source_url + product
    # identifies the measure. Only seed-created rows (source_id is NULL) that no exact key claimed are candidates.
    by_doc: dict[tuple, list[Tariff]] = {}
    for t in all_tariffs:
        if t.id not in claimed and t.source_id is None and t.source_url:
            by_doc.setdefault((t.importing_jurisdiction_id, t.source_url, t.product_description), []).append(t)

    out = []
    for data, key in prepared:
        obj = existing.get(key)
        if obj is None:
            cands = by_doc.get((data["importing_jurisdiction_id"], data.get("source_url"), data["product_description"]))
            if cands and len(cands) == 1:
                obj = cands[0]
                by_doc[(data["importing_jurisdiction_id"], data.get("source_url"), data["product_description"])] = []
        created = obj is None
        if created:
            obj = Tariff(**data)
            db.add(obj)
            existing[key] = obj
        elif obj.id in protected:
            counts.protect("tariffs")
        else:
            _apply(obj, data, skip=set())
        counts.bump("tariffs", created)
        out.append((obj, created))
    db.flush()
    return out


# ------------------------------------------------------------------------------------------------ sources
def load_sources(db: Session, rows: list[dict], jur_ids: dict[str, int], counts: Counts) -> None:
    existing = {s.slug: s for s in db.scalars(select(Source))}
    for row in rows:
        data = dict(row)
        code = data.pop("jurisdiction_code", None)
        data["jurisdiction_id"] = jur_ids.get(code) if code else None
        obj = existing.get(data["slug"])
        created = obj is None
        if created:
            obj = Source(**data)
            db.add(obj)
            existing[obj.slug] = obj
        else:
            # do not clobber runtime state (etag, last_run, counters) or the enabled flag: auto-disable after repeated
            # failures and admin toggles must survive a re-seed. The registry's `enabled` applies on create only;
            # push it explicitly with `python -m app.crawler sync-registry --force-enabled`.
            _apply(
                obj,
                data,
                skip={
                    "slug",
                    "enabled",
                    "etag",
                    "last_modified",
                    "last_run_at",
                    "last_success_at",
                    "last_status",
                    "last_error",
                    "items_total",
                    "consecutive_failures",
                },
            )
        counts.bump("sources", created)
    db.flush()


# ------------------------------------------------------------------------------------------------ change events
def _rate_pairs(rates: list[TaxRate]) -> list[tuple[TaxRate, TaxRate]]:
    """Pair each historical rate row (effective_to set) with the current row of the same (jur, type, kind)."""
    by_key: dict[tuple, list[TaxRate]] = {}
    for r in rates:
        by_key.setdefault((r.jurisdiction_id, r.tax_type, r.rate_kind), []).append(r)
    pairs = []
    for rows in by_key.values():
        hist = [r for r in rows if r.effective_to is not None]
        cur = [r for r in rows if r.effective_to is None and r.rate is not None]
        if not hist or not cur:
            continue
        for h in sorted(hist, key=lambda r: r.effective_to):
            # successor = current row with the latest effective_from at or after the historical row ended
            succ = sorted(cur, key=lambda r: r.effective_from or datetime.min.date())
            nxt = next((c for c in succ if c.effective_from and c.effective_from > h.effective_to), succ[-1])
            if nxt.rate != h.rate:
                pairs.append((h, nxt))
    return pairs


def create_change_backlog(
    db: Session,
    *,
    regs: list[Regulation],
    cases: list[CourtDecision],
    tariffs: list[Tariff],
    rates: list[TaxRate],
    counts: Counts,
    notify_last: int = 15,
    seed: int = 20250101,
) -> None:
    """Create 'created' events for content rows and 'rate_changed' events for historical→current rate pairs.

    detected_at is spread over the last 90 days; only the most recent `notify_last` events fan out notifications.
    Skips entities that already have an event (idempotent).
    """
    existing = {(e.entity_type, e.entity_id, e.change_type) for e in db.scalars(select(ChangeEvent))}
    rng = random.Random(seed)
    now = datetime.now(UTC)
    planned: list[dict] = []

    for r in regs:
        planned.append(
            dict(
                entity_type=EntityType.REGULATION,
                entity_id=r.id,
                change_type=ChangeType.CREATED,
                title=f"New regulation: {r.title}",
                jurisdiction_id=r.jurisdiction_id,
                tax_type=r.tax_type,
                new_value={
                    "status": r.status,
                    "doc_type": r.doc_type,
                    "published_date": str(r.published_date),
                    "source_url": r.source_url,
                },
            )
        )
    for c in cases:
        planned.append(
            dict(
                entity_type=EntityType.COURT_DECISION,
                entity_id=c.id,
                change_type=ChangeType.CREATED,
                title=f"New decision: {c.case_name}",
                jurisdiction_id=c.jurisdiction_id,
                tax_type=(c.tax_types or [None])[0],
                new_value={
                    "court": c.court,
                    "outcome": c.outcome,
                    "decision_date": str(c.decision_date),
                    "source_url": c.source_url,
                },
            )
        )
    for t in tariffs:
        planned.append(
            dict(
                entity_type=EntityType.TARIFF,
                entity_id=t.id,
                change_type=ChangeType.CREATED,
                title=f"New trade measure: {t.product_description}",
                jurisdiction_id=t.importing_jurisdiction_id,
                tax_type="customs_tariff",
                new_value={
                    "measure_type": t.measure_type,
                    "rate": t.rate,
                    "status": t.status,
                    "effective_from": str(t.effective_from),
                },
            )
        )
    for old, new in _rate_pairs(rates):
        planned.append(
            dict(
                entity_type=EntityType.RATE,
                entity_id=new.id,
                change_type=ChangeType.RATE_CHANGED,
                title=f"Rate change: {new.jurisdiction.code} {new.tax_type} {new.rate_kind} {old.rate}% → {new.rate}%",
                jurisdiction_id=new.jurisdiction_id,
                tax_type=new.tax_type,
                old_value={
                    "rate": old.rate,
                    "effective_from": str(old.effective_from),
                    "effective_to": str(old.effective_to),
                },
                new_value={"rate": new.rate, "effective_from": str(new.effective_from), "effective_to": None},
            )
        )

    planned = [p for p in planned if (p["entity_type"], p["entity_id"], p["change_type"]) not in existing]
    if not planned:
        return
    # deterministic spread over the last 90 days, oldest first
    offsets = sorted(rng.uniform(0, 90 * 24 * 3600) for _ in planned)
    rng.shuffle(planned)
    n = len(planned)
    for i, (p, off) in enumerate(zip(planned, offsets, strict=True)):
        notify = i >= n - notify_last
        ev = record_change(db, notify=notify, **p)
        ev.detected_at = now - timedelta(seconds=90 * 24 * 3600 - off)
        counts.bump("change_events", True)
    db.flush()
