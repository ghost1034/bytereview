"""Routes for the E-Signature (esign) feature.

Sender routes are authorized by envelope ownership (envelope.user_id == uid).
Signer routes are authorized by matching the authenticated (MFA-enforced)
account email against esign_recipients — signer identity verification comes
from the platform's phone-MFA login, recorded in the audit trail.
"""

from __future__ import annotations

import json
import logging
from typing import Literal

from fastapi import APIRouter, Cookie, Depends, File, Form, Header, HTTPException, Query, Request, Response, UploadFile
from pydantic import BaseModel, ValidationError

from dependencies.auth import verify_firebase_token
from models.esign import (
    EsignAuditTrailResponse,
    EsignAnchorSearchRequest,
    EsignAnchorSearchResponse,
    EsignConsentResponse,
    EsignConsentRequest,
    EsignCorrectionRequest,
    EsignDeclineRequest,
    EsignDownloadResponse,
    EsignDocumentOrderRequest,
    EsignEnvelopeCreateResponse,
    EsignEnvelopeListResponse,
    EsignEnvelopeResponse,
    EsignEnvelopeUpdateRequest,
    EsignFieldsReplaceRequest,
    EsignInboxResponse,
    EsignProgressRequest,
    EsignProgressResponse,
    EsignApproveRequest,
    EsignGuestExchangeRequest,
    EsignGuestExchangeResponse,
    EsignGuestSessionResponse,
    EsignGuestSubmitRequest,
    EsignInPersonStartRequest,
    EsignManagedRecipientsRequest,
    EsignManagedRecipientsResponse,
    EsignRecipientResponse,
    EsignReassignRequest,
    EsignVersionedActionRequest,
    EsignWitnessRequest,
    EsignGuestInvitationResponse,
    EsignPdfWidgetConversionRequest,
    EsignPdfWidgetInspectionResponse,
    EsignRecipientsReplaceRequest,
    EsignSigningSessionResponse,
    EsignSignerAttachmentResponse,
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
from services.esign.recipient_service import esign_recipient_service
from services.esign.verification_service import esign_verification_service
from services.rate_limit import rate_limiter

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


@router.post("/templates/{template_id}/anchor-search", response_model=EsignAnchorSearchResponse)
async def search_template_anchors(
    template_id: str,
    payload: EsignAnchorSearchRequest,
    token: dict = Depends(verify_firebase_token),
):
    try:
        return await esign_envelope_service.search_template_anchors(
            _uid(token), template_id, **payload.model_dump()
        )
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
            date_format=payload.date_format,
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
    q: str | None = Query(default=None, max_length=255),
    sort_by: Literal["updated_at", "created_at", "sent_at", "completed_at", "title"] = Query(default="updated_at"),
    sort_dir: Literal["asc", "desc"] = Query(default="desc"),
):
    try:
        return esign_envelope_service.list_envelopes(
            _uid(token), limit=limit, offset=offset, status=status, q=q,
            sort_by=sort_by, sort_dir=sort_dir,
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


@router.patch("/envelopes/{envelope_id}/documents/order", response_model=EsignEnvelopeResponse)
async def reorder_documents(
    envelope_id: str,
    payload: EsignDocumentOrderRequest,
    token: dict = Depends(verify_firebase_token),
):
    """Reorder every document in a draft envelope."""
    try:
        return esign_envelope_service.reorder_documents(
            _uid(token), envelope_id, payload.document_ids
        )
    except Exception as exc:
        _raise_http(exc)


@router.get(
    "/envelopes/{envelope_id}/documents/{document_id}/pdf-widgets",
    response_model=EsignPdfWidgetInspectionResponse,
)
async def inspect_pdf_widgets(
    envelope_id: str, document_id: str, token: dict = Depends(verify_firebase_token),
):
    try:
        return await esign_envelope_service.inspect_pdf_widgets(_uid(token), envelope_id, document_id)
    except Exception as exc:
        _raise_http(exc)


@router.post(
    "/envelopes/{envelope_id}/documents/{document_id}/convert-pdf-fields",
    response_model=EsignEnvelopeResponse,
)
async def convert_pdf_widgets(
    envelope_id: str,
    document_id: str,
    payload: EsignPdfWidgetConversionRequest,
    token: dict = Depends(verify_firebase_token),
):
    try:
        return await esign_envelope_service.convert_pdf_widgets(
            _uid(token), envelope_id, document_id, payload.mappings
        )
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


@router.post("/envelopes/{envelope_id}/corrections", response_model=EsignEnvelopeResponse)
async def correct_recipients(
    envelope_id: str, payload: EsignCorrectionRequest, request: Request,
    token: dict = Depends(verify_firebase_token),
):
    try:
        return esign_recipient_service.correct_recipients(
            user_id=_uid(token), user_email=_email(token), envelope_id=envelope_id,
            payload=payload, meta=extract_request_meta(request, token),
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


@router.post("/envelopes/{envelope_id}/anchor-search", response_model=EsignAnchorSearchResponse)
async def search_envelope_anchors(
    envelope_id: str,
    payload: EsignAnchorSearchRequest,
    token: dict = Depends(verify_firebase_token),
):
    try:
        return await esign_envelope_service.search_envelope_anchors(
            _uid(token), envelope_id, **payload.model_dump()
        )
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
async def get_inbox(
    token: dict = Depends(verify_firebase_token),
    q: str | None = Query(default=None, max_length=255),
    state: Literal["pending", "completed"] | None = Query(default=None),
):
    try:
        return esign_signing_service.get_inbox(
            user_id=_uid(token), user_email=_email(token), q=q, state=state
        )
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
    payload: EsignConsentRequest,
    request: Request,
    token: dict = Depends(verify_firebase_token),
):
    try:
        return esign_signing_service.record_consent(
            user_id=_uid(token),
            user_email=_email(token),
            envelope_id=envelope_id,
            expected_routing_version=payload.expected_routing_version,
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
            expected_routing_version=payload.expected_routing_version,
        )
        return EsignProgressResponse(saved_count=saved)
    except Exception as exc:
        _raise_http(exc)


@router.post("/sign/{envelope_id}/attachments", response_model=EsignSignerAttachmentResponse)
async def upload_signer_attachment(
    envelope_id: str,
    field_id: str = Form(...),
    file: UploadFile = File(...),
    token: dict = Depends(verify_firebase_token),
):
    try:
        return await esign_signing_service.upload_attachment(
            user_id=_uid(token),
            user_email=_email(token),
            envelope_id=envelope_id,
            field_id=field_id,
            filename=file.filename or "attachment",
            content_type=file.content_type or "application/octet-stream",
            content=await file.read(),
        )
    except Exception as exc:
        _raise_http(exc)


@router.delete("/sign/{envelope_id}/attachments/{attachment_id}")
async def delete_signer_attachment(
    envelope_id: str,
    attachment_id: str,
    token: dict = Depends(verify_firebase_token),
):
    try:
        await esign_signing_service.delete_attachment(
            user_id=_uid(token),
            user_email=_email(token),
            envelope_id=envelope_id,
            attachment_id=attachment_id,
        )
        return {"message": "Attachment deleted"}
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
            expected_routing_version=payload.expected_routing_version,
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
            expected_routing_version=payload.expected_routing_version,
            meta=extract_request_meta(request, token),
        )
    except Exception as exc:
        _raise_http(exc)


