from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field

from taxatlas.schemas.common import ORMModel, UTCDatetimes


class JurisdictionRef(ORMModel):
    id: int
    code: str
    name: str
    level: str


class TaxRateOut(ORMModel):
    id: int
    jurisdiction_id: int
    jurisdiction: JurisdictionRef | None = None
    tax_type: str
    rate_kind: str
    rate: float | None
    threshold_amount: float | None
    threshold_currency: str | None
    description: str | None
    applies_to: str | None
    effective_from: date | None
    effective_to: date | None
    as_of: date | None
    confidence: str
    source_name: str | None
    source_url: str | None
    notes: str | None
    updated_at: datetime | None = None


class TaxRateIn(BaseModel):
    jurisdiction_code: str
    tax_type: str
    rate_kind: str
    rate: float | None = None
    threshold_amount: float | None = None
    threshold_currency: str | None = None
    description: str | None = None
    applies_to: str | None = None
    effective_from: date | None = None
    effective_to: date | None = None
    as_of: date | None = None
    confidence: str = "reported"
    source_name: str | None = None
    source_url: str | None = None
    notes: str | None = None


class RegulationOut(ORMModel):
    id: int
    jurisdiction_id: int | None
    jurisdiction: JurisdictionRef | None = None
    tax_type: str
    title: str
    summary: str | None
    authority: str | None
    doc_type: str
    status: str
    reference: str | None
    published_date: date | None
    effective_date: date | None
    source_url: str
    source_id: int | None
    tags: list | None
    # Machine translation (docs/translation.md): `lang` is the BCP-47 code of the original (null = not detected yet);
    # `*_en` carry the English rendering and are null when the original is already English.
    lang: str | None = None
    title_en: str | None = None
    summary_en: str | None = None
    first_seen_at: datetime | None = None
    last_seen_at: datetime | None = None


class RegulationDetail(RegulationOut):
    body_excerpt: str | None


class CourtDecisionOut(ORMModel):
    id: int
    jurisdiction_id: int | None
    jurisdiction: JurisdictionRef | None = None
    court: str
    case_name: str
    citation: str | None
    docket: str | None
    decision_date: date | None
    tax_types: list | None
    summary: str | None
    holding: str | None
    significance: str
    outcome: str
    source_url: str
    tags: list | None
    lang: str | None = None
    case_name_en: str | None = None
    summary_en: str | None = None
    holding_en: str | None = None
    first_seen_at: datetime | None = None


class TariffOut(ORMModel):
    id: int
    importing_jurisdiction_id: int
    importing_jurisdiction: JurisdictionRef | None = None
    partner_jurisdiction_id: int | None
    partner_jurisdiction: JurisdictionRef | None = None
    partner_scope: str | None
    hs_code: str | None
    product_description: str
    measure_type: str
    rate: float | None
    rate_text: str | None
    legal_basis: str | None
    status: str
    effective_from: date | None
    effective_to: date | None
    source_url: str | None
    notes: str | None
    lang: str | None = None
    product_description_en: str | None = None
    notes_en: str | None = None
    updated_at: datetime | None = None


class ChangeEventOut(ORMModel):
    id: int
    entity_type: str
    entity_id: int
    jurisdiction_id: int | None
    jurisdiction: JurisdictionRef | None = None
    tax_type: str | None
    change_type: str
    title: str
    title_en: str | None = None
    old_value: dict | None
    new_value: dict | None
    source_id: int | None
    detected_at: datetime


class SourceOut(ORMModel):
    id: int
    slug: str
    name: str
    url: str
    jurisdiction_id: int | None
    jurisdiction: JurisdictionRef | None = None
    tax_types: list | None
    category: str
    adapter: str
    schedule_cron: str
    enabled: bool
    authority: str | None
    authority_en: str | None = None
    last_run_at: datetime | None
    last_success_at: datetime | None
    last_status: str | None
    last_error: str | None
    items_total: int
    consecutive_failures: int


class CrawlRunOut(ORMModel):
    id: int
    source_id: int
    started_at: datetime
    finished_at: datetime | None
    status: str
    http_status: int | None
    items_found: int
    items_new: int
    items_changed: int
    error: str | None
    triggered_by: str


class StatsOverview(UTCDatetimes):
    jurisdictions: int
    countries: int
    subnational: int
    rates: int
    regulations: int
    court_decisions: int
    tariffs: int
    sources: int
    sources_enabled: int
    changes_7d: int
    changes_30d: int
    last_crawl_at: datetime | None
    by_tax_type: dict[str, int] = Field(default_factory=dict)
    by_region: dict[str, int] = Field(default_factory=dict)
