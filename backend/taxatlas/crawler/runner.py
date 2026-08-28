"""Crawler entry point.

run_source(db, source, triggered_by) -> CrawlRun
  - fetches items via the source's adapter (rss/html/json/fixture)
  - normalizes to Regulation / CourtDecision / Tariff rows keyed by source_url
  - computes content_hash; inserts new rows, updates changed rows
  - writes ChangeEvent rows via app.services.changes.record_change (which fans out notifications)
  - records a CrawlRun with counts and status; updates Source.last_* fields

Never raises: every failure is captured on the CrawlRun (status=failed) and the Source
(consecutive_failures, last_error). Ten consecutive failures auto-disable the source.
"""

from __future__ import annotations

import logging
import re
import traceback
from collections.abc import Collection
from datetime import UTC, date, datetime, timedelta
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from taxatlas.core.config import get_settings
from taxatlas.crawler.adapters import FetchResult, RawItem, get_adapter, make_http_client
from taxatlas.crawler.classify import (
    Classification,
    classify,
    classify_tariff_status,
    extract_ad_valorem_rate,
    extract_hts_code,
    extract_partners,
    extract_rate_text,
    extract_reference,
    is_court_tax_relevant,
    is_tax_relevant,
    is_trade_measure_relevant,
)
from taxatlas.models import (
    ChangeEvent,
    ChangeType,
    CourtDecision,
    CrawlRun,
    CrawlStatus,
    EntityType,
    Jurisdiction,
    JurisdictionLevel,
    Outcome,
    Regulation,
    Significance,
    Source,
    SourceCategory,
    Tariff,
    TariffMeasure,
    TaxRate,
)
from taxatlas.services import translate as translation
from taxatlas.services.changes import content_hash, record_change

log = logging.getLogger("taxatlas.crawler")

MAX_LOG_CHARS = 20_000
AUTO_DISABLE_AFTER = 10
MAX_URL_LEN = 1000
MAX_DOCKET_LEN = 100  # CourtDecision.docket String(100); Postgres rejects longer values
MAX_CITATION_LEN = 200

_DOCKET_RX = re.compile(r"^(No\.|Docket|Slip Op\.?|[IVX]{1,4}\s?[A-Z]{1,2}\s?\d{1,4}/\d{2}$|\d{2}-\d{3,5}$)", re.I)
_TRACKING_PARAMS = ("utm_", "fbclid", "gclid", "mc_cid", "mc_eid", "_hsenc", "_hsmi", "ref_src")


def normalize_url(url: str) -> str:
    """Canonical form of a document URL for the `source_url` natural key.

    Drops the fragment and marketing/tracking query parameters (utm_*, fbclid, ...), lower-cases the scheme and host,
    and trims to MAX_URL_LEN. Listings that decorate the same document with "#main", "?utm_source=rss" or a different
    host case would otherwise create duplicate rows for one document.
    """
    url = (url or "").strip()
    try:
        parts = urlsplit(url)
    except ValueError:
        return url[:MAX_URL_LEN]
    if not parts.scheme or not parts.netloc:
        return url[:MAX_URL_LEN]
    query = parts.query
    if query:
        kept = [
            (k, v) for k, v in parse_qsl(query, keep_blank_values=True) if not k.lower().startswith(_TRACKING_PARAMS)
        ]
        query = urlencode(kept, doseq=True) if kept else ""
    out = urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path, query, ""))
    return out[:MAX_URL_LEN]


def _now() -> datetime:
    return datetime.now(UTC)


class _RunLog:
    def __init__(self) -> None:
        self.lines: list[str] = []

    def __call__(self, msg: str, *args: Any) -> None:
        text = msg % args if args else msg
        self.lines.append(f"{_now().strftime('%H:%M:%S')} {text}")
        log.info(text)

    def text(self) -> str:
        out = "\n".join(self.lines)
        if len(out) > MAX_LOG_CHARS:
            out = out[: MAX_LOG_CHARS - 40] + "\n... [log truncated]"
        return out


# --------------------------------------------------------------------------------------
# Item persistence
# --------------------------------------------------------------------------------------
def _item_hash(item: RawItem) -> str:
    return content_hash({"title": item.title, "summary": item.summary or "", "published": item.published})


def _jsonable(v: Any) -> Any:
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    if isinstance(v, (list, tuple)):
        return [_jsonable(x) for x in v]
    return v


