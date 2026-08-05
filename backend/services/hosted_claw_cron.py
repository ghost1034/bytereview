"""Metadata-only bridge between native Hermes cron and Hosted Claw wakes."""

from __future__ import annotations

import logging
import os
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Iterable

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models.db_models import (
    HostedClawCronOccurrence,
    HostedClawCronSchedule,
    HostedClawConfig,
    HostedClawEntitlement,
    HostedClawSlackInstallation,
    HostedClawSlackLink,
    HostedClawUsageSummary,
)
from services.hosted_claw_security import utcnow
from services.hosted_claw_service import publish_job

logger = logging.getLogger(__name__)

ACTIVE_SCHEDULE_STATES = {"scheduled"}
ACTIVE_OCCURRENCE_STATES = {"claimed", "ready", "running"}
TERMINAL_OCCURRENCE_STATES = {"completed", "failed", "unknown", "cancelled", "rejected"}


def cron_enabled() -> bool:
    return os.getenv("HOSTED_CLAW_CRON_ENABLED", "false").strip().lower() in {
        "1", "true", "yes", "on",
    }


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def reconcile_schedules(
    db: Session,
    *,
    user_id: str,
    product: str,
    snapshots: Iterable[object],
    manual_job_id: str | None = None,
    manual_request_id: str | None = None,
) -> tuple[list[str], int]:
    """Converge the metadata mirror and optionally queue one manual fire."""
    now = utcnow()
    rows = db.query(HostedClawCronSchedule).filter(
        HostedClawCronSchedule.user_id == user_id,
        HostedClawCronSchedule.product == product,
    ).with_for_update().all()
    existing = {str(row.native_job_id): row for row in rows}
    seen: set[str] = set()

    for item in snapshots:
        native_job_id = str(getattr(item, "native_job_id"))
        state = str(getattr(item, "state"))
        next_fire_at = _aware(getattr(item, "next_fire_at"))
        row = existing.get(native_job_id)
        if row is None:
            row = HostedClawCronSchedule(
                user_id=user_id,
                product=product,
                native_job_id=native_job_id,
                state=state,
                next_fire_at=next_fire_at if state == "scheduled" else None,
                last_synced_at=now,
            )
            db.add(row)
            db.flush()
            existing[native_job_id] = row
        else:
            row.state = state
            row.next_fire_at = next_fire_at if state == "scheduled" else None
            row.last_synced_at = now
        seen.add(native_job_id)

    for native_job_id, row in existing.items():
        if native_job_id not in seen:
            row.state = "removed"
            row.next_fire_at = None
            row.last_synced_at = now

    queued: list[str] = []
    if manual_job_id:
        schedule = existing.get(str(manual_job_id))
        if schedule is None or schedule.state not in {"scheduled", "paused"}:
            raise ValueError("Manual cron job is missing or terminal")
        duplicate = db.query(HostedClawCronOccurrence).filter(
            HostedClawCronOccurrence.request_key == manual_request_id
        ).first()
        if duplicate is None:
            occurrence = HostedClawCronOccurrence(
                schedule_id=schedule.id,
                user_id=user_id,
                product=product,
                native_job_id=schedule.native_job_id,
                fire_at=now,
                trigger_kind="manual",
                request_key=manual_request_id,
            )
            db.add(occurrence)
            db.flush()
            queued.append(str(occurrence.id))
    return queued, len(seen)


