"""
Gmail Watch Manager Service
Automatically manages Gmail watch subscriptions for users
"""
import logging
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from models.db_models import IntegrationAccount, User
from services.gmail_subscription_service import gmail_subscription_service
from services.google_service import google_service

logger = logging.getLogger(__name__)

class GmailWatchManager:
    """Service for automatically managing Gmail watch subscriptions"""
    
    def __init__(self):
        self.watch_duration_days = 7  # Gmail watch expires after 7 days
        self.renewal_buffer_days = 1  # Renew 1 day before expiration
    
    async def setup_watch_for_new_integration(self, db: Session, user_id: str) -> bool:
        """
        Automatically set up Gmail watch when user connects Google account
        
        Args:
            db: Database session
            user_id: User ID who just connected Google account
            
        Returns:
            True if watch setup successful, False otherwise
        """
        try:
            logger.info(f"Setting up Gmail watch for new Google integration: user {user_id}")
            
            # Verify the user has a Google integration
            integration = db.query(IntegrationAccount).filter(
                IntegrationAccount.user_id == user_id,
                IntegrationAccount.provider == 'google'
            ).first()
            
            if not integration:
                logger.warning(f"No Google integration found for user {user_id}")
                return False
            
            # Set up Gmail watch
            success = gmail_subscription_service.setup_gmail_watch_for_user(db, user_id)
            
            if success:
                logger.info(f"Gmail watch setup successful for user {user_id}")
                
                # Store watch setup timestamp in user record for tracking
                await self._update_watch_timestamp(db, user_id)
                
                return True
            else:
                logger.error(f"Gmail watch setup failed for user {user_id}")
                return False
                
        except Exception as e:
            logger.error(f"Failed to setup Gmail watch for user {user_id}: {e}")
            return False
    
    async def ensure_watch_active_for_user(self, db: Session, user_id: str) -> bool:
        """
        Ensure Gmail watch is active for a user, renewing if necessary
        
        Args:
            db: Database session
            user_id: User ID to check
            
        Returns:
            True if watch is active, False otherwise
        """
        try:
            # Check if user has Google integration
            integration = db.query(IntegrationAccount).filter(
                IntegrationAccount.user_id == user_id,
                IntegrationAccount.provider == 'google'
            ).first()
            
            if not integration:
                logger.debug(f"No Google integration for user {user_id}, skipping watch check")
                return False
            
            # Check if watch needs renewal
            needs_renewal = await self._check_watch_needs_renewal(db, user_id)
            
            if needs_renewal:
                logger.info(f"Gmail watch needs renewal for user {user_id}")
                success = gmail_subscription_service.setup_gmail_watch_for_user(db, user_id)
                
                if success:
                    await self._update_watch_timestamp(db, user_id)
                    logger.info(f"Gmail watch renewed for user {user_id}")
                    return True
                else:
                    logger.error(f"Gmail watch renewal failed for user {user_id}")
                    return False
            else:
                logger.debug(f"Gmail watch is active for user {user_id}")
                return True
                
        except Exception as e:
            logger.error(f"Failed to ensure Gmail watch for user {user_id}: {e}")
            return False
    
    async def ensure_watches_for_all_users(self, db: Session) -> Dict[str, Any]:
        """
        Ensure Gmail watches are active for all users with Google integrations
        
        Args:
            db: Database session
            
        Returns:
            Dict with results summary
        """
        try:
            logger.info("Checking Gmail watches for all users")
            
            # Get all users with Google integrations
            integrations = db.query(IntegrationAccount).filter(
                IntegrationAccount.provider == 'google'
            ).all()
            
            results = {
                'total_users': len(integrations),
                'watches_active': 0,
                'watches_renewed': 0,
                'failures': 0,
                'errors': []
            }
            
            for integration in integrations:
                try:
                    needs_renewal = await self._check_watch_needs_renewal(db, integration.user_id)
                    
                    if needs_renewal:
                        success = gmail_subscription_service.setup_gmail_watch_for_user(db, integration.user_id)
                        if success:
                            await self._update_watch_timestamp(db, integration.user_id)
                            results['watches_renewed'] += 1
                            logger.info(f"Renewed Gmail watch for user {integration.user_id}")
                        else:
                            results['failures'] += 1
                            results['errors'].append({
                                'user_id': integration.user_id,
                                'error': 'Watch renewal failed'
                            })
                    else:
                        results['watches_active'] += 1
                        
                except Exception as e:
                    results['failures'] += 1
                    results['errors'].append({
                        'user_id': integration.user_id,
                        'error': str(e)
                    })
            
            logger.info(f"Gmail watch check completed: {results}")
            return results
            
        except Exception as e:
            logger.error(f"Failed to check Gmail watches for all users: {e}")
            return {
                'total_users': 0,
                'watches_active': 0,
                'watches_renewed': 0,
                'failures': 0,
                'errors': [{'general': str(e)}]
            }
    
    async def handle_integration_change(self, db: Session, user_id: str, old_email: Optional[str] = None) -> bool:
        """
        Handle when user changes their Google integration account
        
        Args:
            db: Database session
            user_id: User ID
            old_email: Previous email address (if known)
            
        Returns:
            True if handled successfully, False otherwise
        """
        try:
            logger.info(f"Handling Google integration change for user {user_id}")
            
            # Always set up watch for the new integration
            success = await self.setup_watch_for_new_integration(db, user_id)
            
            if success:
                logger.info(f"Successfully handled integration change for user {user_id}")
                return True
            else:
                logger.error(f"Failed to handle integration change for user {user_id}")
                return False
                
        except Exception as e:
            logger.error(f"Error handling integration change for user {user_id}: {e}")
            return False
    
    async def _check_watch_needs_renewal(self, db: Session, user_id: str) -> bool:
        """
        Check if Gmail watch needs renewal for a user
        
        Args:
            db: Database session
            user_id: User ID to check
            
        Returns:
            True if watch needs renewal, False otherwise
        """
        try:
            # Get the user's integration record
            integration = db.query(IntegrationAccount).filter(
                IntegrationAccount.user_id == user_id,
                IntegrationAccount.provider == 'google'
            ).first()
            
            if not integration:
                return False
            
            # Check if we have a recent watch setup timestamp
            # For now, we'll use the integration's updated_at as a proxy
            # In a more sophisticated implementation, you could add a dedicated field
            if integration.updated_at:
                time_since_update = datetime.utcnow() - integration.updated_at.replace(tzinfo=None)
                renewal_threshold = timedelta(days=self.watch_duration_days - self.renewal_buffer_days)
                
                if time_since_update > renewal_threshold:
                    logger.debug(f"Watch needs renewal for user {user_id} (last update: {integration.updated_at})")
                    return True
                else:
                    logger.debug(f"Watch is current for user {user_id} (last update: {integration.updated_at})")
                    return False
            else:
                # No timestamp, assume needs setup
                logger.debug(f"No watch timestamp for user {user_id}, needs setup")
                return True
                
        except Exception as e:
            logger.error(f"Error checking watch renewal for user {user_id}: {e}")
            return True  # Err on the side of renewal
    
    async def _update_watch_timestamp(self, db: Session, user_id: str):
        """
        Update the watch setup timestamp for a user
        
        Args:
            db: Database session
            user_id: User ID
        """
        try:
            # Update the integration's updated_at timestamp
            integration = db.query(IntegrationAccount).filter(
                IntegrationAccount.user_id == user_id,
                IntegrationAccount.provider == 'google'
            ).first()
            
            if integration:
                integration.updated_at = datetime.utcnow()
                db.commit()
                logger.debug(f"Updated watch timestamp for user {user_id}")
            
        except Exception as e:
            logger.error(f"Failed to update watch timestamp for user {user_id}: {e}")

# Create service instance
gmail_watch_manager = GmailWatchManager()