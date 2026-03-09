from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from core.database import get_db
from dependencies.auth import verify_firebase_token
from inkwise.services.document_service import InkwiseDocumentService
from inkwise.services.exporter import ExportError, render_docx, render_pdf

router = APIRouter(tags=["inkwise-export"])
document_service = InkwiseDocumentService()

_FILENAME_SAFE_RE = re.compile(r"[^a-zA-Z0-9._ -]+")


def _safe_filename(value: str) -> str:
    value = (value or "document").strip()
    value = _FILENAME_SAFE_RE.sub("", value)
    value = re.sub(r"\s+", " ", value).strip()
    if not value:
        return "document"
    return value[:120]


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
    base = _safe_filename(title)
    try:
        if type == "pdf":
            data = render_pdf(title=title, content_html=document.content_html, content_json=document.content_json)
            return Response(
                content=data,
                media_type="application/pdf",
                headers={
                    "Content-Disposition": f'attachment; filename="{base}.pdf"',
                    "Cache-Control": "no-store",
                },
            )

        data = render_docx(title=title, content_html=document.content_html, content_json=document.content_json)
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={
                "Content-Disposition": f'attachment; filename="{base}.docx"',
                "Cache-Control": "no-store",
            },
        )
    except ExportError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
