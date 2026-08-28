"""Write schemas for admin data maintenance. PATCH bodies are all-optional; only provided fields change."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field, HttpUrl, field_validator

from taxatlas.models import enums
from taxatlas.schemas.tax import TaxRateOut


def _enum_check(kind, value):
    if value is not None and value not in set(kind):
        raise ValueError(f"must be one of {[e.value for e in kind]}")
    return value


class RateCreate(BaseModel):
    jurisdiction_code: str = Field(min_length=2, max_length=16)
    tax_type: str
    rate_kind: str
    rate: float | None = Field(None, ge=0, le=1000)
    threshold_amount: float | None = Field(None, ge=0)
    threshold_currency: str | None = Field(None, min_length=3, max_length=3)
    description: str | None = Field(None, max_length=2000)
    applies_to: str | None = Field(None, max_length=2000)
    effective_from: date | None = None
    effective_to: date | None = None
    as_of: date | None = None
    confidence: str = enums.Confidence.REPORTED
    source_name: str | None = Field(None, max_length=200)
    source_url: str | None = Field(None, max_length=1000)
    notes: str | None = Field(None, max_length=4000)
    supersede: bool = Field(
        True,
        description="Close the currently open row for the same (jurisdiction, tax_type, rate_kind) the day before effective_from",
    )
    supersede_rate_id: int | None = Field(
        None,
        description="When several rows are open for that key (e.g. multiple reduced VAT rates), the id of the one to close",
    )

    @field_validator("tax_type")
    @classmethod
    def _tt(cls, v):
        return _enum_check(enums.TaxType, v)

    @field_validator("rate_kind")
    @classmethod
    def _rk(cls, v):
        return _enum_check(enums.RateKind, v)

    @field_validator("confidence")
    @classmethod
    def _cf(cls, v):
        return _enum_check(enums.Confidence, v)


class RateCreated(TaxRateOut):
    warnings: list[str] = Field(default_factory=list, description="Non-blocking notes, e.g. other rows left open")


class RatePatch(BaseModel):
    rate: float | None = Field(None, ge=0, le=1000)
    threshold_amount: float | None = Field(None, ge=0)
    threshold_currency: str | None = Field(None, min_length=3, max_length=3)
    description: str | None = Field(None, max_length=2000)
    applies_to: str | None = Field(None, max_length=2000)
    effective_from: date | None = None
    effective_to: date | None = None
    as_of: date | None = None
    confidence: str | None = None
    source_name: str | None = Field(None, max_length=200)
    source_url: str | None = Field(None, max_length=1000)
    notes: str | None = Field(None, max_length=4000)
    reason: str | None = Field(
        None, max_length=500, description="Why this correction was made (stored on the change event)"
    )

    @field_validator("confidence")
    @classmethod
    def _cf(cls, v):
        return _enum_check(enums.Confidence, v)


class RegulationCreate(BaseModel):
    jurisdiction_code: str | None = None
    tax_type: str
    title: str = Field(min_length=3, max_length=500)
    summary: str | None = Field(None, max_length=8000)
    body_excerpt: str | None = Field(None, max_length=20000)
    authority: str | None = Field(None, max_length=200)
    doc_type: str = enums.DocType.OTHER
    status: str = enums.RegulationStatus.UNKNOWN
    reference: str | None = Field(None, max_length=200)
    published_date: date | None = None
    effective_date: date | None = None
    source_url: HttpUrl
    tags: list[str] | None = None

    @field_validator("tax_type")
    @classmethod
    def _tt(cls, v):
        return _enum_check(enums.TaxType, v)

    @field_validator("doc_type")
    @classmethod
    def _dt(cls, v):
        return _enum_check(enums.DocType, v)

    @field_validator("status")
    @classmethod
    def _st(cls, v):
        return _enum_check(enums.RegulationStatus, v)


class RegulationPatch(BaseModel):
    jurisdiction_code: str | None = None
    tax_type: str | None = None
    title: str | None = Field(None, min_length=3, max_length=500)
    summary: str | None = Field(None, max_length=8000)
    body_excerpt: str | None = Field(None, max_length=20000)
    authority: str | None = Field(None, max_length=200)
    doc_type: str | None = None
    status: str | None = None
    reference: str | None = Field(None, max_length=200)
    published_date: date | None = None
    effective_date: date | None = None
    tags: list[str] | None = None
    reason: str | None = Field(None, max_length=500)

    @field_validator("tax_type")
    @classmethod
    def _tt(cls, v):
        return _enum_check(enums.TaxType, v)

    @field_validator("doc_type")
    @classmethod
    def _dt(cls, v):
        return _enum_check(enums.DocType, v)

    @field_validator("status")
    @classmethod
    def _st(cls, v):
        return _enum_check(enums.RegulationStatus, v)


class CourtDecisionCreate(BaseModel):
    jurisdiction_code: str | None = None
    court: str = Field(min_length=2, max_length=200)
    case_name: str = Field(min_length=3, max_length=500)
    citation: str | None = Field(None, max_length=200)
    docket: str | None = Field(None, max_length=100)
    decision_date: date | None = None
    tax_types: list[str] | None = None
    summary: str | None = Field(None, max_length=8000)
    holding: str | None = Field(None, max_length=8000)
    significance: str = enums.Significance.ROUTINE
    outcome: str = enums.Outcome.PENDING
    source_url: HttpUrl
    tags: list[str] | None = None

    @field_validator("tax_types")
    @classmethod
    def _tts(cls, v):
        for t in v or []:
            _enum_check(enums.TaxType, t)
        return v

    @field_validator("significance")
    @classmethod
    def _sg(cls, v):
        return _enum_check(enums.Significance, v)

    @field_validator("outcome")
    @classmethod
    def _oc(cls, v):
        return _enum_check(enums.Outcome, v)


class CourtDecisionPatch(BaseModel):
    jurisdiction_code: str | None = None
    court: str | None = Field(None, min_length=2, max_length=200)
    case_name: str | None = Field(None, min_length=3, max_length=500)
    citation: str | None = Field(None, max_length=200)
    docket: str | None = Field(None, max_length=100)
    decision_date: date | None = None
    tax_types: list[str] | None = None
    summary: str | None = Field(None, max_length=8000)
    holding: str | None = Field(None, max_length=8000)
    significance: str | None = None
    outcome: str | None = None
    tags: list[str] | None = None
    reason: str | None = Field(None, max_length=500)

    @field_validator("tax_types")
    @classmethod
    def _tts(cls, v):
        for t in v or []:
            _enum_check(enums.TaxType, t)
        return v

    @field_validator("significance")
    @classmethod
    def _sg(cls, v):
        return _enum_check(enums.Significance, v)

    @field_validator("outcome")
    @classmethod
    def _oc(cls, v):
        return _enum_check(enums.Outcome, v)


class TariffCreate(BaseModel):
    importing_jurisdiction_code: str
    partner_jurisdiction_code: str | None = None
    partner_scope: str | None = Field(None, max_length=500)
    hs_code: str | None = Field(None, max_length=120)
    product_description: str = Field(min_length=2, max_length=500)
    measure_type: str
    rate: float | None = Field(None, ge=0, le=1000)
    rate_text: str | None = Field(None, max_length=200)
    legal_basis: str | None = Field(None, max_length=300)
    status: str = enums.MeasureStatus.IN_FORCE
    effective_from: date | None = None
    effective_to: date | None = None
    source_url: str | None = Field(None, max_length=1000)
    notes: str | None = Field(None, max_length=4000)

    @field_validator("measure_type")
    @classmethod
    def _mt(cls, v):
        return _enum_check(enums.TariffMeasure, v)

    @field_validator("status")
    @classmethod
    def _st(cls, v):
        return _enum_check(enums.MeasureStatus, v)


class TariffPatch(BaseModel):
    partner_jurisdiction_code: str | None = None
    partner_scope: str | None = Field(None, max_length=500)
    hs_code: str | None = Field(None, max_length=120)
    product_description: str | None = Field(None, min_length=2, max_length=500)
    measure_type: str | None = None
    rate: float | None = Field(None, ge=0, le=1000)
    rate_text: str | None = Field(None, max_length=200)
    legal_basis: str | None = Field(None, max_length=300)
    status: str | None = None
    effective_from: date | None = None
    effective_to: date | None = None
    source_url: str | None = Field(None, max_length=1000)
    notes: str | None = Field(None, max_length=4000)
    reason: str | None = Field(None, max_length=500)

    @field_validator("measure_type")
    @classmethod
    def _mt(cls, v):
        return _enum_check(enums.TariffMeasure, v)

    @field_validator("status")
    @classmethod
    def _st(cls, v):
        return _enum_check(enums.MeasureStatus, v)


class JurisdictionPatch(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=120)
    region: str | None = Field(None, max_length=60)
    currency: str | None = Field(None, min_length=3, max_length=3)
    lat: float | None = Field(None, ge=-90, le=90)
    lon: float | None = Field(None, ge=-180, le=180)
    tax_authority_name: str | None = Field(None, max_length=200)
    tax_authority_url: str | None = Field(None, max_length=500)
    summary: str | None = Field(None, max_length=4000)
    has_subnational_taxes: bool | None = None
    is_active: bool | None = None
    reason: str | None = Field(None, max_length=500)
