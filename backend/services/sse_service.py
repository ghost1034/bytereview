"""
Simplified Server-Sent Events (SSE) service for ByteReview
Handles real-time updates for job events with minimal complexity
"""
import asyncio
import json
import logging
import redis.asyncio as redis
from typing import Dict, Any, AsyncGenerator, Set
from collections import defaultdict
import os

logger = logging.getLogger(__name__)

class SSEManager:
    """Simplified SSE Manager for real-time job updates"""
    
    def __init__(self):
        # Store active listeners for each job
        self._job_listeners: Dict[str, Set[asyncio.Queue]] = defaultdict(set)
        self._redis = None
    
    async def listen_for_job_events(self, job_id: str) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Listen for events related to a specific job using full_state approach
        Eliminates race conditions by sending complete state first, then incremental updates
        """
        # STEP 1: Subscribe to Redis pub/sub (start buffering)
        redis_client = await self._get_redis()
        pubsub = redis_client.pubsub()
        channel = f"job_events_{job_id}"
        await pubsub.subscribe(channel)
        
        # Buffer for events that arrive during snapshot
        event_buffer = []
        buffering = True
        
        # Start background task to buffer events
        async def buffer_events():
            nonlocal buffering, event_buffer
            while buffering:
                try:
                    message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                    if message and message['data']:
                        event_data = json.loads(message['data'])
                        event_buffer.append(event_data)
                        logger.debug(f"Buffered event for job {job_id}: {event_data.get('type')}")
                except Exception as e:
                    logger.debug(f"Error buffering event: {e}")
                await asyncio.sleep(0.1)
        
        buffer_task = asyncio.create_task(buffer_events())
        
        try:
            # STEP 2: Get current snapshot from database
            from core.database import db_config
            from models.db_models import ExtractionJob, ExtractionTask
            from services.job_service import JobService
            
            # Small delay to ensure subscription is active
            await asyncio.sleep(0.1)
            
            db = db_config.get_session()
            try:
                job = db.query(ExtractionJob).filter(ExtractionJob.id == job_id).first()
                if not job:
                    yield {"type": "error", "message": "Job not found"}
                    return
                
                # Get all tasks for this job
                tasks = db.query(ExtractionTask).filter(ExtractionTask.job_id == job.id).all()
                
                # Calculate progress
                total_tasks = len(tasks)
                completed = sum(1 for task in tasks if task.status == 'completed')
                failed = sum(1 for task in tasks if task.status == 'failed')
                
                # Create task list
                task_list = [
                    {"id": str(task.id), "status": task.status}
                    for task in tasks
                ]
                
                current_version = int(asyncio.get_event_loop().time() * 1000)
                
            finally:
                db.close()
            
            # STEP 3: Send full_state event
            full_state = {
                "type": "full_state",
                "version": current_version,
                "job_id": job_id,
                "status": job.status,
                "progress": {
                    "total_tasks": total_tasks,
                    "completed": completed,
                    "failed": failed,
                    "tasks": task_list
                },
                "timestamp": current_version
            }
            
            yield full_state
            logger.info(f"Sent full_state for job {job_id}: {completed}/{total_tasks} tasks")
            
            # STEP 4: Stop buffering and flush buffered events
            buffering = False
            await buffer_task
            
            # Send buffered events that occurred after our snapshot
            for buffered_event in event_buffer:
                if buffered_event.get('timestamp', 0) > current_version:
                    yield buffered_event
                    logger.debug(f"Flushed buffered event: {buffered_event.get('type')}")
            
            # STEP 5: Stream live events
            job_completed = job.status == 'completed'
            
            while not job_completed:
                try:
                    # Only wait for Redis events - no local queue
                    message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=30.0)
                    
                    if message is not None and message['data']:
                        try:
                            event = json.loads(message['data'])
                            
                            # Check if this is a job completion event
                            if event.get('type') == 'job_completed':
                                job_completed = True
                                yield event
                                logger.info(f"Job {job_id} completed, closing SSE connection")
                                break
                            else:
                                yield event
                        except json.JSONDecodeError:
                            continue
                    else:
                        # Timeout - only send keepalive if job is not completed
                        if not job_completed:
                            yield {"type": "keepalive", "timestamp": asyncio.get_event_loop().time()}
                        
                except asyncio.TimeoutError:
                    # Only send keepalive if job is not completed
                    if not job_completed:
                        yield {"type": "keepalive", "timestamp": asyncio.get_event_loop().time()}
                    continue
                except asyncio.CancelledError:
                    break
                    
        except Exception as e:
            logger.error(f"SSE listener error for job {job_id}: {e}")
            yield {"type": "error", "message": str(e)}
        finally:
            # Clean up: remove this listener
            self._job_listeners[job_id].discard(event_queue)
            if not self._job_listeners[job_id]:
                del self._job_listeners[job_id]
            
            # Clean up Redis subscription
            try:
                await pubsub.unsubscribe(channel)
                await pubsub.close()
            except Exception:
                pass
    
    async def _get_redis(self):
        """Get Redis connection for cross-process communication"""
        if self._redis is None:
            redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
            self._redis = redis.from_url(redis_url)
        return self._redis
    
    def _make_json_serializable(self, obj):
        """Convert objects to JSON-serializable format"""
        import uuid
        if isinstance(obj, dict):
            return {k: self._make_json_serializable(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [self._make_json_serializable(item) for item in obj]
        elif isinstance(obj, uuid.UUID):
            return str(obj)
        else:
            return obj

    async def send_job_event(self, job_id: str, event: Dict[str, Any]) -> None:
        """
        Send an event to all listeners of a specific job
        Simplified to use Redis pub/sub only
        """
        logger.info(f"Sending SSE event for job {job_id}: {event.get('type', 'unknown')} - task_id: {event.get('task_id', 'N/A')}")
        
        # Add metadata to event
        event["job_id"] = job_id
        event["timestamp"] = asyncio.get_event_loop().time()
        
        # Check if there are local listeners (for logging)
        local_listeners = len(self._job_listeners.get(job_id, set()))
        if local_listeners > 0:
            logger.info(f"Found {local_listeners} local listeners for job {job_id}")
        else:
            logger.info(f"No local listeners for job {job_id}")
        
        # Don't send to local listeners - only use Redis to avoid duplicates
        
        # Send via Redis for cross-process communication
        try:
            redis_client = await self._get_redis()
            channel = f"job_events_{job_id}"
            serializable_event = self._make_json_serializable(event)
            await redis_client.publish(channel, json.dumps(serializable_event))
            logger.info(f"Published SSE event to Redis channel {channel} - event: {event.get('type')} task: {event.get('task_id', 'N/A')}")
        except Exception as e:
            logger.warning(f"Failed to publish event to Redis: {e}")
    
    # Convenience methods for common events
    async def send_file_uploaded(self, job_id: str, file_data: Dict[str, Any]) -> None:
        """Send file uploaded event"""
        await self.send_job_event(job_id, {
            "type": "file_uploaded",
            "file": file_data
        })
    
    async def send_files_extracted(self, job_id: str, files_data: list) -> None:
        """Send files extracted event (when ZIP unpacking completes)"""
        await self.send_job_event(job_id, {
            "type": "files_extracted",
            "files": files_data
        })
    
    async def send_file_status_changed(self, job_id: str, file_id: str, status: str) -> None:
        """Send file status change event"""
        await self.send_job_event(job_id, {
            "type": "file_status_changed",
            "file_id": file_id,
            "status": status
        })
    
    async def send_file_deleted(self, job_id: str, file_id: str) -> None:
        """Send file deleted event"""
        await self.send_job_event(job_id, {
            "type": "file_deleted",
            "file_id": file_id
        })
    
    async def send_extraction_failed(self, job_id: str, file_id: str, error: str) -> None:
        """Send unpacking failed event"""
        await self.send_job_event(job_id, {
            "type": "extraction_failed",
            "file_id": file_id,
            "error": error
        })
    
    async def send_task_started(self, job_id: str, task_id: str) -> None:
        """Send task started event"""
        import time
        await self.send_job_event(job_id, {
            "type": "task_started",
            "task_id": task_id,
            "timestamp": int(time.time() * 1000)
        })
    
    async def send_task_completed(self, job_id: str, task_id: str, result: dict) -> None:
        """Send task completed event"""
        import time
        await self.send_job_event(job_id, {
            "type": "task_completed",
            "task_id": task_id,
            "result": result,
            "timestamp": int(time.time() * 1000)
        })
    
    async def send_task_failed(self, job_id: str, task_id: str, error: str) -> None:
        """Send task failed event"""
        import time
        await self.send_job_event(job_id, {
            "type": "task_failed",
            "task_id": task_id,
            "error": error,
            "timestamp": int(time.time() * 1000)
        })
    
    async def send_job_completed(self, job_id: str) -> None:
        """Send job completion event"""
        import time
        await self.send_job_event(job_id, {
            "type": "job_completed",
            "timestamp": int(time.time() * 1000)
        })
    
    # New workflow-specific events for resumable jobs
    async def send_workflow_progress(self, job_id: str, progress_data: dict) -> None:
        """Send workflow progress update event"""
        await self.send_job_event(job_id, {
            "type": "workflow_progress",
            "progress": progress_data
        })
    
    async def send_config_step_changed(self, job_id: str, old_step: str, new_step: str) -> None:
        """Send configuration step change event"""
        await self.send_job_event(job_id, {
            "type": "config_step_changed",
            "old_step": old_step,
            "new_step": new_step
        })
    
    async def send_job_submitted(self, job_id: str) -> None:
        """Send job submitted for processing event"""
        await self.send_job_event(job_id, {
            "type": "job_submitted"
        })
    
    async def send_job_cancelled(self, job_id: str) -> None:
        """Send job cancelled event"""
        await self.send_job_event(job_id, {
            "type": "job_cancelled"
        })
    
    async def send_auto_save(self, job_id: str, saved_data: dict) -> None:
        """Send auto-save event"""
        await self.send_job_event(job_id, {
            "type": "auto_save",
            "saved_data": saved_data
        })

# Global SSE manager instance
_sse_manager_instance = None

def get_sse_manager():
    global _sse_manager_instance
    if _sse_manager_instance is None:
        _sse_manager_instance = SSEManager()
    return _sse_manager_instance

# For backward compatibility
sse_manager = get_sse_manager()