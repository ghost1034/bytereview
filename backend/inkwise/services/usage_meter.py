"""Operation-scoped Inkwise provider usage aggregation."""

from __future__ import annotations

from contextvars import ContextVar, Token
import logging
from collections.abc import AsyncIterator
from typing import Any, Mapping, TypeVar

from sqlalchemy.orm import Session

from services.billing_service import BillingService, PlanLimitExceeded, TokenAccumulator, billing_limit_http_exception


_active: ContextVar[TokenAccumulator | None] = ContextVar("inkwise_token_accumulator", default=None)
logger = logging.getLogger(__name__)
T = TypeVar("T")


def begin_capture() -> tuple[TokenAccumulator, Token]:
    accumulator = TokenAccumulator()
    return accumulator, _active.set(accumulator)


def end_capture(token: Token) -> None:
    _active.reset(token)


def capture_usage(usage: Mapping[str, Any] | None) -> None:
    accumulator = _active.get()
    if accumulator is not None:
        accumulator.add(usage)


def preflight(db: Session, user_id: str) -> None:
    try:
        BillingService(db).require_limit(user_id, "token", 1)
    except PlanLimitExceeded as exc:
        raise billing_limit_http_exception(exc) from exc


def record_capture(
    db: Session,
    *,
    user_id: str,
    source: str,
    operation_id: str,
    accumulator: TokenAccumulator,
) -> None:
    if accumulator.total_tokens <= 0:
        logger.error(
            "billing_missing_provider_usage product=inkwise source=%s user_id=%s operation_id=%s calls_missing=%s",
            source,
            user_id,
            operation_id,
            accumulator.calls_missing_usage,
        )
        return
    BillingService(db).record_usage(
        user_id=user_id,
        product="inkwise",
        source=source,
        unit="token",
        quantity=accumulator.total_tokens,
        operation_id=operation_id,
        token_details=accumulator.token_details,
    )


async def meter_async_stream(
    stream: AsyncIterator[T],
    *,
    db: Session,
    user_id: str,
    source: str,
    operation_id: str,
) -> AsyncIterator[T]:
    accumulator, context_token = begin_capture()
    try:
        async for item in stream:
            yield item
    finally:
        end_capture(context_token)
        record_capture(
            db,
            user_id=user_id,
            source=source,
            operation_id=operation_id,
            accumulator=accumulator,
        )
