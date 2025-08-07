"""
Automation service for managing automated workflows
"""
import logging
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_

from models.db_models import Automation, AutomationRun, ExtractionJob
from models.automation import AutomationCreate, AutomationUpdate, AutomationResponse, AutomationRunResponse

logger = logging.getLogger(__name__)

class AutomationService:
    """Service for managing automations and automation runs"""
    
    async def create_automation(
        self, 
        db: Session, 
        user_id: str, 
        automation_data: AutomationCreate
    ) -> Automation:
        """Create a new automation"""
        try:
            # Verify the job exists and belongs to the user
            job = db.query(ExtractionJob).filter(
                ExtractionJob.id == automation_data.job_id,
                ExtractionJob.user_id == user_id
            ).first()
            
            if not job:
                raise ValueError("Job not found or access denied")
            
            # Validate export configuration (for future implementation)
            # For now, we allow dest_type without export_config since users can't configure it yet
            if automation_data.export_config and not automation_data.dest_type:
                raise ValueError("dest_type is required when export_config is specified")
            elif not automation_data.dest_type and automation_data.export_config:
                raise ValueError("export_config must be NULL when dest_type is NULL")
            
            # Create automation
            automation = Automation(
                user_id=user_id,
                name=automation_data.name,
                is_enabled=automation_data.is_enabled,
                trigger_type=automation_data.trigger_type,
                trigger_config=automation_data.trigger_config,
                job_id=automation_data.job_id,
                dest_type=automation_data.dest_type,
                export_config=automation_data.export_config or {}
            )
            
            db.add(automation)
            db.commit()
            db.refresh(automation)
            
            logger.info(f"Created automation {automation.id} for user {user_id}")
            return automation
            
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to create automation for user {user_id}: {e}")
            raise
    
    async def get_user_automations(self, db: Session, user_id: str) -> List[Automation]:
        """Get all automations for a user"""
        return db.query(Automation).filter(Automation.user_id == user_id).all()
    
    async def get_automation(self, db: Session, automation_id: str, user_id: str) -> Optional[Automation]:
        """Get a specific automation by ID"""
        return db.query(Automation).filter(
            Automation.id == automation_id,
            Automation.user_id == user_id
        ).first()
    
    async def update_automation(
        self, 
        db: Session, 
        automation_id: str, 
        user_id: str, 
        automation_data: AutomationUpdate
    ) -> Optional[Automation]:
        """Update an existing automation"""
        try:
            automation = await self.get_automation(db, automation_id, user_id)
            if not automation:
                return None
            
            # Update fields if provided (allow explicit null for dest_type and export_config)
            if automation_data.name is not None:
                automation.name = automation_data.name
            if automation_data.is_enabled is not None:
                automation.is_enabled = automation_data.is_enabled
            if automation_data.trigger_config is not None:
                automation.trigger_config = automation_data.trigger_config
            
            automation.dest_type = automation_data.dest_type
            automation.export_config = automation_data.export_config or {}
            
            # Validate export configuration (lenient for now)
            # For now, allow dest_type without export_config since users can't configure it yet
            if not automation.dest_type and automation.export_config:
                raise ValueError("export_config must be NULL when dest_type is NULL")
            
            db.commit()
            db.refresh(automation)
            
            logger.info(f"Updated automation {automation_id}")
            return automation
            
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to update automation {automation_id}: {e}")
            raise
    
    async def delete_automation(self, db: Session, automation_id: str, user_id: str) -> bool:
        """Delete an automation"""
        try:
            automation = await self.get_automation(db, automation_id, user_id)
            if not automation:
                return False
            
            db.delete(automation)
            db.commit()
            
            logger.info(f"Deleted automation {automation_id}")
            return True
            
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to delete automation {automation_id}: {e}")
            raise
    
    async def toggle_automation(self, db: Session, automation_id: str, user_id: str) -> Optional[Automation]:
        """Toggle automation enabled/disabled state"""
        try:
            automation = await self.get_automation(db, automation_id, user_id)
            if not automation:
                return None
            
            automation.is_enabled = not automation.is_enabled
            db.commit()
            db.refresh(automation)
            
            logger.info(f"Toggled automation {automation_id} to {'enabled' if automation.is_enabled else 'disabled'}")
            return automation
            
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to toggle automation {automation_id}: {e}")
            raise
    
    async def get_automation_runs(
        self, 
        db: Session, 
        automation_id: str, 
        user_id: str,
        limit: int = 50
    ) -> List[AutomationRun]:
        """Get automation runs for a specific automation"""
        # Verify automation belongs to user
        automation = await self.get_automation(db, automation_id, user_id)
        if not automation:
            return []
        
        return db.query(AutomationRun).filter(
            AutomationRun.automation_id == automation_id
        ).order_by(AutomationRun.triggered_at.desc()).limit(limit).all()
    
    async def get_enabled_automations(self, db: Session, user_id: str) -> List[Automation]:
        """Get all enabled automations for a user"""
        return db.query(Automation).filter(
            Automation.user_id == user_id,
            Automation.is_enabled == True
        ).all()
    
    async def create_automation_run(
        self, 
        db: Session, 
        automation_id: str, 
        job_id: str
    ) -> AutomationRun:
        """Create a new automation run"""
        try:
            automation_run = AutomationRun(
                automation_id=automation_id,
                job_id=job_id,
                status='pending'
            )
            
            db.add(automation_run)
            db.commit()
            db.refresh(automation_run)
            
            logger.info(f"Created automation run {automation_run.id} for automation {automation_id}")
            return automation_run
            
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to create automation run for automation {automation_id}: {e}")
            raise
    
    async def update_automation_run_status(
        self, 
        db: Session, 
        run_id: str, 
        status: str, 
        error_message: str = None
    ) -> Optional[AutomationRun]:
        """Update automation run status"""
        try:
            automation_run = db.query(AutomationRun).filter(AutomationRun.id == run_id).first()
            if not automation_run:
                return None
            
            automation_run.status = status
            if error_message:
                automation_run.error_message = error_message
            
            if status in ['completed', 'failed']:
                from sqlalchemy.sql import func
                automation_run.completed_at = func.now()
            
            db.commit()
            db.refresh(automation_run)
            
            logger.info(f"Updated automation run {run_id} status to {status}")
            return automation_run
            
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to update automation run {run_id}: {e}")
            raise
    

# Create service instance
automation_service = AutomationService()