from __future__ import annotations

import os
import uuid

from fastapi import APIRouter, Header, HTTPException

from core.database import db_config
from inkwise.services.ingestion_service import InkwiseIngestionService

router = APIRouter(prefix="/internal/tasks", tags=["inkwise-internal-tasks"])
ingestion_service = InkwiseIngestionService()


@router.post("/source-ingestion")
def process_source_ingestion_task(
    body: dict,
    x_inkwise_task_token: str | None = Header(default=None),
) -> dict:
    expected_token = os.getenv("TASKS_TOKEN") or os.getenv("INKWISE_TASKS_TOKEN")
    if expected_token and x_inkwise_task_token != expected_token:
        raise HTTPException(status_code=403, detail="Invalid task token")

    ingestion_id_raw = body.get("ingestion_id")
    if not ingestion_id_raw:
        raise HTTPException(status_code=400, detail="ingestion_id is required")

    try:
        ingestion_id = uuid.UUID(str(ingestion_id_raw))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid ingestion_id") from exc

    db = db_config.get_session()
    try:
        ingestion = ingestion_service.process_source_ingestion_once(db, ingestion_id=ingestion_id)
        return {
            "ok": True,
            "ingestion_id": str(ingestion.id),
            "status": ingestion.status,
        }
    finally:
        db.close()
