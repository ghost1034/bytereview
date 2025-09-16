"""
Cloud Run Task service for maintenance tasks
Replaces worker-maint ARQ worker (cron tasks, cleanup, billing)
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
    run_abandoned_cleanup,
    run_opt_out_cleanup,
    run_artifact_cleanup,
    run_free_user_period_reset,
    run_stripe_usage_reconciliation,
    run_usage_counter_cleanup,
    run_gmail_watch_renewal
)

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    logger.info("Maintenance task service starting up...")
    yield
    logger.info("Maintenance task service shutting down...")

app = FastAPI(
    title="CPAAutomation Maintenance Task Service",
    description="Cloud Run Task service for maintenance and scheduled tasks",
    lifespan=lifespan
)

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "maintenance-tasks"}

@app.post("/execute")
async def execute_task(request: Request):
    """Execute a maintenance task"""
    try:
        task_data = await request.json()
        task_type = task_data.get("task_type")
        
        # Create context dict (similar to ARQ context)
        ctx = {}
        
        if task_type == "run_abandoned_cleanup":
            logger.info("Executing abandoned job cleanup")
            result = await run_abandoned_cleanup(ctx)
            
        elif task_type == "run_opt_out_cleanup":
            logger.info("Executing opt-out data cleanup")
            result = await run_opt_out_cleanup(ctx)
            
        elif task_type == "run_artifact_cleanup":
            logger.info("Executing artifact cleanup")
            result = await run_artifact_cleanup(ctx)
            
        elif task_type == "run_free_user_period_reset":
            logger.info("Executing free user period reset")
            result = await run_free_user_period_reset(ctx)
            
        elif task_type == "run_stripe_usage_reconciliation":
            logger.info("Executing Stripe usage reconciliation")
            result = await run_stripe_usage_reconciliation(ctx)
            
        elif task_type == "run_usage_counter_cleanup":
            logger.info("Executing usage counter cleanup")
            result = await run_usage_counter_cleanup(ctx)
            
        elif task_type == "run_gmail_watch_renewal":
            logger.info("Executing Gmail watch renewal")
            result = await run_gmail_watch_renewal(ctx)
            
        else:
            raise HTTPException(status_code=400, detail=f"Unknown task type: {task_type}")
        
        logger.info(f"Maintenance task {task_type} completed: {result}")
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
    
    logger.info(f"Starting Maintenance Task Service on port {port}")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )

if __name__ == "__main__":
    main()