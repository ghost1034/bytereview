"""Signed filesystem upload/download endpoints for local development only."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, Response

from core.runtime import is_local
from services.local_storage_service import LocalStorageClient, verify_local_storage_token


router = APIRouter()


def _payload(token: str, method: str) -> dict:
    if not is_local():
        raise HTTPException(status_code=404, detail="Not found")
    try:
        return verify_local_storage_token(token, method)
    except ValueError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.put("/upload/{token}", status_code=204, include_in_schema=False)
async def upload_local_object(token: str, request: Request) -> Response:
    payload = _payload(token, "PUT")
    blob = LocalStorageClient().bucket(payload["b"]).blob(payload["o"])
    blob.upload_from_string(await request.body(), content_type=request.headers.get("content-type"))
    return Response(status_code=204)


@router.get("/download/{token}", include_in_schema=False)
async def download_local_object(token: str):
    payload = _payload(token, "GET")
    blob = LocalStorageClient().bucket(payload["b"]).blob(payload["o"])
    if not blob.exists():
        raise HTTPException(status_code=404, detail="File not found")
    disposition = "inline" if payload.get("i") else "attachment"
    filename = payload.get("f") or blob.path.name
    return FileResponse(blob.path, filename=filename, content_disposition_type=disposition)
