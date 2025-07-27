"""
Authentication dependencies - Firebase token verification only
"""
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from firebase_admin import auth as firebase_auth, credentials, initialize_app
from typing import Dict
import logging
import os

logger = logging.getLogger(__name__)

# Initialize Firebase Admin SDK
def init_firebase():
    """Initialize Firebase Admin SDK"""
    try:
        # Check if already initialized
        import firebase_admin
        if not firebase_admin._apps:
            service_account_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
            if service_account_path and os.path.exists(service_account_path):
                cred = credentials.Certificate(service_account_path)
                initialize_app(cred)
                logger.info("Firebase initialized with service account")
            else:
                # Use default credentials for development
                initialize_app()
                logger.info("Firebase initialized with default credentials")
    except Exception as e:
        logger.warning(f"Firebase initialization failed: {e}")
        raise

# Initialize on import
init_firebase()

security = HTTPBearer()

async def verify_firebase_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Dict:
    """
    Firebase token verification dependency
    """
    if not credentials:
        logger.error("No authorization header provided")
        raise HTTPException(status_code=401, detail="Authorization header required")
    
    try:
        logger.info(f"Verifying token: {credentials.credentials[:20]}...")
        # Verify the ID token using Firebase Admin SDK
        decoded_token = firebase_auth.verify_id_token(credentials.credentials)
        logger.info(f"Token verified for user: {decoded_token.get('uid', 'unknown')}")
        return decoded_token
    except Exception as e:
        logger.error(f"Token verification failed: {e}")
        logger.error(f"Token was: {credentials.credentials[:50]}...")
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")

async def get_current_user_id(token_data: Dict = Depends(verify_firebase_token)) -> str:
    """
    Extract user ID from verified token
    Convenience dependency for routes that only need the user ID
    """
    return token_data["uid"]

async def get_current_user_email(token_data: Dict = Depends(verify_firebase_token)) -> str:
    """
    Extract user email from verified token
    Convenience dependency for routes that only need the email
    """
    email = token_data.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="User email not found in token")
    return email

async def verify_token_string(token: str) -> str:
    """
    Verify a raw Firebase token string and return user ID
    Used for SSE authentication via query parameter
    """
    try:
        logger.info(f"Attempting to verify token: {token[:20]}...")
        decoded_token = firebase_auth.verify_id_token(token)
        user_id = decoded_token.get('uid')
        if not user_id:
            logger.error("User ID not found in decoded token")
            raise HTTPException(status_code=401, detail="User ID not found in token")
        logger.info(f"Token verified successfully for user: {user_id}")
        return user_id
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        logger.error(f"Token verification failed with exception: {type(e).__name__}: {e}")
        raise HTTPException(status_code=401, detail=f"Invalid or expired token: {str(e)}")