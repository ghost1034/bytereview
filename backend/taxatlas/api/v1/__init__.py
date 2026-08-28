from fastapi import APIRouter, Depends

from taxatlas.api.deps import get_principal
from taxatlas.api.v1 import (
    account,
    admin,
    changes,
    court_decisions,
    delivery,
    export,
    jurisdictions,
    map,
    rates,
    regulations,
    sources,
    stats,
    tariffs,
)
from taxatlas.models import enums

router = APIRouter(
    prefix="/api/taxatlas/v1",
    tags=["taxatlas"],
    dependencies=[Depends(get_principal)],
)

for module in (
    account,
    delivery,
    jurisdictions,
    map,
    rates,
    regulations,
    court_decisions,
    tariffs,
    changes,
    sources,
    stats,
    export,
    admin,
):
    router.include_router(module.router)


@router.get("/meta/enums", tags=["taxatlas-meta"])
def list_enums() -> dict[str, list[str]]:
    return {
        "tax_types": [item.value for item in enums.TaxType],
        "rate_kinds": [item.value for item in enums.RateKind],
        "jurisdiction_levels": [item.value for item in enums.JurisdictionLevel],
        "regulation_statuses": [item.value for item in enums.RegulationStatus],
        "doc_types": [item.value for item in enums.DocType],
        "tariff_measures": [item.value for item in enums.TariffMeasure],
        "measure_statuses": [item.value for item in enums.MeasureStatus],
        "significance": [item.value for item in enums.Significance],
        "outcomes": [item.value for item in enums.Outcome],
        "change_types": [item.value for item in enums.ChangeType],
        "entity_types": [item.value for item in enums.EntityType],
        "confidence": [item.value for item in enums.Confidence],
    }


@router.get("/meta/quickstart", tags=["taxatlas-meta"])
def quickstart() -> dict:
    return {
        "auth": "Create a read-scoped key in TaxAtlas Account, then send it as X-API-Key.",
        "examples": [
            "GET /api/taxatlas/v1/jurisdictions?level=country",
            "GET /api/taxatlas/v1/rates?tax_type=vat&rate_kind=standard",
            "GET /api/taxatlas/v1/changes",
            "GET /api/taxatlas/v1/export/snapshot?jurisdiction=DE",
        ],
        "rate_limit_headers": ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
        "docs": "/api/docs",
    }