def _diff(old: dict[str, Any], new: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """Return (old, new) restricted to keys whose values differ; values are JSON-safe."""
    o, n = {}, {}
    for k in new:
        if str(old.get(k)) != str(new.get(k)):
            o[k] = _jsonable(old.get(k))
            n[k] = _jsonable(new.get(k))
    return o, n


def _translate(db: Session, fields: dict[str, str | None]) -> tuple[str | None, dict[str, str]]:
    """Best-effort language detection + English translation of an item's text fields (docs/translation.md).

    Returns (lang, {field: english}). With TRANSLATE_PROVIDER=none only `lang` is populated. Never raises: a
    provider or wiring failure is logged and the row is left for `python -m taxatlas.crawler translate --backfill`.
    """
    try:
        return translation.get_service().translate_fields(db, fields)
    except Exception as exc:  # noqa: BLE001 — translation must never fail the crawl
        log.warning("translation skipped: %s: %s", type(exc).__name__, exc)
        return None, {}


def _apply_translation(row: Any, lang: str | None, en: dict[str, str], fields: tuple[str, ...]) -> None:
    row.lang = lang
    for f in fields:
        setattr(row, f"{f}_en", en.get(f))


_REGULATION_TEXT = ("title", "summary")
_COURT_TEXT = ("case_name", "summary", "holding")
_TARIFF_TEXT = ("product_description", "notes")


def _upsert_regulation(
    db: Session, source: Source, run: CrawlRun, item: RawItem, c: Classification, now: datetime
) -> str:
    row = db.scalar(select(Regulation).where(Regulation.source_url == item.url))
    h = _item_hash(item)
    values = {
        "title": item.title,
        "summary": item.summary,
        "doc_type": c.doc_type,
        "status": c.status,
        "reference": (item.extra.get("reference") or c.reference or None),
        "published_date": item.published,
        "tax_type": c.tax_type,
    }
    if values["reference"]:
        values["reference"] = str(values["reference"])[:200]
    if row is None:
        row = Regulation(
            jurisdiction_id=source.jurisdiction_id,
            authority=source.authority or source.name,
            body_excerpt=item.body_text,
            source_url=item.url,
            source_id=source.id,
            content_hash=h,
            tags=c.tags or None,
            first_seen_at=now,
            last_seen_at=now,
            **values,
        )
        lang, en = _translate(db, {"title": item.title, "summary": item.summary})
        _apply_translation(row, lang, en, _REGULATION_TEXT)
        db.add(row)
        db.flush()
        record_change(
            db,
            entity_type=EntityType.REGULATION,
            entity_id=row.id,
            change_type=ChangeType.CREATED,
            title=item.title,
            title_en=en.get("title"),
            jurisdiction_id=source.jurisdiction_id,
            tax_type=c.tax_type,
            new_value={
                "title": item.title,
                "doc_type": c.doc_type,
                "status": c.status,
                "reference": c.reference,
                "url": item.url,
            },
            source_id=source.id,
            crawl_run_id=run.id,
        )
        return "new"
    row.last_seen_at = now
    if row.content_hash == h:
        return "unchanged"
    old = {k: getattr(row, k) for k in values}
    old_d, new_d = _diff(old, values)
    for k, v in values.items():
        setattr(row, k, v)
    row.content_hash = h
    if item.body_text:
        row.body_excerpt = item.body_text
    lang, en = _translate(db, {"title": item.title, "summary": item.summary})  # content changed: re-detect/re-translate
    _apply_translation(row, lang, en, _REGULATION_TEXT)
    db.flush()
    change_type = ChangeType.STATUS_CHANGED if set(new_d) == {"status"} else ChangeType.UPDATED
    record_change(
        db,
        entity_type=EntityType.REGULATION,
        entity_id=row.id,
        change_type=change_type,
        title=item.title,
        title_en=en.get("title"),
        jurisdiction_id=source.jurisdiction_id,
        tax_type=row.tax_type,
        old_value=old_d or None,
        new_value=new_d or None,
        source_id=source.id,
        crawl_run_id=run.id,
    )
    return "changed"


def _upsert_court_decision(
    db: Session, source: Source, run: CrawlRun, item: RawItem, c: Classification, now: datetime
) -> str:
    cfg = source.config or {}
    court = cfg.get("court") or source.authority or source.name
    row = db.scalar(select(CourtDecision).where(CourtDecision.source_url == item.url))
    h = _item_hash(item)
    docket = item.extra.get("docket")
    if docket and len(docket) > 40:  # a meta line rather than a bare number -> pull the reference out of it
        docket = extract_reference(docket) or None
    citation = item.extra.get("citation")
    if c.reference:
        if _DOCKET_RX.match(c.reference) and not docket:
            docket = c.reference
        elif not citation:
            citation = c.reference
    docket = str(docket)[:MAX_DOCKET_LEN] if docket else None
    citation = str(citation)[:MAX_CITATION_LEN] if citation else None
    values = {
        "case_name": item.title,
        "summary": item.summary,
        "decision_date": item.published,
        "tax_types": c.tax_types,
        "significance": c.significance,
        "citation": citation,
        "docket": docket,
    }
    if row is None:
        row = CourtDecision(
            jurisdiction_id=source.jurisdiction_id,
            court=str(court)[:200],
            outcome=Outcome.PENDING,
            source_url=item.url,
            source_id=source.id,
            content_hash=h,
            tags=c.tags or None,
            first_seen_at=now,
            last_seen_at=now,
            **values,
        )
        lang, en = _translate(db, {"case_name": item.title, "summary": item.summary, "holding": None})
        _apply_translation(row, lang, en, _COURT_TEXT)
        db.add(row)
        db.flush()
        record_change(
            db,
            entity_type=EntityType.COURT_DECISION,
            entity_id=row.id,
            change_type=ChangeType.CREATED,
            title=item.title,
            title_en=en.get("case_name"),
            jurisdiction_id=source.jurisdiction_id,
            tax_type=c.tax_type,
            tax_types=c.tax_types,
            new_value={"case_name": item.title, "court": row.court, "significance": c.significance, "url": item.url},
            source_id=source.id,
            crawl_run_id=run.id,
        )
        return "new"
    row.last_seen_at = now
    if row.content_hash == h:
        if row.significance != c.significance:  # classifier tuning; no change event
            row.significance = c.significance
        return "unchanged"
    old = {k: getattr(row, k) for k in values}
    old_d, new_d = _diff(old, values)
    for k, v in values.items():
        setattr(row, k, v)
    row.content_hash = h
    lang, en = _translate(db, {"case_name": item.title, "summary": item.summary, "holding": row.holding})
    _apply_translation(row, lang, en, _COURT_TEXT)
    db.flush()
    record_change(
        db,
        entity_type=EntityType.COURT_DECISION,
        entity_id=row.id,
        change_type=ChangeType.UPDATED,
        title=item.title,
        title_en=en.get("case_name"),
        jurisdiction_id=source.jurisdiction_id,
        tax_type=c.tax_type,
        tax_types=c.tax_types,
        old_value=old_d or None,
        new_value=new_d or None,
        source_id=source.id,
        crawl_run_id=run.id,
    )
    return "changed"


_PARTNER_CACHE_ATTR = "_taxatlas_partner_cache"


def _resolve_partner(db: Session, name: str) -> int | None:
    """Map a normalized partner name to a country-level Jurisdiction id (cached per session)."""
    cache: dict[str, int | None] = db.info.setdefault(_PARTNER_CACHE_ATTR, {})
    key = name.lower()
    if key in cache:
        return cache[key]
    row = db.scalar(
        select(Jurisdiction).where(
            func.lower(Jurisdiction.name) == key,
            Jurisdiction.level.in_([JurisdictionLevel.COUNTRY, JurisdictionLevel.SUPRANATIONAL]),
        )
    )
    if row is None:
        row = db.scalar(
            select(Jurisdiction)
            .where(Jurisdiction.name.ilike(f"{name}%"), Jurisdiction.level == JurisdictionLevel.COUNTRY)
            .order_by(func.length(Jurisdiction.name))
        )
    cache[key] = row.id if row else None
    return cache[key]


def derive_tariff_fields(
    db: Session,
    title: str,
    summary: str | None,
    c: Classification,
    doc_kind: str | None = None,
    importing_jurisdiction_id: int | None = None,
) -> dict[str, Any]:
    """Derived (non-content) tariff attributes: status, measure, rate(s), partner(s), HS code, legal basis.

    Shared by the upsert path and `reclassify_tariffs` so tuning the classifier can be re-applied
    to rows already in the database.
    """
    text = f"{title} {summary or ''}"
    status = classify_tariff_status(title, default="", doc_kind=doc_kind)
    if not status and summary:
        status = classify_tariff_status(summary, default="", doc_kind=doc_kind)
    if not status:
        status = classify_tariff_status(title, doc_kind=doc_kind)  # applies doc-kind / under_review default
    partners = extract_partners(title) or extract_partners(summary or "")
    partner_id = _resolve_partner(db, partners[0]) if partners else None
    if partner_id is None:
        partners = []  # unresolved first token is almost always a company/product name, not a place
    elif partner_id == importing_jurisdiction_id:
        partner_id, partners = None, []  # "from the United States" inside a US source is not a partner
    return {
        "measure_type": c.measure_type or TariffMeasure.OTHER,
        "rate": extract_ad_valorem_rate(text),
        "rate_text": extract_rate_text(text),
        "legal_basis": (c.reference or "")[:300] or None,
        "status": status,
        "hs_code": extract_hts_code(text),
        "partner_scope": (", ".join(partners)[:200] if partners else None),
        "partner_jurisdiction_id": partner_id,
    }


def _upsert_tariff(db: Session, source: Source, run: CrawlRun, item: RawItem, c: Classification, now: datetime) -> str:
    if source.jurisdiction_id is None:
        raise ValueError("tariff sources require a jurisdiction (importing jurisdiction)")
    row = db.scalar(select(Tariff).where(Tariff.source_url == item.url))
    h = _item_hash(item)
    derived = derive_tariff_fields(
        db,
        item.title,
        item.summary,
        c,
        doc_kind=str(item.extra.get("type") or ""),
        importing_jurisdiction_id=source.jurisdiction_id,
    )
    values = {
        "product_description": item.title[:500],
        "effective_from": item.published,
        "notes": item.summary,
        **derived,
    }
    if row is None:
        row = Tariff(
            importing_jurisdiction_id=source.jurisdiction_id,
            source_url=item.url,
            source_id=source.id,
            content_hash=h,
            **values,
        )
        lang, en = _translate(db, {"product_description": values["product_description"], "notes": item.summary})
        _apply_translation(row, lang, en, _TARIFF_TEXT)
        db.add(row)
        db.flush()
        record_change(
            db,
            entity_type=EntityType.TARIFF,
            entity_id=row.id,
            change_type=ChangeType.CREATED,
            title=item.title,
            title_en=en.get("product_description"),
            jurisdiction_id=source.jurisdiction_id,
            tax_type=c.tax_type,
            new_value={
                "product_description": row.product_description,
                "measure_type": derived["measure_type"],
                "status": str(derived["status"]),
                "url": item.url,
            },
            source_id=source.id,
            crawl_run_id=run.id,
        )
        return "new"
    if row.content_hash == h:
        # Content unchanged: silently refresh derived metadata (classifier tuning), no change event.
        for k, v in derived.items():
            if getattr(row, k) != v:
                setattr(row, k, v)
        return "unchanged"
    old = {k: getattr(row, k) for k in values}
    old_d, new_d = _diff(old, values)
    for k, v in values.items():
        setattr(row, k, v)
    row.content_hash = h
    lang, en = _translate(db, {"product_description": values["product_description"], "notes": item.summary})
    _apply_translation(row, lang, en, _TARIFF_TEXT)
    db.flush()
    record_change(
        db,
        entity_type=EntityType.TARIFF,
        entity_id=row.id,
        change_type=ChangeType.STATUS_CHANGED if set(new_d) == {"status"} else ChangeType.UPDATED,
        title=item.title,
        title_en=en.get("product_description"),
        jurisdiction_id=source.jurisdiction_id,
        tax_type=c.tax_type,
        old_value=old_d or None,
        new_value=new_d or None,
        source_id=source.id,
        crawl_run_id=run.id,
    )
    return "changed"


def reclassify_tariffs(db: Session) -> dict[str, int]:
    """Re-derive status/measure/rate/partner/HS for every crawler-created Tariff row (no change events)."""
    rows = list(db.scalars(select(Tariff).where(Tariff.source_id.isnot(None))))
    sources = {s.id: s for s in db.scalars(select(Source))}
    changed_fields = 0
    changed_rows = 0
    for t in rows:
        src = sources.get(t.source_id)
        defaults = [str(x) for x in (src.tax_types or [])] if src else []
        c = classify(t.product_description, t.notes, default_tax_types=defaults, category="tariff")
        derived = derive_tariff_fields(
            db, t.product_description, t.notes, c, importing_jurisdiction_id=t.importing_jurisdiction_id
        )
        touched = False
        for k, v in derived.items():
            if getattr(t, k) != v:
                setattr(t, k, v)
                changed_fields += 1
                touched = True
        changed_rows += touched
    db.commit()
    return {"scanned": len(rows), "rows_changed": changed_rows, "fields_changed": changed_fields}


def prune_tariffs(db: Session, apply: bool = False) -> dict[str, Any]:
    """Delete crawler-created Tariff rows (source_id set) that fail is_trade_measure_relevant().

    Rows whose Source is no longer category=tariff are removed too. Their ChangeEvents are deleted
    (Notifications cascade via FK). Returns counts and the
    removed titles; with apply=False nothing is written.
    """
    rows = list(db.scalars(select(Tariff).where(Tariff.source_id.isnot(None))))
    tariff_source_ids = set(db.scalars(select(Source.id).where(Source.category == SourceCategory.TARIFF)))
    victims = [
        t
        for t in rows
        if t.source_id not in tariff_source_ids  # source re-categorised (e.g. press releases -> news)
        or not is_trade_measure_relevant(f"{t.product_description} {t.notes or ''}")
    ]
    result: dict[str, Any] = {
        "scanned": len(rows),
        "to_delete": len(victims),
        "deleted": 0,
        "events_deleted": 0,
        "titles": [v.product_description for v in victims],
    }
    if apply and victims:
        ids = [v.id for v in victims]
        evs = list(
            db.scalars(
                select(ChangeEvent).where(ChangeEvent.entity_type == EntityType.TARIFF, ChangeEvent.entity_id.in_(ids))
            )
        )
        for ev in evs:
            db.delete(ev)
        for v in victims:
            db.delete(v)
        db.commit()
        result["deleted"] = len(victims)
        result["events_deleted"] = len(evs)
    return result


def _source_tax_filter(src: Source | None) -> bool:
    """Whether the news relevance gate applies to items from this source (mirrors _process_items)."""
    if src is None:
        return False
    cfg = src.config or {}
    return bool(cfg.get("tax_filter", str(src.category) == SourceCategory.NEWS))


def prune_regulations(db: Session, apply: bool = False) -> dict[str, Any]:
    """Delete crawler-created Regulation rows that fail is_tax_relevant(strict=True) where their source applies the
    news gate (category=news or config.tax_filter). Seed/admin rows (source_id NULL) are never touched. The rows'
    ChangeEvents go too (Notifications cascade). With apply=False nothing is written."""
    rows = list(db.scalars(select(Regulation).where(Regulation.source_id.isnot(None))))
    sources = {s.id: s for s in db.scalars(select(Source))}
    victims = [
        r
        for r in rows
        if _source_tax_filter(sources.get(r.source_id))
        and not is_tax_relevant(f"{r.title} {r.summary or ''}", strict=True)
    ]
    result: dict[str, Any] = {
        "scanned": len(rows),
        "to_delete": len(victims),
        "deleted": 0,
        "events_deleted": 0,
        "titles": [f"[{sources[v.source_id].slug}] {v.title}" for v in victims],
    }
    if apply and victims:
        ids = [v.id for v in victims]
        evs = list(
            db.scalars(
                select(ChangeEvent).where(
                    ChangeEvent.entity_type == EntityType.REGULATION, ChangeEvent.entity_id.in_(ids)
                )
            )
        )
        for ev in evs:
            db.delete(ev)
        for v in victims:
            db.delete(v)
        db.commit()
        result["deleted"] = len(victims)
        result["events_deleted"] = len(evs)
    return result


_RECLASSIFY_FIELDS = ("tax_type", "doc_type", "status")


def reclassify_regulations(db: Session, apply: bool = False) -> dict[str, Any]:
    """Re-run the classifier over every crawler-created Regulation row (no change events).

    Updates tax_type / doc_type / status, fills a missing reference, and refreshes tags. Returns counts plus a
    before->after transition table per field so classifier tuning can be reviewed before --apply.
    """
    rows = list(db.scalars(select(Regulation).where(Regulation.source_id.isnot(None))))
    sources = {s.id: s for s in db.scalars(select(Source))}
    transitions: dict[str, dict[str, int]] = {f: {} for f in _RECLASSIFY_FIELDS}
    rows_changed = fields_changed = 0
    for r in rows:
        src = sources.get(r.source_id)
        c = classify(
            r.title,
            r.summary,
            default_tax_types=[str(x) for x in (src.tax_types or [])] if src else None,
            category=str(src.category) if src else "regulation",
            court=(src.config or {}).get("court") or (src.authority if src else None),
        )
        new_values = {"tax_type": c.tax_type, "doc_type": c.doc_type, "status": c.status}
        touched = False
        for field, new in new_values.items():
            old = str(getattr(r, field))
            if old != new:
                key = f"{old} -> {new}"
                transitions[field][key] = transitions[field].get(key, 0) + 1
                fields_changed += 1
                touched = True
                if apply:
                    setattr(r, field, new)
        if not r.reference and c.reference:
            fields_changed += 1
            touched = True
            if apply:
                r.reference = c.reference[:200]
        if apply and (c.tags or None) != (r.tags or None):
            r.tags = c.tags or None
        rows_changed += touched
    if apply:
        db.commit()
    else:
        db.rollback()
    return {
        "scanned": len(rows),
        "rows_changed": rows_changed,
        "fields_changed": fields_changed,
        "transitions": {f: dict(sorted(t.items(), key=lambda kv: -kv[1])) for f, t in transitions.items()},
    }


def prune_courts(db: Session, apply: bool = False) -> dict[str, Any]:
    """Delete crawler-created CourtDecision rows failing is_court_tax_relevant() (title + summary + court),
    and downgrade crawler-created 'landmark' rows to 'significant'. ChangeEvents of deleted rows go too."""
    rows = list(db.scalars(select(CourtDecision).where(CourtDecision.source_id.isnot(None))))
    victims = [
        r for r in rows if not is_court_tax_relevant(f"{r.case_name} {r.summary or ''} {r.holding or ''} {r.court}")
    ]
    victim_ids = {r.id for r in victims}
    downgrades = [r for r in rows if r.significance == Significance.LANDMARK and r.id not in victim_ids]
    result: dict[str, Any] = {
        "scanned": len(rows),
        "to_delete": len(victims),
        "deleted": 0,
        "events_deleted": 0,
        "to_downgrade": len(downgrades),
        "downgraded": 0,
        "titles": [r.case_name for r in victims],
    }
    if apply:
        if victims:
            evs = list(
                db.scalars(
                    select(ChangeEvent).where(
                        ChangeEvent.entity_type == EntityType.COURT_DECISION,
                        ChangeEvent.entity_id.in_(list(victim_ids)),
                    )
                )
            )
            for ev in evs:
                db.delete(ev)
            for r in victims:
                db.delete(r)
            result["events_deleted"] = len(evs)
            result["deleted"] = len(victims)
        for r in downgrades:
            r.significance = Significance.SIGNIFICANT
        result["downgraded"] = len(downgrades)
        db.commit()
    return result


# --------------------------------------------------------------------------------------
# Reference-rate watchers (category="rates"): observe, compare, propose — never write TaxRate rows
# --------------------------------------------------------------------------------------
RATE_TOLERANCE = 0.01
RATE_PROPOSAL_DEDUPE_DAYS = 30


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt


def _rate_label(tax_type: str, rate_kind: str) -> str:
    return f"{tax_type.replace('_', ' ')} {rate_kind.replace('_', ' ')}"


def _open_rate_proposal_exists(
    db: Session, jurisdiction_id: int, tax_type: str, rate_kind: str, value_field: str, observed: float, now: datetime
) -> bool:
    """One open proposal per (code, tax_type, rate_kind, observed value) inside the dedupe window."""
    cutoff = now - timedelta(days=RATE_PROPOSAL_DEDUPE_DAYS)
    rows = db.scalars(
        select(ChangeEvent).where(
            ChangeEvent.entity_type == EntityType.RATE,
            ChangeEvent.jurisdiction_id == jurisdiction_id,
            ChangeEvent.tax_type == tax_type,
        )
    )
    for ev in rows:
        detected = _as_utc(ev.detected_at)
        if detected is not None and detected < cutoff:
            continue
        nv = ev.new_value if isinstance(ev.new_value, dict) else {}
        meta = nv.get("_meta") if isinstance(nv.get("_meta"), dict) else {}
        if not meta.get("proposal") or nv.get("rate_kind") != rate_kind:
            continue
        if str(nv.get("value_field") or "rate") != value_field:
            continue
        try:
            if abs(float(nv.get("observed")) - observed) <= RATE_TOLERANCE:
                return True
        except (TypeError, ValueError):
            continue
    return False


def _process_rate_items(
    db: Session, source: Source, run: CrawlRun, result: FetchResult, rlog: _RunLog
) -> tuple[int, int, int, int]:
    """Compare observed rates with the database and record proposal ChangeEvents.

    For every observation (code, tax_type, rate_kind, value): look up the jurisdiction's un-expired TaxRate rows for
    that (tax_type, rate_kind). When none is within RATE_TOLERANCE of the observed value — or there is no row at all —
    record a ChangeEvent(entity_type="rate", change_type=rate_changed|created) whose new_value carries the
    observation and ``_meta.proposal = True``. No TaxRate row is created or modified here; admins apply proposals.
    Returns (found, proposals, 0, skipped).
    """
    now = _now()
    today = now.date()
    proposals = skipped = 0
    jur_cache: dict[str, Jurisdiction | None] = {}
    for item in result.items:
        ex = item.extra or {}
        code = str(ex.get("code") or "")
        tax_type = str(ex.get("tax_type") or "")
        rate_kind = str(ex.get("rate_kind") or "")
        value_field = str(ex.get("value_field") or "rate")
        try:
            observed = float(ex["value"])
        except (KeyError, TypeError, ValueError):
            skipped += 1
            continue
        if not code or not tax_type or not rate_kind:
            skipped += 1
            continue
        if code not in jur_cache:
            jur_cache[code] = db.scalar(select(Jurisdiction).where(Jurisdiction.code == code))
        jur = jur_cache[code]
        if jur is None:
            skipped += 1
            rlog("  - unknown jurisdiction %s (%s %s)", code, tax_type, rate_kind)
            continue
        rows = list(
            db.scalars(
                select(TaxRate).where(
                    TaxRate.jurisdiction_id == jur.id, TaxRate.tax_type == tax_type, TaxRate.rate_kind == rate_kind
                )
            )
        )
        live = [r for r in rows if r.effective_to is None or r.effective_to >= today]
        db_values = [getattr(r, value_field) for r in live if getattr(r, value_field, None) is not None]
        if any(abs(float(v) - observed) <= RATE_TOLERANCE for v in db_values):
            skipped += 1
            continue
        if _open_rate_proposal_exists(db, jur.id, tax_type, rate_kind, value_field, observed, now):
            skipped += 1
            continue
        current = next(
            (r for r in live if r.effective_from is None or r.effective_from <= today), live[0] if live else None
        )
        db_value = getattr(current, value_field, None) if current is not None else None
        unit = "" if value_field == "threshold_amount" else "%"
        shown_db = "none" if db_value is None else f"{float(db_value):g}{unit}"
        title = (
            f"Observed {_rate_label(tax_type, rate_kind)} {code}: {shown_db} → {observed:g}{unit} "
            f"(source: {source.name})"
        )
        record_change(
            db,
            entity_type=EntityType.RATE,
            entity_id=current.id if current is not None else 0,
            change_type=ChangeType.RATE_CHANGED if db_value is not None else ChangeType.CREATED,
            title=title,
            jurisdiction_id=jur.id,
            tax_type=tax_type,
            old_value={value_field: _jsonable(db_value), "rate_id": current.id if current is not None else None},
            new_value={
                "observed": observed,
                "rate_kind": rate_kind,
                "value_field": value_field,
                "code": code,
                "source_url": source.url,
                "source_name": source.name,
                "observed_at": ex.get("observed_at") or now.isoformat(timespec="seconds"),
                "raw": ex.get("raw"),
                "_meta": {"proposal": True},
            },
            source_id=source.id,
            crawl_run_id=run.id,
        )
        proposals += 1
        rlog("  ! proposal %s", title[:140])
    return len(result.items), proposals, 0, skipped


def _process_items(
    db: Session, source: Source, run: CrawlRun, result: FetchResult, rlog: _RunLog
) -> tuple[int, int, int, int]:
    """Persist items. Returns (found, new, changed, skipped)."""
    if str(source.category) == SourceCategory.RATES:
        return _process_rate_items(db, source, run, result, rlog)
    cfg = source.config or {}
    default_types = [str(t) for t in (source.tax_types or [])]
    category = str(source.category)
    tax_filter = bool(cfg.get("tax_filter", category == SourceCategory.NEWS))
    trade_filter = bool(cfg.get("trade_filter", category == SourceCategory.TARIFF))
    court_filter = bool(cfg.get("court_filter", category == SourceCategory.COURT))
    court_name = str(cfg.get("court") or source.authority or source.name or "")
    now = _now()
    seen: set[str] = set()
    new = changed = skipped = 0
    for item in result.items:
        if not item.url or not item.title:
            skipped += 1
            continue
        url = normalize_url(item.url)
        if url in seen:
            continue
        seen.add(url)
        item.url = url
        text = f"{item.title} {item.summary or ''}"
        if tax_filter and not is_tax_relevant(text, strict=True):
            skipped += 1
            continue
        if trade_filter and not is_trade_measure_relevant(text):
            skipped += 1
            rlog("  - not a trade measure: %s", item.title[:90])
            continue
        if court_filter and not is_court_tax_relevant(f"{text} {court_name}"):
            skipped += 1
            rlog("  - not a tax case: %s", item.title[:90])
            continue
        c = classify(
            item.title,
            item.summary,
            default_tax_types=default_types,
            category=category,
            court=cfg.get("court") or source.authority,
        )
        if category == SourceCategory.COURT:
            outcome = _upsert_court_decision(db, source, run, item, c, now)
        elif category == SourceCategory.TARIFF:
            outcome = _upsert_tariff(db, source, run, item, c, now)
        else:
            outcome = _upsert_regulation(db, source, run, item, c, now)
        if outcome == "new":
            new += 1
            rlog("  + %s [%s/%s] %s", c.tax_type, c.doc_type, c.status, item.title[:90])
        elif outcome == "changed":
            changed += 1
            rlog("  ~ %s", item.title[:90])
    return len(result.items), new, changed, skipped


# --------------------------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------------------------
def run_source(db: Session, source: Source, triggered_by: str = "scheduler", network: bool | None = None) -> CrawlRun:
    """Crawl one source. Never raises; see module docstring."""
    settings = get_settings()
    net_allowed = settings.crawler_network if network is None else network
    rlog = _RunLog()
    source_id = source.id
    run = CrawlRun(source_id=source_id, status=CrawlStatus.RUNNING, triggered_by=str(triggered_by)[:40])
    db.add(run)
    db.commit()
    run_id = run.id
    rlog("run #%s source=%s adapter=%s url=%s", run_id, source.slug, source.adapter, source.url)

    status = CrawlStatus.FAILED
    error: str | None = None
    http_status: int | None = None
    found = new = changed = skipped = 0
    result: FetchResult | None = None
    try:
        adapter = get_adapter(source)
        if adapter.name != "fixture" and not net_allowed:
            status = CrawlStatus.SKIPPED
            rlog("network disabled (CRAWLER_NETWORK=false); skipping non-fixture source")
        elif adapter.name == "browser" and not settings.browser_enabled:
            status = CrawlStatus.SKIPPED
            rlog("browser adapter disabled (BROWSER_ENABLED=false); this source belongs to the crawl-browser job")
        else:
            if adapter.name == "fixture":
                result = adapter.fetch(source, None)
            else:
                with make_http_client() as client:
                    result = adapter.fetch(source, client)
            http_status = result.http_status
            for n in result.notes:
                rlog(n)
            if result.unchanged:
                status = CrawlStatus.UNCHANGED
                rlog("HTTP 304 / unchanged — nothing to process")
            else:
                found, new, changed, skipped = _process_items(db, source, run, result, rlog)
                status = CrawlStatus.SUCCESS
                rlog("found=%s new=%s changed=%s skipped=%s", found, new, changed, skipped)
        db.flush()
    except Exception as exc:  # noqa: BLE001 — by contract we swallow everything
        db.rollback()
        status = CrawlStatus.FAILED
        for n in getattr(exc, "notes", None) or []:  # adapters may attach per-attempt notes (news provider fallbacks)
            rlog(str(n))
        error = f"{type(exc).__name__}: {exc}"[:2000]
        if isinstance(exc, httpx.HTTPStatusError):
            http_status = exc.response.status_code
        rlog("FAILED %s", error)
        log.debug("crawl failure traceback:\n%s", traceback.format_exc())
        found = new = changed = 0

    # After a rollback the ORM objects may be expired; reload by id to be safe.
    run = db.get(CrawlRun, run_id) or run
    source = db.get(Source, source_id) or source
    now = _now()
    run.status = status
    run.http_status = http_status
    run.items_found = found
    run.items_new = new
    run.items_changed = changed
    run.error = error
    run.finished_at = now
    run.log = rlog.text()

    source.last_run_at = now
    source.last_status = str(status)
    if status in (CrawlStatus.SUCCESS, CrawlStatus.UNCHANGED):
        source.last_success_at = now
        source.last_error = None
        source.consecutive_failures = 0
        source.items_total = (source.items_total or 0) + new
        if result is not None:
            if result.etag:
                source.etag = result.etag[:200]
            if result.last_modified:
                source.last_modified = result.last_modified[:100]
    elif status == CrawlStatus.FAILED:
        source.last_error = error
        source.consecutive_failures = (source.consecutive_failures or 0) + 1
        if source.consecutive_failures >= AUTO_DISABLE_AFTER and source.enabled:
            source.enabled = False
            msg = f"auto-disabled after {source.consecutive_failures} consecutive failures"
            log.warning("source %s %s", source.slug, msg)
            run.log = (run.log or "") + "\n" + msg
    try:
        db.commit()
    except Exception as exc:  # pragma: no cover - defensive
        db.rollback()
        log.exception("failed to persist crawl run %s: %s", run_id, exc)
    return run


def run_all(
    db: Session,
    triggered_by: str = "scheduler",
    only_enabled: bool = True,
    network: bool | None = None,
    adapters: Collection[str] | None = None,
) -> list[CrawlRun]:
    """Run every (enabled) source sequentially. Non-fixture adapters are skipped when network is off.

    `adapters` restricts the run to those adapter names (the browser job runs {"browser"}; the http job everything else).
    """
    stmt = select(Source).order_by(Source.id)
    if only_enabled:
        stmt = stmt.where(Source.enabled.is_(True))
    if adapters is not None:
        stmt = stmt.where(Source.adapter.in_(list(adapters)))
    sources = list(db.scalars(stmt))
    runs: list[CrawlRun] = []
    for src in sources:
        runs.append(run_source(db, src, triggered_by=triggered_by, network=network))
    return runs


STALE_RUN_MINUTES = 60


def reap_stale_runs(db: Session, older_than_minutes: int = STALE_RUN_MINUTES) -> int:
    """Mark CrawlRun rows still RUNNING after `older_than_minutes` as failed.

    A run only stays RUNNING if the process died mid-crawl (run_source otherwise always finalises the row), so on
    scheduler start these are closed with an explicit error instead of lingering forever in /sources/runs.
    Returns the number of rows reaped.
    """
    cutoff = _now() - timedelta(minutes=older_than_minutes)
    rows = list(db.scalars(select(CrawlRun).where(CrawlRun.status == CrawlStatus.RUNNING)))
    reaped = 0
    for run in rows:
        started = run.started_at
        if started is not None and started.tzinfo is None:
            started = started.replace(tzinfo=UTC)
        if started is not None and started > cutoff:
            continue
        run.status = CrawlStatus.FAILED
        run.finished_at = _now()
        run.error = "interrupted: process exited before the run finished"
        run.log = ((run.log or "") + "\nmarked failed by reap_stale_runs").strip()
        src = db.get(Source, run.source_id)
        if src is not None and src.last_status == CrawlStatus.RUNNING:
            src.last_status = str(CrawlStatus.FAILED)
        reaped += 1
    if reaped:
        db.commit()
    return reaped


__all__ = [
    "derive_tariff_fields",
    "normalize_url",
    "prune_courts",
    "prune_regulations",
    "prune_tariffs",
    "reap_stale_runs",
    "reclassify_regulations",
    "reclassify_tariffs",
    "run_all",
    "run_source",
]
