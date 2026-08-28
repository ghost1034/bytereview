from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from taxatlas.core.db import Base
from taxatlas.models.enums import JurisdictionLevel


class Jurisdiction(Base):
    __tablename__ = "taxatlas_jurisdictions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(16), unique=True, index=True)  # ISO 3166-1 alpha-2 or 3166-2 ("US-CA")
    name: Mapped[str] = mapped_column(String(120), index=True)
    level: Mapped[str] = mapped_column(String(20), default=JurisdictionLevel.COUNTRY, index=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("taxatlas_jurisdictions.id", ondelete="SET NULL"), index=True)
    region: Mapped[str | None] = mapped_column(String(60), index=True)  # Europe, North America, APAC ...
    iso_alpha3: Mapped[str | None] = mapped_column(String(3))
    iso_numeric: Mapped[str | None] = mapped_column(String(3), index=True)  # matches world-atlas feature ids
    fips: Mapped[str | None] = mapped_column(String(5), index=True)  # matches us-atlas feature ids
    currency: Mapped[str | None] = mapped_column(String(3))
    lat: Mapped[float | None] = mapped_column(Float)
    lon: Mapped[float | None] = mapped_column(Float)
    tax_authority_name: Mapped[str | None] = mapped_column(String(200))
    tax_authority_name_en: Mapped[str | None] = mapped_column(String(400))  # English rendering when not English
    tax_authority_url: Mapped[str | None] = mapped_column(String(500))
    summary: Mapped[str | None] = mapped_column(Text)
    has_subnational_taxes: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    parent: Mapped[Jurisdiction | None] = relationship(remote_side="Jurisdiction.id", back_populates="children")
    children: Mapped[list[Jurisdiction]] = relationship(back_populates="parent")

    __table_args__ = (Index("ix_taxatlas_jurisdictions_level_parent", "level", "parent_id"),)
