from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from taxatlas.core.db import Base
from taxatlas.models.enums import AdapterType, CrawlStatus, SourceCategory


class Source(Base):
    """A monitored upstream (RSS feed, HTML listing, JSON API, or offline fixture)."""

    __tablename__ = "taxatlas_sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    url: Mapped[str] = mapped_column(String(1000))
    jurisdiction_id: Mapped[int | None] = mapped_column(ForeignKey("taxatlas_jurisdictions.id", ondelete="SET NULL"), index=True)
    tax_types: Mapped[list | None] = mapped_column(JSON)  # default tax types for items from this source
    category: Mapped[str] = mapped_column(String(20), default=SourceCategory.REGULATION, index=True)
    adapter: Mapped[str] = mapped_column(String(20), default=AdapterType.RSS)
    config: Mapped[dict | None] = mapped_column(JSON)  # adapter-specific (CSS selectors, json paths, fixture file)
    schedule_cron: Mapped[str] = mapped_column(String(60), default="0 */6 * * *")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    authority: Mapped[str | None] = mapped_column(String(200))
    authority_en: Mapped[str | None] = mapped_column(String(400))  # English rendering when `authority` is not English
    etag: Mapped[str | None] = mapped_column(String(200))
    last_modified: Mapped[str | None] = mapped_column(String(100))
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_status: Mapped[str | None] = mapped_column(String(12))
    last_error: Mapped[str | None] = mapped_column(Text)
    items_total: Mapped[int] = mapped_column(Integer, default=0)
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    jurisdiction = relationship("Jurisdiction")
    runs: Mapped[list[CrawlRun]] = relationship(back_populates="source", cascade="all, delete-orphan")


class CrawlRun(Base):
    __tablename__ = "taxatlas_crawl_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("taxatlas_sources.id", ondelete="CASCADE"), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(12), default=CrawlStatus.RUNNING)
    http_status: Mapped[int | None] = mapped_column(Integer)
    items_found: Mapped[int] = mapped_column(Integer, default=0)
    items_new: Mapped[int] = mapped_column(Integer, default=0)
    items_changed: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text)
    triggered_by: Mapped[str] = mapped_column(String(40), default="scheduler")  # scheduler | manual:<user> | cli
    log: Mapped[str | None] = mapped_column(Text)

    source: Mapped[Source] = relationship(back_populates="runs")


class ChangeEvent(Base):
    """Audit trail of every detected change; drives the Changes feed and user notifications."""

    __tablename__ = "taxatlas_change_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(20), index=True)
    entity_id: Mapped[int] = mapped_column(Integer, index=True)
    jurisdiction_id: Mapped[int | None] = mapped_column(ForeignKey("taxatlas_jurisdictions.id", ondelete="SET NULL"), index=True)
    tax_type: Mapped[str | None] = mapped_column(String(30), index=True)
    change_type: Mapped[str] = mapped_column(String(20), index=True)
    title: Mapped[str] = mapped_column(String(500))
    title_en: Mapped[str | None] = mapped_column(
        String(2000)
    )  # mirrors the entity's *_en when the title is not English
    old_value: Mapped[dict | None] = mapped_column(JSON)
    new_value: Mapped[dict | None] = mapped_column(JSON)
    source_id: Mapped[int | None] = mapped_column(ForeignKey("taxatlas_sources.id", ondelete="SET NULL"))
    crawl_run_id: Mapped[int | None] = mapped_column(ForeignKey("taxatlas_crawl_runs.id", ondelete="SET NULL"))
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    jurisdiction = relationship("Jurisdiction")
    source = relationship("Source")

    __table_args__ = (Index("ix_taxatlas_change_events_jur_detected", "jurisdiction_id", "detected_at"),)
