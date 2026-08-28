from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import JSON, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from taxatlas.core.db import Base
from taxatlas.models.enums import Confidence


class TaxRate(Base):
    """One rate row per (jurisdiction, tax_type, rate_kind, effective window).

    `rate` is a percentage (20.0 == 20%). Thresholds use `threshold_amount` + `threshold_currency`.
    """

    __tablename__ = "taxatlas_tax_rates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    jurisdiction_id: Mapped[int] = mapped_column(ForeignKey("taxatlas_jurisdictions.id", ondelete="CASCADE"), index=True)
    tax_type: Mapped[str] = mapped_column(String(30), index=True)
    rate_kind: Mapped[str] = mapped_column(String(40), index=True)
    rate: Mapped[float | None] = mapped_column(Float)
    threshold_amount: Mapped[float | None] = mapped_column(Float)
    threshold_currency: Mapped[str | None] = mapped_column(String(3))
    description: Mapped[str | None] = mapped_column(Text)
    applies_to: Mapped[str | None] = mapped_column(Text)  # e.g. "Foodstuffs, books, pharmaceuticals"
    effective_from: Mapped[date | None] = mapped_column(Date, index=True)
    effective_to: Mapped[date | None] = mapped_column(Date)
    as_of: Mapped[date | None] = mapped_column(Date)
    confidence: Mapped[str] = mapped_column(String(12), default=Confidence.REPORTED)
    source_name: Mapped[str | None] = mapped_column(String(200))
    source_url: Mapped[str | None] = mapped_column(String(1000))
    notes: Mapped[str | None] = mapped_column(Text)
    extra: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    jurisdiction = relationship("Jurisdiction")

    __table_args__ = (Index("ix_taxatlas_tax_rates_lookup", "jurisdiction_id", "tax_type", "rate_kind"),)
