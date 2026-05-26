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
)

logger = logging.getLogger(__name__)


def preflight_check(db: Session, user_id: str, source: str) -> None:
    """Estimate 1 page and fail-fast for users already at quota.

    True billing is recorded post-flight off real token usage; this guard just
    keeps Free users who are already over their limit from triggering calls.
    """
    if source not in ANALYTICS_SOURCES:
        logger.warning("preflight_check called with unknown source '%s'", source)

    billing = BillingService(db)
    if not billing.check_page_limit(user_id, additional_pages=1):
        raise HTTPException(
            status_code=402,
            detail="Page limit exceeded for current plan. Upgrade to continue using AI features.",
        )


def record_call(
    db: Session,
    user_id: str,
    source: str,
    prompt_tokens: Optional[int],
    output_tokens: Optional[int],
    notes: Optional[str] = None,
) -> Optional[str]:
    """Post-flight: convert token usage to pages and record a UsageEvent."""
    billing = BillingService(db)
    try:
        return billing.record_analytics_usage(
            user_id=user_id,
            source=source,
            prompt_tokens=prompt_tokens,
            output_tokens=output_tokens,
            notes=notes,
        )
    except PlanLimitExceeded:
        # User crossed the threshold during this call. The call itself already
        # ran, but we surface the limit so the UI can prompt for an upgrade.
        raise HTTPException(
            status_code=402,
            detail="This call put you over the Free plan page limit. Upgrade to continue.",
        )
