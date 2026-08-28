from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from taxatlas.api.deps import get_principal
from taxatlas.core.db import get_db
from taxatlas.models import ChangeEvent, CourtDecision, Jurisdiction, JurisdictionLevel, Regulation, Source, Tariff, TaxRate
from taxatlas.schemas.tax import StatsOverview

router = APIRouter(prefix="/stats", tags=["stats"], dependencies=[Depends(get_principal)])


@router.get("/overview", response_model=StatsOverview)
def overview(db: Session = Depends(get_db)):
    c = lambda m: db.scalar(select(func.count()).select_from(m)) or 0  # noqa: E731
    now = datetime.now(UTC)
    countries = (
        db.scalar(select(func.count()).select_from(Jurisdiction).where(Jurisdiction.level == JurisdictionLevel.COUNTRY))
        or 0
    )
    total_j = c(Jurisdiction)
    by_type = dict(db.execute(select(Regulation.tax_type, func.count()).group_by(Regulation.tax_type)).all())
    by_region = dict(
        db.execute(
            select(Jurisdiction.region, func.count())
            .where(Jurisdiction.level == JurisdictionLevel.COUNTRY)
            .group_by(Jurisdiction.region)
        ).all()
    )
    return StatsOverview(
        jurisdictions=total_j,
        countries=countries,
        subnational=total_j
        - countries
        - (
            db.scalar(
                select(func.count())
                .select_from(Jurisdiction)
                .where(Jurisdiction.level == JurisdictionLevel.SUPRANATIONAL)
            )
            or 0
        ),
        rates=c(TaxRate),
        regulations=c(Regulation),
        court_decisions=c(CourtDecision),
        tariffs=c(Tariff),
        sources=c(Source),
        sources_enabled=db.scalar(select(func.count()).select_from(Source).where(Source.enabled.is_(True))) or 0,
        changes_7d=db.scalar(
            select(func.count()).select_from(ChangeEvent).where(ChangeEvent.detected_at >= now - timedelta(days=7))
        )
        or 0,
        changes_30d=db.scalar(
            select(func.count()).select_from(ChangeEvent).where(ChangeEvent.detected_at >= now - timedelta(days=30))
        )
        or 0,
        last_crawl_at=db.scalar(select(func.max(Source.last_run_at))),
        by_tax_type={k or "unknown": v for k, v in by_type.items()},
        by_region={k or "unknown": v for k, v in by_region.items()},
    )
