"""
Cloud Pub/Sub service for real-time messaging
Replaces Redis pub/sub for SSE notifications
"""
import os
import json
import logging
import asyncio
from typing import Dict, Any, Callable, Optional
from concurrent.futures import ThreadPoolExecutor
from google.cloud import pubsub_v1
from google.api_core import retry
import threading
from dotenv import load_dotenv
from services.json_utils import make_json_serializable

load_dotenv()

logger = logging.getLogger(__name__)

class CloudPubSubService:
    """Service for managing Cloud Pub/Sub messaging for SSE"""
    
    def __init__(self):
        self.project_id = os.getenv("GOOGLE_CLOUD_PROJECT_ID", "ace-rider-383100")
        self.publisher = pubsub_v1.PublisherClient()
        self.subscriber = pubsub_v1.SubscriberClient()
        
        # Thread pool for async/sync bridge
        self.executor = ThreadPoolExecutor(max_workers=4)
        
        # Active subscriptions
        self.active_subscriptions: Dict[str, Any] = {}
        self.subscription_lock = threading.Lock()
        
        # Topic names for different message types
        self.topics = {
            "job_updates": f"projects/{self.project_id}/topics/cpa-job-updates",
            "automation_updates": f"projects/{self.project_id}/topics/cpa-automation-updates",
            "export_updates": f"projects/{self.project_id}/topics/cpa-export-updates",
            "system_updates": f"projects/{self.project_id}/topics/cpa-system-updates"
        }
        
        # Subscription names (unique per service instance)
        instance_id = os.getenv("K_REVISION", "local")
        self.subscriptions = {
            "job_updates": f"projects/{self.project_id}/subscriptions/cpa-job-updates-{instance_id}",
            "automation_updates": f"projects/{self.project_id}/subscriptions/cpa-automation-updates-{instance_id}",
            "export_updates": f"projects/{self.project_id}/subscriptions/cpa-export-updates-{instance_id}",
            "system_updates": f"projects/{self.project_id}/subscriptions/cpa-system-updates-{instance_id}"
        }

    async def setup_topics_and_subscriptions(self):
        """Set up Pub/Sub topics and subscriptions (run once on startup)"""
        try:
            loop = asyncio.get_event_loop()
            
            # Create topics
            for topic_name, topic_path in self.topics.items():
                try:
                    def create_topic():
                        return self.publisher.create_topic(name=topic_path)
                    
                    await loop.run_in_executor(self.executor, create_topic)
                    logger.info(f"Created topic: {topic_path}")
                except Exception as e:
                    if "already exists" in str(e).lower():
                        logger.info(f"Topic already exists: {topic_path}")
                    else:
                        logger.error(f"Failed to create topic {topic_path}: {e}")
            
            # Create subscriptions
            for sub_name, sub_path in self.subscriptions.items():
                try:
                    topic_path = self.topics[sub_name]
                    
                    def create_subscription():
                        return self.subscriber.create_subscription(
                            name=sub_path,
                            topic=topic_path,
                            ack_deadline_seconds=30
                        )
                    
                    await loop.run_in_executor(self.executor, create_subscription)
                    logger.info(f"Created subscription: {sub_path}")
                except Exception as e:
                    if "already exists" in str(e).lower():
                        logger.info(f"Subscription already exists: {sub_path}")
                    else:
                        logger.error(f"Failed to create subscription {sub_path}: {e}")
                        
        except Exception as e:
            logger.error(f"Failed to setup topics and subscriptions: {e}")

    async def publish_message(
        self,
        topic_type: str,
        message_data: Dict[str, Any],
        user_id: str = None,
        job_id: str = None
    ) -> bool:
        """Publish a message to a specific topic"""
        try:
            topic_path = self.topics.get(topic_type)
            if not topic_path:
                logger.error(f"Unknown topic type: {topic_type}")
                return False
            
            # Prepare message with metadata
            message = {
                "data": message_data,
                "timestamp": asyncio.get_event_loop().time(),
                "user_id": user_id,
                "job_id": job_id
            }
            
            # Convert to JSON bytes with UUID serialization
            serializable_message = make_json_serializable(message)
            message_bytes = json.dumps(serializable_message).encode('utf-8')
            
            # Add attributes for filtering (must be strings)
            attributes = {}
            if user_id:
                attributes["user_id"] = str(user_id)
            if job_id:
                attributes["job_id"] = str(job_id)
            
            # Publish message
            loop = asyncio.get_event_loop()
            def publish_message():
                return self.publisher.publish(topic_path, message_bytes, **attributes)
            
            future = await loop.run_in_executor(self.executor, publish_message)
            
            logger.debug(f"Published message to {topic_type}: {future.result()}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to publish message to {topic_type}: {e}")
            return False

    async def subscribe_to_topic(
        self,
        topic_type: str,
        callback: Callable[[Dict[str, Any]], None],
        user_id_filter: Optional[str] = None
    ) -> str:
        """Subscribe to a topic with optional user filtering"""
        try:
            subscription_path = self.subscriptions.get(topic_type)
            if not subscription_path:
                logger.error(f"Unknown topic type: {topic_type}")
                return None
            
            def message_callback(message):
                try:
                    # Parse message
                    message_data = json.loads(message.data.decode('utf-8'))
                    
                    # Apply user filter if specified
                    if user_id_filter and message_data.get("user_id") != user_id_filter:
                        message.ack()
                        return
                    
                    # Call the callback
                    callback(message_data)
                    message.ack()
                    
                except Exception as e:
                    logger.error(f"Error processing message: {e}")
                    message.nack()
            
            # Start subscription in thread pool
            loop = asyncio.get_event_loop()
            flow_control = pubsub_v1.types.FlowControl(max_messages=100)
            
            subscription_future = await loop.run_in_executor(
                self.executor,
                lambda: self.subscriber.subscribe(
                    subscription_path,
                    callback=message_callback,
                    flow_control=flow_control
                )
            )
            
            # Store subscription for cleanup
            with self.subscription_lock:
                self.active_subscriptions[subscription_path] = subscription_future
            
            logger.info(f"Subscribed to {topic_type} with filter: {user_id_filter}")
            return subscription_path
            
        except Exception as e:
            logger.error(f"Failed to subscribe to {topic_type}: {e}")
            return None

    async def unsubscribe(self, subscription_path: str):
        """Unsubscribe from a topic"""
        try:
            with self.subscription_lock:
                if subscription_path in self.active_subscriptions:
                    subscription_future = self.active_subscriptions[subscription_path]
                    subscription_future.cancel()
                    del self.active_subscriptions[subscription_path]
                    logger.info(f"Unsubscribed from: {subscription_path}")
        except Exception as e:
            logger.error(f"Failed to unsubscribe from {subscription_path}: {e}")

    async def cleanup(self):
        """Clean up all subscriptions"""
        try:
            with self.subscription_lock:
                for subscription_path, subscription_future in self.active_subscriptions.items():
                    try:
                        subscription_future.cancel()
                        logger.info(f"Cancelled subscription: {subscription_path}")
                    except Exception as e:
                        logger.error(f"Error cancelling subscription {subscription_path}: {e}")
                
                self.active_subscriptions.clear()
            
            # Shutdown executor
            self.executor.shutdown(wait=False)
            logger.info("Cloud Pub/Sub service cleaned up")
            
        except Exception as e:
            logger.error(f"Error during cleanup: {e}")


    # Convenience methods for specific message types
    async def publish_job_update(
        self,
        job_id: str,
        user_id: str,
        status: str,
        message: str = None,
        progress: float = None,
        **extra_data
    ) -> bool:
        """Publish a job status update"""
        message_data = {
            "type": "job_update",
            "job_id": job_id,
            "status": status,
            "message": message,
            "progress": progress,
            **extra_data
        }
        return await self.publish_message("job_updates", message_data, user_id, job_id)

    async def publish_automation_update(
        self,
        automation_run_id: str,
        user_id: str,
        status: str,
        message: str = None,
        **extra_data
    ) -> bool:
        """Publish an automation status update"""
        message_data = {
            "type": "automation_update",
            "automation_run_id": automation_run_id,
            "status": status,
            "message": message,
            **extra_data
        }
        return await self.publish_message("automation_updates", message_data, user_id)

    async def publish_export_update(
        self,
        job_id: str,
        user_id: str,
        status: str,
        file_url: str = None,
        message: str = None,
        **extra_data
    ) -> bool:
        """Publish an export status update"""
        message_data = {
            "type": "export_update",
            "job_id": job_id,
            "status": status,
            "file_url": file_url,
            "message": message,
            **extra_data
        }
        return await self.publish_message("export_updates", message_data, user_id, job_id)

    async def publish_system_update(
        self,
        message_type: str,
        message: str,
        user_id: str = None,
        **extra_data
    ) -> bool:
        """Publish a system-wide update"""
        message_data = {
            "type": "system_update",
            "message_type": message_type,
            "message": message,
            **extra_data
        }
        return await self.publish_message("system_updates", message_data, user_id)

# Global instance
cloud_pubsub_service = CloudPubSubService()