from __future__ import annotations

from datetime import date

from pydantic import BaseModel

from taxatlas.schemas.common import ORMModel


class JurisdictionOut(ORMModel):
    id: int
    code: str
    name: str
    level: str
    parent_id: int | None
    region: str | None
    iso_alpha3: str | None
    iso_numeric: str | None
    fips: str | None
    currency: str | None
    lat: float | None
    lon: float | None
    tax_authority_name: str | None
    tax_authority_name_en: str | None = None  # English rendering when the name is not English (docs/translation.md)
    tax_authority_url: str | None
    has_subnational_taxes: bool
    is_active: bool
    headline: dict[str, float | None] | None = None  # only with ?include=headline
    children_count: int = 0


class JurisdictionDetail(JurisdictionOut):
    summary: str | None
    parent_code: str | None = None
    children_count: int = 0
    rates_count: int = 0
    regulations_count: int = 0
    court_decisions_count: int = 0
    tariffs_count: int = 0
    changes_30d: int = 0


class ChoroplethPoint(BaseModel):
    code: str
    name: str
    iso_numeric: str | None
    fips: str | None
    value: float | None
    label: str | None = None
    as_of: date | None = None
    effective_from: date | None = None
    source_name: str | None = None
