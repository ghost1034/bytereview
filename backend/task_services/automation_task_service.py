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
    """Execute an automation task"""
    try:
        task_data = await request.json()
        task_type = task_data.get("task_type")
        
        # Create context dict (similar to ARQ context)
        ctx = {}
        
        if task_type == "automation_trigger_worker":
            user_id = task_data.get("user_id")
            message_data = task_data.get("message_data", {})
            
            if not all([user_id, message_data]):
                raise HTTPException(status_code=400, detail="user_id and message_data are required")
            
            logger.info(f"Executing automation trigger for user: {user_id}")
            result = await automation_trigger_worker(ctx, user_id, message_data)
            
        elif task_type == "run_initializer_worker":
            job_id = task_data.get("job_id")
            automation_run_id = task_data.get("automation_run_id")
            
            if not job_id:
                raise HTTPException(status_code=400, detail="job_id is required")
            
            logger.info(f"Executing job initializer: job={job_id}, automation_run={automation_run_id}")
            result = await run_initializer_worker(ctx, job_id, automation_run_id)
            
        else:
            raise HTTPException(status_code=400, detail=f"Unknown task type: {task_type}")
        
        logger.info(f"Automation task {task_type} completed: {result}")
        return {"success": True, "result": result}
        
    except Exception as e:
        logger.error(f"Task execution failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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