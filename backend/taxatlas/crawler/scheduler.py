"""APScheduler wiring: one cron job per enabled Source plus a periodic job-sync.

Design notes
- BackgroundScheduler with a 2-worker thread pool; each job opens its own SessionLocal.
- coalesce=True / max_instances=1 so a slow source never stacks up.
- misfire_grace_time=3600 so a restart within the hour still runs missed crawls.
- `refresh-jobs` every 15 min re-reads the Source table: adds new/enabled sources, removes
  disabled/deleted ones, and applies the shared daily schedule for each adapter.
- start_scheduler() must never crash app startup: missing tables or an empty registry just
  produce a scheduler with only the refresh job.
"""

from __future__ import annotations

import logging

from apscheduler.executors.pool import ThreadPoolExecutor
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import select

from taxatlas.schedules import schedule_for_adapter

log = logging.getLogger("taxatlas.crawler.scheduler")

JOB_PREFIX = "crawl:"
REFRESH_JOB_ID = "refresh-jobs"
REFRESH_MINUTES = 15
DEFAULT_CRON = "0 0 * * *"


def _job_id(source_id: int) -> str:
    return f"{JOB_PREFIX}{source_id}"


def run_source_job(source_id: int) -> None:
    """Job body: open a session, load the source, run it. Safe to call from any thread."""
    from taxatlas.core.db import SessionLocal
    from taxatlas.crawler.runner import run_source
    from taxatlas.models import Source

    with SessionLocal() as db:
        src = db.get(Source, source_id)
        if src is None:
            log.warning("scheduled source id=%s no longer exists", source_id)
            return
        if not src.enabled:
            log.info("source %s disabled; skipping scheduled run", src.slug)
            return
        run = run_source(db, src, triggered_by="scheduler")
        log.info(
            "scheduled run %s for %s -> %s (new=%s changed=%s)",
            run.id,
            src.slug,
            run.status,
            run.items_new,
            run.items_changed,
        )


def _trigger_for(cron_expr: str | None) -> CronTrigger:
    expr = (cron_expr or DEFAULT_CRON).strip()
    try:
        return CronTrigger.from_crontab(expr, timezone="UTC")
    except ValueError as exc:
        log.warning("invalid cron %r (%s); falling back to %r", expr, exc, DEFAULT_CRON)
        return CronTrigger.from_crontab(DEFAULT_CRON, timezone="UTC")


def sync_jobs(scheduler: BackgroundScheduler) -> dict[str, int]:
    """Reconcile scheduler jobs with the Source table. Returns counts for logging/tests."""
    from taxatlas.core.db import SessionLocal
    from taxatlas.models import Source

    counts = {"added": 0, "updated": 0, "removed": 0, "total": 0}
    try:
        with SessionLocal() as db:
            rows = list(db.execute(select(Source.id, Source.slug, Source.adapter, Source.enabled)))
    except Exception as exc:  # tables missing, DB down, ...
        log.warning("scheduler: could not read sources (%s); will retry in %s min", exc, REFRESH_MINUTES)
        return counts

    wanted: dict[str, tuple[int, str, str]] = {}
    for sid, slug, adapter, enabled in rows:
        schedule = schedule_for_adapter(adapter)
        if enabled and schedule is not None:
            wanted[_job_id(sid)] = (sid, slug, schedule.cron)

    existing = {j.id: j for j in scheduler.get_jobs() if j.id.startswith(JOB_PREFIX)}
    for jid, job in existing.items():
        if jid not in wanted:
            scheduler.remove_job(jid)
            counts["removed"] += 1
            log.info("scheduler: removed job %s (%s)", jid, job.name)

    for jid, (sid, slug, cron) in wanted.items():
        trigger = _trigger_for(cron)
        job = existing.get(jid)
        if job is None:
            scheduler.add_job(
                run_source_job,
                trigger=trigger,
                id=jid,
                name=f"crawl {slug}",
                args=[sid],
                replace_existing=True,
                coalesce=True,
                max_instances=1,
                misfire_grace_time=3600,
            )
            counts["added"] += 1
            log.info("scheduler: scheduled %s (%s) cron=%r", slug, jid, cron)
        elif str(job.trigger) != str(trigger):
            scheduler.reschedule_job(jid, trigger=trigger)
            counts["updated"] += 1
            log.info("scheduler: rescheduled %s cron=%r", slug, cron)
    counts["total"] = len(wanted)
    return counts


def build_scheduler() -> BackgroundScheduler:
    return BackgroundScheduler(
        executors={"default": ThreadPoolExecutor(max_workers=2)},
        job_defaults={"coalesce": True, "max_instances": 1, "misfire_grace_time": 3600},
        timezone="UTC",
    )


def reap_stale_runs_safe() -> int:
    """Close CrawlRun rows left RUNNING by a crashed worker. Never raises (missing tables, DB down)."""
    from taxatlas.core.db import SessionLocal
    from taxatlas.crawler.runner import reap_stale_runs

    try:
        with SessionLocal() as db:
            n = reap_stale_runs(db)
    except Exception as exc:  # noqa: BLE001 — startup must not fail because of housekeeping
        log.warning("scheduler: could not reap stale runs (%s)", exc)
        return 0
    if n:
        log.warning("scheduler: marked %s interrupted crawl run(s) as failed", n)
    return n


def start_scheduler() -> BackgroundScheduler:
    """Create, populate, and start the scheduler. Returns it (caller shuts it down)."""
    reap_stale_runs_safe()
    scheduler = build_scheduler()
    scheduler.add_job(
        sync_jobs,
        trigger=IntervalTrigger(minutes=REFRESH_MINUTES),
        id=REFRESH_JOB_ID,
        name="sync crawl jobs with Source table",
        args=[scheduler],
        replace_existing=True,
    )
    counts = sync_jobs(scheduler)
    # notification delivery (webhook/email) — see app/services/notifications.py
    from taxatlas.core.config import get_settings
    from taxatlas.services.notifications import dispatch_pending

    scheduler.add_job(
        dispatch_pending,
        trigger=IntervalTrigger(seconds=max(5, get_settings().notify_dispatch_interval_seconds)),
        id="notify-dispatch",
        name="deliver pending notifications (webhook/email)",
        replace_existing=True,
    )
    scheduler.start()
    log.info(
        "crawler scheduler started: %s source jobs (%s added), refresh every %s min",
        counts["total"],
        counts["added"],
        REFRESH_MINUTES,
    )
    return scheduler


__all__ = ["build_scheduler", "reap_stale_runs_safe", "run_source_job", "start_scheduler", "sync_jobs"]