@router.post("/sign/{envelope_id}/reassign", response_model=EsignRecipientResponse)
async def reassign_recipient(
    envelope_id: str, payload: EsignReassignRequest, request: Request,
    token: dict = Depends(verify_firebase_token),
):
    try:
        return esign_recipient_service.reassign(
            user_id=_uid(token), user_email=_email(token), envelope_id=envelope_id,
            payload=payload, meta=extract_request_meta(request, token),
        )
    except Exception as exc:
        _raise_http(exc)


@router.post("/sign/{envelope_id}/corrections", response_model=EsignEnvelopeResponse)
async def editor_correct_recipients(
    envelope_id: str, payload: EsignCorrectionRequest, request: Request,
    token: dict = Depends(verify_firebase_token),
):
    try:
        return esign_recipient_service.correct_recipients(
            user_id=_uid(token), user_email=_email(token), envelope_id=envelope_id,
            payload=payload, meta=extract_request_meta(request, token),
        )
    except Exception as exc:
        _raise_http(exc)


@router.post("/sign/{envelope_id}/approve", response_model=EsignSubmitResponse)
async def approve_envelope(
    envelope_id: str, payload: EsignApproveRequest, request: Request,
    token: dict = Depends(verify_firebase_token),
):
    try:
        return await esign_recipient_service.approve(
            user_id=_uid(token), user_email=_email(token), envelope_id=envelope_id,
            expected_routing_version=payload.expected_routing_version,
            meta=extract_request_meta(request, token),
        )
    except Exception as exc:
        _raise_http(exc)


@router.patch("/sign/{envelope_id}/managed-recipients", response_model=EsignManagedRecipientsResponse)
async def update_managed_recipients(
    envelope_id: str, payload: EsignManagedRecipientsRequest, request: Request,
    token: dict = Depends(verify_firebase_token),
):
    try:
        return esign_recipient_service.manage_recipients(
            user_id=_uid(token), user_email=_email(token), envelope_id=envelope_id,
            payload=payload, meta=extract_request_meta(request, token),
        )
    except Exception as exc:
        _raise_http(exc)


@router.post("/sign/{envelope_id}/manager-complete", response_model=EsignSubmitResponse)
async def complete_manager_step(
    envelope_id: str, payload: EsignVersionedActionRequest, request: Request,
    token: dict = Depends(verify_firebase_token),
):
    try:
        return await esign_recipient_service.manager_complete(
            user_id=_uid(token), user_email=_email(token), envelope_id=envelope_id,
            expected_routing_version=payload.expected_routing_version,
            meta=extract_request_meta(request, token),
        )
    except Exception as exc:
        _raise_http(exc)


