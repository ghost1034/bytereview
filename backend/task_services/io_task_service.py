"""
Cloud Run Task service for I/O tasks
Replaces worker-io ARQ worker (imports, exports, ZIP unpacking)
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
    import_drive_files,
    import_gmail_attachments,
    export_job_to_google_drive,
    unpack_zip_file_task
)

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    logger.info("I/O task service starting up...")
    yield
    logger.info("I/O task service shutting down...")

app = FastAPI(
    title="CPAAutomation I/O Task Service",
    description="Cloud Run Task service for import/export/ZIP tasks",
    lifespan=lifespan
)

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "io-tasks"}

@app.post("/execute")
async def execute_task(request: Request):
    """Execute an I/O task"""
    try:
        task_data = await request.json()
        task_type = task_data.get("task_type")
        
        # Create context dict (similar to ARQ context)
        ctx = {}
        
        if task_type == "import_drive_files":
            job_id = task_data.get("job_id")
            user_id = task_data.get("user_id")
            import_data = task_data.get("import_data", {})
            drive_file_ids = import_data.get("drive_file_ids", [])
            
            if not all([job_id, user_id, drive_file_ids]):
                raise HTTPException(status_code=400, detail="job_id, user_id, and drive_file_ids are required")
            
            logger.info(f"Executing Drive import: job={job_id}, files={len(drive_file_ids)}")
            result = await import_drive_files(ctx, job_id, user_id, drive_file_ids)
            
        elif task_type == "import_gmail_attachments":
            job_id = task_data.get("job_id")
            user_id = task_data.get("user_id")
            import_data = task_data.get("import_data", {})
            attachment_data = import_data.get("attachment_data", [])
            automation_run_id = task_data.get("automation_run_id")
            
            if not all([job_id, user_id, attachment_data]):
                raise HTTPException(status_code=400, detail="job_id, user_id, and attachment_data are required")
            
            logger.info(f"Executing Gmail import: job={job_id}, attachments={len(attachment_data)}")
            result = await import_gmail_attachments(ctx, job_id, user_id, attachment_data, automation_run_id)
            
        elif task_type == "export_job_to_google_drive":
            job_id = task_data.get("job_id")
            user_id = task_data.get("user_id")
            file_type = task_data.get("file_type")
            folder_id = task_data.get("folder_id")
            automation_run_id = task_data.get("automation_run_id")
            run_id = task_data.get("run_id")
            
            if not all([job_id, user_id, file_type]):
                raise HTTPException(status_code=400, detail="job_id, user_id, and file_type are required")
            
            logger.info(f"Executing Google Drive export: job={job_id}, type={file_type}")
            result = await export_job_to_google_drive(ctx, job_id, user_id, file_type, folder_id, automation_run_id, run_id)
            
        elif task_type == "unpack_zip_file_task":
            source_file_id = task_data.get("source_file_id")
            automation_run_id = task_data.get("automation_run_id")
            
            if not source_file_id:
                raise HTTPException(status_code=400, detail="source_file_id is required")
            
            logger.info(f"Executing ZIP unpack: file={source_file_id}")
            result = await unpack_zip_file_task(ctx, source_file_id, automation_run_id)
            
        else:
            raise HTTPException(status_code=400, detail=f"Unknown task type: {task_type}")
        
        logger.info(f"I/O task {task_type} completed: {result}")
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
    
    logger.info(f"Starting I/O Task Service on port {port}")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )

if __name__ == "__main__":
    main()