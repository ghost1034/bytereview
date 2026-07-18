"""Routes for the E-Signature (esign) feature.

Sender routes are authorized by envelope ownership (envelope.user_id == uid).
Signer routes are authorized by matching the authenticated (MFA-enforced)
account email against esign_recipients — signer identity verification comes
from the platform's phone-MFA login, recorded in the audit trail.
"""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel, ValidationError

from dependencies.auth import verify_firebase_token
from models.esign import (
    EsignAuditTrailResponse,
    EsignConsentResponse,
    EsignDeclineRequest,
    EsignDownloadResponse,
    EsignEnvelopeCreateResponse,
    EsignEnvelopeListResponse,
    EsignEnvelopeResponse,
    EsignEnvelopeUpdateRequest,
    EsignFieldsReplaceRequest,
    EsignInboxResponse,
    EsignProgressRequest,
    EsignProgressResponse,
    EsignRecipientsReplaceRequest,
    EsignSigningSessionResponse,
    EsignSubmitRequest,
    EsignSubmitResponse,
    EsignTemplateListResponse,
    EsignTemplateResponse,
    EsignTemplateRoleInput,
    EsignTemplateUpdateRequest,
    EsignVerifyResponse,
    EsignVoidRequest,
)
from services.esign.audit_service import extract_request_meta
from services.esign.envelope_service import (
    EsignConflict,
    EsignError,
    EsignNotFound,
    esign_envelope_service,
)
from services.esign.signing_service import esign_signing_service
from services.esign.verification_service import esign_verification_service

logger = logging.getLogger(__name__)

router = APIRouter()


def _uid(token: dict) -> str:
    return token["uid"]


def _email(token: dict) -> str:
    email = token.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="User email not found in token")
    return email


def _raise_http(exc: Exception) -> None:
    """Map domain errors to HTTP status codes."""
    if isinstance(exc, EsignNotFound):
        raise HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, EsignConflict):
        raise HTTPException(status_code=409, detail=str(exc))
    if isinstance(exc, PermissionError):
        raise HTTPException(status_code=403, detail=str(exc))
    if isinstance(exc, (EsignError, ValueError)):
        raise HTTPException(status_code=400, detail=str(exc))
    logger.exception("Unhandled esign error")
    raise HTTPException(status_code=500, detail="Internal error")


async def _read_uploads(files: list[UploadFile] | None) -> list[tuple[str, bytes]]:
    result = []
    for f in files or []:
        content = await f.read()
        result.append((f.filename or "document.pdf", content))
    return result


# ---------------------------------------------------------------------------
# Templates (sender)
# ---------------------------------------------------------------------------


@router.post("/templates", response_model=EsignTemplateResponse)
async def create_template(
    name: str = Form(...),
    description: str | None = Form(default=None),
    title: str | None = Form(default=None),
    message: str | None = Form(default=None),
    signing_type: str | None = Form(default=None),
    recipient_roles: str | None = Form(default=None),  # JSON array
    files: list[UploadFile] = File(...),
    token: dict = Depends(verify_firebase_token),
):
    try:
        roles: list[EsignTemplateRoleInput] = []
        if recipient_roles:
            try:
                roles = [EsignTemplateRoleInput(**r) for r in json.loads(recipient_roles)]
            except (json.JSONDecodeError, ValidationError, TypeError) as exc:
                raise EsignError(f"Invalid recipient_roles: {exc}")
        return await esign_envelope_service.create_template(
            user_id=_uid(token),
            name=name,
            description=description,
            title=title,
            message=message,
            signing_type=signing_type,
            recipient_roles=roles,
            files=await _read_uploads(files),
        )
    except Exception as exc:
        _raise_http(exc)


@router.get("/templates", response_model=EsignTemplateListResponse)
async def list_templates(token: dict = Depends(verify_firebase_token)):
    return EsignTemplateListResponse(templates=esign_envelope_service.list_templates(_uid(token)))


@router.get("/templates/{template_id}", response_model=EsignTemplateResponse)
async def get_template(template_id: str, token: dict = Depends(verify_firebase_token)):
    try:
        return esign_envelope_service.get_template(_uid(token), template_id)
    except Exception as exc:
        _raise_http(exc)


