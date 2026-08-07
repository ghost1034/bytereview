"""Human-in-the-loop AI proposals for the PBC module."""

from __future__ import annotations

import json
import logging
from typing import Any

from google.genai import types
from sqlalchemy.orm import Session

from models.pbc import PbcDocument, PbcEngagement, PbcRequest, PbcTemplate
from services.analytics_ai_service import _get_resp_text, _get_usage_counts, get_client
from services.billing_service import BillingService


logger = logging.getLogger(__name__)
MODEL = "gemini-2.5-flash"


def _draft_response_schema() -> types.Schema:
    """Constrain Gemini to the shape validated below.

    Gemini 2.5 models count internal thinking against ``max_output_tokens``.
    Without a schema and an explicit zero thinking budget, longer request lists
    can be truncated or returned with a shape that fails JSON validation.
    """
    proposal = types.Schema(
        type="OBJECT",
        properties={
            "title": types.Schema(type="STRING"),
            "category": types.Schema(type="STRING"),
            "description": types.Schema(type="STRING"),
            "priority": types.Schema(type="STRING", enum=["low", "normal", "high", "urgent"]),
            "expected_formats": types.Schema(
                type="ARRAY",
                items=types.Schema(type="STRING"),
            ),
            "rationale": types.Schema(type="STRING"),
        },
        required=[
            "title",
            "category",
            "description",
            "priority",
            "expected_formats",
            "rationale",
        ],
    )
    return types.Schema(
        type="OBJECT",
        properties={
            "summary": types.Schema(type="STRING"),
            "proposals": types.Schema(type="ARRAY", items=proposal),
        },
        required=["summary", "proposals"],
    )


def _meter(db: Session, user_id: str, response, note: str) -> None:
    usage = _get_usage_counts(response)
    BillingService(db).record_analytics_usage(
        user_id,
        "pbc_assistant",
        usage.get("prompt_tokens"),
        usage.get("output_tokens"),
        usage.get("total_tokens"),
        notes=note,
    )


async def draft_request_list(
    db: Session,
    user_id: str,
    engagement: PbcEngagement,
    instructions: str | None,
) -> dict[str, Any]:
    templates = db.query(PbcTemplate).filter(PbcTemplate.firm_id == engagement.firm_id).limit(20).all()
    context = {
        "engagement": {
            "name": engagement.name,
            "client": engagement.client_name_snapshot,
            "type": engagement.engagement_type,
            "period_start": str(engagement.period_start or ""),
            "period_end": str(engagement.period_end or ""),
            "due_date": str(engagement.due_date or ""),
        },
        "firm_templates": [{"name": row.name, "items": row.items or []} for row in templates],
    }
    prompt = f"""You assist an accounting firm in drafting a Prepared by Client request list.
Use only the authorized engagement context and firm templates below. Produce suggestions, not final requests.
Return JSON with `summary` and `proposals`. Each proposal must contain title, category, description,
priority (low|normal|high|urgent), expected_formats (array), and rationale. Return at most 40 proposals.
Do not invent client facts, account balances, laws, or record identifiers.

AUTHORIZED CONTEXT:
{json.dumps(context, default=str)}

FIRM INSTRUCTIONS:
{instructions or 'Draft a practical audit-first request list.'}
"""
    response = await get_client().aio.models.generate_content(
        model=MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=_draft_response_schema(),
            temperature=0.2,
            max_output_tokens=8192,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        ),
    )
    response_text = _get_resp_text(response)
    try:
        parsed = json.loads(response_text or "{}")
    except json.JSONDecodeError as exc:
        logger.warning(
            "Gemini returned invalid JSON for PBC request-list draft (engagement=%s, output_chars=%d)",
            engagement.id,
            len(response_text or ""),
        )
        raise ValueError("AI returned an invalid PBC request-list proposal") from exc
    proposals = parsed.get("proposals")
    if not isinstance(parsed.get("summary"), str) or not isinstance(proposals, list) or len(proposals) > 40:
        raise ValueError("AI returned an invalid PBC request-list proposal")
    allowed_priorities = {"low", "normal", "high", "urgent"}
    cleaned = []
    for item in proposals:
        if not isinstance(item, dict) or not isinstance(item.get("title"), str):
            raise ValueError("AI returned a malformed PBC proposal")
        cleaned.append({
            "title": item["title"][:500],
            "category": str(item.get("category") or "Other")[:128],
            "description": str(item.get("description") or "")[:20_000],
            "priority": item.get("priority") if item.get("priority") in allowed_priorities else "normal",
            "expected_formats": [str(value).lower()[:20] for value in (item.get("expected_formats") or [])[:20]],
            "rationale": str(item.get("rationale") or "")[:2000],
        })
    _meter(db, user_id, response, f"engagement={engagement.id};action=draft")
    return {"summary": parsed["summary"], "proposals": cleaned, "model": MODEL, "requires_confirmation": True}


