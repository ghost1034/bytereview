"""Tasklytic reporting-source registry and deterministic digest snapshots."""

from __future__ import annotations

import hashlib
import struct
import zlib
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from models.tasklytic import TasklyticEntityRecord
from services.tasklytic_service import utcnow


REPORTING_SOURCES: dict[str, dict[str, Any]] = {
    "tasks": {
        "id": "tasks",
        "label": "Tasks",
        "entityKind": "tasks",
        "groupFields": ["assigneeId", "completed", "project", "section", "tag", "createdAt", "dueOn"],
        "dateFields": ["createdAt", "completedAt", "dueOn", "startOn"],
        "measureFields": [],
    },
    "projects": {
        "id": "projects",
        "label": "Projects",
        "entityKind": "projects",
        "groupFields": ["status", "teamId", "ownerId"],
        "dateFields": ["createdAt", "modifiedAt", "startOn", "dueOn"],
        "measureFields": ["taskCount"],
    },
    "time": {
        "id": "time", "label": "Time entries", "entityKind": "timeEntries",
        "groupFields": ["userId", "clientId", "matterId", "projectId", "status", "billable", "activityCode"],
        "dateFields": ["date", "createdAt", "submittedAt", "approvedAt"],
        "measureFields": ["hours", "amount"],
    },
    "expenses": {
        "id": "expenses", "label": "Expenses", "entityKind": "expenses",
        "groupFields": ["userId", "clientId", "matterId", "projectId", "status", "category", "reimbursable"],
        "dateFields": ["date", "createdAt", "submittedAt", "approvedAt", "reimbursedAt"],
        "measureFields": ["amount", "totalAmount", "billableAmount"],
    },
    "utilization": {
        "id": "utilization", "label": "Utilization", "entityKind": "timeEntries",
        "groupFields": ["userId", "projectId", "matterId", "billable"],
        "dateFields": ["date"], "measureFields": ["hours", "utilizationPercent"],
    },
    "wip": {
        "id": "wip", "label": "Work in progress", "entityKind": "timeEntries",
        "groupFields": ["clientId", "matterId", "projectId", "userId", "status"],
        "dateFields": ["date", "approvedAt"], "measureFields": ["amount"],
    },
    "invoices": {
        "id": "invoices", "label": "Invoices", "entityKind": "invoices",
        "groupFields": ["clientId", "matterId", "status", "currency"],
        "dateFields": ["issueDate", "dueOn", "sentAt", "paidAt"],
        "measureFields": ["total", "amountPaid", "amountOutstanding"],
    },
    "payments": {
        "id": "payments", "label": "Payments", "entityKind": "payments",
        "groupFields": ["clientId", "invoiceId", "method", "currency", "status"],
        "dateFields": ["paidAt", "createdAt"], "measureFields": ["amount"],
    },
    "realization": {
        "id": "realization", "label": "Realization", "entityKind": "timeEntries",
        "groupFields": ["userId", "clientId", "matterId", "projectId", "currency"],
        "dateFields": ["date", "billedAt"], "measureFields": ["amount", "realizationPercent"],
    },
    "effective_rate": {
        "id": "effective_rate", "label": "Effective rate", "entityKind": "timeEntries",
        "groupFields": ["userId", "clientId", "matterId", "projectId", "currency"],
        "dateFields": ["date", "billedAt"], "measureFields": ["hours", "amount", "effectiveRate"],
    },
    "ar_aging": {
        "id": "ar_aging", "label": "AR aging", "entityKind": "invoices",
        "groupFields": ["clientId", "currency", "agingBucket"],
        "dateFields": ["issueDate", "dueOn"], "measureFields": ["amountOutstanding"],
    },
}


def reporting_sources_payload() -> list[dict[str, Any]]:
    return [dict(value) for value in REPORTING_SOURCES.values()]


