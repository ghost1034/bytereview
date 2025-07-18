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
        Listen for events related to a specific job
        Simplified version with just local queues and Redis pub/sub
        """
        # Create a queue for this listener
        event_queue = asyncio.Queue()
        
        # Register this listener for the job
        self._job_listeners[job_id].add(event_queue)
        
        # Set up Redis subscription for cross-process events
        redis_client = await self._get_redis()
        pubsub = redis_client.pubsub()
        channel = f"job_events_{job_id}"
        await pubsub.subscribe(channel)
        
        try:
            # Send initial connection confirmation
            yield {"type": "connected", "job_id": job_id}
            
            while True:
                try:
                    # Wait for events from either local queue or Redis with 30s timeout
                    done, pending = await asyncio.wait([
                        asyncio.create_task(event_queue.get()),
                        asyncio.create_task(pubsub.get_message(ignore_subscribe_messages=True, timeout=30.0))
                    ], return_when=asyncio.FIRST_COMPLETED, timeout=30.0)
                    
                    # Cancel pending tasks
                    for task in pending:
                        task.cancel()
                    
                    if done:
                        result = done.pop().result()
                        if result is not None:
                            # Handle Redis message
                            if isinstance(result, dict) and 'data' in result:
                                try:
                                    event = json.loads(result['data'])
                                    yield event
                                except json.JSONDecodeError:
                                    continue
                            # Handle local queue event
                            else:
                                yield result
                    else:
                        # Timeout - send keepalive
                        yield {"type": "keepalive", "timestamp": asyncio.get_event_loop().time()}
                        
                except asyncio.TimeoutError:
                    # Send keepalive event
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
        logger.info(f"Sending SSE event for job {job_id}: {event.get('type', 'unknown')}")
        
        # Add metadata to event
        event["job_id"] = job_id
        event["timestamp"] = asyncio.get_event_loop().time()
        
        # Send to local listeners first (same process)
        local_listeners = len(self._job_listeners.get(job_id, set()))
        if local_listeners > 0:
            logger.info(f"Sending to {local_listeners} local listeners for job {job_id}")
            for queue in list(self._job_listeners[job_id]):
                try:
                    await queue.put(event)
                except Exception as e:
                    logger.warning(f"Failed to send to local listener: {e}")
                    # Remove failed listeners
                    self._job_listeners[job_id].discard(queue)
        else:
            logger.info(f"No local listeners for job {job_id}")
        
        # Send via Redis for cross-process communication
        try:
            redis_client = await self._get_redis()
            channel = f"job_events_{job_id}"
            serializable_event = self._make_json_serializable(event)
            await redis_client.publish(channel, json.dumps(serializable_event))
            logger.info(f"Published SSE event to Redis channel {channel}")
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

# Global SSE manager instance
_sse_manager_instance = None

def get_sse_manager():
    global _sse_manager_instance
    if _sse_manager_instance is None:
        _sse_manager_instance = SSEManager()
    return _sse_manager_instance

# For backward compatibility
sse_manager = get_sse_manager()