from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from core.database import get_db
from dependencies.auth import verify_firebase_token
from inkwise.schemas import InkwiseDriveExportRequest, InkwiseDriveExportResponse
from inkwise.services.document_service import InkwiseDocumentService
from inkwise.services.exporter import ExportError, render_docx, render_pdf
from services.google_service import GoogleService

router = APIRouter(tags=["inkwise-export"])
document_service = InkwiseDocumentService()
google_service = GoogleService()

_FILENAME_SAFE_RE = re.compile(r"[^a-zA-Z0-9._ -]+")


def _safe_filename(value: str) -> str:
    value = (value or "document").strip()
    value = _FILENAME_SAFE_RE.sub("", value)
    value = re.sub(r"\s+", " ", value).strip()
    if not value:
        return "document"
    return value[:120]


def _render_document_bytes(*, type: str, title: str, content_html: str | None, content_json: dict | None) -> tuple[bytes, str, str]:
    base = _safe_filename(title)
    if type == "pdf":
        return render_pdf(title=title, content_html=content_html, content_json=content_json), f"{base}.pdf", "application/pdf"
    return (
        render_docx(title=title, content_html=content_html, content_json=content_json),
        f"{base}.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@router.get("/documents/{document_id}/export")
def export_document(
    document_id: uuid.UUID,
    type: str,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> Response:
    user_id = token_data["uid"]
    if type not in ("pdf", "docx"):
        raise HTTPException(status_code=400, detail="Invalid export type")

    try:
        document = document_service.get_document_or_404(db, user_id=user_id, document_id=document_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    title = document.title or "Untitled"
    try:
        data, filename, media_type = _render_document_bytes(
            type=type,
            title=title,
            content_html=document.content_html,
            content_json=document.content_json,
        )
        return Response(
            content=data,
            media_type=media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Cache-Control": "no-store",
            },
        )
    except ExportError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/documents/{document_id}/export:gdrive", response_model=InkwiseDriveExportResponse)
def export_document_to_drive(
    document_id: uuid.UUID,
    body: InkwiseDriveExportRequest,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseDriveExportResponse:
    user_id = token_data["uid"]
    try:
        document = document_service.get_document_or_404(db, user_id=user_id, document_id=document_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    try:
        data, filename, mime_type = _render_document_bytes(
            type=body.type,
            title=document.title or "Untitled",
            content_html=document.content_html,
            content_json=document.content_json,
        )
    except ExportError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    uploaded = google_service.upload_to_drive(
        db,
        user_id=user_id,
        file_content=data,
        filename=filename,
        mime_type=mime_type,
        folder_id=(body.folder_id or "").strip() or None,
    )
    if not uploaded:
        raise HTTPException(status_code=400, detail="Could not export document to Google Drive")
    return InkwiseDriveExportResponse(**uploaded)
