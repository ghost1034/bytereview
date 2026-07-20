"""Routes for authenticated senders and accountless e-sign recipients."""

from __future__ import annotations

import json
import csv
import io
import logging
import hashlib
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, Request, Response, UploadFile
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, ValidationError

from dependencies.auth import verify_firebase_token
from models.esign import (
    EsignAuditTrailResponse,
    EsignAnchorSearchRequest,
    EsignAnchorSearchResponse,
    EsignConsentResponse,
    EsignConsentRequest,
    EsignCorrectionRequest,
    EsignCloneAndVoidRequest,
    EsignCloneAndVoidResponse,
    EsignDeclineRequest,
    EsignDownloadResponse,
    EsignDocumentOrderRequest,
    EsignEnvelopeCreateResponse,
    EsignEnvelopeListResponse,
    EsignEnvelopeResponse,
    EsignEnvelopeUpdateRequest,
    EsignFieldsReplaceRequest,
    EsignFieldCorrectionRequest,
    EsignInboxResponse,
    EsignProgressRequest,
    EsignProgressResponse,
    EsignApproveRequest,
    EsignGuestExchangeRequest,
    EsignGuestExchangeResponse,
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
    EsignTemplateVersionListResponse,
    EsignTemplateVersionResponse,
    EsignTemplateVersionCompatibilityResponse,
    EsignScheduleRequest,
    EsignBulkJobResponse,
    EsignBulkJobListResponse,
    EsignPowerFormCreateRequest,
    EsignPowerFormResponse,
    EsignPowerFormListResponse,
    EsignPowerFormVerificationRequest,
    EsignPowerFormVerificationExchange,
    EsignReportSummary,
    EsignContextResponse,
    EsignSettingsUpdateRequest,
    EsignPermissionProfileRequest,
    EsignPermissionAssignmentRequest,
    EsignEnvelopeGrantRequest,
    EsignCustodyTransferRequest,
    EsignCustodyRemediationRequest,
    EsignBrandProfileRequest,
    EsignWebhookConfigurationRequest,
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
from services.esign.scale_service import esign_scale_service
from services.esign.email_templates import EmailContent, _shell
from services.esign.admin_service import esign_admin_service
from services.esign.url_service import app_base_url
from services.esign.outbox_service import esign_outbox_service

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
# Firm context and administration
# ---------------------------------------------------------------------------


@router.get("/context", response_model=EsignContextResponse)
async def get_esign_context(token: dict = Depends(verify_firebase_token)):
    try: return esign_admin_service.context(_uid(token))
    except Exception as exc: _raise_http(exc)


@router.get("/admin/overview")
async def esign_admin_overview(token: dict = Depends(verify_firebase_token)):
    try: return esign_admin_service.overview(_uid(token))
    except Exception as exc: _raise_http(exc)


@router.get("/admin/custody-review")
async def esign_admin_custody_review(token: dict = Depends(verify_firebase_token)):
    try: return {"assets": esign_admin_service.custody_review(_uid(token))}
    except Exception as exc: _raise_http(exc)


@router.post("/admin/custody-review/remediate")
async def remediate_esign_custody(payload: EsignCustodyRemediationRequest, token: dict = Depends(verify_firebase_token)):
    try: return esign_admin_service.remediate_custody(_uid(token), payload)
    except Exception as exc: _raise_http(exc)


@router.get("/admin/settings")
async def get_esign_admin_settings(token: dict = Depends(verify_firebase_token)):
    try: return esign_admin_service.get_settings(_uid(token))
    except Exception as exc: _raise_http(exc)


@router.put("/admin/settings")
async def update_esign_admin_settings(payload: EsignSettingsUpdateRequest, token: dict = Depends(verify_firebase_token)):
    try: return esign_admin_service.update_settings(_uid(token), payload)
    except Exception as exc: _raise_http(exc)


@router.get("/admin/permission-profiles")
async def list_esign_permission_profiles(token: dict = Depends(verify_firebase_token)):
    try: return {"profiles": esign_admin_service.list_profiles(_uid(token))}
    except Exception as exc: _raise_http(exc)


@router.post("/admin/permission-profiles", status_code=201)
async def create_esign_permission_profile(payload: EsignPermissionProfileRequest, token: dict = Depends(verify_firebase_token)):
    try: return esign_admin_service.create_profile(_uid(token), payload)
    except Exception as exc: _raise_http(exc)


@router.put("/admin/permission-profiles/{profile_id}")
async def update_esign_permission_profile(profile_id: str, payload: EsignPermissionProfileRequest, token: dict = Depends(verify_firebase_token)):
    try: return esign_admin_service.update_profile(_uid(token), profile_id, payload)
    except Exception as exc: _raise_http(exc)


@router.put("/admin/users/{user_id}/permission-profile")
async def assign_esign_permission_profile(user_id: str, payload: EsignPermissionAssignmentRequest, token: dict = Depends(verify_firebase_token)):
    try: return esign_admin_service.assign_profile(_uid(token), user_id, payload.profile_id)
    except Exception as exc: _raise_http(exc)


@router.get("/admin/brands")
async def list_esign_brands(token: dict = Depends(verify_firebase_token)):
    try: return {"brands": esign_admin_service.list_brands(_uid(token))}
    except Exception as exc: _raise_http(exc)


@router.post("/admin/brands", status_code=201)
async def create_esign_brand(payload: EsignBrandProfileRequest, token: dict = Depends(verify_firebase_token)):
    try: return esign_admin_service.create_brand(_uid(token), payload)
    except Exception as exc: _raise_http(exc)


@router.put("/admin/brands/{brand_id}")
async def update_esign_brand(brand_id: str, payload: EsignBrandProfileRequest, token: dict = Depends(verify_firebase_token)):
    try: return esign_admin_service.update_brand(_uid(token), brand_id, payload)
    except Exception as exc: _raise_http(exc)


@router.post("/admin/brand-assets", status_code=201)
async def upload_esign_brand_asset(file: UploadFile = File(...), token: dict = Depends(verify_firebase_token)):
    try: return await esign_admin_service.upload_brand_asset(_uid(token), file.filename or "logo", file.content_type or "", await file.read())
    except Exception as exc: _raise_http(exc)


@router.get("/admin/webhooks")
async def list_esign_firm_webhooks(token: dict = Depends(verify_firebase_token)):
    try: return {"configurations": esign_admin_service.list_webhooks(_uid(token))}
    except Exception as exc: _raise_http(exc)


@router.post("/admin/webhooks", status_code=201)
async def create_esign_firm_webhook(payload: EsignWebhookConfigurationRequest, token: dict = Depends(verify_firebase_token)):
    try: return esign_admin_service.create_webhook(_uid(token), payload)
    except Exception as exc: _raise_http(exc)


@router.put("/admin/webhooks/{configuration_id}")
async def update_esign_webhook(configuration_id: str, payload: EsignWebhookConfigurationRequest, token: dict = Depends(verify_firebase_token)):
    try: return esign_admin_service.update_webhook(_uid(token), configuration_id, payload)
    except Exception as exc: _raise_http(exc)


@router.post("/admin/webhooks/{configuration_id}/rotate-secret")
async def rotate_esign_webhook_secret(configuration_id: str, token: dict = Depends(verify_firebase_token)):
    try: return esign_admin_service.rotate_secret(_uid(token), configuration_id)
    except Exception as exc: _raise_http(exc)


@router.post("/admin/webhooks/{configuration_id}/test")
async def test_esign_webhook(configuration_id: str, token: dict = Depends(verify_firebase_token)):
    try: return esign_admin_service.test_webhook(_uid(token), configuration_id)
    except Exception as exc: _raise_http(exc)


@router.delete("/admin/webhooks/{configuration_id}")
async def disable_esign_firm_webhook(configuration_id: str, token: dict = Depends(verify_firebase_token)):
    try:
        esign_admin_service.disable_webhook(_uid(token), configuration_id)
        return {"success": True}
    except Exception as exc: _raise_http(exc)


@router.get("/admin/webhook-deliveries")
async def list_esign_webhook_deliveries(status: str | None = Query(default=None), limit: int = Query(default=100, ge=1, le=250), token: dict = Depends(verify_firebase_token)):
    try: return {"deliveries": esign_admin_service.deliveries(_uid(token), status=status, limit=limit)}
    except Exception as exc: _raise_http(exc)


@router.get("/admin/webhook-metrics")
async def get_esign_webhook_metrics(token: dict = Depends(verify_firebase_token)):
    try: return esign_admin_service.webhook_metrics(_uid(token))
    except Exception as exc: _raise_http(exc)


@router.get("/admin/webhook-deliveries/{delivery_id}/attempts")
async def list_esign_webhook_attempts(delivery_id: str, token: dict = Depends(verify_firebase_token)):
    try: return {"attempts": esign_admin_service.attempts(_uid(token), delivery_id)}
    except Exception as exc: _raise_http(exc)


@router.post("/admin/webhook-deliveries/{delivery_id}/replay")
async def replay_esign_webhook(delivery_id: str, token: dict = Depends(verify_firebase_token)):
    try: return esign_admin_service.replay(_uid(token), delivery_id)
    except Exception as exc: _raise_http(exc)


@router.get("/admin/audit")
async def list_esign_admin_audit(
    limit: int = Query(default=500, ge=1, le=5000), event_type: str | None = Query(default=None),
    actor_email: str | None = Query(default=None), target_type: str | None = Query(default=None),
    start: datetime | None = Query(default=None), end: datetime | None = Query(default=None),
    token: dict = Depends(verify_firebase_token),
):
    try: return {"events": esign_admin_service.audit_events(_uid(token), limit=limit, event_type=event_type,
        actor_email=actor_email, target_type=target_type, start=start, end=end)}
    except Exception as exc: _raise_http(exc)


@router.get("/admin/audit.csv", response_class=PlainTextResponse)
async def export_esign_admin_audit(
    event_type: str | None = Query(default=None), actor_email: str | None = Query(default=None),
    target_type: str | None = Query(default=None), start: datetime | None = Query(default=None),
    end: datetime | None = Query(default=None), token: dict = Depends(verify_firebase_token),
):
    try:
        output = io.StringIO(newline=""); writer = csv.writer(output)
        writer.writerow(["id", "created_at", "event_type", "actor_email", "target_type", "target_id", "details"])
        for event in esign_admin_service.audit_events(_uid(token), limit=5000, event_type=event_type,
                actor_email=actor_email, target_type=target_type, start=start, end=end):
            writer.writerow([event["id"], event["created_at"].isoformat(), event["event_type"], event["actor_email"],
                             event["target_type"], event["target_id"], json.dumps(event["details"] or {}, sort_keys=True)])
        return PlainTextResponse(output.getvalue(), media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="esign-admin-audit.csv"'})
    except Exception as exc: _raise_http(exc)


@router.post("/admin/users/{user_id}/offboard")
async def offboard_esign_user(user_id: str, payload: EsignCustodyTransferRequest, token: dict = Depends(verify_firebase_token)):
    try: return {"transferred": esign_admin_service.offboard(_uid(token), user_id, payload.successor_user_id)}
    except Exception as exc: _raise_http(exc)


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
    brand_id: str | None = Form(default=None),
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
            brand_id=brand_id,
        )
    except Exception as exc:
        _raise_http(exc)


@router.get("/templates", response_model=EsignTemplateListResponse)
async def list_templates(include_archived: bool = Query(default=False), token: dict = Depends(verify_firebase_token)):
    return EsignTemplateListResponse(templates=esign_envelope_service.list_templates(_uid(token), include_archived=include_archived))


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
            brand_id=payload.brand_id,
            brand_id_supplied="brand_id" in payload.model_fields_set,
            expected_revision=payload.expected_revision,
        )
    except Exception as exc:
        _raise_http(exc)


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str, token: dict = Depends(verify_firebase_token)):
    try:
        esign_envelope_service.delete_template(_uid(token), template_id)
        return {"message": "Template deleted or archived when referenced by retained records"}
    except Exception as exc:
        _raise_http(exc)