@router.put("/templates/{template_id}", response_model=EsignTemplateResponse)
async def update_template(
    template_id: str,
    payload: EsignTemplateUpdateRequest,
    token: dict = Depends(verify_firebase_token),
):
    try:
        return esign_envelope_service.update_template(
            _uid(token),
            template_id,
            name=payload.name,
            description=payload.description,
            title=payload.title,
            message=payload.message,
            signing_type=payload.signing_type,
            recipient_roles=payload.recipient_roles,
            fields=payload.fields,
        )
    except Exception as exc:
        _raise_http(exc)


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str, token: dict = Depends(verify_firebase_token)):
    try:
        esign_envelope_service.delete_template(_uid(token), template_id)
        return {"message": "Template deleted"}
    except Exception as exc:
        _raise_http(exc)


@router.get(
    "/templates/{template_id}/documents/{document_id}/download",
    response_model=EsignDownloadResponse,
)
async def download_template_document(
    template_id: str, document_id: str, token: dict = Depends(verify_firebase_token)
):
    try:
        return await esign_envelope_service.get_template_document_download(
            _uid(token), template_id, document_id
        )
    except Exception as exc:
        _raise_http(exc)


# ---------------------------------------------------------------------------
# Envelopes (sender)
# ---------------------------------------------------------------------------


@router.post("/envelopes", response_model=EsignEnvelopeCreateResponse)
async def create_envelope(
    request: Request,
    title: str | None = Form(default=None),
    message: str | None = Form(default=None),
    signing_type: str | None = Form(default=None),
    expires_in_days: int | None = Form(default=None),
    reminder_interval_hours: int | None = Form(default=None),
    template_id: str | None = Form(default=None),
    files: list[UploadFile] | None = File(default=None),
    token: dict = Depends(verify_firebase_token),
):
    try:
        envelope = await esign_envelope_service.create_envelope(
            user_id=_uid(token),
            user_email=_email(token),
            title=title,
            message=message,
            signing_type=signing_type,
            files=await _read_uploads(files),
            template_id=template_id,
            expires_in_days=expires_in_days,
            reminder_interval_hours=reminder_interval_hours,
            meta=extract_request_meta(request, token),
        )
        return EsignEnvelopeCreateResponse(envelope=envelope)
    except Exception as exc:
        _raise_http(exc)


@router.get("/envelopes", response_model=EsignEnvelopeListResponse)
async def list_envelopes(
    token: dict = Depends(verify_firebase_token),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None),
):
    try:
        return esign_envelope_service.list_envelopes(
            _uid(token), limit=limit, offset=offset, status=status
        )
    except Exception as exc:
        _raise_http(exc)


@router.get("/envelopes/{envelope_id}", response_model=EsignEnvelopeResponse)
async def get_envelope(envelope_id: str, token: dict = Depends(verify_firebase_token)):
    try:
        return esign_envelope_service.get_envelope(_uid(token), envelope_id)
    except Exception as exc:
        _raise_http(exc)


@router.delete("/envelopes/{envelope_id}")
async def delete_envelope(envelope_id: str, token: dict = Depends(verify_firebase_token)):
    """Hard-delete a draft envelope. Sent envelopes must be voided instead."""
    try:
        await esign_envelope_service.delete_envelope(_uid(token), envelope_id)
        return {"message": "Envelope deleted"}
    except Exception as exc:
        _raise_http(exc)


@router.put("/envelopes/{envelope_id}", response_model=EsignEnvelopeResponse)
async def update_envelope(
    envelope_id: str,
    payload: EsignEnvelopeUpdateRequest,
    token: dict = Depends(verify_firebase_token),
):
    try:
        return esign_envelope_service.update_envelope(_uid(token), envelope_id, payload)
    except Exception as exc:
        _raise_http(exc)


@router.post("/envelopes/{envelope_id}/documents", response_model=EsignEnvelopeResponse)
async def add_documents(
    envelope_id: str,
    files: list[UploadFile] = File(...),
    token: dict = Depends(verify_firebase_token),
):
    """Attach additional PDFs to a draft envelope."""
    try:
        return await esign_envelope_service.add_documents(
            _uid(token), envelope_id, await _read_uploads(files)
        )
    except Exception as exc:
        _raise_http(exc)


