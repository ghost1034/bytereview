"""User-owned TaxAtlas records keyed by the CPAAutomation Firebase UID."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from taxatlas.core.db import Base


class ApiKey(Base):
    __tablename__ = "taxatlas_api_keys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(String(128), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    prefix: Mapped[str] = mapped_column(String(12), index=True)
    key_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    scopes: Mapped[list | None] = mapped_column(JSON)
    rate_limit_per_minute: Mapped[int] = mapped_column(Integer, default=120)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    request_count: Mapped[int] = mapped_column(Integer, default=0)

    user = relationship("User")


class WatchItem(Base):
    __tablename__ = "taxatlas_watch_items"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "jurisdiction_id",
            "tax_type",
            name="uq_taxatlas_watch_user_jur_type",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(String(128), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    jurisdiction_id: Mapped[int | None] = mapped_column(
        ForeignKey("taxatlas_jurisdictions.id", ondelete="CASCADE"), index=True
    )
    tax_type: Mapped[str | None] = mapped_column(String(30))
    include_children: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    jurisdiction = relationship("Jurisdiction")


class Notification(Base):
    __tablename__ = "taxatlas_notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(String(128), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    change_event_id: Mapped[int] = mapped_column(
        ForeignKey("taxatlas_change_events.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    change_event = relationship("ChangeEvent")

