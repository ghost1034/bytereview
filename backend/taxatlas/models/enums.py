"""Shared enumerations. String enums so they serialize cleanly and survive DB round-trips."""

from __future__ import annotations

from enum import StrEnum


class JurisdictionLevel(StrEnum):
    SUPRANATIONAL = "supranational"  # e.g. EU, WTO
    COUNTRY = "country"
    STATE = "state"  # US states, Australian states, Indian states
    PROVINCE = "province"  # Canadian provinces, Chinese provinces
    TERRITORY = "territory"
    REGION = "region"  # e.g. Spanish autonomous communities, Swiss cantons
    CITY = "city"


class TaxType(StrEnum):
    VAT = "vat"
    GST = "gst"
    SALES_USE = "sales_use"
    CORPORATE_INCOME = "corporate_income"
    PERSONAL_INCOME = "personal_income"
    WITHHOLDING = "withholding"
    CAPITAL_GAINS = "capital_gains"
    DIGITAL_SERVICES = "digital_services"
    CUSTOMS_TARIFF = "customs_tariff"
    EXCISE = "excise"
    PAYROLL_SOCIAL = "payroll_social"
    PROPERTY = "property"
    TRANSFER_PRICING = "transfer_pricing"
    PILLAR_TWO = "pillar_two"  # OECD global minimum tax
    OTHER = "other"


INDIRECT_TAX_TYPES = {TaxType.VAT, TaxType.GST, TaxType.SALES_USE, TaxType.EXCISE, TaxType.CUSTOMS_TARIFF}
INCOME_TAX_TYPES = {
    TaxType.CORPORATE_INCOME,
    TaxType.PERSONAL_INCOME,
    TaxType.WITHHOLDING,
    TaxType.CAPITAL_GAINS,
    TaxType.PILLAR_TWO,
}


class RateKind(StrEnum):
    STANDARD = "standard"
    REDUCED = "reduced"
    SUPER_REDUCED = "super_reduced"
    ZERO = "zero"
    HEADLINE = "headline"  # CIT headline / combined
    FEDERAL = "federal"
    STATE_AVERAGE = "state_average"
    TOP_MARGINAL = "top_marginal"
    DIVIDENDS = "dividends"
    INTEREST = "interest"
    ROYALTIES = "royalties"
    SERVICES = "services"
    REGISTRATION_THRESHOLD = "registration_threshold"
    ECONOMIC_NEXUS_THRESHOLD = "economic_nexus_threshold"
    MINIMUM = "minimum"
    TRADE_TAX = "trade_tax"  # municipal/trade-tax burden (DE Gewerbesteuer average per Land)
    REGIONAL = "regional"  # regional surcharge/levy layered on a national tax (IT IRAP, addizionale; JP enterprise tax)
    STAMP_DUTY = "stamp_duty"  # transfer duty on property conveyance (DE GrESt, ES ITP, IN stamp duty)
    OTHER = "other"


class Confidence(StrEnum):
    VERIFIED = "verified"  # checked against primary source on as_of date
    REPORTED = "reported"  # from secondary/aggregator source
    ESTIMATED = "estimated"  # derived / approximate


class RegulationStatus(StrEnum):
    PROPOSED = "proposed"
    CONSULTATION = "consultation"
    ENACTED = "enacted"
    EFFECTIVE = "effective"
    AMENDED = "amended"
    REPEALED = "repealed"
    GUIDANCE = "guidance"
    UNKNOWN = "unknown"


class DocType(StrEnum):
    STATUTE = "statute"
    REGULATION = "regulation"
    RULING = "ruling"
    GUIDANCE = "guidance"
    DIRECTIVE = "directive"
    TREATY = "treaty"
    NEWS = "news"
    CONSULTATION = "consultation"
    OTHER = "other"


class Significance(StrEnum):
    LANDMARK = "landmark"
    SIGNIFICANT = "significant"
    ROUTINE = "routine"


class Outcome(StrEnum):
    TAXPAYER = "taxpayer"
    GOVERNMENT = "government"
    MIXED = "mixed"
    PENDING = "pending"
    REMANDED = "remanded"


class TariffMeasure(StrEnum):
    MFN = "mfn"
    PREFERENTIAL = "preferential"
    ANTIDUMPING = "antidumping"
    COUNTERVAILING = "countervailing"
    SAFEGUARD = "safeguard"
    SECTION_232 = "section_232"
    SECTION_301 = "section_301"
    IEEPA = "ieepa"
    RETALIATORY = "retaliatory"
    CBAM = "cbam"
    QUOTA = "quota"
    EXPORT_CONTROL = "export_control"
    OTHER = "other"


class MeasureStatus(StrEnum):
    PROPOSED = "proposed"
    IN_FORCE = "in_force"
    SUSPENDED = "suspended"
    EXPIRED = "expired"
    REVOKED = "revoked"
    UNDER_REVIEW = "under_review"


class SourceCategory(StrEnum):
    REGULATION = "regulation"
    COURT = "court"
    TARIFF = "tariff"
    RATES = "rates"
    NEWS = "news"


class AdapterType(StrEnum):
    RSS = "rss"
    HTML = "html"
    JSON = "json"
    FIXTURE = "fixture"
    BROWSER = "browser"  # headless Chromium renders the page, then the html selectors apply (adapters/browser.py)
    RATES_TABLE = "rates_table"  # published rate table -> observed (code, tax_type, rate_kind, value); proposals only
    NEWS = "news"  # keyword search over aggregated press via GDELT / Bing / Google News, first provider that answers (adapters/news.py)


class CrawlStatus(StrEnum):
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"
    UNCHANGED = "unchanged"  # HTTP 304


class EntityType(StrEnum):
    RATE = "rate"
    REGULATION = "regulation"
    COURT_DECISION = "court_decision"
    TARIFF = "tariff"
    JURISDICTION = "jurisdiction"


class ChangeType(StrEnum):
    CREATED = "created"
    UPDATED = "updated"
    RATE_CHANGED = "rate_changed"
    STATUS_CHANGED = "status_changed"
    REMOVED = "removed"


class UserRole(StrEnum):
    ADMIN = "admin"
    ANALYST = "analyst"
    VIEWER = "viewer"
