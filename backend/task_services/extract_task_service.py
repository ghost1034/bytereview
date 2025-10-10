"""
Cloud Run Task service for extraction tasks
Replaces worker-extract ARQ worker
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

from workers.worker import process_extraction_task

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    logger.info("Extract task service starting up...")
    yield
    logger.info("Extract task service shutting down...")

app = FastAPI(
    title="CPAAutomation Extract Task Service",
    description="Cloud Run Task service for AI extraction tasks",
    lifespan=lifespan
)

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "extract-tasks"}

@app.post("/execute")
async def execute_task(request: Request):
    """Execute an extraction task"""
    try:
        task_data = await request.json()
        task_type = task_data.get("task_type")
        
        if task_type == "process_extraction_task":
            task_id = task_data.get("task_id")
            automation_run_id = task_data.get("automation_run_id")
            
            if not task_id:
                raise HTTPException(status_code=400, detail="task_id is required")
            
            logger.info(f"Executing extraction task: {task_id}")
            
            # Create context dict (similar to ARQ context)
            ctx = {
                "automation_run_id": automation_run_id
            }
            
            # Execute the task
            result = await process_extraction_task(ctx, task_id, automation_run_id)
            
            logger.info(f"Extraction task {task_id} completed: {result}")
            return {"success": True, "result": result}
        
        else:
            raise HTTPException(status_code=400, detail=f"Unknown task type: {task_type}")
            
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
    
    logger.info(f"Starting Extract Task Service on port {port}")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )

if __name__ == "__main__":
    main()