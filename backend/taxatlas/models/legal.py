from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import JSON, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from taxatlas.core.db import Base
from taxatlas.models.enums import DocType, MeasureStatus, Outcome, RegulationStatus, Significance


class Regulation(Base):
    """A statute, regulation, ruling, guidance item, or official news item about a tax rule."""

    __tablename__ = "taxatlas_regulations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    jurisdiction_id: Mapped[int | None] = mapped_column(ForeignKey("taxatlas_jurisdictions.id", ondelete="SET NULL"), index=True)
    tax_type: Mapped[str] = mapped_column(String(30), index=True)
    title: Mapped[str] = mapped_column(String(500))
    summary: Mapped[str | None] = mapped_column(Text)
    body_excerpt: Mapped[str | None] = mapped_column(Text)
    authority: Mapped[str | None] = mapped_column(String(200))  # IRS, HMRC, EU Commission ...
    doc_type: Mapped[str] = mapped_column(String(20), default=DocType.OTHER, index=True)
    status: Mapped[str] = mapped_column(String(20), default=RegulationStatus.UNKNOWN, index=True)
    reference: Mapped[str | None] = mapped_column(String(200))  # e.g. "Notice 2025-12", "Directive 2006/112/EC"
    published_date: Mapped[date | None] = mapped_column(Date, index=True)
    effective_date: Mapped[date | None] = mapped_column(Date, index=True)
    source_url: Mapped[str] = mapped_column(String(1000), unique=True)
    source_id: Mapped[int | None] = mapped_column(ForeignKey("taxatlas_sources.id", ondelete="SET NULL"), index=True)
    content_hash: Mapped[str | None] = mapped_column(String(64))
    tags: Mapped[list | None] = mapped_column(JSON)
    # Machine translation (app/services/translate.py): BCP-47 code of the original text; NULL = not yet detected.
    # *_en hold the English rendering and stay NULL when the original is already English.
    lang: Mapped[str | None] = mapped_column(String(8))
    title_en: Mapped[str | None] = mapped_column(String(2000))
    summary_en: Mapped[str | None] = mapped_column(Text)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    jurisdiction = relationship("Jurisdiction")
    source = relationship("Source")

    __table_args__ = (Index("ix_taxatlas_regulations_jur_type_date", "jurisdiction_id", "tax_type", "published_date"),)


class CourtDecision(Base):
    __tablename__ = "taxatlas_court_decisions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    jurisdiction_id: Mapped[int | None] = mapped_column(ForeignKey("taxatlas_jurisdictions.id", ondelete="SET NULL"), index=True)
    court: Mapped[str] = mapped_column(String(200), index=True)
    case_name: Mapped[str] = mapped_column(String(500))
    citation: Mapped[str | None] = mapped_column(String(200))
    docket: Mapped[str | None] = mapped_column(String(100))
    decision_date: Mapped[date | None] = mapped_column(Date, index=True)
    tax_types: Mapped[list | None] = mapped_column(JSON)  # list[TaxType]
    summary: Mapped[str | None] = mapped_column(Text)
    holding: Mapped[str | None] = mapped_column(Text)
    significance: Mapped[str] = mapped_column(String(12), default=Significance.ROUTINE, index=True)
    outcome: Mapped[str] = mapped_column(String(12), default=Outcome.PENDING)
    source_url: Mapped[str] = mapped_column(String(1000), unique=True)
    source_id: Mapped[int | None] = mapped_column(ForeignKey("taxatlas_sources.id", ondelete="SET NULL"), index=True)
    content_hash: Mapped[str | None] = mapped_column(String(64))
    tags: Mapped[list | None] = mapped_column(JSON)
    lang: Mapped[str | None] = mapped_column(String(8))  # see Regulation.lang
    case_name_en: Mapped[str | None] = mapped_column(String(2000))
    summary_en: Mapped[str | None] = mapped_column(Text)
    holding_en: Mapped[str | None] = mapped_column(Text)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    jurisdiction = relationship("Jurisdiction")
    source = relationship("Source")


class Tariff(Base):
    """A customs duty / trade measure applied by an importing jurisdiction, optionally against a partner."""

    __tablename__ = "taxatlas_tariffs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    importing_jurisdiction_id: Mapped[int] = mapped_column(
        ForeignKey("taxatlas_jurisdictions.id", ondelete="CASCADE"), index=True
    )
    partner_jurisdiction_id: Mapped[int | None] = mapped_column(
        ForeignKey("taxatlas_jurisdictions.id", ondelete="SET NULL"), index=True
    )
    partner_scope: Mapped[str | None] = mapped_column(
        String(500)
    )  # "All origins", "EU-27", "China", or a long list of origins when no single partner
    hs_code: Mapped[str | None] = mapped_column(
        String(120), index=True
    )  # HS chapter/heading(s) or short scope text; None = all goods
    product_description: Mapped[str] = mapped_column(String(500))
    measure_type: Mapped[str] = mapped_column(String(20), index=True)
    rate: Mapped[float | None] = mapped_column(Float)  # ad valorem %
    rate_text: Mapped[str | None] = mapped_column(String(200))  # specific/compound duties e.g. "$0.45/kg + 5%"
    legal_basis: Mapped[str | None] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(String(20), default=MeasureStatus.IN_FORCE, index=True)
    effective_from: Mapped[date | None] = mapped_column(Date, index=True)
    effective_to: Mapped[date | None] = mapped_column(Date)
    source_url: Mapped[str | None] = mapped_column(String(1000))
    source_id: Mapped[int | None] = mapped_column(ForeignKey("taxatlas_sources.id", ondelete="SET NULL"))
    content_hash: Mapped[str | None] = mapped_column(String(64))
    notes: Mapped[str | None] = mapped_column(Text)
    lang: Mapped[str | None] = mapped_column(String(8))  # see Regulation.lang
    product_description_en: Mapped[str | None] = mapped_column(String(2000))
    notes_en: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    importing_jurisdiction = relationship("Jurisdiction", foreign_keys=[importing_jurisdiction_id])
    partner_jurisdiction = relationship("Jurisdiction", foreign_keys=[partner_jurisdiction_id])
