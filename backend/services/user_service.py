"""
User service - handles all user data operations with Firestore
Clean separation: no authentication logic, only data operations
"""
from models.user import UserCreate, UserUpdate, UserResponse
from core.firebase_config import firebase_config
from datetime import datetime
from typing import Optional
import logging

logger = logging.getLogger(__name__)

class UserService:
    def __init__(self):
        """Initialize with centralized Firebase config"""
        try:
            self.db = firebase_config.firestore
            self.users_collection = self.db.collection('users') if self.db else None
            if not self.users_collection:
                logger.warning("Firestore not available, using mock mode")
        except Exception as e:
            logger.warning(f"Firestore client creation failed: {e}. Using mock mode.")
            self.db = None
            self.users_collection = None

    async def create_user(self, user_data: UserCreate) -> UserResponse:
        """Create a new user in Firestore"""
        if not self.users_collection:
            # Mock mode - return user data without saving
            logger.warning("Firestore not available, returning mock user data")
            user_doc = {
                'uid': user_data.uid,
                'email': user_data.email,
                'display_name': user_data.display_name,
                'photo_url': user_data.photo_url,
                'created_at': datetime.utcnow(),
                'updated_at': datetime.utcnow(),
                'stripe_customer_id': None,
                'subscription_status': 'free',
                'pages_used': 0,
                'pages_limit': 10
            }
            return UserResponse(**user_doc)
            
        try:
            user_doc = {
                'uid': user_data.uid,
                'email': user_data.email,
                'display_name': user_data.display_name,
                'photo_url': user_data.photo_url,
                'created_at': datetime.utcnow(),
                'updated_at': datetime.utcnow(),
                'stripe_customer_id': None,
                'subscription_status': 'free',
                'pages_used': 0,
                'pages_limit': 10
            }
            
            # Use UID as document ID
            self.users_collection.document(user_data.uid).set(user_doc)
            logger.info(f"Created user {user_data.uid} in Firestore")
            
            return UserResponse(**user_doc)
        except Exception as e:
            logger.error(f"Error creating user {user_data.uid}: {str(e)}")
            raise

    async def get_user(self, uid: str) -> Optional[UserResponse]:
        """Get user by UID"""
        if not self.users_collection:
            logger.warning("Firestore not available, returning None")
            return None
            
        try:
            doc = self.users_collection.document(uid).get()
            if doc.exists:
                user_data = doc.to_dict()
                return UserResponse(**user_data)
            return None
        except Exception as e:
            logger.error(f"Error getting user {uid}: {str(e)}")
            raise

    async def update_user(self, uid: str, user_update: UserUpdate) -> Optional[UserResponse]:
        """Update user information"""
        try:
            doc_ref = self.users_collection.document(uid)
            doc = doc_ref.get()
            
            if not doc.exists:
                return None
            
            update_data = {
                'updated_at': datetime.utcnow()
            }
            
            if user_update.display_name is not None:
                update_data['display_name'] = user_update.display_name
            if user_update.photo_url is not None:
                update_data['photo_url'] = user_update.photo_url
            
            doc_ref.update(update_data)
            
            # Get updated document
            updated_doc = doc_ref.get()
            return UserResponse(**updated_doc.to_dict())
        except Exception as e:
            logger.error(f"Error updating user {uid}: {str(e)}")
            raise

    async def get_or_create_user(self, uid: str, email: str, display_name: Optional[str] = None, photo_url: Optional[str] = None) -> UserResponse:
        """Get existing user or create new one"""
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

    async def update_stripe_customer(self, uid: str, stripe_customer_id: str) -> Optional[UserResponse]:
        """Update user's Stripe customer ID"""
        try:
            doc_ref = self.users_collection.document(uid)
            doc_ref.update({
                'stripe_customer_id': stripe_customer_id,
                'updated_at': datetime.utcnow()
            })
            
            updated_doc = doc_ref.get()
            return UserResponse(**updated_doc.to_dict())
        except Exception as e:
            logger.error(f"Error updating Stripe customer for user {uid}: {str(e)}")
            raise

    async def update_subscription_status(self, uid: str, status: str, pages_limit: int = None) -> Optional[UserResponse]:
        """Update user's subscription status"""
        try:
            doc_ref = self.users_collection.document(uid)
            update_data = {
                'subscription_status': status,
                'updated_at': datetime.utcnow()
            }
            
            if pages_limit is not None:
                update_data['pages_limit'] = pages_limit
            
            doc_ref.update(update_data)
            
            updated_doc = doc_ref.get()
            return UserResponse(**updated_doc.to_dict())
        except Exception as e:
            logger.error(f"Error updating subscription for user {uid}: {str(e)}")
            raise

    async def increment_pages_used(self, uid: str, pages: int = 1) -> Optional[UserResponse]:
        """Increment user's pages used count"""
        try:
            doc_ref = self.users_collection.document(uid)
            doc = doc_ref.get()
            
            if not doc.exists:
                return None
            
            current_data = doc.to_dict()
            new_pages_used = current_data.get('pages_used', 0) + pages
            
            doc_ref.update({
                'pages_used': new_pages_used,
                'updated_at': datetime.utcnow()
            })
            
            updated_doc = doc_ref.get()
            return UserResponse(**updated_doc.to_dict())
        except Exception as e:
            logger.error(f"Error incrementing pages for user {uid}: {str(e)}")
            raise