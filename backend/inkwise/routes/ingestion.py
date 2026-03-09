import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from dependencies.auth import verify_firebase_token
from inkwise.schemas import InkwiseSourceIngestionListResponse, InkwiseSourceIngestionOut
from inkwise.services.ingestion_service import InkwiseIngestionService

router = APIRouter(prefix="/source-ingestions", tags=["inkwise-ingestion"])
ingestion_service = InkwiseIngestionService()


@router.get("", response_model=InkwiseSourceIngestionListResponse)
def list_source_ingestions(
    source_id: uuid.UUID | None = None,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseSourceIngestionListResponse:
    items = ingestion_service.list_ingestions(db, user_id=token_data["uid"], source_id=source_id)
    return InkwiseSourceIngestionListResponse(
        source_id=source_id,
        ingestions=[InkwiseSourceIngestionOut.model_validate(item) for item in items],
    )


@router.get("/{ingestion_id}", response_model=InkwiseSourceIngestionOut)
def get_source_ingestion(
    ingestion_id: uuid.UUID,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseSourceIngestionOut:
    try:
        item = ingestion_service.get_ingestion_for_user(db, user_id=token_data["uid"], ingestion_id=ingestion_id)
        return InkwiseSourceIngestionOut.model_validate(item)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
