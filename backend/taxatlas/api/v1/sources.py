"""Source registry: read access for any principal; crawl triggers and enable/disable are admin-only.

Admin checks (`require_admin`) require the admin role AND, for API keys, the `admin` scope; analysts and
read-only keys receive 403. Crawls only ever fetch `Source.url` rows from the seeded registry, so the manual
trigger cannot be pointed at an arbitrary URL (no SSRF surface from this router).
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from core.runtime import is_production
from taxatlas.api.deps import get_principal, require_admin
from taxatlas.api.v1._util import enum_filter, limit_q, offset_q, paginate, resolve_jurisdiction
from taxatlas.core.db import SessionLocal, get_db
from taxatlas.cloud_jobs import job_for_adapter, start_job
from taxatlas.models import CrawlRun, CrawlStatus, Source, SourceCategory, User
from taxatlas.schemas.common import Message, Page
from taxatlas.schemas.schedules import JobScheduleOut, SourceSchedulesOut
from taxatlas.schemas.tax import CrawlRunOut, SourceOut
from taxatlas.schedules import JOB_SCHEDULES

router = APIRouter(prefix="/sources", tags=["sources"], dependencies=[Depends(get_principal)])


@router.get("", response_model=list[SourceOut])
def list_sources(
    category: str | None = Query(None, max_length=30),
    jurisdiction: str | None = Query(None, max_length=16),
    enabled: bool | None = None,
    db: Session = Depends(get_db),
):
    stmt = select(Source).options(selectinload(Source.jurisdiction))
    category = enum_filter(category, SourceCategory, "category")
    if category:
        stmt = stmt.where(Source.category == category)
    if enabled is not None:
        stmt = stmt.where(Source.enabled.is_(enabled))
    if jurisdiction:
        stmt = stmt.where(Source.jurisdiction_id == resolve_jurisdiction(db, jurisdiction).id)
    return list(db.scalars(stmt.order_by(Source.category, Source.name)))


@router.get("/runs", response_model=Page[CrawlRunOut])
def list_runs(
    source_id: int | None = Query(None, ge=1),
    status: str | None = Query(None, max_length=20),
    limit: int = limit_q(),
    offset: int = offset_q(),
    db: Session = Depends(get_db),
):
    stmt = select(CrawlRun)
    if source_id:
        stmt = stmt.where(CrawlRun.source_id == source_id)
    status = enum_filter(status, CrawlStatus, "status")
    if status:
        stmt = stmt.where(CrawlRun.status == status)
    items, total = paginate(db, stmt.order_by(CrawlRun.started_at.desc(), CrawlRun.id.desc()), limit, offset)
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/schedules", response_model=SourceSchedulesOut)
def source_schedules() -> SourceSchedulesOut:
    """Report the batch schedules shared with deployment, independently of source metadata.

    The integrated development API does not start a scheduler; local crawls are
    operator-triggered. In production these are scheduled trigger times, not a
    guarantee of execution (Cloud Run startup, running jobs, and source order apply).
    """
    automated = is_production()
    now = datetime.now(UTC)
    return SourceSchedulesOut(
        mode="cloud_run" if automated else "manual",
        jobs=[
            JobScheduleOut(
                job=schedule.job,
                adapters=list(schedule.adapters),
                schedule_cron=schedule.cron,
                timezone=schedule.timezone,
                label=schedule.label,
                next_run_at=schedule.next_run(now) if automated else None,
            )
            for schedule in JOB_SCHEDULES
        ],
    )


@router.get("/{source_id}", response_model=SourceOut)
def get_source(source_id: int, db: Session = Depends(get_db)):
    s = db.get(Source, source_id)
    if not s:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Source not found")
    return s


def _run_in_background(source_id: int, triggered_by: str) -> None:
    from taxatlas.crawler.runner import run_source

    with SessionLocal() as db:
        src = db.get(Source, source_id)
        if src:
            run_source(db, src, triggered_by=triggered_by)


def _triggered_by(admin: User) -> str:
    # Stored on CrawlRun.triggered_by (40 chars); use the stable user id rather than the email.
    return f"manual:user:{admin.id}"


@router.post("/{source_id}/crawl", response_model=Message, status_code=status.HTTP_202_ACCEPTED)
def trigger_crawl(
    source_id: int, background: BackgroundTasks, admin: User = Depends(require_admin), db: Session = Depends(get_db)
):
    s = db.get(Source, source_id)
    if not s:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Source not found")
    if is_production():
        operation = start_job(job_for_adapter(s.adapter))
        return Message(detail=f"Cloud Run crawl job started ({operation})")
    background.add_task(_run_in_background, source_id, _triggered_by(admin))
    return Message(detail=f"Crawl of '{s.slug}' queued")


@router.post("/crawl-all", response_model=Message, status_code=status.HTTP_202_ACCEPTED)
def trigger_all(background: BackgroundTasks, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if is_production():
        operations = [start_job(job) for job in ("crawl", "crawl-news", "crawl-browser", "rates-watch")]
        return Message(detail=f"Started {len(operations)} TaxAtlas Cloud Run jobs")
    ids = list(db.scalars(select(Source.id).where(Source.enabled.is_(True))))
    for sid in ids:
        background.add_task(_run_in_background, sid, _triggered_by(admin))
    return Message(detail=f"Queued {len(ids)} sources")


@router.patch("/{source_id}/toggle", response_model=SourceOut)
def toggle(source_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    s = db.get(Source, source_id)
    if not s:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Source not found")
    s.enabled = not s.enabled
    if s.enabled:
        s.consecutive_failures = 0  # re-enabling after auto-disable resets the failure counter
    db.commit()
    db.refresh(s)
    return s
