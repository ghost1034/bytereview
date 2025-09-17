"""
Simplified Server-Sent Events (SSE) service for ByteReview
Handles real-time updates for job events with minimal complexity
"""
import asyncio
import json
import logging
# Redis removed - using Cloud Pub/Sub instead
from typing import Dict, Any, AsyncGenerator, Set
from collections import defaultdict
import os
from sqlalchemy import func
from models.db_models import SourceFile, SourceFileToTask, ExtractionJob, ExtractionTask
from services.json_utils import make_json_serializable

logger = logging.getLogger(__name__)

class SSEManager:
    """SSE Manager for real-time job updates using Cloud Pub/Sub"""
    
    def __init__(self):
        # Import here to avoid circular imports
        from services.cloud_pubsub_service import cloud_pubsub_service
        self.pubsub_service = cloud_pubsub_service
        self._initialized = False
    
    async def listen_for_job_events(self, job_id: str, include_full_state: bool = False) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Listen for events related to a specific job using full_state approach
        Uses Cloud Pub/Sub for real-time updates
        """
        # Initialize Pub/Sub if needed
        if not self._initialized:
            await self.pubsub_service.setup_topics_and_subscriptions()
            self._initialized = True
        
        # Buffer for events that arrive during snapshot
        event_buffer = []
        buffering = True

        subscription_path_job = None
        subscription_path_export = None
        
        # If full_state is requested, set up buffering on both job and export topics
        if include_full_state:
            def buffer_callback(message_data):
                nonlocal buffering, event_buffer
                if buffering and message_data.get('job_id') == job_id:
                    event_buffer.append(message_data['data'])
                    logger.debug(f"Buffered event for job {job_id}: {message_data['data'].get('type')}")
            
            subscription_path_job = await self.pubsub_service.subscribe_to_topic(
                "job_updates", 
                buffer_callback
            )
            await asyncio.sleep(0.1)
            subscription_path_export = await self.pubsub_service.subscribe_to_topic(
                "export_updates",
                buffer_callback
            )
            await asyncio.sleep(0.1)

        try:
            if include_full_state:
                # Build and send full_state snapshot
                from core.database import db_config
                from models.db_models import ExtractionJob, ExtractionTask
                from services.job_service import JobService
                
                db = db_config.get_session()
                try:
                    job = db.query(ExtractionJob).filter(ExtractionJob.id == job_id).first()
                    if not job:
                        yield {"type": "error", "message": "Job not found"}
                        return
                    
                    # Get all tasks for this job, ordered by first source file path
                    first_file_subquery = db.query(
                        SourceFileToTask.task_id,
                        func.min(SourceFile.original_path).label('first_file_path')
                    ).join(
                        SourceFile, SourceFile.id == SourceFileToTask.source_file_id
                    ).group_by(SourceFileToTask.task_id).subquery()
                    
                    tasks = db.query(ExtractionTask).join(
                        first_file_subquery, first_file_subquery.c.task_id == ExtractionTask.id
                    ).filter(
                        ExtractionTask.job_id == job.id
                    ).order_by(
                        first_file_subquery.c.first_file_path
                    ).all()
                    
                    total_tasks = job.tasks_total or 0
                    completed = job.tasks_completed or 0
                    failed = job.tasks_failed or 0
                    
                    task_list = []
                    for task in tasks:
                        source_files = db.query(SourceFile).join(
                            SourceFileToTask, SourceFile.id == SourceFileToTask.source_file_id
                        ).filter(
                            SourceFileToTask.task_id == task.id
                        ).order_by(SourceFile.original_path, SourceFile.id).all()
                        
                        if len(source_files) == 1:
                            display_name = source_files[0].original_filename
                        elif len(source_files) <= 3:
                            display_name = ", ".join([f.original_filename for f in source_files])
                        else:
                            display_name = f"{source_files[0].original_filename} and {len(source_files)-1} others"
                        
                        task_list.append({
                            "id": str(task.id),
                            "status": task.status,
                            "display_name": display_name,
                            "file_count": len(source_files)
                        })
                    
                    current_version = int(asyncio.get_event_loop().time() * 1000)
                    
                finally:
                    db.close()
                
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
                
                # Stop buffering and flush buffered events
                buffering = False
                for buffered_event in event_buffer:
                    if buffered_event.get('timestamp', 0) > current_version:
                        yield buffered_event
                        logger.debug(f"Flushed buffered event: {buffered_event.get('type')}")
                
                # If job already completed, notify client and end stream
                if job.status == 'completed':
                    yield {"type": "job_already_completed"}
                    return
            
            # Stream live events using Cloud Pub/Sub
            # If full_state was included, respect job completion to allow closing
            job_completed = False
            if include_full_state:
                job_completed = job.status == 'completed'
            live_events = asyncio.Queue()
            
            def live_callback(message_data):
                nonlocal job_completed
                logger.info(f"SSE received Pub/Sub message for job {message_data.get('job_id')} (looking for {job_id})")
                if message_data.get('job_id') == job_id:
                    event = message_data['data']
                    event_type = event.get('type')
                    logger.info(f"SSE processing event: {event_type} for job {job_id}")
                    
                    if event_type in [
                        'job_completed', 'job_submitted', 'job_cancelled',
                        'task_started', 'task_completed', 'task_failed',
                        'import_started', 'import_progress', 'import_completed', 
                        'import_failed', 'import_batch_completed',
                        'export_started', 'export_completed', 'export_failed',
                        'files_extracted', 'file_status_changed', 'extraction_failed',
                        'file_uploaded', 'file_deleted',
                        'workflow_progress', 'config_step_changed', 'auto_save'
                    ]:
                        if include_full_state and event_type == 'job_completed':
                            job_completed = True
                        live_events.put_nowait(event)
                    else:
                        logger.debug(f"SSE ignoring event type: {event_type}")
                else:
                    logger.debug(f"SSE ignoring message for different job: {message_data.get('job_id')}")
            
            # Switch subscriptions to live callbacks
            if subscription_path_job:
                await self.pubsub_service.unsubscribe(subscription_path_job)
                subscription_path_job = None
            if subscription_path_export:
                await self.pubsub_service.unsubscribe(subscription_path_export)
                subscription_path_export = None
            
            # Subscribe to both job and export updates for live events
            subscription_path_job = await self.pubsub_service.subscribe_to_topic(
                "job_updates", 
                live_callback
            )
            await asyncio.sleep(0.1)
            subscription_path_export = await self.pubsub_service.subscribe_to_topic(
                "export_updates",
                live_callback
            )
            await asyncio.sleep(0.1)
            
            while True:
                try:
                    event = await asyncio.wait_for(live_events.get(), timeout=30.0)
                    yield event
                    
                    if include_full_state and event.get('type') == 'job_completed':
                        logger.info(f"Job {job_id} completed, closing SSE connection")
                        break
                except asyncio.TimeoutError:
                    # Send keepalive on timeout
                    yield {"type": "keepalive", "timestamp": asyncio.get_event_loop().time()}
                    continue
                except asyncio.CancelledError:
                    break
                    
        except Exception as e:
            logger.error(f"SSE listener error for job {job_id}: {e}")
            yield {"type": "error", "message": str(e)}
        finally:
            # Clean up Pub/Sub subscriptions
            if subscription_path_job:
                await self.pubsub_service.unsubscribe(subscription_path_job)
            if subscription_path_export:
                await self.pubsub_service.unsubscribe(subscription_path_export)

    # Redis methods removed - using Cloud Pub/Sub instead
    
    async def send_job_event(self, job_id: str, event: Dict[str, Any]) -> None:
        """
        Send an event to all listeners of a specific job
        Uses Cloud Pub/Sub for real-time communication
        """
        logger.info(f"Sending SSE event for job {job_id}: {event.get('type', 'unknown')} - task_id: {event.get('task_id', 'N/A')}")
        
        # Initialize if needed
        if not self._initialized:
            await self.pubsub_service.setup_topics_and_subscriptions()
            self._initialized = True
        
        # Add metadata to event
        event["job_id"] = job_id
        event["timestamp"] = asyncio.get_event_loop().time()
        
        # Send via Cloud Pub/Sub
        try:
            serializable_event = make_json_serializable(event)
            
            # Determine which topic to use based on event type
            topic_type = "job_updates"  # Default
            if event.get('type') in ['export_started', 'export_completed', 'export_failed']:
                topic_type = "export_updates"
            elif event.get('type') in ['automation_started', 'automation_completed', 'automation_failed']:
                topic_type = "automation_updates"
            
            success = await self.pubsub_service.publish_message(
                topic_type=topic_type,
                message_data=serializable_event,
                user_id=event.get('user_id'),
                job_id=job_id
            )
            
            if success:
                logger.info(f"Published SSE event to Cloud Pub/Sub topic {topic_type} - event: {event.get('type')} task: {event.get('task_id', 'N/A')}")
            else:
                logger.warning(f"Failed to publish event to Cloud Pub/Sub")
                
        except Exception as e:
            logger.warning(f"Failed to publish event to Cloud Pub/Sub: {e}")
    
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
    
    # Import-specific events
    async def send_import_started(self, job_id: str, source: str, file_count: int) -> None:
        """Send import started event"""
        await self.send_job_event(job_id, {
            "type": "import_started",
            "source": source,
            "file_count": file_count
        })
    
    async def send_import_progress(self, job_id: str, filename: str, status: str, file_size: int = 0, original_path: str = None) -> None:
        """Send import progress event"""
        await self.send_job_event(job_id, {
            "type": "import_progress",
            "filename": filename,
            "original_path": original_path or filename,
            "file_size": file_size,
            "status": status
        })
    
    async def send_import_completed(self, job_id: str, file_id: str, filename: str, file_size: int, status: str, original_path: str = None) -> None:
        """Send import completed event"""
        await self.send_job_event(job_id, {
            "type": "import_completed",
            "file_id": file_id,
            "filename": filename,
            "original_path": original_path or filename,
            "file_size": file_size,
            "status": status
        })
    
    async def send_import_failed(self, job_id: str, filename: str, error: str) -> None:
        """Send import failed event"""
        await self.send_job_event(job_id, {
            "type": "import_failed",
            "filename": filename,
            "error": error
        })
    
    async def send_import_batch_completed(self, job_id: str, source: str, successful: int, total: int) -> None:
        """Send import batch completed event"""
        await self.send_job_event(job_id, {
            "type": "import_batch_completed",
            "source": source,
            "successful": successful,
            "total": total
        })
    
    # Export-specific events
    async def send_export_started(self, job_id: str, destination: str, file_type: str) -> None:
        """Send export started event"""
        await self.send_job_event(job_id, {
            "type": "export_started",
            "destination": destination,
            "file_type": file_type
        })
    
    async def send_export_completed(self, job_id: str, destination: str, file_type: str, file_link: str = None) -> None:
        """Send export completed event"""
        await self.send_job_event(job_id, {
            "type": "export_completed",
            "destination": destination,
            "file_type": file_type,
            "file_link": file_link
        })
    
    async def send_export_failed(self, job_id: str, destination: str, file_type: str, error: str) -> None:
        """Send export failed event"""
        await self.send_job_event(job_id, {
            "type": "export_failed",
            "destination": destination,
            "file_type": file_type,
            "error": error
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