@router.delete("/envelopes/{envelope_id}/documents/{document_id}", response_model=EsignEnvelopeResponse)
async def delete_document(
    envelope_id: str,
    document_id: str,
    token: dict = Depends(verify_firebase_token),
):
    """Remove a document (and any fields placed on it) from a draft envelope."""
    try:
        return await esign_envelope_service.delete_document(_uid(token), envelope_id, document_id)
    except Exception as exc:
        _raise_http(exc)


@router.put("/envelopes/{envelope_id}/recipients", response_model=EsignEnvelopeResponse)
async def replace_recipients(
    envelope_id: str,
    payload: EsignRecipientsReplaceRequest,
    template_id: str | None = Query(default=None),
    token: dict = Depends(verify_firebase_token),
):
    """Replace the draft's recipients. Pass template_id to materialize the
    template's fields onto the new recipients (send-from-template flow)."""
    try:
        return esign_envelope_service.replace_recipients(
            _uid(token), envelope_id, payload.recipients, template_id=template_id
        )
    except Exception as exc:
        _raise_http(exc)


@router.put("/envelopes/{envelope_id}/fields", response_model=EsignEnvelopeResponse)
async def replace_fields(
    envelope_id: str,
    payload: EsignFieldsReplaceRequest,
    token: dict = Depends(verify_firebase_token),
):
    try:
        return esign_envelope_service.replace_fields(_uid(token), envelope_id, payload.fields)
    except Exception as exc:
        _raise_http(exc)


@router.post("/envelopes/{envelope_id}/send", response_model=EsignEnvelopeResponse)
async def send_envelope(
    envelope_id: str,
    request: Request,
    token: dict = Depends(verify_firebase_token),
):
    try:
        return await esign_signing_service.send_envelope(
            user_id=_uid(token),
            user_email=_email(token),
            envelope_id=envelope_id,
            meta=extract_request_meta(request, token),
        )
    except Exception as exc:
        _raise_http(exc)


@router.post("/envelopes/{envelope_id}/void", response_model=EsignEnvelopeResponse)
async def void_envelope(
    envelope_id: str,
    payload: EsignVoidRequest,
    request: Request,
    token: dict = Depends(verify_firebase_token),
):
    try:
        return await esign_signing_service.void_envelope(
            user_id=_uid(token),
            user_email=_email(token),
            envelope_id=envelope_id,
            reason=payload.reason,
            meta=extract_request_meta(request, token),
        )
    except Exception as exc:
        _raise_http(exc)


@router.post("/envelopes/{envelope_id}/remind")
async def remind_envelope(
    envelope_id: str,
    request: Request,
    token: dict = Depends(verify_firebase_token),
):
    try:
        return await esign_signing_service.send_reminders(
            user_id=_uid(token),
            user_email=_email(token),
            envelope_id=envelope_id,
            meta=extract_request_meta(request, token),
        )
    except Exception as exc:
        _raise_http(exc)


class _SaveAsTemplateRequest(BaseModel):
    name: str
    description: str | None = None


@router.post("/envelopes/{envelope_id}/save-as-template", response_model=EsignTemplateResponse)
async def save_envelope_as_template(
    envelope_id: str,
    payload: _SaveAsTemplateRequest,
    token: dict = Depends(verify_firebase_token),
):
    try:
        return await esign_envelope_service.save_envelope_as_template(
            _uid(token), envelope_id, name=payload.name, description=payload.description
        )
    except Exception as exc:
        _raise_http(exc)


@router.get("/envelopes/{envelope_id}/audit", response_model=EsignAuditTrailResponse)
async def get_audit_trail(envelope_id: str, token: dict = Depends(verify_firebase_token)):
    try:
        return esign_envelope_service.get_audit_trail(_uid(token), envelope_id)
    except Exception as exc:
        _raise_http(exc)


@router.get(
    "/envelopes/{envelope_id}/documents/{document_id}/download",
    response_model=EsignDownloadResponse,
)
async def download_envelope_document(
    envelope_id: str, document_id: str, token: dict = Depends(verify_firebase_token)
):
    try:
        return await esign_envelope_service.get_document_download(
            _uid(token), envelope_id, document_id
        )
    except Exception as exc:
        _raise_http(exc)