@router.put("/sign/{envelope_id}/witness", response_model=EsignGuestInvitationResponse)
async def configure_witness(
    envelope_id: str, payload: EsignWitnessRequest, request: Request,
    token: dict = Depends(verify_firebase_token),
):
    try:
        return esign_recipient_service.configure_witness(
            user_id=_uid(token), user_email=_email(token), envelope_id=envelope_id,
            payload=payload, meta=extract_request_meta(request, token),
        )
    except Exception as exc:
        _raise_http(exc)


@router.post("/sign/{envelope_id}/in-person/start", response_model=EsignGuestInvitationResponse)
async def start_in_person_signing(
    envelope_id: str, payload: EsignInPersonStartRequest, request: Request,
    token: dict = Depends(verify_firebase_token),
):
    try:
        return esign_recipient_service.start_in_person(
            user_id=_uid(token), user_email=_email(token), envelope_id=envelope_id,
            payload=payload, meta=extract_request_meta(request, token),
        )
    except Exception as exc:
        _raise_http(exc)


GUEST_COOKIE = "esign_guest_session"


def _enforce_guest_rate_limit(request: Request, action: str, *, limit: int, window_seconds: int) -> None:
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    ip = forwarded or (request.client.host if request.client else "unknown")
    if not rate_limiter.check(f"esign_guest_{action}", ip, limit=limit, window_seconds=window_seconds):
        raise HTTPException(status_code=429, detail="Too many guest ceremony requests; try again later")


@router.post("/guest/exchange", response_model=EsignGuestExchangeResponse)
async def exchange_guest_invitation(
    payload: EsignGuestExchangeRequest, request: Request, response: Response,
):
    _enforce_guest_rate_limit(request, "exchange", limit=20, window_seconds=3600)
    try:
        result, session_token, _ = esign_recipient_service.exchange_invitation(
            payload.invitation_token, extract_request_meta(request, None)
        )
        response.set_cookie(
            GUEST_COOKIE, session_token, httponly=True, secure=True, samesite="strict",
            max_age=2 * 60 * 60, path="/api/esign/guest",
        )
        return result
    except Exception as exc:
        _raise_http(exc)


@router.get("/guest/session", response_model=EsignGuestSessionResponse)
async def get_guest_session(request: Request, esign_guest_session: str | None = Cookie(default=None, alias=GUEST_COOKIE)):
    _enforce_guest_rate_limit(request, "session", limit=120, window_seconds=60)
    try:
        if not esign_guest_session:
            raise EsignNotFound("Guest session is invalid or expired")
        return await esign_recipient_service.guest_session(esign_guest_session)
    except Exception as exc:
        _raise_http(exc)


@router.post("/guest/consent")
async def record_guest_consent(
    payload: EsignConsentRequest, request: Request,
    esign_guest_session: str | None = Cookie(default=None, alias=GUEST_COOKIE),
    csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
):
    _enforce_guest_rate_limit(request, "consent", limit=30, window_seconds=60)
    try:
        if not esign_guest_session or not csrf_token:
            raise PermissionError("Guest session and CSRF token are required")
        return esign_recipient_service.guest_consent(
            esign_guest_session, csrf_token, payload.expected_routing_version,
            extract_request_meta(request, None),
        )
    except Exception as exc:
        _raise_http(exc)


@router.post("/guest/submit", response_model=EsignSubmitResponse)
async def submit_guest_signature(
    payload: EsignGuestSubmitRequest, request: Request, response: Response,
    esign_guest_session: str | None = Cookie(default=None, alias=GUEST_COOKIE),
    csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
):
    _enforce_guest_rate_limit(request, "submit", limit=20, window_seconds=300)
    try:
        if not esign_guest_session or not csrf_token:
            raise PermissionError("Guest session and CSRF token are required")
        result = await esign_recipient_service.guest_submit(
            esign_guest_session, csrf_token, payload, extract_request_meta(request, None)
        )
        response.delete_cookie(GUEST_COOKIE, path="/api/esign/guest")
        return result
    except Exception as exc:
        _raise_http(exc)


@router.put("/guest/progress", response_model=EsignProgressResponse)
async def save_guest_progress(
    payload: EsignProgressRequest, request: Request,
    esign_guest_session: str | None = Cookie(default=None, alias=GUEST_COOKIE),
    csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
):
    _enforce_guest_rate_limit(request, "progress", limit=120, window_seconds=60)
    try:
        if not esign_guest_session or not csrf_token:
            raise PermissionError("Guest session and CSRF token are required")
        return esign_recipient_service.guest_progress(esign_guest_session, csrf_token, payload)
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
