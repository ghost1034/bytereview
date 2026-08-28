"""Encrypted user-owned TaxAtlas notification delivery records."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
import os

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, LargeBinary, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from services.encryption_service import encryption_service
from taxatlas.core.db import Base


def _encrypt_secret(value: str | None) -> bytes | None:
    if not value:
        return None
    environment = os.getenv("ENVIRONMENT", "development").lower()
    if environment in {"production", "prod"} and not encryption_service.use_kms:
        raise RuntimeError("TaxAtlas webhook secrets require Google Cloud KMS in production")
    return encryption_service.encrypt_token(value)


class DeliveryKind(StrEnum):
    WEBHOOK = "webhook"
    EMAIL = "email"


class DigestMode(StrEnum):
    INSTANT = "instant"
    DAILY = "daily"


class AttemptStatus(StrEnum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"
    DEAD = "dead"
    SKIPPED = "skipped"


class DeliveryChannel(Base):
    __tablename__ = "taxatlas_delivery_channels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(String(128), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(10))
    target: Mapped[str] = mapped_column(String(1000))
    secret_ciphertext: Mapped[bytes | None] = mapped_column(LargeBinary)
    previous_secret_ciphertext: Mapped[bytes | None] = mapped_column(LargeBinary)
    previous_secret_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    digest: Mapped[str] = mapped_column(String(10), default=DigestMode.INSTANT)
    filters: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0)
    disabled_reason: Mapped[str | None] = mapped_column(String(200))

    user = relationship("User")
    attempts: Mapped[list["DeliveryAttempt"]] = relationship(back_populates="channel", cascade="all, delete-orphan")

    @property
    def secret(self) -> str | None:
        return encryption_service.decrypt_token(self.secret_ciphertext) if self.secret_ciphertext else None

    @secret.setter
    def secret(self, value: str | None) -> None:
        self.secret_ciphertext = _encrypt_secret(value)

    @property
    def previous_secret(self) -> str | None:
        return (
            encryption_service.decrypt_token(self.previous_secret_ciphertext)
            if self.previous_secret_ciphertext
            else None
        )

    @previous_secret.setter
    def previous_secret(self, value: str | None) -> None:
        self.previous_secret_ciphertext = _encrypt_secret(value)


class DeliveryAttempt(Base):
    __tablename__ = "taxatlas_delivery_attempts"
    __table_args__ = (
        UniqueConstraint(
            "channel_id",
            "notification_id",
            "attempt_no",
            name="uq_taxatlas_delivery_attempt_chan_notif_no",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    channel_id: Mapped[int] = mapped_column(
        ForeignKey("taxatlas_delivery_channels.id", ondelete="CASCADE"), index=True
    )
    notification_id: Mapped[int] = mapped_column(
        ForeignKey("taxatlas_notifications.id", ondelete="CASCADE"), index=True
    )
    attempt_no: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(10), default=AttemptStatus.PENDING, index=True)
    http_status: Mapped[int | None] = mapped_column(Integer)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)

    channel: Mapped[DeliveryChannel] = relationship(back_populates="attempts")
    notification = relationship("Notification")
