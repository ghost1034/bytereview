"""Bulk data in/out: CSV export (manager+), CSV import with dry-run (manager+), import job history."""

from __future__ import annotations

import csv
import io
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import PlainTextResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.common import get_or_404, paginate, user_names
from app.core.audit import record
from app.core.db import get_db
from app.core.deps import at_least
from app.models import ImportJob, User
from app.schemas import Page
from app.services import exporter, importer

router = APIRouter(tags=["data"])
ExportEntity = Literal["accounts", "contacts", "leads", "opportunities", "engagements", "activities"]
ImportEntity = Literal["accounts", "contacts", "leads"]


class ImportJobOut(BaseModel):
    id: int
    entity: str
    filename: str
    dry_run: bool
    status: str
    total_rows: int
    created_rows: int
    updated_rows: int
    skipped_rows: int
    exceptions: list[dict]
    actor_id: int | None
    actor_name: str | None = None
    created_at: str


def _out(db: Session, jobs: list[ImportJob]) -> list[ImportJobOut]:
    un = user_names(db, [j.actor_id for j in jobs])
    return [ImportJobOut(id=j.id, entity=j.entity, filename=j.filename, dry_run=j.dry_run, status=j.status, total_rows=j.total_rows,
                         created_rows=j.created_rows, updated_rows=j.updated_rows, skipped_rows=j.skipped_rows, exceptions=j.exceptions or [],
                         actor_id=j.actor_id, actor_name=un.get(j.actor_id), created_at=j.created_at.isoformat()) for j in jobs]


@router.get("/export/{entity}.csv")
def export_csv(entity: ExportEntity, include_archived: bool = False, db: Session = Depends(get_db), actor: User = Depends(at_least("manager"))):
    n = exporter.count(db, entity, include_archived, user=actor)
    record(db, actor_id=actor.id, action=f"export.{entity}", entity_type="export", entity_id=None, after={"rows": n, "include_archived": include_archived})
    db.commit()
    return StreamingResponse(exporter.stream(db, entity, include_archived=include_archived, user=actor), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{entity}.csv"', "Cache-Control": "no-store"})


@router.get("/import/template/{entity}.csv", response_class=PlainTextResponse)
def import_template(entity: ImportEntity, _: User = Depends(at_least("manager"))):
    return PlainTextResponse(importer.template_csv(entity), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{entity}-template.csv"'})


@router.post("/import/{entity}", response_model=ImportJobOut)
async def import_csv(entity: ImportEntity, file: UploadFile = File(...), dry_run: bool = Form(True),
                     db: Session = Depends(get_db), actor: User = Depends(at_least("manager"))):
    raw = await file.read()
    job = importer.run(db, entity, file.filename or "upload.csv", raw, dry_run=dry_run, actor=actor)
    return _out(db, [job])[0]


@router.get("/import/jobs", response_model=Page[ImportJobOut])
def import_jobs(limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0), db: Session = Depends(get_db), _: User = Depends(at_least("manager"))):
    rows, total = paginate(db, select(ImportJob).order_by(ImportJob.created_at.desc(), ImportJob.id.desc()), limit, offset)
    return Page(items=_out(db, rows), total=total, limit=limit, offset=offset)


@router.get("/import/jobs/{job_id}/exceptions.csv")
def import_exceptions(job_id: int, db: Session = Depends(get_db), _: User = Depends(at_least("manager"))):
    job = get_or_404(db, ImportJob, job_id)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["row", "field", "message", "data"])
    for e in job.exceptions or []:
        w.writerow([e.get("row"), e.get("field") or "", e.get("message"), "; ".join(f"{k}={v}" for k, v in (e.get("data") or {}).items())])
    return PlainTextResponse(buf.getvalue(), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="import-{job_id}-exceptions.csv"'})
