"""Tiny constructors shared by the seed data modules (keeps the data tables compact and diffable)."""

from __future__ import annotations

from datetime import date


def d(s: str | None) -> date | None:
    """'YYYY-MM-DD' -> date (None passthrough)."""
    if s is None:
        return None
    y, m, dd = s.split("-")
    return date(int(y), int(m), int(dd))


def rate(
    jur: str,
    tax_type: str,
    kind: str,
    value: float | None = None,
    *,
    thr: float | None = None,
    cur: str | None = None,
    frm: str | None = None,
    to: str | None = None,
    as_of: str = "2025-01-01",
    conf: str = "reported",
    src: str | None = None,
    url: str | None = None,
    desc: str | None = None,
    applies: str | None = None,
    notes: str | None = None,
    extra: dict | None = None,
) -> dict:
    """Build one TaxRate row dict. `value` is a percentage (20.0 == 20%)."""
    return {
        "jurisdiction_code": jur,
        "tax_type": tax_type,
        "rate_kind": kind,
        "rate": value,
        "threshold_amount": thr,
        "threshold_currency": cur,
        "effective_from": d(frm),
        "effective_to": d(to),
        "as_of": d(as_of),
        "confidence": conf,
        "source_name": src,
        "source_url": url,
        "description": desc,
        "applies_to": applies,
        "notes": notes,
        "extra": extra,
    }


def reg(
    jur: str | None,
    tax_type: str,
    title: str,
    summary: str,
    *,
    authority: str,
    doc_type: str,
    status: str,
    reference: str | None = None,
    published: str | None = None,
    effective: str | None = None,
    url: str,
    tags: list[str] | None = None,
) -> dict:
    return {
        "jurisdiction_code": jur,
        "tax_type": tax_type,
        "title": title,
        "summary": summary,
        "authority": authority,
        "doc_type": doc_type,
        "status": status,
        "reference": reference,
        "published_date": d(published),
        "effective_date": d(effective),
        "source_url": url,
        "tags": tags or [],
    }


def case(
    jur: str | None,
    court: str,
    name: str,
    *,
    citation: str | None = None,
    docket: str | None = None,
    decided: str | None = None,
    tax_types: list[str],
    summary: str,
    holding: str,
    significance: str = "significant",
    outcome: str,
    url: str,
    tags: list[str] | None = None,
) -> dict:
    return {
        "jurisdiction_code": jur,
        "court": court,
        "case_name": name,
        "citation": citation,
        "docket": docket,
        "decision_date": d(decided),
        "tax_types": tax_types,
        "summary": summary,
        "holding": holding,
        "significance": significance,
        "outcome": outcome,
        "source_url": url,
        "tags": tags or [],
    }


def tariff(
    importer: str,
    partner: str | None,
    product: str,
    measure: str,
    *,
    scope: str | None = None,
    hs: str | None = None,
    value: float | None = None,
    rate_text: str | None = None,
    basis: str | None = None,
    status: str = "in_force",
    frm: str | None = None,
    to: str | None = None,
    url: str | None = None,
    notes: str | None = None,
) -> dict:
    return {
        "importing_jurisdiction_code": importer,
        "partner_jurisdiction_code": partner,
        "partner_scope": scope,
        "hs_code": hs,
        "product_description": product,
        "measure_type": measure,
        "rate": value,
        "rate_text": rate_text,
        "legal_basis": basis,
        "status": status,
        "effective_from": d(frm),
        "effective_to": d(to),
        "source_url": url,
        "notes": notes,
    }