async def match_document(
    db: Session,
    user_id: str,
    engagement: PbcEngagement,
    document: PbcDocument,
) -> dict[str, Any]:
    requests = db.query(PbcRequest).filter(
        PbcRequest.engagement_id == engagement.id, PbcRequest.status != "waived"
    ).order_by(PbcRequest.sort_order).all()
    context = [{
        "id": str(row.id), "number": row.request_number, "title": row.title,
        "category": row.category, "expected_filename": row.expected_filename,
        "expected_formats": row.expected_formats or [], "period_end": str(row.period_end or ""),
    } for row in requests]
    prompt = f"""Suggest which PBC request best matches this uploaded document using metadata only.
Return JSON with candidates (maximum 3), each containing request_id, confidence from 0 to 1, and rationale,
plus warnings (array of strings). Never claim to have inspected document contents.

DOCUMENT: {json.dumps({'filename': document.filename, 'mime_type': document.mime_type, 'size_bytes': document.size_bytes})}
AUTHORIZED REQUESTS: {json.dumps(context)}
"""
    response = await get_client().aio.models.generate_content(
        model=MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0, max_output_tokens=2048),
    )
    parsed = json.loads(_get_resp_text(response) or "{}")
    known = {item["id"] for item in context}
    candidates = []
    for item in (parsed.get("candidates") or [])[:3]:
        if item.get("request_id") not in known:
            continue
        candidates.append({
            "request_id": item["request_id"],
            "confidence": max(0.0, min(float(item.get("confidence") or 0), 1.0)),
            "rationale": str(item.get("rationale") or "")[:2000],
        })
    result = {
        "candidates": candidates,
        "warnings": [str(item)[:1000] for item in (parsed.get("warnings") or [])[:20]],
        "model": MODEL,
        "metadata_only": True,
        "requires_confirmation": True,
    }
    document.ai_metadata = result
    _meter(db, user_id, response, f"engagement={engagement.id};document={document.id};action=match")
    return result


def completeness_flags(db: Session, engagement: PbcEngagement) -> dict[str, Any]:
    flags = []
    for row in db.query(PbcRequest).filter(PbcRequest.engagement_id == engagement.id).order_by(PbcRequest.sort_order):
        docs = db.query(PbcDocument).filter(PbcDocument.request_id == row.id, PbcDocument.state == "available").all()
        warnings = []
        if row.status not in {"accepted", "waived"} and row.due_date and row.due_date < __import__("datetime").date.today():
            warnings.append("Request is overdue")
        if row.status in {"submitted", "accepted"} and not docs:
            warnings.append("Completed status has no available evidence")
        if row.expected_formats and docs:
            expected = {str(value).lower().lstrip(".") for value in row.expected_formats}
            if all(document.filename.rsplit(".", 1)[-1].lower() not in expected for document in docs if "." in document.filename):
                warnings.append("Available evidence does not match the expected format")
        if row.requires_redaction and docs:
            warnings.append("Evidence requires documented redaction review")
        if warnings:
            flags.append({"request_id": str(row.id), "request_number": row.request_number, "warnings": warnings})
    return {"flags": flags, "requires_confirmation": True, "generated_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc)}
