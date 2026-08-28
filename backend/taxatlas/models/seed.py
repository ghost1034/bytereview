from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column

from taxatlas.core.db import Base


class SeedRun(Base):
    """Auditable record of each successfully applied reference-data version."""

    __tablename__ = "taxatlas_seed_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    version: Mapped[str] = mapped_column(String(80), nullable=False)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    summary: Mapped[dict | None] = mapped_column(JSON)
    applied_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

