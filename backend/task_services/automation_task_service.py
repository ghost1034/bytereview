"""
Cloud Run Task service for automation tasks
Replaces worker-automation ARQ worker (Gmail triggers, job initialization)
"""
import os
import logging
from fastapi import FastAPI, Request, HTTPException
from contextlib import asynccontextmanager
import uvicorn

# Add backend to path
import sys
from pathlib import Path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from workers.worker import (
    automation_trigger_worker,
    run_initializer_worker
)

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    logger.info("Automation task service starting up...")
    yield
    logger.info("Automation task service shutting down...")

app = FastAPI(
    title="CPAAutomation Automation Task Service",
    description="Cloud Run Task service for automation triggers and job initialization",
    lifespan=lifespan
)

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "automation-tasks"}

@app.post("/execute")
async def execute_task(request: Request):
    """Execute an automation task. Always return 200 to prevent Cloud Tasks retries."""
    try:
        task_data = await request.json()
        task_type = task_data.get("task_type")
        
        # Create context dict (similar to ARQ context)
        ctx = {}
        
        if task_type == "automation_trigger_worker":
            user_id = task_data.get("user_id")
            message_data = task_data.get("message_data", {})
            
            if not all([user_id, message_data]):
                # Permanent error; don't retry
                logger.warning("automation_trigger_worker missing required fields: user_id or message_data")
                return {"success": False, "error": "user_id and message_data are required"}
            
            logger.info(f"Executing automation trigger for user: {user_id}")
            try:
                result = await automation_trigger_worker(ctx, user_id, message_data)
                logger.info(f"Automation task {task_type} completed: {result}")
                return {"success": True, "result": result}
            except Exception as e:
                # Treat as handled failure to avoid Cloud Tasks retry
                logger.error(f"automation_trigger_worker failed: {e}")
                return {"success": False, "error": str(e)}
            
        elif task_type == "run_initializer_worker":
            job_id = task_data.get("job_id")
            automation_run_id = task_data.get("automation_run_id")
            
            if not job_id:
                # Permanent error; don't retry
                logger.warning("run_initializer_worker missing required field: job_id")
                return {"success": False, "error": "job_id is required"}
            
            logger.info(f"Executing job initializer: job={job_id}, automation_run={automation_run_id}")
            try:
                result = await run_initializer_worker(ctx, job_id, automation_run_id)
                logger.info(f"Automation task {task_type} completed: {result}")
                return {"success": True, "result": result}
            except Exception as e:
                # Treat as handled failure to avoid Cloud Tasks retry
                logger.error(f"run_initializer_worker failed: {e}")
                return {"success": False, "error": str(e)}
            
        else:
            # Unknown task type is a permanent error; don't retry
            logger.warning(f"Unknown task type: {task_type}")
            return {"success": False, "error": f"Unknown task type: {task_type}"}
        
    except Exception as e:
        # Any unexpected error at the request level should not cause retries
        logger.error(f"Task execution failed at request level: {e}")
        return {"success": False, "error": str(e)}

def main():
    """Main entry point"""
    port = int(os.getenv("PORT", "8080"))
    
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    
    logger.info(f"Starting Automation Task Service on port {port}")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )

if __name__ == "__main__":
    main()