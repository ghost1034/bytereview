from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from taxatlas.core.db import Base


class Translation(Base):
    """Machine-translation cache and billing ledger (app/services/translate.py).

    One row per distinct (target language, source text). Re-crawls, content re-detections and backfills look here
    before calling the provider, so a given string is never paid for twice. `source_chars` with `provider` is what the
    daily character budget sums over; cache hits add no rows.
    """

    __tablename__ = "taxatlas_translations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(64), unique=True)  # sha256(target + NUL + source_text)
    target_lang: Mapped[str] = mapped_column(String(8), default="en")
    source_lang: Mapped[str | None] = mapped_column(String(8))  # as detected by the provider (or heuristic)
    source_chars: Mapped[int] = mapped_column(Integer, default=0)
    translated: Mapped[str | None] = mapped_column(Text)  # NULL when the source turned out to be English already
    provider: Mapped[str] = mapped_column(String(20))  # google | parenthetical | heuristic
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (Index("ix_taxatlas_translations_provider_created", "provider", "created_at"),)
