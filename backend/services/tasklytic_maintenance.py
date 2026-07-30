"""Scheduled Tasklytic digest delivery and abandoned-upload cleanup."""

from __future__ import annotations

import asyncio
from datetime import timedelta

from core.database import db_config
from models.tasklytic import TasklyticEntityRecord, TasklyticFileUpload
from services.email_service import email_service
from services.gcs_service import get_storage_service
from services.tasklytic_service import utcnow


def _next_run(frequency: str):
    now = utcnow()
    if frequency == "monthly_1st":
        month = now.month + 1
        year = now.year + (1 if month == 13 else 0)
        month = 1 if month == 13 else month
        return now.replace(year=year, month=month, day=1)
    return now + timedelta(days=1 if frequency == "daily" else 7)


async def run_tasklytic_maintenance() -> dict[str, int]:
    db = db_config.get_session()
    sent = 0
    abandoned = 0
    try:
        now = utcnow()
        dashboards = db.query(TasklyticEntityRecord).filter_by(entity_kind="dashboards").all()
        for row in dashboards:
            payload = dict(row.payload or {})
            schedule = payload.get("schedule") or {}
            next_run = schedule.get("nextRunAt")
            recipients = schedule.get("recipients") or []
            if not next_run or not recipients:
                continue
            try:
                from datetime import datetime
                due = datetime.fromisoformat(str(next_run).replace("Z", "+00:00")) <= now
            except (TypeError, ValueError):
                due = False
            if not due:
                continue
            title = str(payload.get("name") or "Dashboard")
            chart_lines = "\n".join(f"• {chart.get('title', 'Chart')} ({chart.get('type', 'chart')})" for chart in payload.get("charts") or [])
            body = f"Dashboard digest: {title}\n\n{chart_lines or 'No charts configured.'}\n\n— CPAAutomation Project Management"
            for recipient in recipients:
                if email_service.send_html_email(str(recipient), f"[Tasklytic] Dashboard digest — {title}", body.replace("\n", "<br/>"), body):
                    sent += 1
            schedule["nextRunAt"] = _next_run(str(schedule.get("frequency") or "weekly_mon")).isoformat()
            payload["schedule"] = schedule
            row.payload = payload
            row.revision += 1

        expired = db.query(TasklyticFileUpload).filter(
            TasklyticFileUpload.state.in_(["initiated", "completed"]),
            TasklyticFileUpload.expires_at < now,
        ).all()
        storage = get_storage_service()
        for upload in expired:
            if upload.state == "completed":
                attachments = db.query(TasklyticEntityRecord).filter_by(
                    entity_kind="attachments", workspace_id=upload.workspace_id
                ).all()
                if any((attachment.payload or {}).get("storageRef") == upload.object_name for attachment in attachments):
                    continue
            try:
                await storage.delete_file(upload.object_name)
            except Exception:
                pass
            upload.state = "abandoned"
            abandoned += 1
        db.commit()
        return {"digests_sent": sent, "uploads_abandoned": abandoned}
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