def normalize_chart_definition(raw: Any) -> dict[str, Any]:
    """Repair legacy aliases without dropping persisted chart fields."""

    if not isinstance(raw, dict):
        raise ValueError("Dashboard charts must be objects")
    chart = dict(raw)
    chart["source"] = str(chart.get("source") or "tasks")
    chart["xAxis"] = chart.get("xAxis") or chart.pop("groupBy", None) or chart.pop("xField", None)
    chart["dateField"] = chart.get("dateField") or chart.pop("yAxis", None)
    if chart.get("dateField") and not chart.get("yAxis"):
        chart["yAxis"] = chart["dateField"]
    legacy_granularity = chart.get("measureField") if chart.get("measureField") in {"day", "week", "month", "quarter"} else None
    chart["granularity"] = chart.get("granularity") or legacy_granularity
    if legacy_granularity:
        chart["measureField"] = None
    if chart.get("granularity") not in {None, "day", "week", "month", "quarter"}:
        raise ValueError("Chart granularity is invalid")
    try:
        top_n = int(chart["topN"]) if chart.get("topN") is not None else None
    except (TypeError, ValueError) as exc:
        raise ValueError("Chart topN must be numeric") from exc
    if top_n is not None and top_n not in {5, 10, 25, 50}:
        raise ValueError("Chart topN must be 5, 10, 25, or 50")
    chart["topN"] = top_n
    chart.setdefault("filters", [])
    chart.setdefault("measure", "count")
    return chart


@dataclass(frozen=True)
class DashboardSnapshot:
    content: bytes
    mime_type: str
    width: int
    height: int
    sha256: str
    generated_at: str
    chart_summaries: list[dict[str, Any]]


def next_dashboard_run(frequency: str, scheduled_for: datetime, now: datetime) -> datetime:
    """Advance from the schedule anchor until the next future occurrence."""

    scheduled_for = scheduled_for.replace(tzinfo=scheduled_for.tzinfo or timezone.utc)
    now = now.replace(tzinfo=now.tzinfo or timezone.utc)
    candidate = scheduled_for
    while candidate <= now:
        if frequency == "daily":
            candidate += timedelta(days=1)
        elif frequency == "weekly_mon":
            candidate += timedelta(days=7)
        elif frequency == "monthly_1st":
            month = candidate.month + 1
            year = candidate.year + (1 if month == 13 else 0)
            candidate = candidate.replace(year=year, month=1 if month == 13 else month, day=1)
        else:
            raise ValueError("Dashboard schedule frequency is invalid")
    return candidate


def _matches_filter(payload: dict[str, Any], clause: dict[str, Any]) -> bool:
    field = str(clause.get("field") or "")
    if field == "__scope":
        return True
    if field.startswith("customField:"):
        wrapped = (payload.get("customFieldValues") or {}).get(field.split(":", 1)[1])
        raw = wrapped.get("value") if isinstance(wrapped, dict) else None
    elif field == "due":
        raw = payload.get("dueOn")
    else:
        raw = payload.get(field)
    expected = clause.get("value")
    op = clause.get("op")
    if op == "eq":
        return raw == expected
    if op == "neq":
        return raw != expected
    if op == "contains":
        return str(expected).lower() in str(raw or "").lower()
    if op == "in" and isinstance(expected, list):
        return raw in expected
    if op == "before":
        return bool(raw) and str(raw) < str(expected)
    if op == "after":
        return bool(raw) and str(raw) > str(expected)
    return True