@router.post("/templates/{template_id}/versions", response_model=EsignTemplateVersionResponse)
async def publish_template_version(
    template_id: str,
    expected_revision: int | None = Query(default=None, ge=1),
    token: dict = Depends(verify_firebase_token),
):
    try:
        return await esign_scale_service.publish_template(
            _uid(token), template_id, expected_revision=expected_revision
        )
    except Exception as exc:
        _raise_http(exc)


@router.get("/templates/{template_id}/versions", response_model=EsignTemplateVersionListResponse)
async def list_template_versions(template_id: str, token: dict = Depends(verify_firebase_token)):
    try:
        return EsignTemplateVersionListResponse(versions=esign_scale_service.list_versions(_uid(token), template_id))
    except Exception as exc:
        _raise_http(exc)


@router.post("/template-versions/{version_id}/draft", response_model=EsignTemplateResponse, status_code=201)
async def create_template_draft_from_version(version_id: str, token: dict = Depends(verify_firebase_token)):
    try: return await esign_scale_service.create_draft_from_version(_uid(token), version_id)
    except Exception as exc: _raise_http(exc)


@router.get("/template-versions/{version_id}/bulk-sample.csv", response_class=PlainTextResponse)
async def download_bulk_sample(version_id: str, token: dict = Depends(verify_firebase_token)):
    try:
        return PlainTextResponse(esign_scale_service.sample_csv(_uid(token), version_id), media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="bulk-send-sample.csv"'})
    except Exception as exc:
        _raise_http(exc)


# ---------------------------------------------------------------------------
# Bulk sends
# ---------------------------------------------------------------------------


@router.post("/bulk-jobs", response_model=EsignBulkJobResponse)
async def create_bulk_job(
    template_version_id: str = Form(...), file: UploadFile = File(...),
    default_schedule_at: datetime | None = Form(default=None),
    default_schedule_timezone: str | None = Form(default=None),
    token: dict = Depends(verify_firebase_token),
):
    try:
        return esign_scale_service.create_bulk_job(_uid(token), template_version_id, await file.read(),
            default_schedule_at, default_schedule_timezone)
    except Exception as exc:
        _raise_http(exc)


@router.get("/bulk-jobs", response_model=EsignBulkJobListResponse)
async def list_bulk_jobs(token: dict = Depends(verify_firebase_token)):
    return EsignBulkJobListResponse(jobs=esign_scale_service.list_bulk_jobs(_uid(token)))


@router.get("/bulk-jobs/{job_id}", response_model=EsignBulkJobResponse)
async def get_bulk_job(job_id: str, token: dict = Depends(verify_firebase_token)):
    try: return esign_scale_service.get_bulk_job(_uid(token), job_id)
    except Exception as exc: _raise_http(exc)


@router.post("/bulk-jobs/{job_id}/confirm", response_model=EsignBulkJobResponse)
async def confirm_bulk_job(job_id: str, token: dict = Depends(verify_firebase_token)):
    try: return esign_scale_service.confirm_bulk_job(_uid(token), job_id)
    except Exception as exc: _raise_http(exc)


@router.post("/bulk-jobs/{job_id}/cancel", response_model=EsignBulkJobResponse)
async def cancel_bulk_job(job_id: str, token: dict = Depends(verify_firebase_token)):
    try: return esign_scale_service.cancel_bulk_job(_uid(token), job_id)
    except Exception as exc: _raise_http(exc)


@router.post("/bulk-jobs/{job_id}/retry", response_model=EsignBulkJobResponse)
async def retry_bulk_job(job_id: str, token: dict = Depends(verify_firebase_token)):
    try: return esign_scale_service.retry_bulk_job(_uid(token), job_id)
    except Exception as exc: _raise_http(exc)


@router.get("/bulk-jobs/{job_id}/errors.csv", response_class=PlainTextResponse)
async def bulk_error_csv(job_id: str, token: dict = Depends(verify_firebase_token)):
    try:
        return PlainTextResponse(esign_scale_service.error_csv(_uid(token), job_id), media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="bulk-send-errors.csv"'})
    except Exception as exc: _raise_http(exc)


# ---------------------------------------------------------------------------
# PowerForms
# ---------------------------------------------------------------------------


@router.post("/powerforms", response_model=EsignPowerFormResponse)
async def create_powerform(payload: EsignPowerFormCreateRequest, token: dict = Depends(verify_firebase_token)):
    try: return esign_scale_service.create_powerform(_uid(token), payload)
    except Exception as exc: _raise_http(exc)


@router.get("/powerforms", response_model=EsignPowerFormListResponse)
async def list_powerforms(token: dict = Depends(verify_firebase_token)):
    return EsignPowerFormListResponse(powerforms=esign_scale_service.list_powerforms(_uid(token)))


@router.post("/powerforms/{form_id}/state/{state}", response_model=EsignPowerFormResponse)
async def set_powerform_state(form_id: str, state: Literal["active", "paused", "revoked"], token: dict = Depends(verify_firebase_token)):
    try: return esign_scale_service.powerform_state(_uid(token), form_id, state)
    except Exception as exc: _raise_http(exc)


@router.post("/powerforms/{form_id}/rotate", response_model=EsignPowerFormResponse)
async def rotate_powerform(form_id: str, token: dict = Depends(verify_firebase_token)):
    try: return esign_scale_service.rotate_powerform(_uid(token), form_id)
    except Exception as exc: _raise_http(exc)


@router.post("/powerforms/{form_id}/upgrade/{version_id}", response_model=EsignPowerFormResponse)
async def upgrade_powerform(form_id: str, version_id: str, token: dict = Depends(verify_firebase_token)):
    try: return esign_scale_service.upgrade_powerform(_uid(token), form_id, version_id)
    except Exception as exc: _raise_http(exc)


@router.get("/powerforms/{form_id}/upgrade/{version_id}/preview", response_model=EsignTemplateVersionCompatibilityResponse)
async def preview_powerform_upgrade(form_id: str, version_id: str, token: dict = Depends(verify_firebase_token)):
    try: return esign_scale_service.powerform_upgrade_preview(_uid(token), form_id, version_id)
    except Exception as exc: _raise_http(exc)


@router.get("/powerforms/{form_id}/submissions")
async def list_powerform_submissions(form_id: str, token: dict = Depends(verify_firebase_token)):
    try: return {"submissions": esign_scale_service.list_powerform_submissions(_uid(token), form_id)}
    except Exception as exc: _raise_http(exc)


@router.post("/powerforms/{form_id}/submissions/{submission_id}/retry")
async def retry_powerform_submission(form_id: str, submission_id: str, token: dict = Depends(verify_firebase_token)):
    try: return await esign_scale_service.retry_powerform_submission(_uid(token), form_id, submission_id)
    except Exception as exc: _raise_http(exc)


@router.get("/public/powerforms/{public_token}")
async def public_powerform_config(public_token: str, request: Request):
    _enforce_guest_rate_limit(request, "powerform_config", limit=60, window_seconds=60)
    try: return esign_scale_service.public_powerform(public_token)
    except Exception as exc: _raise_http(exc)


@router.post("/public/powerforms/{public_token}/verification")
async def request_powerform_verification(public_token: str, payload: EsignPowerFormVerificationRequest, request: Request):
    _enforce_guest_rate_limit(request, "powerform_verify", limit=10, window_seconds=900)
    try:
        import hashlib
        link_key = hashlib.sha256(public_token.encode()).hexdigest()[:24]
        if not rate_limiter.check("esign_powerform_link", link_key, limit=50, window_seconds=900):
            raise PermissionError("Too many verification requests")
        for identity in payload.recipients:
            email = str(identity.get("email") or "").strip().lower()
            if email and not rate_limiter.check("esign_powerform_email", email, limit=5, window_seconds=900):
                raise PermissionError("Too many verification requests")
        email, verification = esign_scale_service.request_powerform_verification(
            public_token, payload.model_dump(mode="json"), extract_request_meta(request, None))
        base = app_base_url()
        url = f"{base}/esign/guest?powerform_token={verification}"
        content = EmailContent(subject="Verify your email to start signing",
            html=_shell(heading="Verify your email", body_paragraphs=["Use this single-use link within 15 minutes to begin signing."],
                button_label="Verify and continue", button_url=url),
            text=f"Verify your email to begin signing. This link expires in 15 minutes:\n\n{url}")
        await esign_outbox_service.queue_external_email(
            kind="powerform_verification", to_email=email, content=content,
            idempotency_key=f"powerform-verification:{hashlib.sha256(verification.encode()).hexdigest()}",
        )
        return {"message": "If the request can be accepted, a verification email will arrive shortly."}
    except Exception as exc:
        # Public response is deliberately generic; details stay server-side.
        logger.info("PowerForm verification request rejected: %s", exc)
        return {"message": "If the request can be accepted, a verification email will arrive shortly."}


@router.post("/public/powerforms/verification/exchange")
async def exchange_powerform_verification(payload: EsignPowerFormVerificationExchange, request: Request):
    _enforce_guest_rate_limit(request, "powerform_exchange", limit=20, window_seconds=900)
    try: return await esign_scale_service.exchange_powerform_verification(payload.token)
    except Exception as exc: _raise_http(exc)


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------


@router.get("/reports/summary", response_model=EsignReportSummary)
async def report_summary(
    start: str = Query(...), end: str = Query(...), source: str | None = Query(default=None),
    status: str | None = Query(default=None), template_version_id: str | None = Query(default=None),
    sender_user_id: str | None = Query(default=None), source_id: str | None = Query(default=None),
    token: dict = Depends(verify_firebase_token),
):
    try:
        return esign_scale_service.report_summary(_uid(token), datetime.fromisoformat(start.replace("Z", "+00:00")),
            datetime.fromisoformat(end.replace("Z", "+00:00")), source, status, template_version_id,
            sender_user_id, source_id)
    except Exception as exc: _raise_http(exc)


@router.get("/reports/time-series")
async def report_time_series(
    start: str = Query(...), end: str = Query(...), source: str | None = Query(default=None),
    status: str | None = Query(default=None), template_version_id: str | None = Query(default=None),
    sender_user_id: str | None = Query(default=None), source_id: str | None = Query(default=None),
    token: dict = Depends(verify_firebase_token),
):
    try:
        return {"points": esign_scale_service.report_time_series(_uid(token),
            datetime.fromisoformat(start.replace("Z", "+00:00")), datetime.fromisoformat(end.replace("Z", "+00:00")),
            source, status, template_version_id, sender_user_id, source_id)}
    except Exception as exc: _raise_http(exc)


@router.get("/reports/details.csv", response_class=PlainTextResponse)
async def report_details_csv(
    start: str = Query(...), end: str = Query(...), source: str | None = Query(default=None),
    status: str | None = Query(default=None), template_version_id: str | None = Query(default=None),
    sender_user_id: str | None = Query(default=None), source_id: str | None = Query(default=None),
    token: dict = Depends(verify_firebase_token),
):
    try:
        content = esign_scale_service.report_csv(_uid(token), datetime.fromisoformat(start.replace("Z", "+00:00")),
            datetime.fromisoformat(end.replace("Z", "+00:00")), source, status, template_version_id,
            sender_user_id, source_id)
        return PlainTextResponse(content, media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="esign-report-details.csv"'})
    except Exception as exc: _raise_http(exc)


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


@router.post("/templates/{template_id}/documents", response_model=EsignTemplateResponse)
async def add_template_documents(template_id: str, files: list[UploadFile] = File(...),
                                 token: dict = Depends(verify_firebase_token)):
    try: return await esign_envelope_service.add_template_documents(_uid(token), template_id, await _read_uploads(files))
    except Exception as exc: _raise_http(exc)


@router.delete("/templates/{template_id}/documents/{document_id}", response_model=EsignTemplateResponse)
async def delete_template_document(template_id: str, document_id: str,
                                   token: dict = Depends(verify_firebase_token)):
    try: return await esign_envelope_service.delete_template_document(_uid(token), template_id, document_id)
    except Exception as exc: _raise_http(exc)


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
    brand_id: str | None = Form(default=None),
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
            brand_id=brand_id,
            meta=extract_request_meta(request, token),
        )
        return EsignEnvelopeCreateResponse(envelope=envelope)
    except Exception as exc:
        _raise_http(exc)


@router.post("/envelopes/{envelope_id}/schedule", response_model=EsignEnvelopeResponse)
async def schedule_envelope(
    envelope_id: str, payload: EsignScheduleRequest, token: dict = Depends(verify_firebase_token),
):
    try: return esign_scale_service.schedule(_uid(token), envelope_id, payload.schedule_at, payload.schedule_timezone)
    except Exception as exc: _raise_http(exc)


@router.post("/envelopes/{envelope_id}/unschedule", response_model=EsignEnvelopeResponse)
async def unschedule_envelope(envelope_id: str, token: dict = Depends(verify_firebase_token)):
    try: return esign_scale_service.unschedule(_uid(token), envelope_id)
    except Exception as exc: _raise_http(exc)


@router.post("/envelopes/{envelope_id}/retry-send", response_model=EsignEnvelopeResponse)
async def retry_failed_send(envelope_id: str, request: Request, token: dict = Depends(verify_firebase_token)):
    try:
        return await esign_scale_service.retry_failed_send(_uid(token), _email(token), envelope_id,
            extract_request_meta(request, token))
    except Exception as exc: _raise_http(exc)


@router.post("/envelopes/{envelope_id}/recover-draft", response_model=EsignEnvelopeResponse)
async def recover_failed_send_draft(envelope_id: str, token: dict = Depends(verify_firebase_token)):
    try: return esign_scale_service.recover_failed_send_draft(_uid(token), envelope_id)
    except Exception as exc: _raise_http(exc)


@router.post("/envelopes/{envelope_id}/retry-sealing")
async def retry_envelope_sealing(envelope_id: str, token: dict = Depends(verify_firebase_token)):
    try:
        work_id = esign_outbox_service.retry_seal(_uid(token), envelope_id)
        await esign_outbox_service.dispatch_seal(work_id)
        return {"status": "queued", "work_item_id": work_id}
    except Exception as exc:
        _raise_http(exc)


@router.get("/envelopes/{envelope_id}/email-deliveries")
async def list_envelope_email_deliveries(envelope_id: str, token: dict = Depends(verify_firebase_token)):
    try:
        return {"deliveries": esign_outbox_service.list_emails(_uid(token), envelope_id)}
    except Exception as exc:
        _raise_http(exc)


@router.post("/envelopes/{envelope_id}/email-deliveries/{delivery_id}/resend")
async def resend_envelope_email(
    envelope_id: str, delivery_id: str, token: dict = Depends(verify_firebase_token),
):
    try:
        delivery = esign_outbox_service.retry_email(_uid(token), envelope_id, delivery_id)
        await esign_outbox_service.deliver_due_emails(envelope_id=envelope_id)
        return delivery
    except Exception as exc:
        _raise_http(exc)


@router.get("/envelopes", response_model=EsignEnvelopeListResponse)
async def list_envelopes(
    token: dict = Depends(verify_firebase_token),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None),
    source_type: Literal["manual", "bulk", "powerform"] | None = Query(default=None),
    source_id: str | None = Query(default=None),
    template_version_id: str | None = Query(default=None),
    q: str | None = Query(default=None, max_length=255),
    sort_by: Literal["updated_at", "created_at", "sent_at", "completed_at", "title"] = Query(default="updated_at"),
    sort_dir: Literal["asc", "desc"] = Query(default="desc"),
    scope: Literal["mine", "shared", "firm"] = Query(default="mine"),
    owner_user_id: str | None = Query(default=None),
):
    try:
        return esign_envelope_service.list_envelopes(
            _uid(token), limit=limit, offset=offset, status=status, q=q,
            source_type=source_type, source_id=source_id, template_version_id=template_version_id,
            sort_by=sort_by, sort_dir=sort_dir,
            scope=scope,
            owner_user_id=owner_user_id,
        )
    except Exception as exc:
        _raise_http(exc)


@router.get("/envelopes/{envelope_id}", response_model=EsignEnvelopeResponse)
async def get_envelope(envelope_id: str, token: dict = Depends(verify_firebase_token)):
    try:
        return esign_envelope_service.get_envelope(_uid(token), envelope_id)
    except Exception as exc:
        _raise_http(exc)


@router.get("/envelopes/{envelope_id}/access")
async def get_envelope_access(envelope_id: str, token: dict = Depends(verify_firebase_token)):
    try: return esign_admin_service.list_access(_uid(token), envelope_id)
    except Exception as exc: _raise_http(exc)


@router.put("/envelopes/{envelope_id}/access")
async def grant_envelope_access(envelope_id: str, payload: EsignEnvelopeGrantRequest, token: dict = Depends(verify_firebase_token)):
    try: return esign_admin_service.grant_access(_uid(token), _email(token), envelope_id, payload.user_id, payload.access_level)
    except Exception as exc: _raise_http(exc)


@router.delete("/envelopes/{envelope_id}/access/{user_id}")
async def revoke_envelope_access(envelope_id: str, user_id: str, token: dict = Depends(verify_firebase_token)):
    try:
        esign_admin_service.revoke_access(_uid(token), _email(token), envelope_id, user_id)
        return {"success": True}
    except Exception as exc: _raise_http(exc)


@router.post("/envelopes/{envelope_id}/transfer")
async def transfer_envelope_custody(envelope_id: str, payload: EsignCustodyTransferRequest, token: dict = Depends(verify_firebase_token)):
    try: return esign_admin_service.transfer(_uid(token), _email(token), envelope_id, payload.successor_user_id, payload.retain_previous_owner_view)
    except Exception as exc: _raise_http(exc)


@router.get("/envelopes/{envelope_id}/webhooks")
async def list_envelope_webhooks(envelope_id: str, token: dict = Depends(verify_firebase_token)):
    try: return {"configurations": esign_admin_service.list_webhooks(_uid(token), envelope_id)}
    except Exception as exc: _raise_http(exc)


@router.post("/envelopes/{envelope_id}/webhooks", status_code=201)
async def create_envelope_webhook(envelope_id: str, payload: EsignWebhookConfigurationRequest, token: dict = Depends(verify_firebase_token)):
    try: return esign_admin_service.create_webhook(_uid(token), payload, envelope_id)
    except Exception as exc: _raise_http(exc)


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
            _uid(token), envelope_id, document_id, payload.mappings,
            confirm_unsupported_flatten=payload.confirm_unsupported_flatten,
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
            _uid(token), envelope_id, payload.recipients, template_id=template_id,
            expected_revision=payload.expected_revision,
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


@router.put("/envelopes/{envelope_id}/corrections/fields", response_model=EsignEnvelopeResponse)
async def correct_fields(
    envelope_id: str, payload: EsignFieldCorrectionRequest, request: Request,
    token: dict = Depends(verify_firebase_token),
):
    try:
        return await esign_envelope_service.correct_fields(
            user_id=_uid(token), user_email=_email(token), envelope_id=envelope_id,
            fields=payload.fields, reason=payload.reason,
            expected_routing_version=payload.expected_routing_version,
            meta=extract_request_meta(request, token),
        )
    except Exception as exc:
        _raise_http(exc)


@router.put(
    "/envelopes/{envelope_id}/corrections/documents/{document_id}",
    response_model=EsignEnvelopeResponse,
)
async def replace_active_document(
    envelope_id: str, document_id: str, request: Request,
    file: UploadFile = File(...), reason: str = Form(...),
    expected_routing_version: int = Form(...),
    token: dict = Depends(verify_firebase_token),
):
    try:
        return await esign_envelope_service.replace_active_document(
            user_id=_uid(token), user_email=_email(token), envelope_id=envelope_id,
            document_id=document_id, filename=file.filename or "replacement.pdf",
            content=await file.read(), reason=reason,
            expected_routing_version=expected_routing_version,
            meta=extract_request_meta(request, token),
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
        return esign_envelope_service.replace_fields(
            _uid(token), envelope_id, payload.fields,
            expected_revision=payload.expected_revision,
        )
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


@router.post(
    "/envelopes/{envelope_id}/clone-and-void",
    response_model=EsignCloneAndVoidResponse,
)
async def clone_and_void_envelope(
    envelope_id: str,
    payload: EsignCloneAndVoidRequest,
    request: Request,
    token: dict = Depends(verify_firebase_token),
):
    """Clone immutable evidence to a draft, then void the active source."""
    clone = None
    try:
        meta = extract_request_meta(request, token)
        clone = await esign_envelope_service.clone_for_correction(
            user_id=_uid(token), user_email=_email(token), envelope_id=envelope_id,
            reason=payload.reason,
            expected_routing_version=payload.expected_routing_version,
            meta=meta,
        )
        original = await esign_signing_service.void_envelope(
            user_id=_uid(token), user_email=_email(token), envelope_id=envelope_id,
            reason=payload.reason, meta=meta,
        )
        return EsignCloneAndVoidResponse(original=original, clone=clone)
    except Exception as exc:
        # If the source changed between clone and void, remove the unexposed
        # draft so the operation retains all-or-nothing behavior for callers.
        if clone is not None:
            try:
                await esign_envelope_service.delete_envelope(_uid(token), clone.id)
            except Exception:
                logger.exception("Could not compensate failed clone-and-void draft %s", clone.id)
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
            occupation=payload.occupation,
            address=payload.address,
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
        result = esign_recipient_service.reassign(
            user_id=_uid(token), user_email=_email(token), envelope_id=envelope_id,
            payload=payload, meta=extract_request_meta(request, token),
        )
        await esign_signing_service.notify_reassigned_recipient(envelope_id, result.id)
        return result
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
    token_key = hashlib.sha256(payload.invitation_token.encode("utf-8")).hexdigest()
    if not rate_limiter.check("esign_guest_exchange_token", token_key, limit=10, window_seconds=3600):
        raise HTTPException(status_code=429, detail="Too many guest ceremony requests; try again later")
    try:
        result, session_token, _ = esign_recipient_service.exchange_invitation(
            payload.invitation_token, extract_request_meta(request, None)
        )
        response.set_cookie(
            GUEST_COOKIE, session_token, httponly=True, secure=True, samesite="strict",
            max_age=2 * 60 * 60, path=f"/api/esign/guest/sessions/{result.session_id}",
        )
        response.headers["Cache-Control"] = "no-store"
        return result
    except Exception as exc:
        _raise_http(exc)


def _guest_cookie(request: Request) -> str:
    value = request.cookies.get(GUEST_COOKIE)
    if not value:
        raise EsignNotFound("Guest session is invalid or expired")
    return value


def _guest_actor(
    session_id: str, request: Request, csrf_token: str | None = None,
    *, purpose: str = "ceremony",
) -> tuple[dict, object]:
    if csrf_token is None and request.method not in ("GET", "HEAD"):
        raise PermissionError("Guest CSRF token is required")
    access = esign_recipient_service.resolve_guest_access(
        session_id, _guest_cookie(request), csrf_token, required_purpose=purpose,
    )
    meta = extract_request_meta(request, None)
    meta.access_method = "email_link"
    meta.invitation_id = access["invitation_id"]
    meta.session_id = access["session_id"]
    return access, meta


def _consume_guest(response: Response, session_id: str, request: Request) -> None:
    esign_recipient_service.consume_guest_access(session_id, _guest_cookie(request))
    response.delete_cookie(
        GUEST_COOKIE, path=f"/api/esign/guest/sessions/{session_id}",
    )


@router.get("/guest/sessions/{session_id}", response_model=EsignSigningSessionResponse)
async def get_guest_session(session_id: str, request: Request, response: Response):
    _enforce_guest_rate_limit(request, "session", limit=120, window_seconds=60)
    try:
        result = await esign_recipient_service.guest_signing_session(
            session_id, _guest_cookie(request), extract_request_meta(request, None),
        )
        response.headers["Cache-Control"] = "no-store"
        return result
    except Exception as exc:
        _raise_http(exc)


@router.post("/guest/sessions/{session_id}/consent", response_model=EsignConsentResponse)
async def record_guest_consent(
    session_id: str, payload: EsignConsentRequest, request: Request,
    csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
):
    _enforce_guest_rate_limit(request, "consent", limit=30, window_seconds=60)
    try:
        access, meta = _guest_actor(session_id, request, csrf_token)
        return esign_signing_service.record_consent(
            user_id=None, user_email=access["recipient_email"], envelope_id=access["envelope_id"],
            recipient_id=access["recipient_id"], expected_routing_version=payload.expected_routing_version,
            meta=meta,
        )
    except Exception as exc:
        _raise_http(exc)


@router.put("/guest/sessions/{session_id}/progress", response_model=EsignProgressResponse)
async def save_guest_progress(
    session_id: str, payload: EsignProgressRequest, request: Request,
    csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
):
    _enforce_guest_rate_limit(request, "progress", limit=120, window_seconds=60)
    try:
        access, _ = _guest_actor(session_id, request, csrf_token)
        saved = esign_signing_service.save_progress(
            user_id=None, user_email=access["recipient_email"], envelope_id=access["envelope_id"],
            recipient_id=access["recipient_id"], field_values=payload.field_values,
            expected_routing_version=payload.expected_routing_version,
        )
        return EsignProgressResponse(saved_count=saved)
    except Exception as exc:
        _raise_http(exc)


@router.post("/guest/sessions/{session_id}/attachments", response_model=EsignSignerAttachmentResponse)
async def upload_guest_attachment(
    session_id: str, request: Request, field_id: str = Form(...), file: UploadFile = File(...),
    csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
):
    try:
        access, _ = _guest_actor(session_id, request, csrf_token)
        return await esign_signing_service.upload_attachment(
            user_id=None, user_email=access["recipient_email"], envelope_id=access["envelope_id"],
            recipient_id=access["recipient_id"], field_id=field_id,
            filename=file.filename or "attachment", content_type=file.content_type or "application/octet-stream",
            content=await file.read(),
        )
    except Exception as exc:
        _raise_http(exc)


@router.delete("/guest/sessions/{session_id}/attachments/{attachment_id}")
async def delete_guest_attachment(
    session_id: str, attachment_id: str, request: Request,
    csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
):
    try:
        access, _ = _guest_actor(session_id, request, csrf_token)
        await esign_signing_service.delete_attachment(
            user_id=None, user_email=access["recipient_email"], envelope_id=access["envelope_id"],
            recipient_id=access["recipient_id"], attachment_id=attachment_id,
        )
        return {"message": "Attachment deleted"}
    except Exception as exc:
        _raise_http(exc)


@router.post("/guest/sessions/{session_id}/submit", response_model=EsignSubmitResponse)
async def submit_guest_signature(
    session_id: str, payload: EsignGuestSubmitRequest, request: Request, response: Response,
    csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
):
    _enforce_guest_rate_limit(request, "submit", limit=20, window_seconds=300)
    try:
        access, meta = _guest_actor(session_id, request, csrf_token)
        result = await esign_signing_service.submit_signature(
            user_id=None, user_email=access["recipient_email"], envelope_id=access["envelope_id"],
            recipient_id=access["recipient_id"], signature=payload.signature,
            field_values=payload.field_values, expected_routing_version=payload.expected_routing_version,
            occupation=payload.occupation, address=payload.address, meta=meta,
        )
        _consume_guest(response, session_id, request)
        return result
    except Exception as exc:
        _raise_http(exc)


@router.post("/guest/sessions/{session_id}/decline", response_model=EsignSubmitResponse)
async def decline_guest_envelope(
    session_id: str, payload: EsignDeclineRequest, request: Request, response: Response,
    csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
):
    try:
        access, meta = _guest_actor(session_id, request, csrf_token)
        result = await esign_signing_service.decline(
            user_id=None, user_email=access["recipient_email"], envelope_id=access["envelope_id"],
            recipient_id=access["recipient_id"], reason=payload.reason,
            expected_routing_version=payload.expected_routing_version, meta=meta,
        )
        response.delete_cookie(GUEST_COOKIE, path=f"/api/esign/guest/sessions/{session_id}")
        return result
    except Exception as exc:
        _raise_http(exc)


@router.post("/guest/sessions/{session_id}/approve", response_model=EsignSubmitResponse)
async def approve_guest_envelope(
    session_id: str, payload: EsignApproveRequest, request: Request, response: Response,
    csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
):
    try:
        access, meta = _guest_actor(session_id, request, csrf_token)
        result = await esign_recipient_service.approve(
            user_id=None, user_email=access["recipient_email"], envelope_id=access["envelope_id"],
            actor_recipient_id=access["recipient_id"], expected_routing_version=payload.expected_routing_version,
            meta=meta,
        )
        _consume_guest(response, session_id, request)
        return result
    except Exception as exc:
        _raise_http(exc)


@router.post("/guest/sessions/{session_id}/reassign", response_model=EsignRecipientResponse)
async def reassign_guest_recipient(
    session_id: str, payload: EsignReassignRequest, request: Request, response: Response,
    csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
):
    try:
        access, meta = _guest_actor(session_id, request, csrf_token)
        result = esign_recipient_service.reassign(
            user_id=None, user_email=access["recipient_email"], envelope_id=access["envelope_id"],
            actor_recipient_id=access["recipient_id"], payload=payload, meta=meta,
        )
        await esign_signing_service.notify_reassigned_recipient(access["envelope_id"], result.id)
        response.delete_cookie(GUEST_COOKIE, path=f"/api/esign/guest/sessions/{session_id}")
        return result
    except Exception as exc:
        _raise_http(exc)


@router.patch("/guest/sessions/{session_id}/managed-recipients", response_model=EsignManagedRecipientsResponse)
async def update_guest_managed_recipients(
    session_id: str, payload: EsignManagedRecipientsRequest, request: Request,
    csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
):
    try:
        access, meta = _guest_actor(session_id, request, csrf_token)
        return esign_recipient_service.manage_recipients(
            user_id=None, user_email=access["recipient_email"], envelope_id=access["envelope_id"],
            actor_recipient_id=access["recipient_id"], payload=payload, meta=meta,
        )
    except Exception as exc:
        _raise_http(exc)


@router.post("/guest/sessions/{session_id}/manager-complete", response_model=EsignSubmitResponse)
async def complete_guest_manager_step(
    session_id: str, payload: EsignVersionedActionRequest, request: Request, response: Response,
    csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
):
    try:
        access, meta = _guest_actor(session_id, request, csrf_token)
        result = await esign_recipient_service.manager_complete(
            user_id=None, user_email=access["recipient_email"], envelope_id=access["envelope_id"],
            actor_recipient_id=access["recipient_id"], expected_routing_version=payload.expected_routing_version,
            meta=meta,
        )
        _consume_guest(response, session_id, request)
        return result
    except Exception as exc:
        _raise_http(exc)


@router.post("/guest/sessions/{session_id}/corrections", response_model=EsignEnvelopeResponse)
async def correct_guest_recipients(
    session_id: str, payload: EsignCorrectionRequest, request: Request,
    csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
):
    try:
        access, meta = _guest_actor(session_id, request, csrf_token)
        return esign_recipient_service.correct_recipients(
            user_id=None, user_email=access["recipient_email"], envelope_id=access["envelope_id"],
            actor_recipient_id=access["recipient_id"], payload=payload, meta=meta,
        )
    except Exception as exc:
        _raise_http(exc)


@router.put("/guest/sessions/{session_id}/witness", response_model=EsignGuestInvitationResponse)
async def configure_guest_witness(
    session_id: str, payload: EsignWitnessRequest, request: Request,
    csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
):
    try:
        access, meta = _guest_actor(session_id, request, csrf_token)
        return esign_recipient_service.configure_witness(
            user_id=None, user_email=access["recipient_email"], envelope_id=access["envelope_id"],
            actor_recipient_id=access["recipient_id"], payload=payload, meta=meta,
        )
    except Exception as exc:
        _raise_http(exc)


@router.get("/guest/sessions/{session_id}/completed/{kind}", response_model=EsignDownloadResponse)
async def download_guest_completed(session_id: str, kind: Literal["sealed", "certificate"], request: Request):
    try:
        return await esign_recipient_service.guest_completed_download(
            session_id, _guest_cookie(request), kind,
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
