"""Background, advisory AI field placement for E-Signature drafts."""

from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import tempfile
import time
import uuid
from collections import Counter
from datetime import datetime, timezone
from typing import Any

import fitz
from google import genai
from google.genai import types
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import joinedload

from core.database import db_config
from inkwise.services.ocrmypdf_service import OCRmyPDFError, OCRmyPDFService
from models.db_models import (
    EsignAiFieldPlacementRun, EsignDocument, EsignEnvelope, EsignEnvelopeStatus,
    EsignField, EsignFieldType, EsignRecipientRole, EsignTemplate, EsignTemplateDocument,
    EsignTemplateField,
)
from models.esign import (
    EsignAiFieldPlacementActionResponse, EsignAiFieldPlacementApplyRequest,
    EsignAiFieldPlacementCreateRequest, EsignAiFieldPlacementProposal,
    EsignAiFieldPlacementRunResponse, EsignFieldProperties,
)
from services.billing_service import BillingService, PlanLimitExceeded
from services.cloud_run_task_service import cloud_run_task_service
from services.esign.authorization_service import esign_authorization_service
from services.esign.envelope_service import (
    EsignConflict, EsignError, EsignNotFound, _bump_draft_revision, _lock_draft_revision,
    esign_envelope_service, normalize_template_roles, validate_field_placement,
)
from services.esign.field_logic import FieldLogicError, validate_field_graph
from services.gcs_service import get_storage_service
from services.pdf_anchor import relative_anchor_box_position, resolve_contextual_anchor_rect


logger = logging.getLogger(__name__)
ALLOWED_TYPES = {
    "signature", "initials", "date_signed", "first_name", "last_name", "full_name",
    "email", "company", "title", "text", "checkbox", "date", "number",
}
ACTIVE_STATUSES = {"queued", "processing"}
DEFAULT_SIZES = {
    "signature": (0.28, 0.045), "initials": (0.08, 0.035), "date_signed": (0.16, 0.03),
    "first_name": (0.18, 0.03), "last_name": (0.18, 0.03), "full_name": (0.24, 0.03),
    "email": (0.24, 0.03), "company": (0.24, 0.03), "title": (0.20, 0.03),
    "text": (0.24, 0.03), "checkbox": (0.03, 0.022), "date": (0.16, 0.03),
    "number": (0.16, 0.03),
}
RELATIVE_POSITIONS = {"auto", "center", "right", "left", "below", "above"}
CROSS_AXIS_ALIGNMENTS = {"auto", "start", "center", "end"}
OPTIONAL_BY_DEFAULT = {"date_signed", "first_name", "last_name", "full_name", "email"}


def _value(value: Any) -> str:
    return value.value if hasattr(value, "value") else str(value)


def _overlap_duplicate(left: dict[str, Any], right: dict[str, Any]) -> bool:
    """Return true when matching fields overlap >= 50% of the smaller box."""
    keys = ("document_id", "page_number", "participant_id", "field_type")
    if any(str(left.get(key)) != str(right.get(key)) for key in keys):
        return False
    x0 = max(float(left["pos_x"]), float(right["pos_x"]))
    y0 = max(float(left["pos_y"]), float(right["pos_y"]))
    x1 = min(float(left["pos_x"]) + float(left["width"]), float(right["pos_x"]) + float(right["width"]))
    y1 = min(float(left["pos_y"]) + float(left["height"]), float(right["pos_y"]) + float(right["height"]))
    intersection = max(0.0, x1 - x0) * max(0.0, y1 - y0)
    smaller = min(float(left["width"]) * float(left["height"]), float(right["width"]) * float(right["height"]))
    return smaller > 0 and intersection / smaller >= 0.5


def parse_ai_field_placement_response(payload: Any) -> tuple[list[dict[str, Any]], list[str]]:
    """Parse model JSON without trusting types, participants, anchors, or geometry."""
    if isinstance(payload, str):
        payload = json.loads(payload)
    if isinstance(payload, dict):
        warnings = [str(item)[:500] for item in payload.get("warnings", []) if str(item).strip()]
        payload = payload.get("proposals", [])
    else:
        warnings = []
    if not isinstance(payload, list):
        raise ValueError("Vertex AI returned an invalid proposals collection")
    if len(payload) > 500:
        warnings.extend(
            f"Suggestion {index + 1} was omitted because the analysis returned too many suggestions."
            for index in range(500, len(payload))
        )
    parsed: list[dict[str, Any]] = []
    for index, item in enumerate(payload[:500]):
        if not isinstance(item, dict):
            warnings.append(f"Suggestion {index + 1} was omitted because it was malformed.")
            continue
        field_type = str(item.get("field_type") or "").strip().lower()
        if field_type not in ALLOWED_TYPES:
            warnings.append(f"Suggestion {index + 1} used unsupported field type '{field_type or 'unknown'}' and was omitted.")
            continue
        parsed.append({**item, "field_type": field_type})
    return parsed, warnings