def _chart_records(db, workspace_id: str, chart: dict[str, Any]) -> list[TasklyticEntityRecord]:
    source = REPORTING_SOURCES.get(str(chart.get("source")))
    if source is None:
        return []
    entity_kinds = ["timeEntries", "expenses"] if chart.get("source") == "wip" else [source["entityKind"]]
    rows = db.query(TasklyticEntityRecord).filter(
        TasklyticEntityRecord.entity_kind.in_(entity_kinds),
        TasklyticEntityRecord.workspace_id == workspace_id,
    ).all()
    filters = [item for item in chart.get("filters") or [] if isinstance(item, dict)]
    scope = next((item.get("value") for item in filters if item.get("field") == "__scope"), None)
    project_ids: set[str] | None = None
    if isinstance(scope, dict) and scope.get("type") == "portfolio":
        portfolio = db.query(TasklyticEntityRecord).filter_by(
            entity_kind="portfolios", record_id=str(scope.get("id") or ""), workspace_id=workspace_id,
        ).one_or_none()
        project_ids = set((portfolio.payload or {}).get("projectIds") or []) if portfolio else set()
    elif isinstance(scope, dict) and scope.get("type") == "team":
        project_ids = {
            row.record_id for row in db.query(TasklyticEntityRecord).filter_by(
                entity_kind="projects", workspace_id=workspace_id,
            ).all() if (row.payload or {}).get("teamId") == scope.get("id")
        }
    result = []
    for row in rows:
        payload = row.payload or {}
        if isinstance(scope, dict) and scope.get("type") == "project":
            project_id = scope.get("id")
            if chart.get("source") == "tasks" and project_id not in (payload.get("projectIds") or []):
                continue
            if chart.get("source") == "projects" and row.record_id != project_id:
                continue
        if project_ids is not None:
            if chart.get("source") == "tasks" and not project_ids.intersection(payload.get("projectIds") or []):
                continue
            if chart.get("source") == "projects" and row.record_id not in project_ids:
                continue
        if all(_matches_filter(payload, clause) for clause in filters):
            result.append(row)
    return result


def _png(width: int, height: int, pixels: bytearray) -> bytes:
    rows = b"".join(b"\x00" + bytes(pixels[y * width * 3:(y + 1) * width * 3]) for y in range(height))

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(rows, 9))
        + chunk(b"IEND", b"")
    )


def _fill(pixels: bytearray, width: int, height: int, box: tuple[int, int, int, int], color: tuple[int, int, int]) -> None:
    left, top, right, bottom = box
    left, top = max(0, left), max(0, top)
    right, bottom = min(width, right), min(height, bottom)
    row = bytes(color) * max(0, right - left)
    for y in range(top, bottom):
        start = (y * width + left) * 3
        pixels[start:start + len(row)] = row


def build_dashboard_snapshot(db, workspace_id: str, dashboard: dict[str, Any]) -> DashboardSnapshot:
    """Render a real PNG overview from current source rows, not client DOM state."""

    width, height = 960, 540
    pixels = bytearray((247, 244, 238) * width * height)
    _fill(pixels, width, height, (0, 0, width, 72), (47, 64, 57))
    charts = [normalize_chart_definition(item) for item in (dashboard.get("charts") or [])][:6]
    summaries: list[dict[str, Any]] = []
    palette = [(204, 120, 92), (93, 138, 130), (215, 165, 79), (125, 112, 155), (106, 139, 177), (171, 114, 132)]
    for index, chart in enumerate(charts):
        rows = _chart_records(db, workspace_id, chart)
        summaries.append({
            "chartId": chart.get("id"),
            "title": str(chart.get("title") or "Chart"),
            "source": chart.get("source"),
            "recordCount": len(rows),
        })
        column, row_index = index % 3, index // 3
        left, top = 24 + column * 312, 92 + row_index * 210
        _fill(pixels, width, height, (left, top, left + 288, top + 186), (255, 255, 252))
        _fill(pixels, width, height, (left, top, left + 8, top + 186), palette[index % len(palette)])
        # A current-data bar and deterministic chart stripes make the PNG a
        # useful visual snapshot even when a mail client suppresses HTML text.
        bar_width = min(244, 18 + len(rows) * 18)
        _fill(pixels, width, height, (left + 24, top + 104, left + 24 + bar_width, top + 144), palette[index % len(palette)])
        signature = hashlib.sha256(str(chart.get("title") or "Chart").encode()).digest()
        for stripe, value in enumerate(signature[:12]):
            stripe_height = 8 + value % 34
            _fill(
                pixels, width, height,
                (left + 24 + stripe * 18, top + 82 - stripe_height, left + 34 + stripe * 18, top + 82),
                (84, 91, 86),
            )
    if not charts:
        _fill(pixels, width, height, (96, 176, 864, 364), (255, 255, 252))
    content = _png(width, height, pixels)
    return DashboardSnapshot(
        content=content,
        mime_type="image/png",
        width=width,
        height=height,
        sha256=hashlib.sha256(content).hexdigest(),
        generated_at=utcnow().isoformat(),
        chart_summaries=summaries,
    )
