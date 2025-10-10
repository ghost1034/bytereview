"""
Simplified Server-Sent Events (SSE) service for ByteReview (Redis-backed)
Handles real-time updates for job events with minimal complexity
"""
import asyncio
import json
import logging
import os
from typing import Dict, Any, AsyncGenerator

import redis.asyncio as redis
from sqlalchemy import func

from models.db_models import SourceFile, SourceFileToTask, ExtractionJob, ExtractionTask

logger = logging.getLogger(__name__)

class SSEManager:
    """SSE Manager for real-time job updates using Redis pub/sub"""

    def __init__(self):
        self._redis: redis.Redis | None = None

    async def _get_redis(self) -> redis.Redis:
        """Get Redis connection for cross-process communication"""
        if self._redis is None:
            redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
            self._redis = redis.from_url(redis_url)
        return self._redis

    async def listen_for_job_events(self, job_id: str, include_full_state: bool = False) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Listen for events related to a specific job. When include_full_state is True (Processing page),
        send a full_state snapshot first, buffering events during the snapshot and then flushing newer ones.
        When False (imports/ZIP/exports/results pages), stream incremental updates only.
        """
        redis_client = await self._get_redis()
        pubsub = redis_client.pubsub()
        channel = f"job_events_{job_id}"
        await pubsub.subscribe(channel)

        event_buffer = []
        buffering = False
        buffer_task: asyncio.Task | None = None

        try:
            # Only buffer and snapshot if requested
            if include_full_state:
                buffering = True

                async def buffer_events():
                    nonlocal buffering
                    while buffering:
                        try:
                            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                            if message and message.get("data"):
                                try:
                                    event_data = json.loads(message["data"])  # type: ignore[index]
                                    event_buffer.append(event_data)
                                    logger.debug(
                                        f"Buffered event for job {job_id}: {event_data.get('type')}"
                                    )
                                except Exception:
                                    # Ignore malformed messages while buffering
                                    pass
                        except Exception as e:
                            logger.debug(f"Error buffering event: {e}")
                        await asyncio.sleep(0.1)

                buffer_task = asyncio.create_task(buffer_events())

                # Small delay to ensure subscription is active
                await asyncio.sleep(0.1)

                # Build and send full_state snapshot
                from core.database import db_config

                db = db_config.get_session()
                try:
                    job = db.query(ExtractionJob).filter(ExtractionJob.id == job_id).first()
                    if not job:
                        yield {"type": "error", "message": "Job not found"}
                        return

                    # Get latest job run for this job
                    from models.db_models import JobRun
                    latest_run = db.query(JobRun).filter(
                        JobRun.job_id == job.id
                    ).order_by(JobRun.created_at.desc()).first()
                    
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
                        .join(first_file_subquery, first_file_subquery.c.task_id == ExtractionTask.id)
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
                            display_name = source_files[0].original_filename
                        elif len(source_files) <= 3:
                            display_name = ", ".join(
                                [f.original_filename for f in source_files]
                            )
                        else:
                            display_name = f"{source_files[0].original_filename} and {len(source_files)-1} others"

                        task_list.append(
                            {
                                "id": str(task.id),
                                "status": task.status,
                                "display_name": display_name,
                                "file_count": len(source_files),
                            }
                        )

                    # Use epoch ms for snapshot version to match event timestamps
                    import time

                    current_version = int(time.time() * 1000)

                finally:
                    db.close()

                full_state = {
                    "type": "full_state",
                    "version": current_version,
                    "job_id": job_id,
                    "status": latest_run.status,
                    "progress": {
                        "total_tasks": total_tasks,
                        "completed": completed,
                        "failed": failed,
                        "tasks": task_list,
                    },
                    "timestamp": current_version,
                }

                yield full_state
                logger.info(
                    f"Sent full_state for job {job_id}: {completed}/{total_tasks} tasks"
                )

                # Stop buffering and flush buffered events newer than snapshot
                buffering = False
                if buffer_task:
                    await buffer_task

                for buffered_event in event_buffer:
                    try:
                        if buffered_event.get("timestamp", 0) > current_version:
                            yield buffered_event
                            logger.debug(
                                f"Flushed buffered event: {buffered_event.get('type')}"
                            )
                    except Exception:
                        pass

                # If job already completed, short-circuit like before
                if latest_run.status == "completed":
                    yield {"type": "job_already_completed"}
                    return

            # Live event streaming loop
            while True:
                try:
                    message = await pubsub.get_message(
                        ignore_subscribe_messages=True, timeout=30.0
                    )

                    if message is not None and message.get("data"):
                        try:
                            event = json.loads(message["data"])  # type: ignore[index]

                            # If processing page requested snapshot and we see completion, close
                            if include_full_state and event.get("type") == "job_completed":
                                yield event
                                logger.info(
                                    f"Job {job_id} completed, closing SSE connection"
                                )
                                break

                            yield event
                        except json.JSONDecodeError:
                            continue
                    else:
                        # Keepalive on idle
                        yield {
                            "type": "keepalive",
                            "timestamp": int(asyncio.get_event_loop().time() * 1000),
                        }

                except asyncio.TimeoutError:
                    # Keepalive on timeout
                    yield {
                        "type": "keepalive",
                        "timestamp": int(asyncio.get_event_loop().time() * 1000),
                    }
                    continue
                except asyncio.CancelledError:
                    break
        except Exception as e:
            logger.error(f"SSE listener error for job {job_id}: {e}")
            yield {"type": "error", "message": str(e)}
        finally:
            # Clean up Redis subscription
            try:
                await pubsub.unsubscribe(channel)
                await pubsub.close()
            except Exception:
                pass

    async def send_job_event(self, job_id: str, event: Dict[str, Any]) -> None:
        """
        Publish a job event to Redis channel for the job. Use epoch ms timestamps.
        """
        logger.info(
            f"Sending SSE event for job {job_id}: {event.get('type', 'unknown')} - task_id: {event.get('task_id', 'N/A')}"
        )

        # Add metadata; do not overwrite existing timestamp if provided
        event["job_id"] = job_id
        if "timestamp" not in event:
            import time

            event["timestamp"] = int(time.time() * 1000)

        # Send via Redis for cross-process communication
        try:
            redis_client = await self._get_redis()
            channel = f"job_events_{job_id}"
            await redis_client.publish(channel, json.dumps(self._make_json_serializable(event)))
            logger.info(
                f"Published SSE event to Redis channel {channel} - event: {event.get('type')} task: {event.get('task_id', 'N/A')}"
            )
        except Exception as e:
            logger.warning(f"Failed to publish event to Redis: {e}")

    # Convenience methods for common events
    async def send_file_uploaded(self, job_id: str, file_data: Dict[str, Any]) -> None:
        await self.send_job_event(job_id, {"type": "file_uploaded", "file": file_data})

    async def send_files_extracted(self, job_id: str, files_data: list) -> None:
        await self.send_job_event(job_id, {"type": "files_extracted", "files": files_data})

    async def send_file_status_changed(self, job_id: str, file_id: str, status: str) -> None:
        await self.send_job_event(job_id, {"type": "file_status_changed", "file_id": file_id, "status": status})

    async def send_file_deleted(self, job_id: str, file_id: str) -> None:
        await self.send_job_event(job_id, {"type": "file_deleted", "file_id": file_id})

    async def send_extraction_failed(self, job_id: str, file_id: str, error: str) -> None:
        await self.send_job_event(job_id, {"type": "extraction_failed", "file_id": file_id, "error": error})

    async def send_task_started(self, job_id: str, task_id: str) -> None:
        import time

        await self.send_job_event(
            job_id,
            {"type": "task_started", "task_id": task_id, "timestamp": int(time.time() * 1000)},
        )

    async def send_task_completed(self, job_id: str, task_id: str, result: dict) -> None:
        import time

        await self.send_job_event(
            job_id,
            {
                "type": "task_completed",
                "task_id": task_id,
                "result": result,
                "timestamp": int(time.time() * 1000),
            },
        )

    async def send_task_failed(self, job_id: str, task_id: str, error: str) -> None:
        import time

        await self.send_job_event(
            job_id,
            {
                "type": "task_failed",
                "task_id": task_id,
                "error": error,
                "timestamp": int(time.time() * 1000),
            },
        )

    async def send_job_completed(self, job_id: str) -> None:
        import time

        await self.send_job_event(job_id, {"type": "job_completed", "timestamp": int(time.time() * 1000)})

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
        self, job_id: str, filename: str, status: str, file_size: int = 0, original_path: str | None = None
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
        self, job_id: str, file_id: str, filename: str, file_size: int, status: str, original_path: str | None = None
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

    @staticmethod
    def _make_json_serializable(obj):
        import uuid

        if isinstance(obj, dict):
            return {k: SSEManager._make_json_serializable(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [SSEManager._make_json_serializable(item) for item in obj]
        elif isinstance(obj, uuid.UUID):
            return str(obj)
        else:
            return obj

# Global SSE manager instance
_sse_manager_instance = None

def get_sse_manager():
    global _sse_manager_instance
    if _sse_manager_instance is None:
        _sse_manager_instance = SSEManager()
    return _sse_manager_instance

# For backward compatibility
sse_manager = get_sse_manager()
