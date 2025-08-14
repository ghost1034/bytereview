"""
PostgreSQL-only user service for ByteReview
Clean implementation without Firestore dependencies
"""
from models.user import UserCreate, UserUpdate, UserResponse
from models.db_models import User as DBUser
from core.database import db_config
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from datetime import datetime
from typing import Optional
import logging

logger = logging.getLogger(__name__)

class UserService:
    """
    User service that uses only PostgreSQL
    Clean implementation for the new ByteReview architecture
    """
    
    def __init__(self):
        """Initialize with PostgreSQL connection"""
        try:
            # Test connection
            db = db_config.get_session()
            db.close()
            logger.info("PostgreSQL user service initialized")
        except Exception as e:
            logger.error(f"Failed to initialize user service: {e}")
            raise

    def _get_session(self) -> Session:
        """Get PostgreSQL session"""
        return db_config.get_session()

    async def create_user(self, user_data: UserCreate) -> UserResponse:
        """Create a new user in PostgreSQL"""
        db = self._get_session()
        try:
            logger.info(f"UserService: Creating user with display_name='{user_data.display_name}'")
            
            pg_user = DBUser(
                id=user_data.uid,
                email=user_data.email,
                display_name=user_data.display_name,
                photo_url=user_data.photo_url
            )
            db.add(pg_user)
            db.commit()
            db.refresh(pg_user)
            
            logger.info(f"UserService: After DB save, display_name='{pg_user.display_name}'")
            
            # Convert to response format
            return UserResponse(
                uid=pg_user.id,
                email=pg_user.email,
                display_name=pg_user.display_name,
                photo_url=pg_user.photo_url,
                created_at=pg_user.created_at,
                updated_at=pg_user.updated_at
            )
            
        except SQLAlchemyError as e:
            logger.error(f"Failed to create user {user_data.uid}: {e}")
            db.rollback()
            raise
        finally:
            db.close()

    async def get_user(self, uid: str) -> Optional[UserResponse]:
        """Get user by UID"""
        db = self._get_session()
        try:
            pg_user = db.query(DBUser).filter(DBUser.id == uid).first()
            if not pg_user:
                return None
            
            return UserResponse(
                uid=pg_user.id,
                email=pg_user.email,
                display_name=pg_user.display_name,
                photo_url=pg_user.photo_url,
                created_at=pg_user.created_at,
                updated_at=pg_user.updated_at
            )
            
        except SQLAlchemyError as e:
            logger.error(f"Error getting user {uid}: {e}")
            raise
        finally:
            db.close()

    async def update_user(self, uid: str, user_update: UserUpdate) -> Optional[UserResponse]:
        """Update user information"""
        db = self._get_session()
        try:
            pg_user = db.query(DBUser).filter(DBUser.id == uid).first()
            if not pg_user:
                return None
            
            # Update fields
            if user_update.display_name is not None:
                pg_user.display_name = user_update.display_name
            if user_update.photo_url is not None:
                pg_user.photo_url = user_update.photo_url
            
            pg_user.updated_at = datetime.utcnow()
            
            db.commit()
            db.refresh(pg_user)
            
            logger.info(f"Updated user {uid}")
            
            return UserResponse(
                uid=pg_user.id,
                email=pg_user.email,
                display_name=pg_user.display_name,
                photo_url=pg_user.photo_url,
                created_at=pg_user.created_at,
                updated_at=pg_user.updated_at
            )
            
        except SQLAlchemyError as e:
            logger.error(f"Failed to update user {uid}: {e}")
            db.rollback()
            raise
        finally:
            db.close()

    async def get_or_create_user(self, uid: str, email: str, display_name: Optional[str] = None, photo_url: Optional[str] = None) -> UserResponse:
        """Get existing user or create new one (does not update existing users)"""
        user = await self.get_user(uid)
        if user:
            return user
        
        # Create new user
        user_create = UserCreate(
            uid=uid,
            email=email,
            display_name=display_name,
            photo_url=photo_url
        )
        return await self.create_user(user_create)

    async def sync_user_profile(self, uid: str, email: str, display_name: Optional[str] = None, photo_url: Optional[str] = None) -> UserResponse:
        """Sync user profile - creates user if doesn't exist, updates profile if it does"""
        user = await self.get_user(uid)
        if user:
            # Always update the profile during sync
            user_update = UserUpdate(
                display_name=display_name,
                photo_url=photo_url
            )
            updated_user = await self.update_user(uid, user_update)
            return updated_user
        else:
            # Create new user
            user_create = UserCreate(
                uid=uid,
                email=email,
                display_name=display_name,
                photo_url=photo_url
            )
            return await self.create_user(user_create)

    async def delete_user_account(self, uid: str) -> bool:
        """
        Permanently delete user account and all associated data
        This includes:
        - User profile
        - All extraction jobs and results
        - Templates and field configurations
        - Billing account and usage data
        - Integration accounts
        - Automation configurations
        - All files from cloud storage
        """
        db = self._get_session()
        try:
            # Import here to avoid circular imports
            from models.db_models import (
                User, ExtractionJob, ExtractionTask, ExtractionResult, 
                SourceFile, JobField, Template, BillingAccount, 
                UsageCounter, IntegrationAccount, Automation, AutomationRun
            )
            from services.gcs_service import GCSService
            
            logger.info(f"Starting account deletion for user {uid}")
            
            # Initialize GCS service for file cleanup
            gcs_service = GCSService()
            
            # Get user to verify they exist
            user = db.query(User).filter(User.id == uid).first()
            if not user:
                logger.warning(f"User {uid} not found for deletion")
                return False
            
            # 1. Delete all user files from cloud storage
            # TODO: Implement this properly later
            try:
                # Delete all files in user's directory
                gcs_service.delete_user_files(uid)
                logger.info(f"Deleted cloud storage files for user {uid}")
            except Exception as e:
                logger.error(f"Failed to delete cloud storage files for user {uid}: {e}")
                # Continue with database deletion even if file deletion fails
            
            # 2. Delete database records in dependency order
            
            # Delete automation runs first (via automation relationship)
            automation_runs = db.query(AutomationRun).join(Automation).filter(Automation.user_id == uid).all()
            for run in automation_runs:
                db.delete(run)
            logger.info(f"Deleted {len(automation_runs)} automation runs")
            
            # Delete automations
            automations = db.query(Automation).filter(Automation.user_id == uid).all()
            for automation in automations:
                db.delete(automation)
            logger.info(f"Deleted {len(automations)} automations")
            
            # Delete integration accounts
            integration_accounts = db.query(IntegrationAccount).filter(IntegrationAccount.user_id == uid).all()
            for account in integration_accounts:
                db.delete(account)
            logger.info(f"Deleted {len(integration_accounts)} integration accounts")
            
            # Delete extraction results
            extraction_results = db.query(ExtractionResult).join(ExtractionTask).join(ExtractionJob).filter(ExtractionJob.user_id == uid).all()
            for result in extraction_results:
                db.delete(result)
            logger.info(f"Deleted {len(extraction_results)} extraction results")
            
            # Delete job fields
            job_fields = db.query(JobField).join(ExtractionJob).filter(ExtractionJob.user_id == uid).all()
            for job_field in job_fields:
                db.delete(job_field)
            logger.info(f"Deleted {len(job_fields)} job fields")
            
            # Delete extraction tasks
            extraction_tasks = db.query(ExtractionTask).join(ExtractionJob).filter(ExtractionJob.user_id == uid).all()
            for task in extraction_tasks:
                db.delete(task)
            logger.info(f"Deleted {len(extraction_tasks)} extraction tasks")
            
            # Delete source files
            source_files = db.query(SourceFile).join(ExtractionJob).filter(ExtractionJob.user_id == uid).all()
            for source_file in source_files:
                db.delete(source_file)
            logger.info(f"Deleted {len(source_files)} source files")
            
            # Delete extraction jobs
            extraction_jobs = db.query(ExtractionJob).filter(ExtractionJob.user_id == uid).all()
            for job in extraction_jobs:
                db.delete(job)
            logger.info(f"Deleted {len(extraction_jobs)} extraction jobs")
            
            # Delete templates
            templates = db.query(Template).filter(Template.user_id == uid).all()
            for template in templates:
                db.delete(template)
            logger.info(f"Deleted {len(templates)} templates")
            
            # Delete usage counters
            usage_counters = db.query(UsageCounter).filter(UsageCounter.user_id == uid).all()
            for counter in usage_counters:
                db.delete(counter)
            logger.info(f"Deleted {len(usage_counters)} usage counters")
            
            # Delete billing account
            # TODO: Cancel Stripe subscription automatically
            billing_account = db.query(BillingAccount).filter(BillingAccount.user_id == uid).first()
            if billing_account:
                db.delete(billing_account)
                logger.info("Deleted billing account")
            
            # Finally, delete the user
            db.delete(user)
            
            # Commit all deletions
            db.commit()
            
            logger.info(f"Successfully deleted user account {uid} and all associated data")
            return True
            
        except Exception as e:
            logger.error(f"Failed to delete user account {uid}: {e}")
            db.rollback()
            raise
        finally:
            db.close()

    # TODO: Implement subscription and usage tracking methods when needed
    # async def update_stripe_customer(self, uid: str, stripe_customer_id: str) -> Optional[UserResponse]
    # async def update_subscription_status(self, uid: str, status: str, pages_limit: int = None) -> Optional[UserResponse]
    # async def increment_pages_used(self, uid: str, pages: int = 1) -> Optional[UserResponse]