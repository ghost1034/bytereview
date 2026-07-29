"""Durable sending-at-scale workflows for e-signature.

The database is the queue and idempotency authority. Cloud Scheduler calls the
existing maintenance worker, which claims small batches with SKIP LOCKED; this
keeps local development functional while still being safe under concurrent
Cloud Tasks delivery.
"""

from __future__ import annotations

import csv
import hashlib
import io
import os
import re
import secrets
import statistics
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from core.database import db_config
from models.db_models import (
    AnalyticsUserRole,
    EsignBulkJob,
    EsignBulkRow,
    EsignDocument,
    EsignEnvelope,
    EsignEnvelopeStatus,
    EsignEventType,
    EsignField,
    EsignFieldType,
    EsignPowerForm,
    EsignPowerFormSubmission,
    EsignRecipient,
    EsignRecipientRole,
    EsignSigningType,
    EsignTemplate,
    EsignTemplateDocument,
    EsignTemplateField,
    EsignTemplateVersion,
    User,
)
from models.esign import (
    EsignBulkJobResponse,
    EsignBulkRowResponse,
    EsignPowerFormCreateRequest,
    EsignPowerFormResponse,
    EsignReportSummary,
    EsignTemplateVersionResponse,
    EsignTemplateVersionCompatibilityResponse,
    EsignTemplateResponse,
)
from services.analytics.firm_scope import require_firm_id
from services.esign import audit_service
from services.esign.audit_service import EsignRequestMeta
from services.esign.envelope_service import (
    DEFAULT_CONSENT_DISCLOSURE,
    EsignConflict,
    EsignError,
    EsignNotFound,
    _lock_draft_revision,
    esign_envelope_service,
    normalize_template_roles,
    validate_field_placement,
)
from services.esign.field_logic import remap_property_references, validate_field_graph
from services.esign.signing_service import esign_signing_service
from services.esign.url_service import app_base_url
from services.esign.authorization_service import esign_authorization_service

MAX_CSV_BYTES = 10 * 1024 * 1024
MAX_BULK_ROWS = 1_000
MIN_SCHEDULE = timedelta(minutes=5)
MAX_SCHEDULE = timedelta(days=365)


def _slug(label: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "_", label.strip().lower()).strip("_")
    return value or "recipient"


def _snapshot(template: EsignTemplate) -> dict[str, Any]:
    roles = normalize_template_roles(list(template.recipient_roles or []))
    return {
        "brand_id": str(template.brand_id) if getattr(template, "brand_id", None) else None,
        "name": template.name,
        "title": template.title,
        "message": template.message,
        "signing_type": template.signing_type.value if hasattr(template.signing_type, "value") else str(template.signing_type),
        "date_format": template.date_format,
        "recipient_roles": roles,
        "documents": [{
            "id": str(d.id), "display_order": int(d.display_order),
            "original_filename": d.original_filename, "gcs_object_name": d.gcs_object_name,
            "sha256": d.sha256, "page_count": int(d.page_count),
            "file_size_bytes": int(d.file_size_bytes),
        } for d in template.documents or []],
        "fields": [{
            "id": str(f.id), "template_document_id": str(f.template_document_id),
            "recipient_index": int(f.recipient_index),
            "recipient_role_id": str(f.recipient_role_id) if getattr(f, "recipient_role_id", None) else roles[int(f.recipient_index)]["id"],
            "field_type": f.field_type.value if hasattr(f.field_type, "value") else str(f.field_type),
            "page_number": int(f.page_number), "pos_x": float(f.pos_x), "pos_y": float(f.pos_y),
            "width": float(f.width), "height": float(f.height), "required": bool(f.required),
            "label": f.label, "properties": dict(f.properties or {}),
        } for f in template.fields or []],
    }


def bulk_headers(snapshot: dict[str, Any]) -> list[str]:
    headers = ["envelope_title", "message", "expires_in_days", "reminder_interval_hours"]
    seen: set[str] = set()
    for role in snapshot.get("recipient_roles", []):
        base = _slug(str(role.get("label") or role.get("role") or "recipient"))
        if base in seen:
            raise EsignError(f"Recipient role labels must be unique after CSV normalization: {base}")
        seen.add(base)
        headers.extend((f"{base}_name", f"{base}_email"))
    labels: set[str] = set()
    for field in snapshot.get("fields", []):
        props = field.get("properties") or {}
        label = str(props.get("data_label") or "").strip()
        if label and "sender_prefill" in props and label not in labels:
            if label in headers or label in ("schedule_at", "schedule_timezone"):
                raise EsignError(f"Sender-prefill data label conflicts with a reserved CSV column: {label}")
            headers.append(label)
            labels.add(label)
    return headers + ["schedule_at", "schedule_timezone"]


def _parse_schedule(value: str, timezone_name: str, *, now: datetime) -> datetime:
    if not value.strip():
        raise ValueError("schedule_at is empty")
    try:
        zone = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as exc:
        raise ValueError("schedule_timezone must be a valid IANA timezone") from exc
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("schedule_at must be an ISO-8601 date/time") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=zone)
        # A round trip detects nonexistent wall-clock times during the DST jump.
        if parsed.astimezone(timezone.utc).astimezone(zone).replace(tzinfo=None) != parsed.replace(tzinfo=None):
            raise ValueError("schedule_at is not a valid local time because of daylight saving time")
    utc = parsed.astimezone(timezone.utc)
    if utc < now + MIN_SCHEDULE or utc > now + MAX_SCHEDULE:
        raise ValueError("schedule_at must be between 5 minutes and 365 days from now")
    return utc


def validate_bulk_csv(content: bytes, snapshot: dict[str, Any], *, now: Optional[datetime] = None) -> list[dict[str, Any]]:
    if len(content) > MAX_CSV_BYTES:
        raise EsignError("CSV exceeds the 10 MB limit")
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise EsignError("CSV must be UTF-8 encoded") from exc
    reader = csv.DictReader(io.StringIO(text, newline=""))
    expected = bulk_headers(snapshot)
    if reader.fieldnames != expected:
        raise EsignError(f"CSV headers must exactly match the template sample: {', '.join(expected)}")
    raw_rows = list(reader)
    if not raw_rows or len(raw_rows) > MAX_BULK_ROWS:
        raise EsignError("CSV must contain between 1 and 1,000 data rows")
    now = now or datetime.now(timezone.utc)
    result: list[dict[str, Any]] = []
    roles = snapshot.get("recipient_roles", [])
    prefill_fields = {str((field.get("properties") or {}).get("data_label")): field
        for field in snapshot.get("fields", []) if "sender_prefill" in (field.get("properties") or {})
        and (field.get("properties") or {}).get("data_label")}
    for row_number, raw in enumerate(raw_rows, start=2):
        normalized = {key: (value or "").strip() for key, value in raw.items()}
        errors: list[str] = []
        emails: list[str] = []
        for role in roles:
            base = _slug(str(role.get("label") or role.get("role") or "recipient"))
            name, email = normalized[f"{base}_name"], normalized[f"{base}_email"].lower()
            normalized[f"{base}_email"] = email
            if not name or not email:
                errors.append(f"{role.get('label') or base} name and email are required")
            elif not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
                errors.append(f"{role.get('label') or base} email is invalid")
            emails.append(email)
        if len([e for e in emails if e]) != len(set(e for e in emails if e)):
            errors.append("recipient emails must be unique within an envelope")
        for key, minimum, maximum in (("expires_in_days", 1, 365), ("reminder_interval_hours", 1, 720)):
            if normalized[key]:
                try:
                    number = int(normalized[key])
                    if number < minimum or number > maximum:
                        raise ValueError
                except ValueError:
                    errors.append(f"{key} must be an integer from {minimum} to {maximum}")
        for label, field in prefill_fields.items():
            value = normalized.get(label, ""); props = field.get("properties") or {}; field_type = field.get("field_type")
            if not value: continue
            text_rule = props.get("text_validation") or {}
            if text_rule.get("max_length") and len(value) > int(text_rule["max_length"]): errors.append(f"{label} is too long")
            if text_rule.get("regex"):
                try:
                    if re.fullmatch(str(text_rule["regex"]), value) is None: errors.append(f"{label} has an invalid format")
                except re.error: errors.append(f"{label} has an invalid template validation rule")
            if field_type == "number":
                try:
                    number = float(value); rule = props.get("number_validation") or {}
                    if rule.get("minimum") is not None and number < float(rule["minimum"]): errors.append(f"{label} is below its minimum")
                    if rule.get("maximum") is not None and number > float(rule["maximum"]): errors.append(f"{label} exceeds its maximum")
                except ValueError: errors.append(f"{label} must be a number")
            if field_type == "date":
                try: datetime.fromisoformat(value)
                except ValueError: errors.append(f"{label} must be an ISO-8601 date")
            if field_type == "dropdown" and value not in {str(option.get("value")) for option in props.get("options", [])}:
                errors.append(f"{label} must be one of the configured options")
        scheduled_at = None
        if normalized["schedule_at"] or normalized["schedule_timezone"]:
            if not normalized["schedule_at"] or not normalized["schedule_timezone"]:
                errors.append("schedule_at and schedule_timezone must be supplied together")
            else:
                try:
                    scheduled_at = _parse_schedule(normalized["schedule_at"], normalized["schedule_timezone"], now=now)
                except ValueError as exc:
                    errors.append(str(exc))
        result.append({"row_number": row_number, "normalized": normalized, "errors": errors, "scheduled_at": scheduled_at})
    return result


