"""
API routes for automation management
"""
import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from core.database import get_db
from dependencies.auth import get_current_user_id
from services.automation_service import automation_service
from models.automation import (
    AutomationCreate, 
    AutomationUpdate, 
    AutomationResponse, 
    AutomationListResponse,
    AutomationRunResponse,
    AutomationRunListResponse
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/automations", tags=["automations"])

@router.post("/", response_model=AutomationResponse)
async def create_automation(
    automation: AutomationCreate,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Create a new automation"""
    try:
        created_automation = await automation_service.create_automation(db, user_id, automation)
        return AutomationResponse.from_orm(created_automation)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to create automation for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to create automation")

@router.get("/", response_model=AutomationListResponse)
async def list_automations(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Get all automations for the current user"""
    try:
        automations = await automation_service.get_user_automations(db, user_id)
        return AutomationListResponse(
            automations=[AutomationResponse.from_orm(auto) for auto in automations],
            total=len(automations)
        )
    except Exception as e:
        logger.error(f"Failed to list automations for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list automations")

@router.get("/{automation_id}", response_model=AutomationResponse)
async def get_automation(
    automation_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Get a specific automation by ID"""
    try:
        automation = await automation_service.get_automation(db, automation_id, user_id)
        if not automation:
            raise HTTPException(status_code=404, detail="Automation not found")
        return AutomationResponse.from_orm(automation)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get automation {automation_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get automation")

@router.put("/{automation_id}", response_model=AutomationResponse)
async def update_automation(
    automation_id: str,
    automation: AutomationUpdate,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Update an existing automation"""
    try:
        updated_automation = await automation_service.update_automation(db, automation_id, user_id, automation)
        if not updated_automation:
            raise HTTPException(status_code=404, detail="Automation not found")
        return AutomationResponse.from_orm(updated_automation)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to update automation {automation_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update automation")

@router.delete("/{automation_id}")
async def delete_automation(
    automation_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Delete an automation"""
    try:
        deleted = await automation_service.delete_automation(db, automation_id, user_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Automation not found")
        return {"message": "Automation deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete automation {automation_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete automation")

@router.post("/{automation_id}/toggle", response_model=AutomationResponse)
async def toggle_automation(
    automation_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Toggle automation enabled/disabled state"""
    try:
        automation = await automation_service.toggle_automation(db, automation_id, user_id)
        if not automation:
            raise HTTPException(status_code=404, detail="Automation not found")
        return AutomationResponse.from_orm(automation)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to toggle automation {automation_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to toggle automation")

@router.get("/{automation_id}/runs", response_model=AutomationRunListResponse)
async def get_automation_runs(
    automation_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=100, description="Maximum number of runs to return")
):
    """Get automation runs for a specific automation"""
    try:
        runs = await automation_service.get_automation_runs(db, automation_id, user_id, limit)
        return AutomationRunListResponse(
            runs=[AutomationRunResponse.from_orm(run) for run in runs],
            total=len(runs)
        )
    except Exception as e:
        logger.error(f"Failed to get automation runs for {automation_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get automation runs")