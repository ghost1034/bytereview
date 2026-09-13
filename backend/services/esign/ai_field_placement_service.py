"""Background, advisory AI field placement for E-Signature drafts."""

from __future__ import annotations

import asyncio
import json
import hashlib
import logging
import math
import os
import tempfile
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any

import fitz
from google import genai
from google.genai import types
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import joinedload

from core.database import db_config
from models.db_models import (
    EsignAiFieldPlacementRun, EsignEnvelope,
    EsignField, EsignFieldType, EsignRecipientRole, EsignTemplate,
    EsignTemplateField,
)
from models.esign import (
    EsignAiFieldPlacementActionResponse, EsignAiFieldPlacementApplyRequest,
    EsignAiFieldPlacementCreateRequest, EsignAiFieldPlacementProposal,
    EsignAiFieldPlacementRunResponse,
)
from services.billing_service import BillingService
from services.cloud_run_task_service import cloud_run_task_service
from services.esign.authorization_service import esign_authorization_service
from services.esign.envelope_service import (
    EsignConflict, EsignError, EsignNotFound, _bump_draft_revision, _lock_draft_revision,
    esign_envelope_service, normalize_template_roles, validate_field_placement,
)
from services.esign.field_logic import FieldLogicError, validate_field_graph
from services.esign.placement_single_call import (
    PIPELINE_VERSION, analyze_documents, validate_group_acceptance, remap_properties,
)
from services.esign.placement_model import generate_placement_response
from services.esign.placement_targets import field_box, intersection_fraction
from services.gcs_service import get_storage_service
from services.pdf_anchor import relative_anchor_box_position, resolve_contextual_anchor_rect


