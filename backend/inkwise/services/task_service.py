"""Cloud Tasks helpers for Inkwise ingestion."""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from urllib.parse import urlparse, urlunparse

from google.cloud import tasks_v2
from google.protobuf import timestamp_pb2

from inkwise.settings import InkwiseSettings


@dataclass(frozen=True)
class EnqueueResult:
    created: bool
    task_name: str | None


def _normalize_base_url(base_raw: str | None) -> str:
    base = (base_raw or "").strip().rstrip("/")
    if not base:
        return ""

    try:
        parsed = urlparse(base)
        host = parsed.hostname or ""
        if parsed.scheme == "http" and host.endswith(".run.app"):
            parsed = parsed._replace(scheme="https")
            return urlunparse(parsed).rstrip("/")
    except Exception:
        pass

    return base


def enqueue_ingestion_task(
    *,
    settings: InkwiseSettings,
    ingestion_id: str,
    delay_seconds: int = 0,
    service_url: str | None = None,
) -> EnqueueResult:
    if not settings.cloud_tasks_enabled:
        return EnqueueResult(created=False, task_name=None)

    base = _normalize_base_url(settings.cloud_tasks_service_url or service_url)
    if not base:
        return EnqueueResult(created=False, task_name=None)

    client = tasks_v2.CloudTasksClient()
    parent = client.queue_path(
        settings.cloud_tasks_project,
        settings.cloud_tasks_location,
        settings.cloud_tasks_queue_ingest,
    )

    payload = json.dumps({"ingestion_id": ingestion_id}).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if settings.tasks_token:
        headers["X-Inkwise-Task-Token"] = settings.tasks_token

    schedule = timestamp_pb2.Timestamp()
    schedule.FromSeconds(int(time.time()) + int(delay_seconds))

    task = {
        "http_request": {
            "http_method": tasks_v2.HttpMethod.POST,
            "url": f"{base}/api/inkwise/internal/tasks/source-ingestion",
            "headers": headers,
            "body": payload,
        },
        "schedule_time": schedule,
    }

    created = client.create_task(parent=parent, task=task)
    return EnqueueResult(created=True, task_name=getattr(created, "name", None))
