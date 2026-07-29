"""Vertex-backed Tasklytic assistant with server-derived context."""

from __future__ import annotations

import json
import logging
from typing import Any

from google.genai import types
from sqlalchemy.orm import Session

from models.tasklytic import TasklyticEntityRecord
from services.analytics_ai_service import _get_resp_text, _get_usage_counts, get_client
from services.billing_service import BillingService
from services.tasklytic_service import _find_record, authorize_record, get_membership


logger = logging.getLogger(__name__)
ALLOWED_MODELS = {"gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro", "gemini-3.1-pro-preview"}
ALLOWED_PROPOSALS = {
    "draft_status_update", "create_subtasks", "update_description", "smart_fields", "create_task"
}


def build_authorized_context(db: Session, user_id: str, scope: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    scope_type = scope.get("type")
    mapping = {
        "workspace": (None, "workspaceId"),
        "project": ("projects", "projectId"),
        "task": ("tasks", "taskId"),
        "goal": ("goals", "goalId"),
        "portfolio": ("portfolios", "portfolioId"),
    }
    if scope_type not in mapping:
        raise ValueError("Unsupported AI scope")
    kind, id_field = mapping[scope_type]
    scope_id = scope.get(id_field)
    if not isinstance(scope_id, str):
        raise ValueError("AI scope id is required")
    if kind is None:
        workspace_id = scope_id
        get_membership(db, workspace_id, user_id)
        anchor: dict[str, Any] = {"id": workspace_id}
    else:
        row = _find_record(db, kind, scope_id)
        if row is None or not row.workspace_id:
            raise ValueError("AI scope was not found")
        workspace_id = row.workspace_id
        get_membership(db, workspace_id, user_id)
        authorize_record(db, kind, row.payload or {}, workspace_id, user_id)
        anchor = row.payload or {}

    # Keep context bounded and only include records the caller may read.
    context: dict[str, Any] = {"scope": scope, "anchor": anchor, "collections": {}}
    for entity_kind in ("projects", "tasks", "sections", "goals", "portfolios", "statusUpdates", "users"):
        rows = db.query(TasklyticEntityRecord).filter_by(
            entity_kind=entity_kind, workspace_id=workspace_id
        ).limit(500).all()
        visible = []
        for row in rows:
            try:
                authorize_record(db, entity_kind, row.payload or {}, workspace_id, user_id)
            except Exception:
                continue
            visible.append(row.payload)
        context["collections"][entity_kind] = visible
    return workspace_id, context


def _proposal_ref(proposal: dict[str, Any]) -> tuple[str | None, str | None]:
    payload = proposal.get("payload") or {}
    proposal_type = proposal.get("type")
    if proposal_type == "draft_status_update":
        return "projects", payload.get("projectId")
    if proposal_type in {"create_subtasks", "update_description", "smart_fields"}:
        return "tasks", payload.get("parentTaskId") or payload.get("taskId")
    if proposal_type == "create_task" and payload.get("projectId"):
        return "projects", payload.get("projectId")
    return None, None


def validate_proposals(db: Session, user_id: str, workspace_id: str, proposals: Any) -> list[dict[str, Any]]:
    if not isinstance(proposals, list) or len(proposals) > 20:
        raise ValueError("Model returned an invalid proposals collection")
    result = []
    for proposal in proposals:
        if not isinstance(proposal, dict) or proposal.get("type") not in ALLOWED_PROPOSALS:
            raise ValueError("Model returned an unsupported proposal type")
        if not isinstance(proposal.get("title"), str) or not isinstance(proposal.get("preview"), str):
            raise ValueError("Model returned a malformed proposal")
        kind, ref = _proposal_ref(proposal)
        if kind and ref:
            row = _find_record(db, kind, str(ref), workspace_id)
            if row is None:
                raise ValueError("Model proposal references an unknown record")
            authorize_record(db, kind, row.payload or {}, workspace_id, user_id)
        if proposal["type"] == "create_task":
            payload = proposal.get("payload") or {}
            if payload.get("workspaceId") != workspace_id:
                raise ValueError("Model proposal references another workspace")
        result.append(proposal)
    return result


async def generate_tasklytic_response(
    db: Session,
    user_id: str,
    prompt: str,
    history: list[dict[str, str]],
    model: str | None,
    scope: dict[str, Any],
) -> dict[str, Any]:
    workspace_id, context = build_authorized_context(db, user_id, scope)
    selected_model = model if model in ALLOWED_MODELS else "gemini-2.5-flash"
    history_text = "\n".join(f"{row['role']}: {row['content']}" for row in history[-20:])
    instruction = f"""You are Tasklytic's project-management assistant. Use only the authorized JSON context below.
Return JSON with keys text (string), optional reasoning (string), and proposals (array). Proposal types may only be:
draft_status_update, create_subtasks, update_description, smart_fields, create_task.
Never invent record IDs; proposals must reuse IDs from context. A create_task payload must use workspaceId {workspace_id!r}.

AUTHORIZED CONTEXT:
{json.dumps(context, separators=(',', ':'), default=str)}

RECENT HISTORY:
{history_text}

USER REQUEST:
{prompt}
"""
    response = await get_client().aio.models.generate_content(
        model=selected_model,
        contents=instruction,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.2,
            max_output_tokens=8192,
        ),
    )
    text = _get_resp_text(response)
    if not text:
        raise RuntimeError("Vertex AI returned an empty response")
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError("Vertex AI returned malformed JSON") from exc
    if not isinstance(parsed, dict) or not isinstance(parsed.get("text"), str):
        raise ValueError("Vertex AI returned an invalid response")
    parsed["proposals"] = validate_proposals(db, user_id, workspace_id, parsed.get("proposals", []))
    usage = _get_usage_counts(response)
    try:
        BillingService(db).record_analytics_usage(
            user_id,
            "tasklytic_assistant",
            usage.get("prompt_tokens"),
            usage.get("output_tokens"),
            usage.get("total_tokens"),
            notes=f"workspace={workspace_id};model={selected_model}",
        )
    except Exception:
        logger.exception("Unable to meter Tasklytic AI usage for %s", user_id)
        raise
    return parsed
