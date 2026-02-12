"""backend/services/sse_service.py

Postgres-backed Server-Sent Events (SSE) service.

We use Postgres LISTEN/NOTIFY as a cross-service message bus (Cloud Run workers -> API SSE).

Notes
- Postgres NOTIFY payloads are limited (~8KB). Keep events small and treat them as signals.
- Large state (results, file lists) should be fetched via existing API endpoints.
"""

import asyncio
import json
import logging
import select
import threading
import time
import uuid
from dataclasses import dataclass
from typing import Any, AsyncGenerator, Dict, Optional

import psycopg2
from sqlalchemy import func, text

from core.database import db_config
from models.db_models import ExtractionJob, ExtractionTask, SourceFile, SourceFileToTask

logger = logging.getLogger(__name__)


def _epoch_ms() -> int:
    return int(time.time() * 1000)


@dataclass
class _Subscriber:
    subscriber_id: str
    loop: asyncio.AbstractEventLoop
    queue: "asyncio.Queue[Dict[str, Any]]"


class SSEManager:
    """SSE Manager for real-time job updates using Postgres LISTEN/NOTIFY."""

    PG_CHANNEL = "job_events"
    # Keep bounded to avoid unbounded memory growth on slow clients.
    QUEUE_MAXSIZE = 500
    # NOTIFY payload limit is ~8000 bytes; stay safely below.
    NOTIFY_SAFE_BYTES = 7000

    def __init__(self):
        self._subs_by_job: Dict[str, Dict[str, _Subscriber]] = {}
        self._subs_lock = threading.Lock()

        self._listener_stop = threading.Event()
        self._listener_thread: Optional[threading.Thread] = None

    # -----------------------------
    # Postgres LISTEN/NOTIFY bridge
    # -----------------------------
    def _ensure_listener_started(self) -> None:
        if self._listener_thread and self._listener_thread.is_alive():
            return
        self._listener_thread = threading.Thread(
            target=self._listener_loop,
            name="pg-sse-listener",
            daemon=True,
        )
        self._listener_thread.start()

    def _listener_loop(self) -> None:
        """Background thread: LISTEN for PG notifications and dispatch to local subscribers."""
        backoff_seconds = 1.0
        while not self._listener_stop.is_set():
            conn = None
            try:
                # Dedicated raw psycopg2 connection (not SQLAlchemy pooled).
                conn = psycopg2.connect(db_config.database_url)
                conn.set_session(autocommit=True)
                cur = conn.cursor()
                cur.execute(f"LISTEN {self.PG_CHANNEL};")
                cur.close()

                logger.info("SSE Postgres listener started (LISTEN %s)", self.PG_CHANNEL)
                backoff_seconds = 1.0

                while not self._listener_stop.is_set():
                    r, _, _ = select.select([conn], [], [], 1.0)
                    if not r:
                        continue

                    conn.poll()
                    while conn.notifies:
                        notify = conn.notifies.pop(0)
                        payload = notify.payload
                        try:
                            event = json.loads(payload)
                        except Exception:
                            logger.warning("Dropping malformed PG notify payload")
                            continue

                        job_id = event.get("job_id")
                        if not job_id:
                            continue

                        self._dispatch_event(str(job_id), event)

            except Exception as e:
                logger.error("SSE Postgres listener error: %s", e)
                time.sleep(backoff_seconds)
                backoff_seconds = min(backoff_seconds * 2, 30.0)
            finally:
                try:
                    if conn is not None:
                        conn.close()
                except Exception:
                    pass

    def _dispatch_event(self, job_id: str, event: Dict[str, Any]) -> None:
        with self._subs_lock:
            subs = list(self._subs_by_job.get(job_id, {}).values())

        if not subs:
            return

        def _put(q: "asyncio.Queue[Dict[str, Any]]", item: Dict[str, Any]) -> None:
            try:
                q.put_nowait(item)
            except asyncio.QueueFull:
                # Prefer newest events (e.g. job_completed). Drop oldest to make room.
                try:
                    q.get_nowait()
                except Exception:
                    return
                try:
                    q.put_nowait(item)
                except Exception:
                    return
            except Exception:
                pass

        for sub in subs:
            try:
                sub.loop.call_soon_threadsafe(_put, sub.queue, event)
            except Exception:
                continue

    # -----------------------------
    # SSE stream
    # -----------------------------
    async def listen_for_job_events(
        self, job_id: str, include_full_state: bool = False
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Listen for events for a job.

        When include_full_state is True (Processing page), send a full_state snapshot first,
        then flush any queued events newer than the snapshot version.
        """

        self._ensure_listener_started()

        loop = asyncio.get_running_loop()
        subscriber_id = str(uuid.uuid4())
        queue: "asyncio.Queue[Dict[str, Any]]" = asyncio.Queue(maxsize=self.QUEUE_MAXSIZE)
        sub = _Subscriber(subscriber_id=subscriber_id, loop=loop, queue=queue)

        with self._subs_lock:
            self._subs_by_job.setdefault(str(job_id), {})[subscriber_id] = sub

        try:
            yield {"type": "connected", "job_id": job_id, "timestamp": _epoch_ms()}

            if include_full_state:
                snapshot_version = _epoch_ms()

                db = db_config.get_session()
                try:
                    job = db.query(ExtractionJob).filter(ExtractionJob.id == job_id).first()
                    if not job:
                        yield {"type": "error", "message": "Job not found"}
                        return

                    # Get latest job run for this job
                    from models.db_models import JobRun

                    latest_run = (
                        db.query(JobRun)
                        .filter(JobRun.job_id == job.id)
                        .order_by(JobRun.created_at.desc())
                        .first()
                    )
                    if not latest_run:
                        yield {"type": "error", "message": "No job run found"}
                        return

                    # Build ordered task list using first source file path
                    first_file_subquery = (
                        db.query(
                            SourceFileToTask.task_id,
                            func.min(SourceFile.original_path).label("first_file_path"),
                        )
                        .join(SourceFile, SourceFile.id == SourceFileToTask.source_file_id)
                        .group_by(SourceFileToTask.task_id)
                        .subquery()
                    )

                    tasks = (
                        db.query(ExtractionTask)
                        .join(
                            first_file_subquery,
                            first_file_subquery.c.task_id == ExtractionTask.id,
                        )
                        .filter(ExtractionTask.job_run_id == latest_run.id)
                        .order_by(first_file_subquery.c.first_file_path)
                        .all()
                    )

                    total_tasks = latest_run.tasks_total or 0
                    completed = latest_run.tasks_completed or 0
                    failed = latest_run.tasks_failed or 0

                    task_list = []
                    for task in tasks:
                        source_files = (
                            db.query(SourceFile)
                            .join(
                                SourceFileToTask,
                                SourceFile.id == SourceFileToTask.source_file_id,
                            )
                            .filter(SourceFileToTask.task_id == task.id)
                            .order_by(SourceFile.original_path, SourceFile.id)
                            .all()
                        )

                        if len(source_files) == 1:
                            display_name = str(source_files[0].original_filename)
                        elif len(source_files) <= 3:
                            display_name = ", ".join([str(f.original_filename) for f in source_files])
                        else:
                            display_name = (
                                f"{str(source_files[0].original_filename)} and {len(source_files) - 1} others"
                            )

                        task_list.append(
                            {
                                "id": str(task.id),
                                "status": task.status,
                                "display_name": display_name,
                                "file_count": len(source_files),
                            }
                        )
                finally:
                    db.close()

                full_state = {
                    "type": "full_state",
                    "version": snapshot_version,
                    "job_id": job_id,
                    "status": str(latest_run.status),
                    "progress": {
                        "total_tasks": total_tasks,
                        "completed": completed,
                        "failed": failed,
                        "tasks": task_list,
                    },
                    "timestamp": snapshot_version,
                }
                yield full_state

                # Flush any queued events that arrived during snapshot generation.
                try:
                    while True:
                        buffered_event = queue.get_nowait()
                        yield buffered_event
                except asyncio.QueueEmpty:
                    pass

                if str(latest_run.status) == "completed":
                    yield {"type": "job_already_completed"}
                    return

            # Live event streaming loop
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)

                    if include_full_state and event.get("type") == "job_completed":
                        yield event
                        logger.info("Job %s completed, closing SSE connection", job_id)
                        break

                    yield event

                except asyncio.TimeoutError:
                    yield {"type": "keepalive", "timestamp": _epoch_ms()}
                except asyncio.CancelledError:
                    break
        except Exception as e:
            logger.error("SSE listener error for job %s: %s", job_id, e)
            yield {"type": "error", "message": str(e)}
        finally:
            with self._subs_lock:
                job_subs = self._subs_by_job.get(str(job_id))
                if job_subs:
                    job_subs.pop(subscriber_id, None)
                    if not job_subs:
                        self._subs_by_job.pop(str(job_id), None)

    # -----------------------------
    # Publishing
    # -----------------------------
    async def send_job_event(self, job_id: str, event: Dict[str, Any]) -> None:
        """Publish a job event to Postgres NOTIFY."""

        logger.info(
            "Sending SSE event for job %s: %s - task_id: %s",
            job_id,
            event.get("type", "unknown"),
            event.get("task_id", "N/A"),
        )

        event["job_id"] = str(job_id)
        if "timestamp" not in event:
            event["timestamp"] = _epoch_ms()

        serializable = self._make_json_serializable(event)
        payload = json.dumps(serializable, separators=(",", ":"), ensure_ascii=True)

        # Degrade known-large events to signal-only if needed.
        if len(payload.encode("utf-8")) > self.NOTIFY_SAFE_BYTES:
            event_type = serializable.get("type")
            logger.warning(
                "SSE event too large for NOTIFY (type=%s bytes=%s); degrading payload",
                event_type,
                len(payload.encode("utf-8")),
            )
            degraded = dict(serializable)
            if event_type == "task_completed":
                degraded.pop("result", None)
            if event_type == "files_extracted":
                degraded.pop("files", None)
            payload = json.dumps(degraded, separators=(",", ":"), ensure_ascii=True)

        try:
            await asyncio.to_thread(self._publish_notify_sync, self.PG_CHANNEL, payload)
        except Exception as e:
            logger.warning("Failed to publish SSE event to Postgres: %s", e)

    @staticmethod
    def _publish_notify_sync(channel: str, payload: str) -> None:
        # Use the SQLAlchemy engine pool; pg_notify is transactional.
        with db_config.engine.begin() as conn:
            conn.execute(text("SELECT pg_notify(:chan, :payload);"), {"chan": channel, "payload": payload})

    # -----------------------------
    # Convenience methods
    # -----------------------------
    async def send_file_uploaded(self, job_id: str, file_data: Dict[str, Any]) -> None:
        await self.send_job_event(job_id, {"type": "file_uploaded", "file": file_data})

    async def send_files_extracted(self, job_id: str, zip_file_id: str, extracted_count: int) -> None:
        # Signal-only: clients should refetch files list.
        await self.send_job_event(
            job_id,
            {
                "type": "files_extracted",
                "zip_file_id": zip_file_id,
                "extracted_count": extracted_count,
            },
        )

    async def send_file_status_changed(self, job_id: str, file_id: str, status: str) -> None:
        await self.send_job_event(
            job_id, {"type": "file_status_changed", "file_id": file_id, "status": status}
        )

    async def send_file_deleted(self, job_id: str, file_id: str) -> None:
        await self.send_job_event(job_id, {"type": "file_deleted", "file_id": file_id})

    async def send_extraction_failed(self, job_id: str, file_id: str, error: str) -> None:
        await self.send_job_event(
            job_id, {"type": "extraction_failed", "file_id": file_id, "error": error}
        )

    async def send_task_started(self, job_id: str, task_id: str) -> None:
        await self.send_job_event(
            job_id, {"type": "task_started", "task_id": task_id, "timestamp": _epoch_ms()}
        )

    async def send_task_completed(self, job_id: str, task_id: str, row_count: int | None = None) -> None:
        event: Dict[str, Any] = {"type": "task_completed", "task_id": task_id, "timestamp": _epoch_ms()}
        if row_count is not None:
            event["row_count"] = row_count
        await self.send_job_event(job_id, event)

    async def send_task_failed(self, job_id: str, task_id: str, error: str) -> None:
        await self.send_job_event(
            job_id,
            {
                "type": "task_failed",
                "task_id": task_id,
                "error": error,
                "timestamp": _epoch_ms(),
            },
        )

    async def send_job_completed(self, job_id: str) -> None:
        await self.send_job_event(job_id, {"type": "job_completed", "timestamp": _epoch_ms()})

    async def send_workflow_progress(self, job_id: str, progress_data: dict) -> None:
        await self.send_job_event(job_id, {"type": "workflow_progress", "progress": progress_data})

    async def send_config_step_changed(self, job_id: str, old_step: str, new_step: str) -> None:
        await self.send_job_event(
            job_id,
            {"type": "config_step_changed", "old_step": old_step, "new_step": new_step},
        )

    async def send_job_submitted(self, job_id: str) -> None:
        await self.send_job_event(job_id, {"type": "job_submitted"})

    async def send_job_cancelled(self, job_id: str) -> None:
        await self.send_job_event(job_id, {"type": "job_cancelled"})

    async def send_auto_save(self, job_id: str, saved_data: dict) -> None:
        await self.send_job_event(job_id, {"type": "auto_save", "saved_data": saved_data})

    async def send_import_started(self, job_id: str, source: str, file_count: int) -> None:
        await self.send_job_event(
            job_id, {"type": "import_started", "source": source, "file_count": file_count}
        )

    async def send_import_progress(
        self,
        job_id: str,
        filename: str,
        status: str,
        file_size: int = 0,
        original_path: str | None = None,
    ) -> None:
        await self.send_job_event(
            job_id,
            {
                "type": "import_progress",
                "filename": filename,
                "original_path": original_path or filename,
                "file_size": file_size,
                "status": status,
            },
        )

    async def send_import_completed(
        self,
        job_id: str,
        file_id: str,
        filename: str,
        file_size: int,
        status: str,
        original_path: str | None = None,
    ) -> None:
        await self.send_job_event(
            job_id,
            {
                "type": "import_completed",
                "file_id": file_id,
                "filename": filename,
                "original_path": original_path or filename,
                "file_size": file_size,
                "status": status,
            },
        )

    async def send_import_failed(self, job_id: str, filename: str, error: str) -> None:
        await self.send_job_event(job_id, {"type": "import_failed", "filename": filename, "error": error})

    async def send_import_batch_completed(self, job_id: str, source: str, successful: int, total: int) -> None:
        await self.send_job_event(
            job_id,
            {"type": "import_batch_completed", "source": source, "successful": successful, "total": total},
        )

    async def send_export_started(self, job_id: str, destination: str, file_type: str) -> None:
        await self.send_job_event(
            job_id, {"type": "export_started", "destination": destination, "file_type": file_type}
        )

    async def send_export_completed(
        self, job_id: str, destination: str, file_type: str, file_link: str | None = None
    ) -> None:
        await self.send_job_event(
            job_id,
            {
                "type": "export_completed",
                "destination": destination,
                "file_type": file_type,
                "file_link": file_link,
            },
        )

    async def send_export_failed(self, job_id: str, destination: str, file_type: str, error: str) -> None:
        await self.send_job_event(
            job_id,
            {"type": "export_failed", "destination": destination, "file_type": file_type, "error": error},
        )

    # -----------------------------
    # Utilities
    # -----------------------------
    @staticmethod
    def _make_json_serializable(obj: Any) -> Any:
        if isinstance(obj, dict):
            return {k: SSEManager._make_json_serializable(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [SSEManager._make_json_serializable(item) for item in obj]
        if isinstance(obj, uuid.UUID):
            return str(obj)
        return obj


_sse_manager_instance: Optional[SSEManager] = None


def get_sse_manager() -> SSEManager:
    global _sse_manager_instance
    if _sse_manager_instance is None:
        _sse_manager_instance = SSEManager()
    return _sse_manager_instance


# For backward compatibility
sse_manager = get_sse_manager()