class EsignScaleService:
    def _get_session(self) -> Session:
        return db_config.get_session()

    @staticmethod
    def _require_feature(db: Session, user_id: str, feature: str, capability: str) -> None:
        principal = esign_authorization_service.principal(db, user_id)
        if principal and not esign_authorization_service.effective_feature(principal, feature, capability):
            raise EsignNotFound("E-Signature feature not found")

    @staticmethod
    def _version_response(row: EsignTemplateVersion) -> EsignTemplateVersionResponse:
        return EsignTemplateVersionResponse(id=str(row.id), template_id=str(row.template_id), version=row.version,
            published_at=row.published_at, published_by_user_id=row.published_by_user_id)

    @staticmethod
    def _bulk_response(job: EsignBulkJob, include_rows: bool = True) -> EsignBulkJobResponse:
        rows = [EsignBulkRowResponse(
            id=str(r.id), row_number=r.row_number, status=r.status, normalized_input=r.normalized_input,
            attempts=r.attempts, error_code=r.error_code, error_message=r.error_message,
            scheduled_at=r.scheduled_at, schedule_timezone=r.schedule_timezone,
            envelope_id=str(r.envelope_id) if r.envelope_id else None,
        ) for r in sorted(job.rows or [], key=lambda item: item.row_number)] if include_rows else []
        return EsignBulkJobResponse(id=str(job.id), template_version_id=str(job.template_version_id), status=job.status,
            total_rows=job.total_rows, valid_rows=job.valid_rows, invalid_rows=job.invalid_rows,
            processed_rows=job.processed_rows, created_at=job.created_at, confirmed_at=job.confirmed_at,
            completed_at=job.completed_at, rows=rows)

    @staticmethod
    def _powerform_response(row: EsignPowerForm, public_token: Optional[str] = None) -> EsignPowerFormResponse:
        base = app_base_url()
        return EsignPowerFormResponse(id=str(row.id), name=row.name, template_version_id=str(row.template_version_id),
            state=row.state, starts_at=row.starts_at, ends_at=row.ends_at, submission_cap=row.submission_cap,
            submission_count=row.submission_count, role_config=row.role_config, public_fields=row.public_fields or [],
            instructions=row.instructions, public_url=f"{base}/esign/p/{public_token}" if public_token else None,
            created_at=row.created_at, updated_at=row.updated_at,
            brand_id=str(row.brand_id) if getattr(row, "brand_id", None) else None)

    async def publish_template(
        self, user_id: str, template_id: str, *, expected_revision: Optional[int] = None,
    ) -> EsignTemplateVersionResponse:
        db = self._get_session()
        try:
            template = esign_envelope_service._load_template(db, user_id, template_id)
            _lock_draft_revision(db, template, expected_revision)
            firm_id = require_firm_id(db, user_id)
            checked_rules: set[str] = set()
            documents_by_id = {str(document.id): document for document in template.documents or []}
            for field in template.fields or []:
                document = documents_by_id.get(str(field.template_document_id))
                if document is None:
                    raise EsignError("Template field references an unknown document")
                validate_field_placement(field, document)
                props = field.properties or {}
                anchor = props.get("anchor")
                if anchor and not (anchor.get("anchor") or anchor.get("text")):
                    raise EsignError("Every anchor placement rule must contain anchor text")
                if anchor:
                    rule_key = str(anchor.get("rule_id") or field.id)
                    if rule_key not in checked_rules:
                        checked_rules.add(rule_key)
                        result = await esign_envelope_service._search_anchors(list(template.documents or []),
                            anchor=str(anchor.get("anchor") or anchor.get("text")),
                            case_sensitive=bool(anchor.get("case_sensitive", False)), whole_word=bool(anchor.get("whole_word", False)),
                            document_ids=anchor.get("document_ids"), page_numbers=anchor.get("page_numbers"),
                            match_mode=str(anchor.get("match_mode", "all")), horizontal_alignment=str(anchor.get("horizontal_alignment", "after")),
                            relative_position=anchor.get("relative_position"),
                            cross_axis_alignment=anchor.get("cross_axis_alignment"),
                            offset_x=float(anchor.get("offset_x", 0)), offset_y=float(anchor.get("offset_y", 0)),
                            offset_unit=str(anchor.get("offset_unit", "point")),
                            field_width=float(field.width), field_height=float(field.height))
                if props.get("conversion_source") == "acroform" and not props.get("acroform_widget_id"):
                    raise EsignError("Every PDF-field mapping must retain its widget ID")
            latest = db.query(func.max(EsignTemplateVersion.version)).filter(EsignTemplateVersion.template_id == template.id).scalar() or 0
            row = EsignTemplateVersion(id=uuid.uuid4(), template_id=template.id, firm_id=firm_id,
                version=int(latest) + 1, snapshot=_snapshot(template), published_by_user_id=user_id)
            template.firm_id = firm_id
            db.add(row); db.commit(); db.refresh(row)
            return self._version_response(row)
        except Exception:
            db.rollback(); raise
        finally:
            db.close()

    def list_versions(self, user_id: str, template_id: str) -> list[EsignTemplateVersionResponse]:
        db = self._get_session()
        try:
            template = esign_envelope_service._load_template(db, user_id, template_id)
            rows = db.query(EsignTemplateVersion).filter(EsignTemplateVersion.template_id == template.id).order_by(EsignTemplateVersion.version.desc()).all()
            return [self._version_response(row) for row in rows]
        finally:
            db.close()

    async def create_draft_from_version(self, user_id: str, version_id: str) -> EsignTemplateResponse:
        db = self._get_session()
        created_objects: list[str] = []
        try:
            version = self._owned_version(db, user_id, version_id)
            snapshot = dict(version.snapshot or {})
            template = EsignTemplate(
                id=uuid.uuid4(), user_id=user_id, firm_id=version.firm_id,
                name=f"{snapshot.get('name') or 'Template'} (v{version.version} draft)",
                title=snapshot.get("title"), message=snapshot.get("message"),
                signing_type=EsignSigningType(snapshot.get("signing_type") or "sequential"),
                date_format=snapshot.get("date_format") or "MM/DD/YYYY",
                recipient_roles=normalize_template_roles(snapshot.get("recipient_roles") or []),
                brand_id=uuid.UUID(snapshot["brand_id"]) if snapshot.get("brand_id") else None,
            )
            db.add(template); db.flush()
            document_ids: dict[str, uuid.UUID] = {}
            for source in snapshot.get("documents", []):
                document_id = uuid.uuid4()
                object_name = f"esign_templates/{user_id}/{template.id}/{document_id}_{os.path.basename(source['original_filename'])}"
                await esign_envelope_service.storage.copy_object(source["gcs_object_name"], object_name)
                created_objects.append(object_name); document_ids[str(source["id"])] = document_id
                db.add(EsignTemplateDocument(
                    id=document_id, template_id=template.id, display_order=int(source.get("display_order", 0)),
                    original_filename=source["original_filename"], gcs_object_name=object_name,
                    sha256=source["sha256"], page_count=int(source["page_count"]),
                    file_size_bytes=int(source["file_size_bytes"]),
                ))
            field_ids = {str(field.get("id")): str(uuid.uuid4()) for field in snapshot.get("fields", [])}
            source_documents = {str(item["id"]): item for item in snapshot.get("documents", [])}
            for field in snapshot.get("fields", []):
                source_document_id = str(field["template_document_id"])
                if source_document_id not in document_ids: continue
                validate_field_placement(field, source_documents[source_document_id])
                db.add(EsignTemplateField(
                    id=uuid.UUID(field_ids[str(field.get("id"))]), template_id=template.id,
                    template_document_id=document_ids[source_document_id],
                    recipient_index=int(field["recipient_index"]),
                    recipient_role_id=uuid.UUID(str(field["recipient_role_id"])) if field.get("recipient_role_id") else None,
                    field_type=EsignFieldType(field["field_type"]), page_number=int(field["page_number"]),
                    pos_x=field["pos_x"], pos_y=field["pos_y"], width=field["width"], height=field["height"],
                    required=bool(field.get("required", True)), label=field.get("label"),
                    properties=remap_property_references(dict(field.get("properties") or {}), field_ids),
                ))
            db.commit(); db.refresh(template)
            return esign_envelope_service._serialize_template(template)
        except Exception:
            db.rollback()
            for object_name in created_objects:
                try: await esign_envelope_service.storage.delete_file(object_name)
                except Exception: pass
            raise
        finally:
            db.close()

    def sample_csv(self, user_id: str, version_id: str) -> str:
        db = self._get_session()
        try:
            version = self._owned_version(db, user_id, version_id)
            output = io.StringIO(newline="")
            csv.writer(output).writerow(bulk_headers(version.snapshot))
            return output.getvalue()
        finally:
            db.close()

    def create_bulk_job(self, user_id: str, version_id: str, content: bytes,
                        default_schedule_at: Optional[datetime] = None,
                        default_schedule_timezone: Optional[str] = None) -> EsignBulkJobResponse:
        db = self._get_session()
        try:
            self._require_feature(db, user_id, "bulk_sends", "bulk_sends")
            version = self._owned_version(db, user_id, version_id)
            parsed = validate_bulk_csv(content, version.snapshot)
            default_utc = None
            if default_schedule_at or default_schedule_timezone:
                if not default_schedule_at or not default_schedule_timezone:
                    raise EsignError("Batch schedule time and timezone must be supplied together")
                value = default_schedule_at.isoformat()
                default_utc = _parse_schedule(value, default_schedule_timezone, now=datetime.now(timezone.utc))
            job = EsignBulkJob(id=uuid.uuid4(), firm_id=version.firm_id, user_id=user_id,
                template_version_id=version.id, status="ready", total_rows=len(parsed),
                valid_rows=sum(not r["errors"] for r in parsed), invalid_rows=sum(bool(r["errors"]) for r in parsed),
                default_schedule_at=default_utc, default_schedule_timezone=default_schedule_timezone)
            db.add(job); db.flush()
            for item in parsed:
                digest = hashlib.sha256(f"{job.id}:{item['row_number']}".encode()).hexdigest()
                db.add(EsignBulkRow(id=uuid.uuid4(), job_id=job.id, row_number=item["row_number"],
                    idempotency_key=digest, normalized_input=item["normalized"],
                    status="invalid" if item["errors"] else "valid", error_code="validation_failed" if item["errors"] else None,
                    error_message="; ".join(item["errors"]) or None, scheduled_at=item["scheduled_at"] or default_utc,
                    schedule_timezone=item["normalized"].get("schedule_timezone") or default_schedule_timezone))
            db.commit(); db.refresh(job)
            return self._bulk_response(job)
        except Exception:
            db.rollback(); raise
        finally:
            db.close()

    def list_bulk_jobs(self, user_id: str) -> list[EsignBulkJobResponse]:
        db = self._get_session()
        try:
            firm_id = require_firm_id(db, user_id)
            rows = db.query(EsignBulkJob).options(joinedload(EsignBulkJob.rows)).filter(
                EsignBulkJob.firm_id == firm_id, EsignBulkJob.user_id == user_id,
                EsignBulkJob.kind == "bulk").order_by(EsignBulkJob.created_at.desc()).all()
            return [self._bulk_response(row, include_rows=False) for row in rows]
        finally: db.close()

    def get_bulk_job(self, user_id: str, job_id: str) -> EsignBulkJobResponse:
        db = self._get_session()
        try: return self._bulk_response(self._owned_job(db, user_id, job_id))
        finally: db.close()

    def confirm_bulk_job(self, user_id: str, job_id: str) -> EsignBulkJobResponse:
        db = self._get_session()
        try:
            job = self._owned_job(db, user_id, job_id)
            if job.confirmed_at is not None and job.status != "cancelled":
                return self._bulk_response(job)
            if job.status != "ready": raise EsignConflict("Only a ready bulk job can be confirmed")
            if job.valid_rows == 0: raise EsignConflict("This bulk job has no valid rows to process")
            job.status = "queued"; job.confirmed_at = datetime.now(timezone.utc)
            for row in job.rows or []:
                if row.status == "valid": row.status = "queued"
            db.commit(); db.refresh(job); return self._bulk_response(job)
        except Exception: db.rollback(); raise
        finally: db.close()

    def cancel_bulk_job(self, user_id: str, job_id: str) -> EsignBulkJobResponse:
        db = self._get_session()
        try:
            job = self._owned_job(db, user_id, job_id)
            if job.status == "cancelled":
                return self._bulk_response(job)
            if job.status not in ("ready", "queued", "processing"):
                raise EsignConflict("Only a ready or active bulk job can be cancelled")
            for row in job.rows or []:
                if row.status in ("valid", "queued", "materialized", "scheduled"):
                    if row.envelope_id:
                        env = db.query(EsignEnvelope).filter(EsignEnvelope.id == row.envelope_id).first()
                        if env and env.status in (EsignEnvelopeStatus.DRAFT, EsignEnvelopeStatus.SCHEDULED):
                            # Cancellation policy: unsent draft artifacts are retained as
                            # ordinary drafts so a sender can inspect or safely delete them.
                            env.status = EsignEnvelopeStatus.DRAFT
                    row.status = "cancelled"
            job.status = "cancelled"; job.completed_at = datetime.now(timezone.utc)
            db.commit(); db.refresh(job); return self._bulk_response(job)
        except Exception: db.rollback(); raise
        finally: db.close()

    def retry_bulk_job(self, user_id: str, job_id: str) -> EsignBulkJobResponse:
        db = self._get_session()
        try:
            job = self._owned_job(db, user_id, job_id)
            if job.status == "queued" and job.completed_at is None and any(
                    row.status == "queued" and row.attempts > 0 for row in job.rows or []):
                return self._bulk_response(job)
            if job.status not in ("partial_failed", "completed"):
                raise EsignConflict("Only a finished bulk job with failed rows can be retried")
            retried = 0
            for row in job.rows or []:
                if row.status == "failed":
                    row.status = "queued"; row.error_code = None; row.error_message = None; retried += 1
            if not retried: raise EsignConflict("This job has no failed rows to retry")
            job.status = "queued"; job.completed_at = None
            db.commit(); db.refresh(job); return self._bulk_response(job)
        except Exception: db.rollback(); raise
        finally: db.close()

    def error_csv(self, user_id: str, job_id: str) -> str:
        db = self._get_session()
        try:
            job = self._owned_job(db, user_id, job_id)
            output = io.StringIO(newline=""); writer = csv.writer(output)
            original_headers: list[str] = []
            for row in sorted(job.rows or [], key=lambda r: r.row_number):
                for key in (row.normalized_input or {}):
                    if key not in original_headers:
                        original_headers.append(key)
            writer.writerow([*original_headers, "_row_number", "_status", "_error_code", "_error_message"])
            for row in sorted(job.rows or [], key=lambda r: r.row_number):
                if row.error_message:
                    writer.writerow([*((row.normalized_input or {}).get(key, "") for key in original_headers),
                                     row.row_number, row.status, row.error_code or "", row.error_message])
            return output.getvalue()
        finally: db.close()

    async def process_queued_rows(self, limit: int = 50) -> int:
        db = self._get_session()
        try:
            ids = [r.id for r in db.query(EsignBulkRow).filter(EsignBulkRow.status == "queued").with_for_update(skip_locked=True).limit(limit).all()]
            for row_id in ids:
                row = db.query(EsignBulkRow).filter(EsignBulkRow.id == row_id).first()
                if row: row.status = "processing"; row.attempts += 1
            db.commit()
        finally: db.close()
        for row_id in ids:
            await self._materialize_bulk_row(row_id)
        return len(ids)

    async def _materialize_bulk_row(self, row_id: uuid.UUID) -> None:
        db = self._get_session()
        immediate: Optional[tuple[str, str, str]] = None
        try:
            row = db.query(EsignBulkRow).options(joinedload(EsignBulkRow.job)).filter(EsignBulkRow.id == row_id).with_for_update().first()
            if not row or row.status != "processing": return
            job = row.job
            version = db.query(EsignTemplateVersion).filter(EsignTemplateVersion.id == job.template_version_id).first()
            if row.envelope_id:
                existing = db.query(EsignEnvelope).filter(EsignEnvelope.id == row.envelope_id).first()
                if existing and existing.status in (EsignEnvelopeStatus.SENT, EsignEnvelopeStatus.IN_PROGRESS, EsignEnvelopeStatus.COMPLETED):
                    row.status = "sent"; db.commit(); return
                if existing and existing.status == EsignEnvelopeStatus.SCHEDULED:
                    row.status = "scheduled"; db.commit(); return
                if existing:
                    existing.status = EsignEnvelopeStatus.DRAFT
                    existing.send_error_code = None; existing.send_error_message = None
                    row.status = "materialized"
                    immediate = (job.user_id, self._sender_email(db, job.user_id), str(existing.id))
                    db.commit()
                    await esign_signing_service.send_envelope(user_id=immediate[0], user_email=immediate[1], envelope_id=immediate[2], meta=EsignRequestMeta())
                    self._mark_bulk_sent(row_id); return
                row.envelope_id = None
            snap, data = version.snapshot, row.normalized_input
            env = EsignEnvelope(id=uuid.uuid4(), user_id=job.user_id, firm_id=job.firm_id,
                source_type=data.get("__source_type") or "bulk",
                source_id=uuid.UUID(data["__source_id"]) if data.get("__source_id") else job.id,
                template_version_id=version.id,
                template_id=version.template_id,
                title=(data.get("envelope_title") or snap.get("title") or "Untitled envelope")[:255],
                message=data.get("message") or snap.get("message"), status=EsignEnvelopeStatus.DRAFT,
                signing_type=EsignSigningType(snap.get("signing_type", "sequential")),
                date_format=snap.get("date_format") or "MM/DD/YYYY", consent_disclosure_text=DEFAULT_CONSENT_DISCLOSURE,
                brand_id=uuid.UUID(snap["brand_id"]) if snap.get("brand_id") else None,
                reminder_interval_hours=int(data["reminder_interval_hours"]) if data.get("reminder_interval_hours") else None)
            if data.get("expires_in_days"): env.expires_at = datetime.now(timezone.utc) + timedelta(days=int(data["expires_in_days"]))
            db.add(env); db.flush()
            doc_map: dict[str, EsignDocument] = {}
            for d in snap.get("documents", []):
                object_name = f"esign/{job.user_id}/{env.id}/original/{uuid.uuid4()}_{os.path.basename(d['original_filename'])}"
                await esign_envelope_service.storage.copy_object(d["gcs_object_name"], object_name)
                doc = EsignDocument(id=uuid.uuid4(), envelope_id=env.id, display_order=d["display_order"],
                    original_filename=d["original_filename"], gcs_object_name=object_name, original_sha256=d["sha256"],
                    page_count=d["page_count"], file_size_bytes=d["file_size_bytes"])
                db.add(doc); doc_map[d["id"]] = doc
            roles = normalize_template_roles(snap.get("recipient_roles", []))
            recipients: list[EsignRecipient] = []
            recipients_by_role_id: dict[str, EsignRecipient] = {}
            for role in roles:
                base = _slug(str(role.get("label") or role.get("role") or "recipient"))
                recipient = EsignRecipient(id=uuid.uuid4(), envelope_id=env.id,
                    name=data[f"{base}_name"], email=data[f"{base}_email"], role=EsignRecipientRole(role.get("role", "signer")),
                    routing_order=int(role.get("routing_order", 1)), role_label=role.get("label"),
                    private_message=role.get("private_message"), host_name=role.get("host_name"),
                    host_email=(str(role.get("host_email") or "").strip().lower() or None),
                    allow_reassignment=bool(role.get("allow_reassignment", False)),
                    template_role_id=uuid.UUID(role["id"]))
                db.add(recipient); recipients.append(recipient); recipients_by_role_id[role["id"]] = recipient
            db.flush()
            for role in roles:
                recipient = recipients_by_role_id[role["id"]]
                manager = recipients_by_role_id.get(str(role.get("managed_by_role_id")))
                witness_for = recipients_by_role_id.get(str(role.get("witness_for_role_id")))
                recipient.managed_by_recipient_id = manager.id if manager else None
                recipient.witness_for_recipient_id = witness_for.id if witness_for else None
            db.flush()
            id_map = {f["id"]: str(uuid.uuid4()) for f in snap.get("fields", [])}
            fields: list[EsignField] = []
            for f in snap.get("fields", []):
                props = remap_property_references(f.get("properties") or {}, id_map)
                label = props.get("data_label")
                if label and label in data and "sender_prefill" in props: props["sender_prefill"] = data[label]
                role_id = str(f.get("recipient_role_id") or roles[int(f["recipient_index"])]["id"])
                recipient = recipients_by_role_id.get(role_id)
                if recipient is None:
                    recipient = recipients[int(f["recipient_index"])]
                validate_field_placement(f, doc_map[f["template_document_id"]])
                field = EsignField(id=uuid.UUID(id_map[f["id"]]), envelope_id=env.id,
                    document_id=doc_map[f["template_document_id"]].id, recipient_id=recipient.id,
                    field_type=EsignFieldType(f["field_type"]), page_number=f["page_number"], pos_x=f["pos_x"], pos_y=f["pos_y"],
                    width=f["width"], height=f["height"], required=f["required"], label=f.get("label"), properties=props)
                db.add(field); fields.append(field)
            validate_field_graph(fields)
            audit_service.record_event(db, envelope_id=env.id, event_type=EsignEventType.CREATED,
                actor_user_id=job.user_id,
                meta=EsignRequestMeta(ip_address=data.get("__ip_address"), user_agent=data.get("__user_agent"),
                    mfa_verified=False if data.get("__source_type") == "powerform" else None,
                    mfa_method="email_link" if data.get("__source_type") == "powerform" else None),
                details={"source_type": env.source_type, "source_id": str(env.source_id),
                    "bulk_job_id": str(job.id) if env.source_type == "bulk" else None,
                    "bulk_row_id": str(row.id) if env.source_type == "bulk" else None,
                    "powerform_id": data.get("__source_id"), "submission_id": data.get("__submission_id"),
                    "verification_method": "email_link" if env.source_type == "powerform" else None,
                    "consent": data.get("__consent") if env.source_type == "powerform" else None,
                    "template_version_id": str(version.id)})
            row.envelope_id = env.id
            if row.scheduled_at:
                env.status = EsignEnvelopeStatus.SCHEDULED; env.scheduled_at = row.scheduled_at; env.schedule_timezone = row.schedule_timezone
                row.status = "scheduled"
            else:
                row.status = "materialized"; immediate = (job.user_id, self._sender_email(db, job.user_id), str(env.id))
            db.commit()
            if immediate:
                await esign_signing_service.send_envelope(user_id=immediate[0], user_email=immediate[1], envelope_id=immediate[2], meta=EsignRequestMeta())
                self._mark_bulk_sent(row_id)
        except Exception as exc:
            db.rollback(); self._mark_bulk_failed(row_id, exc)
        finally:
            db.close(); self._refresh_job_for_row(row_id)

    async def dispatch_due(self, limit: int = 100) -> int:
        now = datetime.now(timezone.utc); db = self._get_session()
        try:
            rows = db.query(EsignEnvelope).filter(EsignEnvelope.status == EsignEnvelopeStatus.SCHEDULED,
                EsignEnvelope.scheduled_at <= now).with_for_update(skip_locked=True).limit(limit).all()
            claimed = [(e.id, e.user_id, self._sender_email(db, e.user_id)) for e in rows]
            for env in rows: env.status = EsignEnvelopeStatus.DRAFT; env.schedule_claimed_at = now
            db.commit()
        finally: db.close()
        for env_id, user_id, email in claimed:
            try:
                await esign_signing_service.send_envelope(user_id=user_id, user_email=email, envelope_id=str(env_id), meta=EsignRequestMeta())
                self._mark_envelope_row_status(env_id, "sent")
            except Exception as exc:
                self._mark_send_failed(env_id, exc)
        return len(claimed)

    def schedule(self, user_id: str, envelope_id: str, schedule_at: datetime, timezone_name: str):
        now = datetime.now(timezone.utc)
        if schedule_at.tzinfo is None: schedule_at = _parse_schedule(schedule_at.isoformat(), timezone_name, now=now)
        else:
            ZoneInfo(timezone_name); schedule_at = schedule_at.astimezone(timezone.utc)
            if schedule_at < now + MIN_SCHEDULE or schedule_at > now + MAX_SCHEDULE: raise EsignError("Schedule must be 5 minutes to 365 days ahead")
        db = self._get_session()
        try:
            self._require_feature(db, user_id, "scheduled_sending", "scheduling")
            env = esign_envelope_service._load_envelope(db, user_id, envelope_id)
            if env.status != EsignEnvelopeStatus.DRAFT: raise EsignConflict("Only a draft envelope can be scheduled")
            env.status = EsignEnvelopeStatus.SCHEDULED; env.scheduled_at = schedule_at; env.schedule_timezone = timezone_name
            audit_service.record_event(db, envelope_id=env.id, event_type=EsignEventType.SCHEDULED,
                actor_user_id=user_id, details={"scheduled_at": schedule_at.isoformat(), "timezone": timezone_name})
            db.commit(); db.refresh(env); return esign_envelope_service._serialize_envelope(env)
        except Exception: db.rollback(); raise
        finally: db.close()

    def unschedule(self, user_id: str, envelope_id: str):
        db = self._get_session()
        try:
            env = esign_envelope_service._load_envelope(db, user_id, envelope_id)
            if env.status != EsignEnvelopeStatus.SCHEDULED: raise EsignConflict("Envelope is not scheduled")
            env.status = EsignEnvelopeStatus.DRAFT; env.scheduled_at = None; env.schedule_timezone = None; env.schedule_claimed_at = None
            audit_service.record_event(db, envelope_id=env.id, event_type=EsignEventType.UNSCHEDULED, actor_user_id=user_id)
            db.commit(); db.refresh(env); return esign_envelope_service._serialize_envelope(env)
        except Exception: db.rollback(); raise
        finally: db.close()

    async def retry_failed_send(self, user_id: str, user_email: str, envelope_id: str, meta: EsignRequestMeta):
        db = self._get_session()
        try:
            env = esign_envelope_service._load_envelope(db, user_id, envelope_id)
            if env.status != EsignEnvelopeStatus.SEND_FAILED: raise EsignConflict("Envelope is not in send_failed status")
            env.status = EsignEnvelopeStatus.DRAFT; env.send_error_code = None; env.send_error_message = None
            db.commit(); env_id = env.id
        except Exception: db.rollback(); raise
        finally: db.close()
        try:
            return await esign_signing_service.send_envelope(user_id=user_id, user_email=user_email,
                envelope_id=envelope_id, meta=meta)
        except Exception as exc:
            self._mark_send_failed(env_id, exc); raise

    def recover_failed_send_draft(self, user_id: str, envelope_id: str) -> EsignEnvelopeResponse:
        db = self._get_session()
        try:
            env = esign_envelope_service._load_envelope(db, user_id, envelope_id)
            if env.status != EsignEnvelopeStatus.SEND_FAILED: raise EsignConflict("Envelope is not in send_failed status")
            env.status = EsignEnvelopeStatus.DRAFT
            audit_service.record_event(db, envelope_id=env.id, event_type=EsignEventType.CORRECTED,
                actor_user_id=user_id, details={"recovery": "send_failed_to_draft", "error_code": env.send_error_code})
            db.commit(); db.refresh(env); return esign_envelope_service._serialize_envelope(env)
        except Exception: db.rollback(); raise
        finally: db.close()

    def create_powerform(self, user_id: str, payload: EsignPowerFormCreateRequest) -> EsignPowerFormResponse:
        db = self._get_session()
        try:
            self._require_feature(db, user_id, "powerforms", "powerforms")
            version = self._owned_version(db, user_id, payload.template_version_id)
            selected_brand_id = uuid.UUID(payload.brand_id) if payload.brand_id else None
            if selected_brand_id:
                from models.db_models import EsignBrandProfile
                if not db.query(EsignBrandProfile).filter(EsignBrandProfile.id == selected_brand_id,
                    EsignBrandProfile.firm_id == version.firm_id, EsignBrandProfile.active.is_(True)).first():
                    raise EsignNotFound("Brand not found")
            visitors = [r for r in payload.role_config if r.identity_source == "visitor" and r.initiating_signer]
            if len(visitors) != 1: raise EsignError("Exactly one visitor-provided role must be the initiating signer")
            role_count = len(version.snapshot.get("recipient_roles", []))
            if sorted(r.recipient_index for r in payload.role_config) != list(range(role_count)):
                raise EsignError("PowerForm must configure every template recipient role exactly once")
            for r in payload.role_config:
                if r.identity_source == "preset" and (not r.name or not r.email): raise EsignError("Preset roles require name and email")
            initiating_role = version.snapshot["recipient_roles"][visitors[0].recipient_index].get("role", "signer")
            if initiating_role in ("cc", "certified_delivery"):
                raise EsignError("The initiating signer must have an actionable signing role")
            allowed_fields = {str((f.get("properties") or {}).get("data_label")) for f in version.snapshot.get("fields", [])
                if "sender_prefill" in (f.get("properties") or {}) and (f.get("properties") or {}).get("data_label")}
            if not set(payload.public_fields).issubset(allowed_fields):
                raise EsignError("Public fields must be sender-prefill data labels from the published version")
            now = datetime.now(timezone.utc)
            if any(value and value.tzinfo is None for value in (payload.starts_at, payload.ends_at)):
                raise EsignError("PowerForm dates must include a timezone")
            if payload.starts_at and payload.ends_at and payload.starts_at >= payload.ends_at:
                raise EsignError("PowerForm end date must be after its start date")
            if payload.ends_at and payload.ends_at <= now:
                raise EsignError("PowerForm end date must be in the future")
            token = secrets.token_urlsafe(32)
            row = EsignPowerForm(id=uuid.uuid4(), firm_id=version.firm_id, user_id=user_id, template_version_id=version.id,
                name=payload.name.strip(), public_token_sha256=hashlib.sha256(token.encode()).hexdigest(),
                starts_at=payload.starts_at, ends_at=payload.ends_at, submission_cap=payload.submission_cap,
                role_config=[r.model_dump(mode="json") for r in payload.role_config], public_fields=payload.public_fields,
                instructions=payload.instructions, brand_id=selected_brand_id)
            db.add(row); db.commit(); db.refresh(row); return self._powerform_response(row, token)
        except Exception: db.rollback(); raise
        finally: db.close()

    def list_powerforms(self, user_id: str) -> list[EsignPowerFormResponse]:
        db = self._get_session()
        try:
            firm_id = require_firm_id(db, user_id)
            return [self._powerform_response(r) for r in db.query(EsignPowerForm).filter(EsignPowerForm.firm_id == firm_id).order_by(EsignPowerForm.created_at.desc()).all()]
        finally: db.close()

    def powerform_state(self, user_id: str, form_id: str, state: str) -> EsignPowerFormResponse:
        if state not in ("active", "paused", "revoked"): raise EsignError("Invalid PowerForm state")
        db = self._get_session()
        try:
            row = self._owned_powerform(db, user_id, form_id); row.state = state
            db.commit(); db.refresh(row); return self._powerform_response(row)
        except Exception: db.rollback(); raise
        finally: db.close()

    def rotate_powerform(self, user_id: str, form_id: str) -> EsignPowerFormResponse:
        db = self._get_session()
        try:
            row = self._owned_powerform(db, user_id, form_id); token = secrets.token_urlsafe(32)
            row.public_token_sha256 = hashlib.sha256(token.encode()).hexdigest()
            db.commit(); db.refresh(row); return self._powerform_response(row, token)
        except Exception: db.rollback(); raise
        finally: db.close()

    def upgrade_powerform(self, user_id: str, form_id: str, version_id: str) -> EsignPowerFormResponse:
        db = self._get_session()
        try:
            row = self._owned_powerform(db, user_id, form_id)
            version = self._owned_version(db, user_id, version_id)
            current = self._owned_version(db, user_id, str(row.template_version_id))
            current_role_ids = [str(role.get("id") or index) for index, role in enumerate(current.snapshot.get("recipient_roles", []))]
            target_role_ids = [str(role.get("id") or index) for index, role in enumerate(version.snapshot.get("recipient_roles", []))]
            if current_role_ids != target_role_ids or len(target_role_ids) != len(row.role_config or []):
                raise EsignError("The new version's recipient roles do not match this PowerForm")
            row.template_version_id = version.id
            db.commit(); db.refresh(row); return self._powerform_response(row)
        except Exception: db.rollback(); raise
        finally: db.close()

    def powerform_upgrade_preview(
        self, user_id: str, form_id: str, version_id: str,
    ) -> EsignTemplateVersionCompatibilityResponse:
        db = self._get_session()
        try:
            form = self._owned_powerform(db, user_id, form_id)
            current = self._owned_version(db, user_id, str(form.template_version_id))
            target = self._owned_version(db, user_id, version_id)
            current_roles = {str(role.get("id") or index): role for index, role in enumerate(current.snapshot.get("recipient_roles", []))}
            target_roles = {str(role.get("id") or index): role for index, role in enumerate(target.snapshot.get("recipient_roles", []))}
            added = [str(role.get("label") or key) for key, role in target_roles.items() if key not in current_roles]
            removed = [str(role.get("label") or key) for key, role in current_roles.items() if key not in target_roles]
            changed = [str(target_roles[key].get("label") or key) for key in current_roles.keys() & target_roles.keys()
                       if any(current_roles[key].get(field) != target_roles[key].get(field)
                              for field in ("role", "routing_order", "managed_by_role_id", "witness_for_role_id"))]
            compatible = not added and not removed and len(target_roles) == len(form.role_config or [])
            warnings = []
            if added or removed: warnings.append("Recipient roles changed; update the PowerForm identity mapping before upgrading.")
            if changed: warnings.append("One or more recipient roles changed routing or relationship settings.")
            return EsignTemplateVersionCompatibilityResponse(
                compatible=compatible, current_version=current.version, target_version=target.version,
                added_roles=added, removed_roles=removed, changed_roles=changed,
                current_field_count=len(current.snapshot.get("fields", [])),
                target_field_count=len(target.snapshot.get("fields", [])), warnings=warnings,
            )
        finally:
            db.close()

    def list_powerform_submissions(self, user_id: str, form_id: str) -> list[dict[str, Any]]:
        db = self._get_session()
        try:
            row = self._owned_powerform(db, user_id, form_id)
            submissions = db.query(EsignPowerFormSubmission).filter(
                EsignPowerFormSubmission.powerform_id == row.id).order_by(EsignPowerFormSubmission.created_at.desc()).all()
            return [{"id": str(item.id), "status": item.status, "initiating_email": item.initiating_email,
                "envelope_id": str(item.envelope_id) if item.envelope_id else None,
                "verified_at": item.verified_at, "created_at": item.created_at,
                "attempt_count": item.attempt_count, "last_error": item.last_error} for item in submissions]
        finally: db.close()

    async def retry_powerform_submission(self, user_id: str, form_id: str, submission_id: str) -> dict[str, Any]:
        db = self._get_session()
        try:
            form = self._owned_powerform(db, user_id, form_id)
            submission = db.query(EsignPowerFormSubmission).filter(
                EsignPowerFormSubmission.id == uuid.UUID(submission_id),
                EsignPowerFormSubmission.powerform_id == form.id,
            ).with_for_update().first()
            if not submission: raise EsignNotFound("PowerForm submission not found")
            if submission.status != "failed": raise EsignConflict("Only a failed submission can be retried")
            token = secrets.token_urlsafe(32)
            submission.verification_token_sha256 = hashlib.sha256(token.encode()).hexdigest()
            submission.verification_expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
            db.commit()
        except Exception:
            db.rollback(); raise
        finally:
            db.close()
        await self.exchange_powerform_verification(token)
        return next(item for item in self.list_powerform_submissions(user_id, form_id) if item["id"] == submission_id)

    def public_powerform(self, token: str) -> dict[str, Any]:
        db = self._get_session()
        try:
            row = self._active_powerform(db, token); version = db.query(EsignTemplateVersion).filter(EsignTemplateVersion.id == row.template_version_id).first()
            roles = version.snapshot.get("recipient_roles", [])
            prompts = [{"recipient_index": c["recipient_index"], "label": roles[c["recipient_index"]].get("label"),
                "role": roles[c["recipient_index"]].get("role")} for c in row.role_config if c["identity_source"] == "visitor"]
            return {"name": row.name, "instructions": row.instructions, "roles": prompts, "fields": row.public_fields or []}
        finally: db.close()

    @staticmethod
    def _validate_powerform_input(form: EsignPowerForm, version: EsignTemplateVersion, data: dict[str, Any]) -> tuple[str, dict[str, Any]]:
        if not bool(data.get("consent")):
            raise EsignError("Electronic signature consent is required")
        roles = version.snapshot.get("recipient_roles", [])
        configured = {int(item["recipient_index"]): item for item in (form.role_config or [])}
        supplied_list = data.get("recipients") or []
        supplied: dict[int, dict[str, str]] = {}
        for item in supplied_list:
            try:
                index = int(item.get("recipient_index", -1))
            except (TypeError, ValueError):
                raise EsignError("Recipient role index is invalid")
            if index in supplied:
                raise EsignError("Each visitor recipient role must be supplied exactly once")
            supplied[index] = item
        visitor_indices = {index for index, item in configured.items() if item.get("identity_source") == "visitor"}
        if set(supplied) != visitor_indices:
            raise EsignError("Every visitor recipient identity must be supplied exactly once")
        emails: list[str] = []
        normalized_recipients: list[dict[str, Any]] = []
        initiating_email = ""
        for index, _role in enumerate(roles):
            config = configured.get(index)
            if config is None:
                raise EsignError("PowerForm recipient configuration is incomplete")
            identity = supplied[index] if index in visitor_indices else config
            name = str(identity.get("name") or "").strip()
            email = str(identity.get("email") or "").strip().lower()
            if not name or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
                raise EsignError(f"A valid name and email are required for recipient role {index + 1}")
            emails.append(email)
            normalized_recipients.append({"recipient_index": index, "name": name, "email": email})
            if config.get("initiating_signer"):
                initiating_email = email
        if len(emails) != len(set(emails)):
            raise EsignError("Recipient emails must be unique")
        if not initiating_email:
            raise EsignError("The initiating signer is not configured")

        fields = data.get("fields") or {}
        if set(fields) - set(form.public_fields or []):
            raise EsignError("The submission contains an unsupported public field")
        public_definitions = {
            str((field.get("properties") or {}).get("data_label")): field
            for field in version.snapshot.get("fields", [])
            if (field.get("properties") or {}).get("data_label") in (form.public_fields or [])
        }
        normalized_fields: dict[str, str] = {}
        for label in form.public_fields or []:
            value = str(fields.get(label, "")).strip()
            field = public_definitions.get(label) or {}
            props = field.get("properties") or {}
            text_rule = props.get("text_validation") or {}
            if text_rule.get("max_length") and len(value) > int(text_rule["max_length"]):
                raise EsignError(f"{label} is too long")
            if text_rule.get("regex") and value and re.fullmatch(str(text_rule["regex"]), value) is None:
                raise EsignError(f"{label} has an invalid format")
            if field.get("field_type") == "number" and value:
                try:
                    number = float(value)
                except ValueError:
                    raise EsignError(f"{label} must be a number")
                rule = props.get("number_validation") or {}
                if rule.get("minimum") is not None and number < float(rule["minimum"]):
                    raise EsignError(f"{label} is below its minimum")
                if rule.get("maximum") is not None and number > float(rule["maximum"]):
                    raise EsignError(f"{label} exceeds its maximum")
            if field.get("field_type") == "date" and value:
                try:
                    datetime.fromisoformat(value)
                except ValueError:
                    raise EsignError(f"{label} must be an ISO-8601 date")
            if field.get("field_type") == "dropdown" and value not in {str(option.get("value")) for option in props.get("options", [])}:
                raise EsignError(f"{label} must be one of the configured options")
            normalized_fields[label] = value
        return initiating_email, {"recipients": normalized_recipients, "fields": normalized_fields, "consent": True}

    def request_powerform_verification(self, token: str, data: dict[str, Any], meta: EsignRequestMeta) -> tuple[str, str]:
        db = self._get_session()
        try:
            row = self._active_powerform(db, token)
            version = db.query(EsignTemplateVersion).filter(EsignTemplateVersion.id == row.template_version_id).first()
            email, normalized = self._validate_powerform_input(row, version, data)
            verification = secrets.token_urlsafe(32)
            submission = EsignPowerFormSubmission(id=uuid.uuid4(), powerform_id=row.id, normalized_input=normalized,
                initiating_email=email, verification_token_sha256=hashlib.sha256(verification.encode()).hexdigest(),
                verification_expires_at=datetime.now(timezone.utc) + timedelta(minutes=15), consent=True,
                ip_address=meta.ip_address, user_agent=meta.user_agent)
            db.add(submission); db.commit()
            return email, verification
        except Exception: db.rollback(); raise
        finally: db.close()

    async def exchange_powerform_verification(self, token: str) -> dict[str, str]:
        """Consume a verification token once and materialize the pinned version.

        The PowerForm row is locked while the cap is checked and incremented,
        preventing concurrent exchanges from oversubscribing the link.
        """
        db = self._get_session(); row_id: Optional[uuid.UUID] = None; submission_id: Optional[uuid.UUID] = None; form_brand_id = None
        try:
            digest = hashlib.sha256(token.encode()).hexdigest(); now = datetime.now(timezone.utc)
            submission = db.query(EsignPowerFormSubmission).filter(
                EsignPowerFormSubmission.verification_token_sha256 == digest).with_for_update().first()
            retry_deadline = (submission.verification_expires_at + timedelta(hours=24)) if submission else None
            if (not submission or submission.consumed_at
                    or (submission.verification_expires_at <= now and submission.status != "failed")
                    or (submission.status == "failed" and retry_deadline <= now)):
                raise EsignNotFound("Verification link is invalid or expired")
            idempotency_key = hashlib.sha256(f"powerform:{submission.id}".encode()).hexdigest()
            if submission.status == "materializing":
                stale_row = db.query(EsignBulkRow).filter(
                    EsignBulkRow.idempotency_key == idempotency_key
                ).first()
                if (not stale_row or not stale_row.updated_at
                        or stale_row.updated_at > now - timedelta(minutes=15)):
                    raise EsignConflict("This verification is already being processed")
                stale_row.status = "failed"
                stale_row.error_code = "materialization_timeout"
                stale_row.error_message = "Previous PowerForm materialization attempt timed out"
                submission.status = "failed"
                submission.last_error = stale_row.error_message
            form = db.query(EsignPowerForm).filter(EsignPowerForm.id == submission.powerform_id).with_for_update().first()
            if not form or form.state != "active" or (form.starts_at and form.starts_at > now) or (form.ends_at and form.ends_at <= now):
                raise EsignNotFound("This form is unavailable")
            if form.submission_cap is not None and form.submission_count >= form.submission_cap:
                raise EsignConflict("This form has reached its submission limit")
            if form.submission_cap is not None:
                reservations = db.query(func.count(EsignPowerFormSubmission.id)).filter(
                    EsignPowerFormSubmission.powerform_id == form.id,
                    EsignPowerFormSubmission.status == "materializing",
                    EsignPowerFormSubmission.id != submission.id,
                ).scalar() or 0
                if form.submission_count + int(reservations) >= form.submission_cap:
                    raise EsignConflict("This form has reached its submission limit")
            if not submission.consent: raise EsignError("Electronic signature consent is required")
            form_brand_id = form.brand_id
            version = db.query(EsignTemplateVersion).filter(EsignTemplateVersion.id == form.template_version_id).first()
            data = {"envelope_title": version.snapshot.get("title") or form.name, "message": version.snapshot.get("message") or "",
                "expires_in_days": "", "reminder_interval_hours": "", "schedule_at": "", "schedule_timezone": "",
                "__source_type": "powerform", "__source_id": str(form.id), "__submission_id": str(submission.id),
                "__ip_address": submission.ip_address, "__user_agent": submission.user_agent, "__consent": submission.consent}
            supplied = {int(r["recipient_index"]): r for r in submission.normalized_input.get("recipients", [])}
            configured = {int(r["recipient_index"]): r for r in form.role_config}
            for index, role in enumerate(version.snapshot.get("recipient_roles", [])):
                identity = supplied.get(index) if configured[index]["identity_source"] == "visitor" else configured[index]
                base = _slug(str(role.get("label") or role.get("role") or "recipient"))
                data[f"{base}_name"] = str((identity or {}).get("name") or "").strip()
                data[f"{base}_email"] = str((identity or {}).get("email") or "").strip().lower()
            for label in form.public_fields or []: data[label] = str(submission.normalized_input.get("fields", {}).get(label, ""))
            row = db.query(EsignBulkRow).filter(EsignBulkRow.idempotency_key == idempotency_key).first()
            if row is None:
                job = EsignBulkJob(id=uuid.uuid4(), firm_id=form.firm_id, user_id=form.user_id,
                    template_version_id=version.id, status="processing", kind="powerform", total_rows=1, valid_rows=1, invalid_rows=0, confirmed_at=now)
                db.add(job); db.flush()
                row = EsignBulkRow(id=uuid.uuid4(), job_id=job.id, row_number=1,
                    idempotency_key=idempotency_key, normalized_input=data, status="processing", attempts=1)
                db.add(row)
            else:
                if row.status in ("failed", "processing"):
                    row.status = "processing"; row.error_code = None; row.error_message = None; row.attempts += 1
                elif not row.envelope_id or row.status not in ("sent", "materialized"):
                    raise EsignConflict("This verification is already being processed")
            submission.status = "materializing"; submission.attempt_count += 1; submission.last_error = None
            row_id = row.id; submission_id = submission.id
            db.commit()
        except Exception: db.rollback(); raise
        finally: db.close()
        assert row_id and submission_id
        await self._materialize_bulk_row(row_id)
        db = self._get_session()
        try:
            row = db.query(EsignBulkRow).filter(EsignBulkRow.id == row_id).first()
            submission = db.query(EsignPowerFormSubmission).filter(EsignPowerFormSubmission.id == submission_id).with_for_update().first()
            if not row or not row.envelope_id or row.status == "failed":
                if submission:
                    submission.status = "failed"
                    submission.last_error = row.error_message if row else "PowerForm materialization failed"
                    db.commit()
                raise EsignError(row.error_message if row else "PowerForm materialization failed")
            form = db.query(EsignPowerForm).filter(EsignPowerForm.id == submission.powerform_id).with_for_update().first()
            if form.submission_cap is not None and form.submission_count >= form.submission_cap:
                submission.status = "failed"; submission.last_error = "Submission limit reached during finalization"; db.commit()
                raise EsignConflict("This form has reached its submission limit")
            env = db.query(EsignEnvelope).options(joinedload(EsignEnvelope.recipients)).filter(EsignEnvelope.id == row.envelope_id).first()
            env.source_type = "powerform"; env.source_id = submission.powerform_id
            if form_brand_id: env.brand_id = form_brand_id
            form.submission_count += 1
            submission.verified_at = datetime.now(timezone.utc); submission.consumed_at = submission.verified_at
            submission.envelope_id = env.id; submission.status = "submitted"; submission.last_error = None
            recipient = next(r for r in env.recipients or [] if r.email == submission.initiating_email)
            from services.esign.recipient_service import esign_recipient_service
            invitation = esign_recipient_service._issue_invitation(db, env, recipient)
            db.commit(); return {"envelope_id": str(env.id), "invitation_token": invitation.invitation_token}
        except Exception as exc:
            db.rollback()
            recovery = self._get_session()
            try:
                submission = recovery.query(EsignPowerFormSubmission).filter(
                    EsignPowerFormSubmission.id == submission_id
                ).with_for_update().first()
                if submission and not submission.consumed_at:
                    submission.status = "failed"
                    submission.last_error = str(exc)[:4000]
                    recovery.commit()
            except Exception:
                recovery.rollback()
                logger.exception("Could not record failed PowerForm submission %s", submission_id)
            finally:
                recovery.close()
            raise
        finally: db.close()

    def report_summary(self, user_id: str, start: datetime, end: datetime, source: Optional[str] = None,
                       status: Optional[str] = None, template_version_id: Optional[str] = None,
                       sender_user_id: Optional[str] = None, source_id: Optional[str] = None) -> EsignReportSummary:
        db = self._get_session()
        try:
            user = db.query(User).filter(User.id == user_id).first()
            if not user: raise EsignNotFound("User not found")
            principal = esign_authorization_service.principal(db, user_id)
            if principal and not principal.can("reports"): raise EsignNotFound("E-Signature reports not found")
            q = db.query(EsignEnvelope).filter(EsignEnvelope.firm_id == require_firm_id(db, user_id))
            if not principal or not (principal.is_admin or principal.can("firm_view")): q = q.filter(EsignEnvelope.user_id == user_id)
            if source: q = q.filter(EsignEnvelope.source_type == source)
            if status: q = q.filter(EsignEnvelope.status == status)
            if template_version_id: q = q.filter(EsignEnvelope.template_version_id == uuid.UUID(template_version_id))
            if sender_user_id:
                if (not principal or not (principal.is_admin or principal.can("firm_view"))) and sender_user_id != user_id:
                    raise PermissionError("You may only report on envelopes you sent")
                q = q.filter(EsignEnvelope.user_id == sender_user_id)
            if source_id: q = q.filter(EsignEnvelope.source_id == uuid.UUID(source_id))
            cohort = q.filter(EsignEnvelope.sent_at >= start, EsignEnvelope.sent_at < end).all()
            completed = [e for e in cohort if e.completed_at]
            hours = sorted((e.completed_at - e.sent_at).total_seconds() / 3600 for e in completed)
            active = q.filter(EsignEnvelope.status.in_((EsignEnvelopeStatus.SENT, EsignEnvelopeStatus.IN_PROGRESS))).all()
            now = datetime.now(timezone.utc); aging = {"0-2": 0, "3-7": 0, "8-14": 0, "15-30": 0, "31+": 0}
            for env in active:
                days = (now - env.sent_at).days if env.sent_at else 0
                aging["0-2" if days <= 2 else "3-7" if days <= 7 else "8-14" if days <= 14 else "15-30" if days <= 30 else "31+"] += 1
            exception_rows = q.filter(EsignEnvelope.created_at >= start, EsignEnvelope.created_at < end).all()
            exceptions = {key: 0 for key in ("declined", "expired", "send_failed", "overdue_scheduled", "bulk_invalid_failed", "anchor_failed")}
            for env in exception_rows:
                value = env.status.value if hasattr(env.status, "value") else str(env.status)
                if value in exceptions: exceptions[value] += 1
                if value == "scheduled" and env.scheduled_at and env.scheduled_at < now: exceptions["overdue_scheduled"] += 1
                if env.send_error_code == "required_anchor": exceptions["anchor_failed"] += 1
            bulk_q = db.query(func.count(EsignBulkRow.id)).join(EsignBulkJob).filter(EsignBulkJob.firm_id == user.firm_id,
                EsignBulkRow.created_at >= start, EsignBulkRow.created_at < end, EsignBulkRow.status.in_(("invalid", "failed")))
            if user.role not in (AnalyticsUserRole.ADMIN, AnalyticsUserRole.MANAGER):
                bulk_q = bulk_q.filter(EsignBulkJob.user_id == user_id)
            bulk_errors = bulk_q.scalar() or 0
            exceptions["bulk_invalid_failed"] = int(bulk_errors)
            p90 = hours[min(len(hours) - 1, max(0, int(len(hours) * .9) - 1))] if hours else None
            return EsignReportSummary(volume=len(cohort), completed=len(completed), completion_rate=(len(completed) / len(cohort) if cohort else 0),
                median_completion_hours=statistics.median(hours) if hours else None, p90_completion_hours=p90,
                aging=aging, exceptions=exceptions)
        finally: db.close()

    def report_time_series(self, user_id: str, start: datetime, end: datetime,
                           source: Optional[str] = None, status: Optional[str] = None,
                           template_version_id: Optional[str] = None,
                           sender_user_id: Optional[str] = None,
                           source_id: Optional[str] = None) -> list[dict[str, Any]]:
        db = self._get_session()
        try:
            user = db.query(User).filter(User.id == user_id).first()
            if not user: raise EsignNotFound("User not found")
            principal = esign_authorization_service.principal(db, user_id)
            if principal and not principal.can("reports"): raise EsignNotFound("E-Signature reports not found")
            q = db.query(EsignEnvelope).filter(EsignEnvelope.firm_id == require_firm_id(db, user_id),
                EsignEnvelope.sent_at >= start, EsignEnvelope.sent_at < end)
            if not principal or not (principal.is_admin or principal.can("firm_view")): q = q.filter(EsignEnvelope.user_id == user_id)
            if source: q = q.filter(EsignEnvelope.source_type == source)
            if status: q = q.filter(EsignEnvelope.status == status)
            if template_version_id: q = q.filter(EsignEnvelope.template_version_id == uuid.UUID(template_version_id))
            if sender_user_id:
                if (not principal or not (principal.is_admin or principal.can("firm_view"))) and sender_user_id != user_id:
                    raise PermissionError("You may only report on envelopes you sent")
                q = q.filter(EsignEnvelope.user_id == sender_user_id)
            if source_id: q = q.filter(EsignEnvelope.source_id == uuid.UUID(source_id))
            buckets: dict[str, dict[str, Any]] = {}
            for env in q.all():
                day = env.sent_at.date().isoformat()
                bucket = buckets.setdefault(day, {"date": day, "sent": 0, "completed": 0})
                bucket["sent"] += 1; bucket["completed"] += int(env.completed_at is not None)
            return [buckets[key] for key in sorted(buckets)]
        finally: db.close()

    def report_csv(self, user_id: str, start: datetime, end: datetime,
                   source: Optional[str] = None, status: Optional[str] = None,
                   template_version_id: Optional[str] = None,
                   sender_user_id: Optional[str] = None,
                   source_id: Optional[str] = None) -> str:
        db = self._get_session()
        try:
            user = db.query(User).filter(User.id == user_id).first()
            if not user: raise EsignNotFound("User not found")
            principal = esign_authorization_service.principal(db, user_id)
            if principal and not principal.can("exports"): raise EsignNotFound("E-Signature report export not found")
            q = db.query(EsignEnvelope).filter(EsignEnvelope.firm_id == require_firm_id(db, user_id),
                EsignEnvelope.sent_at >= start, EsignEnvelope.sent_at < end)
            if not principal or not (principal.is_admin or principal.can("firm_view")): q = q.filter(EsignEnvelope.user_id == user_id)
            if source: q = q.filter(EsignEnvelope.source_type == source)
            if status: q = q.filter(EsignEnvelope.status == status)
            if template_version_id: q = q.filter(EsignEnvelope.template_version_id == uuid.UUID(template_version_id))
            if sender_user_id:
                if (not principal or not (principal.is_admin or principal.can("firm_view"))) and sender_user_id != user_id:
                    raise PermissionError("You may only export envelopes you sent")
                q = q.filter(EsignEnvelope.user_id == sender_user_id)
            if source_id: q = q.filter(EsignEnvelope.source_id == uuid.UUID(source_id))
            output = io.StringIO(newline=""); writer = csv.writer(output)
            writer.writerow(["envelope_id", "title", "sender_user_id", "source", "source_id", "template_version_id",
                "status", "scheduled_at", "sent_at", "completed_at", "created_at", "error_code", "error_message"])
            for env in q.order_by(EsignEnvelope.created_at.desc()).all():
                writer.writerow([env.id, env.title, env.user_id, env.source_type, env.source_id or "", env.template_version_id or "",
                    env.status.value if hasattr(env.status, "value") else env.status, env.scheduled_at or "", env.sent_at or "",
                    env.completed_at or "", env.created_at, env.send_error_code or "", env.send_error_message or ""])
            return output.getvalue()
        finally: db.close()

    def _owned_version(self, db: Session, user_id: str, version_id: str) -> EsignTemplateVersion:
        try: vid = uuid.UUID(version_id)
        except ValueError: raise EsignNotFound("Template version not found")
        firm_id = require_firm_id(db, user_id)
        row = db.query(EsignTemplateVersion).filter(EsignTemplateVersion.id == vid, EsignTemplateVersion.firm_id == firm_id).first()
        if not row: raise EsignNotFound("Template version not found")
        return row

    def _owned_job(self, db: Session, user_id: str, job_id: str) -> EsignBulkJob:
        try: jid = uuid.UUID(job_id)
        except ValueError: raise EsignNotFound("Bulk job not found")
        row = db.query(EsignBulkJob).options(joinedload(EsignBulkJob.rows)).filter(EsignBulkJob.id == jid, EsignBulkJob.user_id == user_id).first()
        if not row: raise EsignNotFound("Bulk job not found")
        return row

    def _owned_powerform(self, db: Session, user_id: str, form_id: str) -> EsignPowerForm:
        try: fid = uuid.UUID(form_id)
        except ValueError: raise EsignNotFound("PowerForm not found")
        firm_id = require_firm_id(db, user_id)
        row = db.query(EsignPowerForm).filter(EsignPowerForm.id == fid, EsignPowerForm.firm_id == firm_id).first()
        if not row: raise EsignNotFound("PowerForm not found")
        return row

    @staticmethod
    def _active_powerform(db: Session, token: str) -> EsignPowerForm:
        digest = hashlib.sha256(token.encode()).hexdigest(); now = datetime.now(timezone.utc)
        row = db.query(EsignPowerForm).filter(EsignPowerForm.public_token_sha256 == digest).first()
        if not row or row.state != "active" or (row.starts_at and row.starts_at > now) or (row.ends_at and row.ends_at <= now) or (row.submission_cap is not None and row.submission_count >= row.submission_cap):
            raise EsignNotFound("This form is unavailable")
        return row

    @staticmethod
    def _sender_email(db: Session, user_id: str) -> str:
        user = db.query(User).filter(User.id == user_id).first()
        if not user: raise EsignNotFound("Sender not found")
        return user.email

    def _mark_bulk_sent(self, row_id: uuid.UUID) -> None:
        db = self._get_session()
        try:
            row = db.query(EsignBulkRow).filter(EsignBulkRow.id == row_id).first()
            if row: row.status = "sent"; db.commit()
        finally: db.close()

    def _mark_bulk_failed(self, row_id: uuid.UUID, exc: Exception) -> None:
        db = self._get_session()
        try:
            row = db.query(EsignBulkRow).filter(EsignBulkRow.id == row_id).first()
            if row: row.status = "failed"; row.error_code = "materialization_failed"; row.error_message = str(exc)[:2000]; db.commit()
        finally: db.close()

    def _mark_send_failed(self, envelope_id: uuid.UUID, exc: Exception) -> None:
        db = self._get_session()
        try:
            env = db.query(EsignEnvelope).filter(EsignEnvelope.id == envelope_id).first()
            if env:
                env.status = EsignEnvelopeStatus.SEND_FAILED; env.send_error_code = "scheduled_send_failed"; env.send_error_message = str(exc)[:2000]
                audit_service.record_event(db, envelope_id=env.id, event_type=EsignEventType.SEND_FAILED,
                    details={"error_code": "scheduled_send_failed", "message": str(exc)[:2000]})
            row = db.query(EsignBulkRow).filter(EsignBulkRow.envelope_id == envelope_id).first()
            if row: row.status = "failed"; row.error_code = "send_failed"; row.error_message = str(exc)[:2000]
            db.commit()
        finally: db.close()

    def _mark_envelope_row_status(self, envelope_id: uuid.UUID, status: str) -> None:
        db = self._get_session()
        try:
            row = db.query(EsignBulkRow).filter(EsignBulkRow.envelope_id == envelope_id).first()
            if row: row.status = status; db.commit()
        finally: db.close()

    def _refresh_job_for_row(self, row_id: uuid.UUID) -> None:
        db = self._get_session()
        try:
            row = db.query(EsignBulkRow).filter(EsignBulkRow.id == row_id).first()
            if not row: return
            job = db.query(EsignBulkJob).filter(EsignBulkJob.id == row.job_id).first()
            statuses = [s[0] for s in db.query(EsignBulkRow.status).filter(EsignBulkRow.job_id == job.id).all()]
            terminal = {"invalid", "failed", "sent", "scheduled", "cancelled"}
            job.processed_rows = sum(s in terminal for s in statuses)
            if all(s in terminal for s in statuses):
                job.status = "partial_failed" if any(s in ("invalid", "failed") for s in statuses) else "completed"
                job.completed_at = datetime.now(timezone.utc)
            else: job.status = "processing"
            db.commit()
        finally: db.close()


esign_scale_service = EsignScaleService()