def dispatch_due_occurrences(db: Session, *, limit: int = 500) -> list[str]:
    """Register one occurrence per due native fire; safe under duplicate ticks."""
    if not cron_enabled():
        return []
    now = utcnow()
    active_links = db.query(HostedClawSlackLink.user_id).join(
        HostedClawSlackInstallation,
        HostedClawSlackInstallation.id == HostedClawSlackLink.installation_id,
    ).filter(
        HostedClawSlackLink.unlinked_at.is_(None),
        HostedClawSlackInstallation.status == "active",
    )
    entitled_users = db.query(HostedClawEntitlement.user_id).filter(
        HostedClawEntitlement.enabled.is_(True),
        HostedClawEntitlement.revoked_at.is_(None),
    )
    schedules = db.query(HostedClawCronSchedule).filter(
        HostedClawCronSchedule.state == "scheduled",
        HostedClawCronSchedule.next_fire_at.isnot(None),
        HostedClawCronSchedule.next_fire_at <= now,
        HostedClawCronSchedule.user_id.in_(active_links),
        HostedClawCronSchedule.user_id.in_(entitled_users),
    ).order_by(HostedClawCronSchedule.next_fire_at.asc()).limit(limit).all()
    queued: list[str] = []

    # Budget and entitlement rejection happens before Hermes claims an
    # occurrence, so it is safe to retry that same occurrence once admission
    # becomes valid again. Reusing the row preserves `(schedule, fire_at)`
    # idempotency and avoids advancing Hermes behind its back.
    rejected = db.query(HostedClawCronOccurrence).join(
        HostedClawCronSchedule,
        HostedClawCronSchedule.id == HostedClawCronOccurrence.schedule_id,
    ).filter(
        HostedClawCronOccurrence.status == "rejected",
        HostedClawCronOccurrence.error_code.in_(["budget_exhausted", "entitlement_changed"]),
        HostedClawCronSchedule.state == "scheduled",
        HostedClawCronOccurrence.user_id.in_(active_links),
        HostedClawCronOccurrence.user_id.in_(entitled_users),
    ).order_by(HostedClawCronOccurrence.fire_at.asc()).limit(limit).all()
    period = date.today().replace(day=1)
    for occurrence in rejected:
        entitlement = db.get(HostedClawEntitlement, str(occurrence.user_id))
        config = db.get(HostedClawConfig, str(occurrence.user_id))
        if (
            entitlement is None
            or config is None
            or occurrence.product not in (entitlement.allowed_products or [])
            or config.model_alias not in (entitlement.allowed_model_aliases or [])
        ):
            continue
        usage_cost = db.query(HostedClawUsageSummary.cost_usd).filter(
            HostedClawUsageSummary.user_id == occurrence.user_id,
            HostedClawUsageSummary.period_start == period,
        ).scalar() or Decimal("0")
        budget = Decimal(entitlement.monthly_budget_usd or 0)
        if budget > 0 and Decimal(usage_cost) >= budget:
            continue
        occurrence.status = "pending"
        occurrence.error_code = None
        occurrence.worker_id = None
        occurrence.runtime_id = None
        occurrence.claimed_at = None
        occurrence.ready_at = None
        occurrence.heartbeat_at = None
        occurrence.lease_expires_at = None
        occurrence.completed_at = None
        queued.append(str(occurrence.id))

    for schedule in schedules:
        entitlement = db.get(HostedClawEntitlement, str(schedule.user_id))
        if entitlement is None or schedule.product not in (entitlement.allowed_products or []):
            continue
        existing_occurrence = db.query(HostedClawCronOccurrence.id).filter(
            HostedClawCronOccurrence.schedule_id == schedule.id,
            HostedClawCronOccurrence.fire_at == schedule.next_fire_at,
        ).first()
        if existing_occurrence is not None:
            continue
        occurrence = HostedClawCronOccurrence(
            schedule_id=schedule.id,
            user_id=schedule.user_id,
            product=schedule.product,
            native_job_id=schedule.native_job_id,
            fire_at=schedule.next_fire_at,
            trigger_kind="scheduled",
        )
        try:
            with db.begin_nested():
                db.add(occurrence)
                db.flush()
        except IntegrityError:
            continue
        queued.append(str(occurrence.id))
    db.commit()
    for occurrence_id in queued:
        try:
            publish_job(occurrence_id)
        except Exception:
            # The DB is authoritative and the supervisor also polls. A later
            # dispatcher tick or interactive wake will provide another hint.
            logger.exception("hosted_cron_wake_publish_failed occurrence_id=%s", occurrence_id)
    if queued:
        logger.info("hosted_cron_due_registered count=%d", len(queued))
    return queued


def recover_expired_occurrences(db: Session, now: datetime | None = None) -> tuple[int, int]:
    """Requeue pre-Hermes claims and quarantine ambiguous native executions."""
    now = now or utcnow()
    reclaimable = db.query(HostedClawCronOccurrence).filter(
        HostedClawCronOccurrence.status.in_(["claimed", "ready"]),
        HostedClawCronOccurrence.provider_claimed_at.is_(None),
        HostedClawCronOccurrence.lease_expires_at < now,
    ).update(
        {
            HostedClawCronOccurrence.status: "pending",
            HostedClawCronOccurrence.worker_id: None,
            HostedClawCronOccurrence.runtime_id: None,
            HostedClawCronOccurrence.claimed_at: None,
            HostedClawCronOccurrence.ready_at: None,
            HostedClawCronOccurrence.lease_expires_at: None,
        },
        synchronize_session=False,
    )
    unknown = db.query(HostedClawCronOccurrence).filter(
        HostedClawCronOccurrence.status == "running",
        HostedClawCronOccurrence.provider_claimed_at.isnot(None),
        HostedClawCronOccurrence.lease_expires_at < now,
    ).update(
        {
            HostedClawCronOccurrence.status: "unknown",
            HostedClawCronOccurrence.completed_at: now,
            HostedClawCronOccurrence.error_code: "ambiguous_runtime_exit",
        },
        synchronize_session=False,
    )
    if unknown:
        logger.error("hosted_cron_unknown_executions count=%d", unknown)
    return int(reclaimable), int(unknown)


def active_slack_context(db: Session, user_id: str):
    link = db.query(HostedClawSlackLink).filter(
        HostedClawSlackLink.user_id == user_id,
        HostedClawSlackLink.unlinked_at.is_(None),
    ).first()
    installation = db.get(HostedClawSlackInstallation, link.installation_id) if link else None
    if installation is None or installation.status != "active":
        return None, None
    return link, installation


def publish_occurrences(occurrence_ids: Iterable[str]) -> None:
    for occurrence_id in occurrence_ids:
        publish_job(str(occurrence_id))