def _normalized_dimension(value: Any, default: float) -> tuple[float, bool]:
    """Return a finite normalized dimension, falling back for unsafe model output."""
    if value is None:
        return default, False
    try:
        if isinstance(value, bool):
            raise ValueError
        parsed = float(value)
    except (TypeError, ValueError):
        return default, True
    if not math.isfinite(parsed) or parsed <= 0 or parsed > 1:
        return default, True
    return parsed, False


def materialize_ai_field_placement_proposal(
    item: dict[str, Any],
    *,
    suggestion_number: int,
    document_id: str,
    participant_id: str,
    page_number: int,
    page: fitz.Page,
) -> tuple[dict[str, Any] | None, list[str], list[str], str | None]:
    """Turn one trusted-identity model item into safe normalized page geometry.

    Returns the proposal, user-visible recovery/omission warnings, recovery metric
    codes, and an omission metric code when the proposal could not be staged.
    """
    prefix = f"Suggestion {suggestion_number}"
    anchor, reason = resolve_contextual_anchor_rect(page, item)
    if anchor is None:
        return None, [f"{prefix} was omitted. {reason}"], [], "anchor"

    rotated = anchor * page.rotation_matrix
    rotated.normalize()
    bounds = page.rect
    ax = rotated.x0 / bounds.width
    ay = rotated.y0 / bounds.height
    aw = rotated.width / bounds.width
    ah = rotated.height / bounds.height
    default_w, default_h = DEFAULT_SIZES[item["field_type"]]
    width, width_recovered = _normalized_dimension(item.get("width"), default_w)
    height, height_recovered = _normalized_dimension(item.get("height"), default_h)
    warnings: list[str] = []
    recovery_codes: list[str] = []
    if width_recovered or height_recovered:
        warnings.append(f"{prefix} used the default field size because its requested dimensions were invalid.")
        recovery_codes.append("default_size")

    relative_position = str(item.get("relative_position") or "auto").strip().lower()
    alignment = str(item.get("cross_axis_alignment") or "auto").strip().lower()
    if relative_position not in RELATIVE_POSITIONS:
        relative_position = "auto"
        warnings.append(f"{prefix} used automatic placement because its requested position was invalid.")
        recovery_codes.append("default_position")
    if alignment not in CROSS_AXIS_ALIGNMENTS:
        alignment = "auto"
        warnings.append(f"{prefix} used automatic alignment because its requested alignment was invalid.")
        recovery_codes.append("default_alignment")

    pos_x, pos_y = relative_anchor_box_position(
        ax, ay, aw, ah,
        relative_position=relative_position,
        cross_axis_alignment=alignment,
        field_width=width,
        field_height=height,
    )
    default_required = item["field_type"] not in OPTIONAL_BY_DEFAULT
    raw_required = item.get("required")
    if raw_required is None:
        required = default_required
    elif isinstance(raw_required, bool):
        required = raw_required
    else:
        required = default_required
        warnings.append(f"{prefix} used the default required setting because the requested value was invalid.")
        recovery_codes.append("default_required")

    raw_properties = item.get("properties")
    if isinstance(raw_properties, dict):
        properties = {**raw_properties, "schema_version": 2}
    else:
        properties = {"schema_version": 2}
        if raw_properties is not None:
            warnings.append(f"{prefix} ignored malformed optional field properties.")
            recovery_codes.append("default_properties")
    proposal = {
        "id": str(uuid.uuid4()),
        "document_id": document_id,
        "participant_id": participant_id,
        "field_type": item["field_type"],
        "page_number": page_number,
        "pos_x": pos_x,
        "pos_y": pos_y,
        "width": width,
        "height": height,
        "required": required,
        "label": str(item.get("label"))[:255] if item.get("label") else None,
        "properties": properties,
    }
    try:
        normalized = EsignAiFieldPlacementProposal.model_validate(proposal).model_dump(mode="json")
    except Exception:
        if properties == {"schema_version": 2}:
            return None, warnings + [f"{prefix} was omitted because its placement geometry was invalid."], recovery_codes, "geometry"
        proposal["properties"] = {"schema_version": 2}
        try:
            normalized = EsignAiFieldPlacementProposal.model_validate(proposal).model_dump(mode="json")
        except Exception:
            return None, warnings + [f"{prefix} was omitted because its placement geometry was invalid."], recovery_codes, "geometry"
        warnings.append(f"{prefix} ignored optional field properties that were invalid for its field type.")
        recovery_codes.append("default_properties")
    return normalized, warnings, recovery_codes, None