@router.get("/envelopes/{envelope_id}/sealed/download", response_model=EsignDownloadResponse)
async def download_sealed_document(envelope_id: str, token: dict = Depends(verify_firebase_token)):
    try:
        return await esign_envelope_service.get_sealed_download(
            _uid(token), _email(token), envelope_id
        )
    except Exception as exc:
        _raise_http(exc)


@router.get("/envelopes/{envelope_id}/certificate/download", response_model=EsignDownloadResponse)
async def download_certificate(envelope_id: str, token: dict = Depends(verify_firebase_token)):
    try:
        return await esign_envelope_service.get_certificate_download(
            _uid(token), _email(token), envelope_id
        )
    except Exception as exc:
        _raise_http(exc)


# ---------------------------------------------------------------------------
# Signer routes
# ---------------------------------------------------------------------------


@router.get("/inbox", response_model=EsignInboxResponse)
async def get_inbox(token: dict = Depends(verify_firebase_token)):
    try:
        return esign_signing_service.get_inbox(user_id=_uid(token), user_email=_email(token))
    except Exception as exc:
        _raise_http(exc)


@router.get("/sign/{envelope_id}", response_model=EsignSigningSessionResponse)
async def get_signing_session(
    envelope_id: str,
    request: Request,
    token: dict = Depends(verify_firebase_token),
):
    try:
        return await esign_signing_service.get_signing_session(
            user_id=_uid(token),
            user_email=_email(token),
            envelope_id=envelope_id,
            meta=extract_request_meta(request, token),
        )
    except Exception as exc:
        _raise_http(exc)


@router.post("/sign/{envelope_id}/consent", response_model=EsignConsentResponse)
async def record_consent(
    envelope_id: str,
    request: Request,
    token: dict = Depends(verify_firebase_token),
):
    try:
        return esign_signing_service.record_consent(
            user_id=_uid(token),
            user_email=_email(token),
            envelope_id=envelope_id,
            meta=extract_request_meta(request, token),
        )
    except Exception as exc:
        _raise_http(exc)


@router.put("/sign/{envelope_id}/progress", response_model=EsignProgressResponse)
async def save_signing_progress(
    envelope_id: str,
    payload: EsignProgressRequest,
    token: dict = Depends(verify_firebase_token),
):
    """Finish Later: save the signer's in-progress text/checkbox entries."""
    try:
        saved = esign_signing_service.save_progress(
            user_id=_uid(token),
            user_email=_email(token),
            envelope_id=envelope_id,
            field_values=payload.field_values,
        )
        return EsignProgressResponse(saved_count=saved)
    except Exception as exc:
        _raise_http(exc)


@router.post("/sign/{envelope_id}/submit", response_model=EsignSubmitResponse)
async def submit_signature(
    envelope_id: str,
    payload: EsignSubmitRequest,
    request: Request,
    token: dict = Depends(verify_firebase_token),
):
    try:
        return await esign_signing_service.submit_signature(
            user_id=_uid(token),
            user_email=_email(token),
            envelope_id=envelope_id,
            signature=payload.signature,
            field_values=payload.field_values,
            meta=extract_request_meta(request, token),
        )
    except Exception as exc:
        _raise_http(exc)


@router.post("/sign/{envelope_id}/decline", response_model=EsignSubmitResponse)
async def decline_envelope(
    envelope_id: str,
    payload: EsignDeclineRequest,
    request: Request,
    token: dict = Depends(verify_firebase_token),
):
    try:
        return await esign_signing_service.decline(
            user_id=_uid(token),
            user_email=_email(token),
            envelope_id=envelope_id,
            reason=payload.reason,
            meta=extract_request_meta(request, token),
        )
    except Exception as exc:
        _raise_http(exc)


# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------


@router.post("/verify", response_model=EsignVerifyResponse)
async def verify_document(
    envelope_id: str | None = Form(default=None),
    file: UploadFile | None = File(default=None),
    token: dict = Depends(verify_firebase_token),
):
    """Re-verify a sealed document at any later date: recompute SHA-256 and
    validate the embedded PAdES signature."""
    try:
        content = await file.read() if file else None
        return await esign_verification_service.verify(
            user_id=_uid(token), envelope_id=envelope_id, pdf_bytes=content
        )
    except Exception as exc:
        _raise_http(exc)