logger = logging.getLogger(__name__)
# Historical anchor parser compatibility; live runs use the shared 20-type contract.
LEGACY_ALLOWED_TYPES = {
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
        if field_type not in LEGACY_ALLOWED_TYPES:
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
        self.model_name = os.getenv("ESIGN_AI_FIELD_PLACEMENT_MODEL", "gemini-2.5-flash")

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
            issues=list(getattr(run, 'issues', None) or []),
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
        return {"documents": documents, "participants": participants,
                "existing_fields": [EsignAiFieldPlacementService._field_dict(field, target_type=target_type)
                                    for field in target.fields or []]}

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
            allowed_users = {item.strip() for item in os.getenv('ESIGN_AI_TARGET_PIPELINE_USERS', '').split(',') if item.strip()}
            enabled = os.getenv('ESIGN_AI_TARGET_PIPELINE', 'false').lower() == 'true' or user_id in allowed_users
            if not enabled:
                raise EsignError('AI field placement is temporarily paused. Place fields manually or try again later.')
            snapshot['pipeline_version'] = PIPELINE_VERSION
            snapshot['model_settings'] = {'model': self.model_name,
                                          'location': os.getenv('ESIGN_AI_FIELD_PLACEMENT_LOCATION', 'global'),
                                          'temperature': 0.1}
            if not snapshot["participants"]:
                raise EsignError("Add at least one signing role before placing fields with AI")
            documents = snapshot["documents"]
            if payload.scope == "active_document":
                documents = [item for item in documents if item["id"] == payload.document_id]
                if not documents:
                    raise EsignError("The active document is not part of this draft")
            selected_ids = [item["id"] for item in documents]
            snapshot['selected_document_ids'] = selected_ids
            pages = sum(int(item["page_count"]) for item in documents)
            active = db.query(EsignAiFieldPlacementRun).filter(
                (EsignAiFieldPlacementRun.envelope_id == target.id if target_type == "envelope" else EsignAiFieldPlacementRun.template_id == target.id),
                EsignAiFieldPlacementRun.scope == payload.scope,
                EsignAiFieldPlacementRun.status.in_(ACTIVE_STATUSES),
            ).first()
            if active:
                raise EsignConflict("An AI field-placement analysis is already running for this scope")
            BillingService(db).require_limit(user_id, "page", pages)
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
            "id": str(field.id),
            "document_id": str(field.document_id if target_type == "envelope" else field.template_document_id),
            "participant_id": str(field.recipient_id if target_type == "envelope" else field.recipient_role_id),
            "field_type": _value(field.field_type), "page_number": int(field.page_number),
            "pos_x": float(field.pos_x), "pos_y": float(field.pos_y), "width": float(field.width), "height": float(field.height),
            "properties": dict(field.properties or {}),
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
            try:
                validate_group_acceptance(list(run.proposals or []), accepted)
            except ValueError as exc:
                raise EsignError(str(exc)) from exc
            existing = [self._field_dict(item, target_type=run.target_type) for item in target.fields or []]
            for item in proposals:
                if item.get('target_id') and any(
                    item['document_id'] == other['document_id'] and item['page_number'] == other['page_number']
                    and intersection_fraction(field_box(item), field_box(other)) > .2 for other in existing
                ):
                    raise EsignConflict('Fields were added over a suggested target after analysis. Review or regenerate the suggestions.')
                if (item.get('properties') or {}).get('selection_group') and any(_overlap_duplicate(item, other) for other in existing):
                    raise EsignConflict('A choice group overlaps fields added since analysis. Review or regenerate the group.')
            added: list[Any] = []
            saved_ids = {item['id']: str(uuid.uuid4()) for item in proposals}
            roles = normalize_template_roles(target.recipient_roles or []) if run.target_type == "template" else []
            for item in proposals:
                if any(_overlap_duplicate(item, other) for other in existing):
                    continue
                proposal = EsignAiFieldPlacementProposal.model_validate(item)
                document = next((doc for doc in target.documents if str(doc.id) == proposal.document_id), None)
                if not document or proposal.participant_id not in current_participants: raise EsignConflict("A suggestion references a removed document or role")
                validate_field_placement(proposal.model_dump(), document)
                common = dict(id=uuid.UUID(saved_ids[proposal.id]), field_type=EsignFieldType(proposal.field_type), page_number=proposal.page_number,
                              pos_x=proposal.pos_x, pos_y=proposal.pos_y, width=proposal.width, height=proposal.height,
                              required=proposal.required, label=proposal.label,
                              properties=remap_properties(proposal.properties.model_dump(exclude_none=True), saved_ids))
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

    @staticmethod
    def _response_schema(document_ids: list[str], participant_ids: list[str]) -> types.Schema:
        proposal = types.Schema(
            type="OBJECT",
            properties={
                "document_id": types.Schema(type="STRING", enum=document_ids),
                "page_number": types.Schema(type="INTEGER", minimum=0),
                "participant_id": types.Schema(type="STRING", enum=participant_ids),
                "field_type": types.Schema(type="STRING", enum=sorted(LEGACY_ALLOWED_TYPES)),
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

    def _generate_target_payload(
        self, phase: str, prompt: str, schema: dict[str, Any], image: bytes | list[dict[str, Any]],
        settings: dict[str, Any],
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        with genai.Client(vertexai=True, project=os.environ['GOOGLE_CLOUD_PROJECT_ID'],
                          location=settings.get('location', 'global'),
                          http_options=types.HttpOptions(timeout=600_000, retry_options=types.HttpRetryOptions(attempts=1))) as client:
            return generate_placement_response(client, {'model': self.model_name, **settings}, phase, prompt, schema, image)

    def _durable_generate(self, run_id: str, token: uuid.UUID, settings: dict[str, Any],
                          phase: str, prompt: str, schema: dict[str, Any], images: list[dict[str, Any]]) -> tuple[dict[str, Any], dict[str, Any]]:
        """Reserve once before network I/O; replay only a durably stored response."""
        request_hash = hashlib.sha256(json.dumps({
            'prompt': prompt, 'schema': schema, 'settings': settings,
            'images': [hashlib.sha256(image['data']).hexdigest() for image in images],
        }, sort_keys=True).encode()).hexdigest()
        with db_config.get_session() as db:
            run = db.query(EsignAiFieldPlacementRun).filter_by(id=uuid.UUID(run_id)).with_for_update().one()
            if run.status != 'processing' or run.processing_token != token or run.processing_deadline <= datetime.now(timezone.utc):
                raise RuntimeError('Analysis worker no longer owns this run')
            if run.model_response is not None:
                if run.model_response['request_hash'] != request_hash:
                    raise ValueError('Saved response does not match the prepared request')
                return run.model_response['response'], run.model_response['provider']
            if run.inference_attempted_at is not None:
                raise RuntimeError('The single inference attempt was already reserved; start a new analysis')
            run.inference_attempted_at = datetime.now(timezone.utc)
            run.processing_deadline = datetime.now(timezone.utc) + timedelta(minutes=30)
            run.analysis_diagnostics = {'pipeline_version': PIPELINE_VERSION, 'request_hash': request_hash, 'attempted_calls': 1}
            db.commit()
        raw, metadata = self._generate_target_payload(phase, prompt, schema, images, settings)
        with db_config.get_session() as db:
            run = db.query(EsignAiFieldPlacementRun).filter_by(id=uuid.UUID(run_id)).with_for_update().one()
            if run.status != 'processing' or run.processing_token != token or run.processing_deadline <= datetime.now(timezone.utc):
                raise RuntimeError('Analysis completed after its worker lease ended')
            run.model_response = {'request_hash': request_hash, 'response': raw, 'provider': metadata}
            db.commit()
        return raw, metadata

    def recover_expired_runs(self) -> list[str]:
        """Expired workers lose their lease. Only saved responses can resume."""
        requeue = []
        with db_config.get_session() as db:
            runs = db.query(EsignAiFieldPlacementRun).filter(
                EsignAiFieldPlacementRun.status == 'processing',
                EsignAiFieldPlacementRun.processing_deadline < datetime.now(timezone.utc),
            ).with_for_update(skip_locked=True).all()
            for run in runs:
                run.processing_token = None
                run.processing_deadline = None
                if run.model_response is not None and run.processing_attempts < 3:
                    run.status = 'queued'
                    requeue.append(str(run.id))
                else:
                    run.status = 'failed'
                    run.completed_at = datetime.now(timezone.utc)
                    run.error = 'Analysis timed out. Start a new analysis or place fields manually.'
            db.commit()
            # Re-offer saved-response work on every maintenance tick until a
            # worker claims it, including after an enqueue/network failure.
            requeue = [str(row.id) for row in db.query(EsignAiFieldPlacementRun).filter(
                EsignAiFieldPlacementRun.status == 'queued',
                EsignAiFieldPlacementRun.model_response.isnot(None),
                EsignAiFieldPlacementRun.processing_attempts < 3,
            ).all()]
        return requeue

    async def process_run(self, run_id: str, **task_context: Any) -> dict[str, Any]:
        started = time.monotonic()
        try:
            parsed = uuid.UUID(str(run_id))
        except ValueError:
            return {'status': 'not_found'}
        token = uuid.uuid4()
        diagnostics: dict[str, Any] = {}
        db = db_config.get_session()
        try:
            run = db.query(EsignAiFieldPlacementRun).filter_by(id=parsed).with_for_update().first()
            if not run:
                return {'status': 'not_found'}
            if run.status != 'queued':
                return {'status': run.status}
            if (run.target_snapshot or {}).get('pipeline_version') != PIPELINE_VERSION:
                run.status = 'failed'
                run.error = 'This analysis uses an older pipeline. Start a new analysis.'
                run.completed_at = datetime.now(timezone.utc)
                db.commit()
                return {'status': 'failed'}
            if run.processing_attempts >= 3:
                run.status = 'failed'
                run.error = 'Local analysis could not be completed. Start a new analysis.'
                run.completed_at = datetime.now(timezone.utc)
                db.commit()
                return {'status': 'failed'}
            if run.inference_attempted_at is not None and run.model_response is None:
                run.status = 'failed'
                run.error = 'The previous request outcome is unknown. Start a new analysis.'
                run.completed_at = datetime.now(timezone.utc)
                db.commit()
                return {'status': 'failed'}
            run.status = 'processing'
            run.processing_attempts += 1
            run.started_at = datetime.now(timezone.utc)
            run.processing_token = token
            run.processing_deadline = datetime.now(timezone.utc) + timedelta(minutes=30)
            db.commit()
            snapshot = run.target_snapshot
            target_model = EsignEnvelope if run.target_type == 'envelope' else EsignTemplate
            target = db.query(target_model).options(joinedload(target_model.documents)).filter_by(id=run.envelope_id or run.template_id).first()
            if not target:
                raise ValueError('Draft target was deleted')
            selected = set(run.selected_document_ids)
            documents = [document for document in target.documents if str(document.id) in selected]
            if {str(d.id) for d in documents} != selected:
                raise ValueError('A selected document was removed before analysis')
            with tempfile.TemporaryDirectory(prefix='esign-single-request-') as directory:
                originals = {}
                for document in documents:
                    path = os.path.join(directory, f'{document.id}.pdf')
                    await self.storage.download_file(document.gcs_object_name, path)
                    with open(path, 'rb') as handle:
                        originals[str(document.id)] = handle.read()
                settings = snapshot['model_settings']
                result = await asyncio.to_thread(
                    analyze_documents, originals, snapshot, run.instructions,
                    lambda phase, prompt, schema, images: self._durable_generate(str(parsed), token, settings, phase, prompt, schema, images),
                    model_settings=settings, diagnostics_sink=diagnostics,
                )
            db.refresh(run, with_for_update=True)
            if run.status != 'processing' or run.processing_token != token or run.processing_deadline <= datetime.now(timezone.utc):
                return {'status': run.status}
            BillingService(db).record_usage(
                user_id=run.requester_user_id, product='esign', source='esign_ai_field_placement',
                unit='page', quantity=int(run.page_usage), operation_id=str(run.id),
                esign_ai_field_placement_run_id=str(run.id), notes='E-Signature AI field placement', commit=False,
            )
            diagnostics['attempted_calls'] = int(run.inference_attempted_at is not None)
            diagnostics['request_hash'] = run.model_response['request_hash']
            run.analysis_diagnostics = diagnostics
            run.issues = result.issues
            run.proposals = result.proposals
            run.warnings = []
            run.status = 'completed'
            run.completed_at = datetime.now(timezone.utc)
            run.processing_deadline = None
            run.processing_token = None
            db.commit()
            logger.info('esign_ai_field_placement_metric %s', json.dumps({
                'event': 'completed', 'run_id': str(run.id), 'pipeline_version': PIPELINE_VERSION,
                'duration_ms': int((time.monotonic()-started)*1000), 'pages': run.page_usage,
                'proposals': len(result.proposals), 'omissions': len(result.issues), 'model_calls': 1,
                'model_tokens': sum(c.get('provider', {}).get('usage', {}).get('total_token_count', 0) or 0 for c in diagnostics['calls']),
            }))
            return {'status': 'completed', 'proposals': len(result.proposals)}
        except Exception as exc:
            db.rollback()
            failed = db.query(EsignAiFieldPlacementRun).filter_by(id=parsed).with_for_update().first()
            if failed and failed.status == 'processing' and failed.processing_token == token:
                # Only local failures after response persistence are retryable.
                # Validation failures are terminal and never re-call the model.
                can_resume = failed.model_response is not None and not isinstance(exc, ValueError) and failed.processing_attempts < 3
                attempted = int(failed.inference_attempted_at is not None)
                failed.analysis_diagnostics = {**(failed.analysis_diagnostics or {}), **diagnostics, 'attempted_calls': attempted}
                failed.status = 'queued' if can_resume else 'failed'
                failed.processing_token = None
                failed.processing_deadline = None
                failed.error = None if can_resume else (str(exc)[:500] if isinstance(exc, ValueError) else 'AI analysis failed. Start a new analysis or place fields manually.')
                failed.completed_at = None if can_resume else datetime.now(timezone.utc)
                db.commit()
                if can_resume:
                    raise
            logger.error('esign_ai_field_placement_metric %s', json.dumps({'event': 'failed', 'run_id': run_id, 'model_error': type(exc).__name__}))
            return {'status': failed.status if failed else 'not_found'}
        finally:
            db.close()


esign_ai_field_placement_service = EsignAiFieldPlacementService()