class EsignAiFieldPlacementService:
    def __init__(self) -> None:
        self.storage = get_storage_service()
        self.ocr = OCRmyPDFService()
        self.model_name = os.getenv("ESIGN_AI_FIELD_PLACEMENT_MODEL", "gemini-2.5-flash")
        self._client: genai.Client | None = None

    @staticmethod
    def _serialize(run: EsignAiFieldPlacementRun) -> EsignAiFieldPlacementRunResponse:
        status = str(run.status)
        progress = 0 if status == "queued" else 40 if status == "processing" else 100
        target_id = run.envelope_id if run.target_type == "envelope" else run.template_id
        return EsignAiFieldPlacementRunResponse(
            id=str(run.id), target_type=run.target_type, target_id=str(target_id), status=status,
            scope=run.scope, selected_document_ids=[str(item) for item in (run.selected_document_ids or [])],
            base_revision=int(run.base_revision), instructions=run.instructions,
            proposals=list(run.proposals or []), warnings=list(run.warnings or []), error=run.error,
            page_usage=int(run.page_usage or 0), progress=progress, created_at=run.created_at,
            updated_at=run.updated_at, started_at=run.started_at, completed_at=run.completed_at,
            applied_at=run.applied_at, discarded_at=run.discarded_at,
        )

    @staticmethod
    def _snapshot(target_type: str, target: Any) -> dict[str, Any]:
        documents = [{
            "id": str(document.id), "sha256": document.original_sha256 if target_type == "envelope" else document.sha256,
            "page_count": int(document.page_count), "name": document.original_filename,
        } for document in target.documents or []]
        if target_type == "envelope":
            participants = [{
                "id": str(recipient.id),
                "label": recipient.role_label or recipient.name or _value(recipient.role).replace("_", " "),
                "role": _value(recipient.role),
            } for recipient in target.recipients or [] if recipient.role in {
                EsignRecipientRole.SIGNER, EsignRecipientRole.WITNESS, EsignRecipientRole.IN_PERSON_SIGNER,
            }]
        else:
            participants = [{"id": role["id"], "label": role.get("label") or role.get("role", "signer"), "role": role.get("role", "signer")}
                            for role in normalize_template_roles(target.recipient_roles or [])
                            if role.get("role") in {"signer", "witness", "in_person_signer"}]
        return {"documents": documents, "participants": participants}

    def _load_target(self, db: Any, user_id: str, target_type: str, target_id: str) -> Any:
        if target_type == "envelope":
            target = esign_envelope_service._load_envelope(db, user_id, target_id)
            esign_envelope_service._require_draft(target)
        else:
            target = esign_envelope_service._load_template(db, user_id, target_id)
            if target.archived_at is not None:
                raise EsignConflict("Archived templates cannot be edited")
        principal = esign_authorization_service.principal(db, user_id)
        if principal and not principal.features.get("ai_field_placement", True):
            raise EsignNotFound("AI field placement not found")
        return target

    async def create_run(
        self, user_id: str, target_type: str, target_id: str, payload: EsignAiFieldPlacementCreateRequest,
    ) -> EsignAiFieldPlacementRunResponse:
        db = db_config.get_session()
        run: EsignAiFieldPlacementRun | None = None
        try:
            target = self._load_target(db, user_id, target_type, target_id)
            _lock_draft_revision(db, target, payload.expected_revision)
            snapshot = self._snapshot(target_type, target)
            if not snapshot["participants"]:
                raise EsignError("Add at least one signing role before placing fields with AI")
            documents = snapshot["documents"]
            if payload.scope == "active_document":
                documents = [item for item in documents if item["id"] == payload.document_id]
                if not documents:
                    raise EsignError("The active document is not part of this draft")
            selected_ids = [item["id"] for item in documents]
            pages = sum(int(item["page_count"]) for item in documents)
            active = db.query(EsignAiFieldPlacementRun).filter(
                (EsignAiFieldPlacementRun.envelope_id == target.id if target_type == "envelope" else EsignAiFieldPlacementRun.template_id == target.id),
                EsignAiFieldPlacementRun.scope == payload.scope,
                EsignAiFieldPlacementRun.status.in_(ACTIVE_STATUSES),
            ).first()
            if active:
                raise EsignConflict("An AI field-placement analysis is already running for this scope")
            if not BillingService(db).check_page_limit(user_id, pages):
                raise PlanLimitExceeded("Page allowance is too low for the selected documents")
            run = EsignAiFieldPlacementRun(
                id=uuid.uuid4(), target_type=target_type,
                envelope_id=target.id if target_type == "envelope" else None,
                template_id=target.id if target_type == "template" else None,
                requester_user_id=user_id, status="queued", scope=payload.scope,
                selected_document_ids=selected_ids, target_snapshot=snapshot,
                base_revision=int(target.draft_revision), instructions=payload.instructions,
                page_usage=pages,
            )
            db.add(run); db.commit(); db.refresh(run)
        except IntegrityError as exc:
            db.rollback(); raise EsignConflict("An AI field-placement analysis is already running for this scope") from exc
        except Exception:
            db.rollback(); raise
        finally:
            db.close()
        try:
            await cloud_run_task_service.enqueue_esign_ai_field_placement_task(str(run.id))
        except Exception as exc:
            db = db_config.get_session()
            try:
                failed = db.query(EsignAiFieldPlacementRun).filter_by(id=run.id).first()
                if failed and failed.status == "queued":
                    failed.status = "failed"; failed.error = "Analysis could not be queued. Please try again."
                    failed.completed_at = datetime.now(timezone.utc); db.commit(); db.refresh(failed); run = failed
            finally: db.close()
            logger.exception("Failed to enqueue E-Signature AI placement run %s", run.id)
        return self._serialize(run)

    def _authorized_run(self, db: Any, user_id: str, run_id: str) -> EsignAiFieldPlacementRun:
        try: parsed = uuid.UUID(str(run_id))
        except ValueError: raise EsignNotFound("AI field-placement run not found")
        run = db.query(EsignAiFieldPlacementRun).filter_by(id=parsed).first()
        if not run: raise EsignNotFound("AI field-placement run not found")
        self._load_target(db, user_id, run.target_type, str(run.envelope_id or run.template_id))
        return run

    def get_run(self, user_id: str, run_id: str) -> EsignAiFieldPlacementRunResponse:
        db = db_config.get_session()
        try: return self._serialize(self._authorized_run(db, user_id, run_id))
        finally: db.close()

    def list_runs(self, user_id: str, target_type: str, target_id: str) -> list[EsignAiFieldPlacementRunResponse]:
        db = db_config.get_session()
        try:
            target = self._load_target(db, user_id, target_type, target_id)
            query = db.query(EsignAiFieldPlacementRun).filter(
                EsignAiFieldPlacementRun.envelope_id == target.id if target_type == "envelope"
                else EsignAiFieldPlacementRun.template_id == target.id
            ).order_by(EsignAiFieldPlacementRun.created_at.desc()).limit(20)
            return [self._serialize(item) for item in query.all()]
        finally: db.close()

    @staticmethod
    def _field_dict(field: Any, *, target_type: str) -> dict[str, Any]:
        return {
            "document_id": str(field.document_id if target_type == "envelope" else field.template_document_id),
            "participant_id": str(field.recipient_id if target_type == "envelope" else field.recipient_role_id),
            "field_type": _value(field.field_type), "page_number": int(field.page_number),
            "pos_x": float(field.pos_x), "pos_y": float(field.pos_y), "width": float(field.width), "height": float(field.height),
        }

    @staticmethod
    def _current_identity(target_type: str, target: Any) -> tuple[dict[str, str], set[str]]:
        docs = {str(item.id): (item.original_sha256 if target_type == "envelope" else item.sha256) for item in target.documents or []}
        if target_type == "envelope":
            participants = {str(item.id) for item in target.recipients or [] if item.role in {
                EsignRecipientRole.SIGNER, EsignRecipientRole.WITNESS, EsignRecipientRole.IN_PERSON_SIGNER,
            }}
        else:
            participants = {item["id"] for item in normalize_template_roles(target.recipient_roles or [])
                            if item.get("role") in {"signer", "witness", "in_person_signer"}}
        return docs, participants

    def apply_run(self, user_id: str, run_id: str, payload: EsignAiFieldPlacementApplyRequest) -> EsignAiFieldPlacementActionResponse:
        db = db_config.get_session()
        try:
            run = self._authorized_run(db, user_id, run_id)
            target = self._load_target(db, user_id, run.target_type, str(run.envelope_id or run.template_id))
            # Serialize applications on the draft, then refresh the run so a
            # retry racing the first request observes its committed outcome.
            _lock_draft_revision(db, target, None)
            db.refresh(run, with_for_update=True)
            if run.status == "applied":
                return EsignAiFieldPlacementActionResponse(run=self._serialize(run), draft_revision=int(target.draft_revision), fields_added=0)
            _lock_draft_revision(db, target, payload.current_revision)
            if run.status != "completed": raise EsignConflict("Only completed suggestions can be applied")
            snapshot_docs = {item["id"]: item["sha256"] for item in (run.target_snapshot or {}).get("documents", [])}
            snapshot_participant_rows = list((run.target_snapshot or {}).get("participants", []))
            snapshot_participants = {item["id"] for item in snapshot_participant_rows}
            current_docs, current_participants = self._current_identity(run.target_type, target)
            current_participant_rows = self._snapshot(run.target_type, target)["participants"]
            participant_key = lambda item: (str(item.get("id")), str(item.get("label")), str(item.get("role")))
            if (snapshot_docs != current_docs or snapshot_participants != current_participants
                    or sorted(map(participant_key, snapshot_participant_rows)) != sorted(map(participant_key, current_participant_rows))):
                raise EsignConflict("Documents or signing roles changed while AI was running. Generate new suggestions.")
            accepted = set(payload.accepted_proposal_ids)
            if len(accepted) != len(payload.accepted_proposal_ids): raise EsignError("Proposal IDs must be unique")
            proposals = [item for item in (run.proposals or []) if item.get("id") in accepted]
            if len(proposals) != len(accepted): raise EsignError("An accepted proposal does not belong to this run")
            existing = [self._field_dict(item, target_type=run.target_type) for item in target.fields or []]
            added: list[Any] = []
            roles = normalize_template_roles(target.recipient_roles or []) if run.target_type == "template" else []
            for item in proposals:
                if any(_overlap_duplicate(item, other) for other in existing):
                    continue
                proposal = EsignAiFieldPlacementProposal.model_validate(item)
                document = next((doc for doc in target.documents if str(doc.id) == proposal.document_id), None)
                if not document or proposal.participant_id not in current_participants: raise EsignConflict("A suggestion references a removed document or role")
                validate_field_placement(proposal.model_dump(), document)
                common = dict(id=uuid.uuid4(), field_type=EsignFieldType(proposal.field_type), page_number=proposal.page_number,
                              pos_x=proposal.pos_x, pos_y=proposal.pos_y, width=proposal.width, height=proposal.height,
                              required=proposal.required, label=proposal.label,
                              properties=proposal.properties.model_dump(exclude_none=True))
                if run.target_type == "envelope":
                    field = EsignField(envelope_id=target.id, document_id=uuid.UUID(proposal.document_id), recipient_id=uuid.UUID(proposal.participant_id), **common)
                else:
                    role_index = next((i for i, role in enumerate(roles) if role["id"] == proposal.participant_id), None)
                    if role_index is None: raise EsignConflict("A suggestion references a removed signing role")
                    field = EsignTemplateField(template_id=target.id, template_document_id=uuid.UUID(proposal.document_id),
                                               recipient_index=role_index, recipient_role_id=uuid.UUID(proposal.participant_id), **common)
                added.append(field); existing.append(item)
            try: validate_field_graph(list(target.fields or []) + added)
            except FieldLogicError as exc: raise EsignError(str(exc)) from exc
            db.add_all(added); _bump_draft_revision(target); run.status = "applied"; run.applied_at = datetime.now(timezone.utc)
            db.commit(); db.refresh(run)
            logger.info("esign_ai_field_placement_metric %s", json.dumps({"event": "applied", "run_id": str(run.id), "accepted": len(accepted), "added": len(added)}))
            return EsignAiFieldPlacementActionResponse(run=self._serialize(run), draft_revision=int(target.draft_revision), fields_added=len(added))
        except Exception: db.rollback(); raise
        finally: db.close()

    def discard_run(self, user_id: str, run_id: str) -> EsignAiFieldPlacementActionResponse:
        db = db_config.get_session()
        try:
            run = self._authorized_run(db, user_id, run_id)
            db.refresh(run, with_for_update=True)
            target = self._load_target(db, user_id, run.target_type, str(run.envelope_id or run.template_id))
            if run.status == "applied": raise EsignConflict("Applied suggestions cannot be discarded")
            if run.status != "discarded":
                run.status = "discarded"; run.discarded_at = datetime.now(timezone.utc); db.commit(); db.refresh(run)
                logger.info("esign_ai_field_placement_metric %s", json.dumps({"event": "discarded", "run_id": str(run.id), "pages": int(run.page_usage or 0), "processed": bool(run.completed_at)}))
            return EsignAiFieldPlacementActionResponse(run=self._serialize(run), draft_revision=int(target.draft_revision), fields_added=0)
        except Exception: db.rollback(); raise
        finally: db.close()

    def _client_or_raise(self) -> genai.Client:
        if self._client is None:
            project = os.getenv("GOOGLE_CLOUD_PROJECT_ID")
            if not project: raise RuntimeError("Vertex AI is not configured")
            self._client = genai.Client(vertexai=True, project=project, location=os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1"))
        return self._client

    @staticmethod
    def _response_schema(document_ids: list[str], participant_ids: list[str]) -> types.Schema:
        proposal = types.Schema(
            type="OBJECT",
            properties={
                "document_id": types.Schema(type="STRING", enum=document_ids),
                "page_number": types.Schema(type="INTEGER", minimum=0),
                "participant_id": types.Schema(type="STRING", enum=participant_ids),
                "field_type": types.Schema(type="STRING", enum=sorted(ALLOWED_TYPES)),
                "anchor_text": types.Schema(type="STRING", min_length=1),
                "anchor_before": types.Schema(type="STRING", nullable=True),
                "anchor_after": types.Schema(type="STRING", nullable=True),
                "match_index": types.Schema(type="INTEGER", minimum=0, nullable=True),
                "case_sensitive": types.Schema(type="BOOLEAN", nullable=True),
                "whole_word": types.Schema(type="BOOLEAN", nullable=True),
                "relative_position": types.Schema(type="STRING", enum=sorted(RELATIVE_POSITIONS), nullable=True),
                "cross_axis_alignment": types.Schema(type="STRING", enum=sorted(CROSS_AXIS_ALIGNMENTS), nullable=True),
                "width": types.Schema(type="NUMBER", minimum=0.001, maximum=1, nullable=True),
                "height": types.Schema(type="NUMBER", minimum=0.001, maximum=1, nullable=True),
                "required": types.Schema(type="BOOLEAN", nullable=True),
                "label": types.Schema(type="STRING", nullable=True),
                "properties": types.Schema(type="OBJECT", additional_properties=True, nullable=True),
            },
            required=["document_id", "page_number", "participant_id", "field_type", "anchor_text"],
        )
        return types.Schema(
            type="OBJECT",
            properties={
                "proposals": types.Schema(type="ARRAY", items=proposal),
                "warnings": types.Schema(type="ARRAY", items=types.Schema(type="STRING")),
            },
            required=["proposals", "warnings"],
        )

    @staticmethod
    def _build_model_prompt(
        *,
        documents: list[Any],
        participants: list[dict[str, Any]],
        existing: list[dict[str, Any]],
        page_numbered_text: str,
        instructions: str | None,
    ) -> str:
        document_summary = [{"id": str(document.id), "pages": int(document.page_count)} for document in documents]
        return f"""Suggest E-Signature fields for the attached PDFs.

Documents: {json.dumps(document_summary)}
Signing roles (use these IDs exactly and never create roles): {json.dumps(participants)}
Existing field summaries: {json.dumps(existing)}

Placement rules:
- Page numbers are zero-based. Return only fields a listed signing role should complete.
- anchor_text must be short, exact, visible text that is searchable in the extracted page text. Do not use checkbox glyphs or drawn lines as anchors.
- If anchor_text occurs more than once on a page, provide unique nearby anchor_before or anchor_after context. For repeated Signature/Date rows, prefer that row's participant or role label as anchor_before; a unique following section label may be used as anchor_after.
- match_index is the zero-based reading-order occurrence of anchor_text. Use it when nearby searchable context cannot uniquely identify a repeated label. If both context and match_index are supplied, they must identify the same occurrence.
- Set whole_word for short or common anchors such as Yes or No. Context must still identify the intended occurrence when the word appears elsewhere.
- Place fields into the adjacent blank area. Use only auto, center, right, left, below, or above for relative_position and auto, start, center, or end for cross_axis_alignment.
- Width and height are optional normalized page ratios between 0 and 1. Omit them to use safe field-type defaults. Do not return point or pixel dimensions.
- Omit properties unless a field needs type-compatible optional behavior. Never set schema_version.
- Do not duplicate existing fields. Add document ambiguities to warnings instead of guessing.

Page-numbered extracted text:
{page_numbered_text}

Additional sender instructions: {instructions or 'None'}
"""

    async def _download_analysis_pdf(self, document: Any, directory: str) -> tuple[str, bool]:
        source = os.path.join(directory, f"{document.id}.pdf")
        await self.storage.download_file(document.gcs_object_name, source)
        needs_ocr = False
        with fitz.open(source) as pdf:
            needs_ocr = any(len(page.get_text().strip()) < 25 for page in pdf)
        if not needs_ocr: return source, False
        output = os.path.join(directory, f"{document.id}-ocr.pdf")
        try:
            await asyncio.to_thread(self.ocr.run_ocr, input_pdf_path=source, output_pdf_path=output,
                                    languages=os.getenv("FORM_FILL_TARGET_OCR_LANGUAGES", "eng"),
                                    timeout_seconds=int(os.getenv("FORM_FILL_TARGET_OCR_TIMEOUT_SECONDS", "600")))
        except OCRmyPDFError as exc: raise RuntimeError(f"OCR failed for {document.original_filename}: {exc}") from exc
        return output, True

    def _generate_model_payload(self, document_parts: list[Any], prompt: str, response_schema: types.Schema) -> Any:
        response = self._client_or_raise().models.generate_content(
            model=self.model_name, contents=document_parts + [prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=response_schema,
                temperature=0.1,
            ),
        )
        return json.loads(response.text or "{}")

    async def process_run(self, run_id: str, **task_context: Any) -> dict[str, Any]:
        started = time.monotonic(); db = db_config.get_session()
        try:
            try: parsed = uuid.UUID(str(run_id))
            except ValueError: return {"status": "not_found"}
            run = db.query(EsignAiFieldPlacementRun).filter_by(id=parsed).with_for_update().first()
            if not run: return {"status": "not_found"}
            if run.status != "queued": return {"status": run.status}
            run.status = "processing"; run.started_at = datetime.now(timezone.utc); db.commit()
            target_model = EsignEnvelope if run.target_type == "envelope" else EsignTemplate
            target = db.query(target_model).options(joinedload(target_model.documents), joinedload(target_model.fields)).filter_by(id=run.envelope_id or run.template_id).first()
            if not target: raise RuntimeError("Draft target was deleted")
            selected = set(str(item) for item in run.selected_document_ids or [])
            documents = [item for item in target.documents or [] if str(item.id) in selected]
            snapshot = run.target_snapshot or {}; participants = snapshot.get("participants", [])
            existing = [self._field_dict(item, target_type=run.target_type) for item in target.fields or []]
            document_parts: list[Any] = []; local_paths: dict[str, str] = {}; page_text_sections: list[str] = []; ocr_used = 0
            omission_counts: Counter[str] = Counter(); recovery_counts: Counter[str] = Counter()
            with tempfile.TemporaryDirectory(prefix="esign-ai-placement-") as directory:
                for document in documents:
                    path, used = await self._download_analysis_pdf(document, directory); ocr_used += int(used); local_paths[str(document.id)] = path
                    with open(path, "rb") as handle: document_parts.append(types.Part.from_bytes(data=handle.read(), mime_type="application/pdf"))
                    with fitz.open(path) as text_pdf:
                        for page_index, text_page in enumerate(text_pdf):
                            page_text_sections.append(
                                f"Document {document.id}, zero-based page {page_index} "
                                f"(display page {page_index + 1}):\n{text_page.get_text().strip()}"
                            )
                page_numbered_text = "\n\n".join(page_text_sections)
                prompt = self._build_model_prompt(
                    documents=documents,
                    participants=participants,
                    existing=existing,
                    page_numbered_text=page_numbered_text,
                    instructions=run.instructions,
                )
                response_schema = self._response_schema(
                    [str(document.id) for document in documents],
                    [str(participant["id"]) for participant in participants],
                )
                raw = await asyncio.to_thread(
                    self._generate_model_payload, document_parts, prompt, response_schema,
                )
                candidates, warnings = parse_ai_field_placement_response(raw)
                parse_omissions = sum("omitted" in warning.lower() for warning in warnings)
                if parse_omissions:
                    omission_counts["parse"] += parse_omissions
                model_warning_count = len(warnings) - parse_omissions
                proposals: list[dict[str, Any]] = []
                participant_ids = {item["id"] for item in participants}; docs_by_id = {str(item.id): item for item in documents}
                pdfs = {doc_id: fitz.open(path) for doc_id, path in local_paths.items()}
                try:
                    for index, item in enumerate(candidates):
                        participant_id = str(item.get("participant_id") or "")
                        document_id = str(item.get("document_id") or "")
                        if participant_id not in participant_ids:
                            warnings.append(f"Suggestion {index + 1} was omitted because its signing role was missing or ambiguous.")
                            omission_counts["signing_role"] += 1; continue
                        document = docs_by_id.get(document_id)
                        if not document:
                            warnings.append(f"Suggestion {index + 1} was omitted because its document was not selected.")
                            omission_counts["document"] += 1; continue
                        try:
                            if isinstance(item.get("page_number"), bool): raise ValueError
                            page_number = int(item.get("page_number"))
                        except (TypeError, ValueError): page_number = -1
                        if page_number < 0 or page_number >= int(document.page_count):
                            warnings.append(f"Suggestion {index + 1} was omitted because its page was invalid.")
                            omission_counts["page"] += 1; continue
                        page = pdfs[document_id][page_number]
                        normalized, candidate_warnings, recovery_codes, omission_code = materialize_ai_field_placement_proposal(
                            item,
                            suggestion_number=index + 1,
                            document_id=document_id,
                            participant_id=participant_id,
                            page_number=page_number,
                            page=page,
                        )
                        warnings.extend(candidate_warnings)
                        recovery_counts.update(recovery_codes)
                        if normalized is None:
                            omission_counts[omission_code or "validation"] += 1; continue
                        if any(_overlap_duplicate(normalized, other) for other in existing + proposals):
                            warnings.append(f"Suggestion {index + 1} overlapped an existing or duplicate field and was omitted.")
                            omission_counts["overlap"] += 1; continue
                        proposals.append(normalized)
                finally:
                    for pdf in pdfs.values(): pdf.close()
            db.refresh(run, with_for_update=True)
            if run.status == "discarded": return {"status": "discarded"}
            billing = BillingService(db)
            usage_event_id = billing.record_usage(
                run.requester_user_id, int(run.page_usage), "esign_ai_field_placement",
                esign_ai_field_placement_run_id=str(run.id), notes="E-Signature AI field placement",
                commit=False,
            )
            run.proposals = proposals; run.warnings = warnings; run.status = "completed"; run.completed_at = datetime.now(timezone.utc); db.commit()
            if usage_event_id:
                account = billing.get_or_create_billing_account(run.requester_user_id)
                if account.plan_code in ("basic", "pro"):
                    billing._report_usage_to_stripe(run.requester_user_id, int(run.page_usage), usage_event_id)
            logger.info("esign_ai_field_placement_metric %s", json.dumps({
                "event": "completed", "run_id": str(run.id),
                "duration_ms": int((time.monotonic()-started)*1000), "pages": run.page_usage,
                "proposals": len(proposals), "omissions": sum(omission_counts.values()),
                "omission_reasons": dict(omission_counts), "recoveries": dict(recovery_counts),
                "model_warnings": model_warning_count, "ocr_documents": ocr_used,
            }))
            return {"status": "completed", "proposals": len(proposals)}
        except Exception as exc:
            db.rollback()
            failed = db.query(EsignAiFieldPlacementRun).filter_by(id=run_id).first()
            if failed and failed.status in ACTIVE_STATUSES:
                retry_count = task_context.get("task_retry_count")
                max_attempts = max(1, int(os.getenv("TASK_EXTRACT_MAX_ATTEMPTS", "3")))
                if retry_count is not None and int(retry_count) + 1 < max_attempts:
                    failed.status = "queued"; failed.error = None; failed.started_at = None
                else:
                    failed.status = "failed"; failed.error = "AI analysis failed. Place fields manually or try again."; failed.completed_at = datetime.now(timezone.utc)
                db.commit()
            logger.error("esign_ai_field_placement_metric %s", json.dumps({"event": "failed", "run_id": str(run_id), "model_error": type(exc).__name__}))
            raise
        finally: db.close()


esign_ai_field_placement_service = EsignAiFieldPlacementService()
