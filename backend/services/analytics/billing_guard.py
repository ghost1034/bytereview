"""Wrappers used by analytics LLM routes to enforce billing pre- and post-flight.

Routes call `preflight_check(...)` before invoking the model and
`record_call(...)` after the model responds with usage metadata. Both wrap the
existing `BillingService` so analytics flows feed the same UsageEvent table as
extraction and Form Fill.
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from services.billing_service import (
    ANALYTICS_SOURCES,
    BillingService,
    PlanLimitExceeded,
    billing_limit_http_exception,
)

logger = logging.getLogger(__name__)


def preflight_check(db: Session, user_id: str, source: str) -> None:
    """Fail fast once no token quota remains.

    True billing is recorded post-flight off real token usage; this guard just
    keeps Free users who are already over their limit from triggering calls.
    """
    if source not in ANALYTICS_SOURCES:
        logger.warning("preflight_check called with unknown source '%s'", source)

    billing = BillingService(db)
    try:
        billing.require_limit(user_id, "token", 1)
    except PlanLimitExceeded as exc:
        raise billing_limit_http_exception(exc) from exc


def record_call(
    db: Session,
    user_id: str,
    source: str,
    prompt_tokens: Optional[int],
    output_tokens: Optional[int],
    total_tokens: Optional[int] = None,
    notes: Optional[str] = None,
    operation_id: Optional[str] = None,
    product: str = "analytics",
) -> Optional[str]:
    """Record actual provider tokens as one token UsageEvent."""
    billing = BillingService(db)
    try:
        return billing.record_analytics_usage(
            user_id=user_id,
            source=source,
            prompt_tokens=prompt_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            notes=notes,
            operation_id=operation_id,
            product=product,
        )
    except PlanLimitExceeded as exc:
        raise billing_limit_http_exception(exc) from exc
