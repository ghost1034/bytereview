"""
Authentication dependencies - centralized auth logic for all routes
"""
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from core.firebase_config import firebase_config
from typing import Dict
import logging

logger = logging.getLogger(__name__)

security = HTTPBearer()

async def verify_firebase_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Dict:
    """
    Centralized Firebase token verification dependency
    Can be used by any route that needs authentication
    """
    if not credentials:
        logger.error("No authorization header provided")
        raise HTTPException(status_code=401, detail="Authorization header required")
    
    try:
        logger.info(f"Verifying token: {credentials.credentials[:20]}...")
        # Verify the ID token using centralized Firebase config
        decoded_token = firebase_config.auth.verify_id_token(credentials.credentials)
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