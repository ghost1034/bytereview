"""
Integration routes for OAuth providers (Google, Microsoft, etc.)
"""
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.orm import Session
from typing import Optional
import os
import secrets
import logging
from datetime import datetime, timedelta, timezone
import urllib.parse

from core.database import get_db
from dependencies.auth import get_current_user_id
from models.db_models import User, IntegrationAccount
from services.encryption_service import encryption_service
from services.google_service import google_service

# Google OAuth imports
try:
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token
    import google.auth.transport.requests
    from googleapiclient.discovery import build
    GOOGLE_AVAILABLE = True
except ImportError:
    GOOGLE_AVAILABLE = False
    logging.warning("Google client libraries not installed. Google integration disabled.")

router = APIRouter(prefix="/integrations", tags=["integrations"])
logger = logging.getLogger(__name__)

# Google OAuth configuration - loaded dynamically to ensure .env is loaded first
def get_google_config():
    return {
        'client_id': os.getenv("GOOGLE_CLIENT_ID"),
        'client_secret': os.getenv("GOOGLE_CLIENT_SECRET"),
        'redirect_uri': os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:3000/integrations/google/callback")
    }

# OAuth scopes for different services
# Production release: Drive-only scopes
# - drive.readonly: Read-only access to all files (for importing)
# - drive.file: Read/write access only to files created by this app (for exporting)
GOOGLE_SCOPES = {
    "drive": "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email",
    "gmail": "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email",
    "combined": "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email"
}

@router.get("/google/auth-url")
async def get_google_auth_url(
    scopes: str = "drive",
    current_user_id: str = Depends(get_current_user_id)
):
    """
    Generate Google OAuth authorization URL (Drive only for this release)
    """
    if not GOOGLE_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google client libraries not installed. Please install google-auth and google-api-python-client."
        )
    
    config = get_google_config()
    
    if not config['client_id'] or not config['client_secret']:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google OAuth not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables."
        )
    
    # # Only allow Drive for production release
    # if scopes != "drive":
    #     raise HTTPException(
    #         status_code=status.HTTP_400_BAD_REQUEST,
    #         detail="Only 'drive' scopes are supported in this release"
    #     )
    
    # Validate scopes
    if scopes not in GOOGLE_SCOPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid scopes. Must be one of: {list(GOOGLE_SCOPES.keys())}"
        )
    
    # Generate state parameter for CSRF protection
    state = secrets.token_urlsafe(32)
    
    # Store state in session or cache (for now, we'll include user_id in state)
    # In production, you'd want to store this in Redis with expiration
    state_data = f"{current_user_id}:{state}"
    
    # Build authorization URL
    auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={config['client_id']}&"
        f"redirect_uri={urllib.parse.quote(config['redirect_uri'])}&"
        f"scope={urllib.parse.quote(GOOGLE_SCOPES[scopes])}&"
        "response_type=code&"
        "access_type=offline&"
        "prompt=consent&"
        f"state={state_data}"
    )
    
    return {
        "auth_url": auth_url,
        "state": state_data
    }

@router.post("/google/exchange")
async def exchange_google_code(
    request: Request,
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_current_user_id)
):
    """
    Exchange authorization code for tokens
    """
    if not GOOGLE_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google client libraries not installed. Please install google-auth and google-api-python-client."
        )
    
    config = get_google_config()
    
    if not config['client_id'] or not config['client_secret']:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google OAuth not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables."
        )
    
    body = await request.json()
    code = body.get("code")
    state = body.get("state")
    
    if not code or not state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing code or state parameter"
        )
    
    # Validate state parameter
    try:
        user_id, _ = state.split(":", 1)
        if user_id != current_user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid state parameter"
            )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid state parameter format"
        )
    
    # Exchange code for tokens
    try:
        import requests
        
        token_data = {
            "client_id": config['client_id'],
            "client_secret": config['client_secret'],
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": config['redirect_uri']
        }
        
        response = requests.post(
            "https://oauth2.googleapis.com/token",
            data=token_data
        )
        response.raise_for_status()
        tokens = response.json()
        
        # Get user info to verify the token
        user_info_response = requests.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {tokens['access_token']}"}
        )
        user_info_response.raise_for_status()
        user_info = user_info_response.json()
        
        # Parse scopes
        scopes = tokens.get("scope", "").split()
        
        # Calculate expiry time
        expires_at = None
        if "expires_in" in tokens:
            expires_at = datetime.now(timezone.utc) + timedelta(seconds=tokens["expires_in"])
        
        # Check if integration account already exists
        existing_account = db.query(IntegrationAccount).filter(
            IntegrationAccount.user_id == current_user_id,
            IntegrationAccount.provider == "google"
        ).first()
        
        if existing_account:
            # Update existing account
            existing_account.scopes = scopes
            existing_account.set_access_token(tokens["access_token"])
            if "refresh_token" in tokens:
                existing_account.set_refresh_token(tokens["refresh_token"])
            existing_account.expires_at = expires_at
            existing_account.updated_at = datetime.now(timezone.utc)
            account = existing_account
        else:
            # Create new integration account
            account = IntegrationAccount(
                user_id=current_user_id,
                provider="google",
                scopes=scopes,
                expires_at=expires_at
            )
            account.set_access_token(tokens["access_token"])
            if "refresh_token" in tokens:
                account.set_refresh_token(tokens["refresh_token"])
            
            db.add(account)
        
        db.commit()
        db.refresh(account)
        
        logger.info(f"Google OAuth successful for user {current_user_id}")
        
        # Automatically set up Gmail watch if Gmail scopes are present
        gmail_watch_setup = False
        if any("gmail" in scope for scope in scopes):
            try:
                from services.gmail_watch_manager import gmail_watch_manager
                gmail_watch_setup = await gmail_watch_manager.setup_watch_for_new_integration(db, current_user_id)
                if gmail_watch_setup:
                    logger.info(f"Gmail watch automatically set up for user {current_user_id}")
                else:
                    logger.warning(f"Failed to automatically set up Gmail watch for user {current_user_id}")
            except Exception as e:
                logger.error(f"Error setting up Gmail watch for user {current_user_id}: {e}")
        
        return {
            "success": True,
            "provider": "google",
            "scopes": scopes,
            "user_email": user_info.get("email"),
            "expires_at": expires_at.isoformat() if expires_at else None,
            "gmail_watch_setup": gmail_watch_setup
        }
        
    except requests.RequestException as e:
        logger.error(f"Google OAuth token exchange failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to exchange authorization code"
        )
    except Exception as e:
        logger.error(f"Unexpected error during Google OAuth: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during OAuth"
        )

@router.get("/google/status")
async def get_google_integration_status(
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_current_user_id)
):
    """
    Get current Google integration status for the user
    """
    account = db.query(IntegrationAccount).filter(
        IntegrationAccount.user_id == current_user_id,
        IntegrationAccount.provider == "google"
    ).first()
    
    if not account:
        return {
            "connected": False,
            "scopes": [],
            "expires_at": None
        }
    
    # Check if token is expired
    is_expired = False
    if account.expires_at:
        is_expired = datetime.now(timezone.utc) > account.expires_at
    
    # Check Drive access capabilities with limited scopes
    has_drive_readonly = google_service.has_drive_readonly_access(db, current_user_id)
    has_drive_file = google_service.has_drive_file_access(db, current_user_id)
    has_valid_drive_access = google_service.validate_drive_access(db, current_user_id)
    
    return {
        "connected": True,
        "scopes": account.scopes,
        "expires_at": account.expires_at.isoformat() if account.expires_at else None,
        "is_expired": is_expired,
        "drive_capabilities": {
            "can_import": has_drive_readonly,
            "can_export": has_drive_file,
            "has_limited_access": has_valid_drive_access
        }
    }

@router.delete("/google/disconnect")
async def disconnect_google_integration(
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_current_user_id)
):
    """
    Disconnect Google integration for the user
    """
    account = db.query(IntegrationAccount).filter(
        IntegrationAccount.user_id == current_user_id,
        IntegrationAccount.provider == "google"
    ).first()
    
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Google integration not found"
        )
    
    # Revoke the token with Google (optional but recommended)
    try:
        access_token = account.get_access_token()
        if access_token:
            import requests
            requests.post(
                f"https://oauth2.googleapis.com/revoke?token={access_token}"
            )
    except Exception as e:
        logger.warning(f"Failed to revoke Google token: {e}")
    
    # Delete the integration account
    db.delete(account)
    db.commit()
    
    logger.info(f"Google integration disconnected for user {current_user_id}")
    
    return {"success": True, "message": "Google integration disconnected"}

@router.post("/google/refresh")
async def refresh_google_token(
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_current_user_id)
):
    """
    Refresh Google access token using refresh token
    """
    if not GOOGLE_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google client libraries not installed. Please install google-auth and google-api-python-client."
        )
    
    config = get_google_config()
    
    if not config['client_id'] or not config['client_secret']:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google OAuth not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables."
        )
    
    account = db.query(IntegrationAccount).filter(
        IntegrationAccount.user_id == current_user_id,
        IntegrationAccount.provider == "google"
    ).first()
    
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Google integration not found"
        )
    
    refresh_token = account.get_refresh_token()
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No refresh token available. Please re-authorize."
        )
    
    try:
        import requests
        
        token_data = {
            "client_id": config['client_id'],
            "client_secret": config['client_secret'],
            "refresh_token": refresh_token,
            "grant_type": "refresh_token"
        }
        
        response = requests.post(
            "https://oauth2.googleapis.com/token",
            data=token_data
        )
        response.raise_for_status()
        tokens = response.json()
        
        # Update the access token
        account.set_access_token(tokens["access_token"])
        
        # Update expiry time
        if "expires_in" in tokens:
            account.expires_at = datetime.now(timezone.utc) + timedelta(seconds=tokens["expires_in"])
        
        # Update refresh token if provided (Google sometimes issues new ones)
        if "refresh_token" in tokens:
            account.set_refresh_token(tokens["refresh_token"])
        
        account.updated_at = datetime.now(timezone.utc)
        db.commit()
        
        logger.info(f"Google token refreshed for user {current_user_id}")
        
        return {
            "success": True,
            "expires_at": account.expires_at.isoformat() if account.expires_at else None
        }
        
    except requests.RequestException as e:
        logger.error(f"Google token refresh failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to refresh token. Please re-authorize."
        )
    except Exception as e:
        logger.error(f"Unexpected error during token refresh: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during token refresh"
        )

@router.get("/google/picker-token")
async def get_google_picker_token(
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_current_user_id)
):
    """
    Get Google access token for use with Google Picker API
    """
    account = db.query(IntegrationAccount).filter(
        IntegrationAccount.user_id == current_user_id,
        IntegrationAccount.provider == "google"
    ).first()
    
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Google integration not found"
        )
    
    access_token = account.get_access_token()
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No access token available. Please re-authorize."
        )
    
    # Check if token is expired and refresh if needed
    if account.expires_at and datetime.now(timezone.utc) > account.expires_at:
        refresh_token = account.get_refresh_token()
        if not refresh_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Token expired and no refresh token available. Please re-authorize."
            )
        
        try:
            config = get_google_config()
            import requests
            
            token_data = {
                "client_id": config['client_id'],
                "client_secret": config['client_secret'],
                "refresh_token": refresh_token,
                "grant_type": "refresh_token"
            }
            
            response = requests.post(
                "https://oauth2.googleapis.com/token",
                data=token_data
            )
            response.raise_for_status()
            tokens = response.json()
            
            # Update the access token
            account.set_access_token(tokens["access_token"])
            
            # Update expiry time
            if "expires_in" in tokens:
                account.expires_at = datetime.now(timezone.utc) + timedelta(seconds=tokens["expires_in"])
            
            # Update refresh token if provided
            if "refresh_token" in tokens:
                account.set_refresh_token(tokens["refresh_token"])
            
            account.updated_at = datetime.now(timezone.utc)
            db.commit()
            
            access_token = tokens["access_token"]
            logger.info(f"Refreshed Google token for picker use for user {current_user_id}")
            
        except requests.RequestException as e:
            logger.error(f"Failed to refresh token for picker: {e}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to refresh token. Please re-authorize."
            )
    
    return {
        "access_token": access_token
    }

@router.get("/gmail/attachments")
async def get_gmail_attachments(
    query: str = Query(default="has:attachment", description="Gmail search query"),
    mimeTypes: str = Query(default="", description="Comma-separated MIME types to filter"),
    limit: int = Query(default=50, max=100, description="Maximum number of attachments to return"),
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_current_user_id)
):
    """
    Get Gmail attachments matching the specified criteria
    """
    account = db.query(IntegrationAccount).filter(
        IntegrationAccount.user_id == current_user_id,
        IntegrationAccount.provider == "google"
    ).first()
    
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Google integration not found"
        )
    
    try:
        # Parse MIME types
        mime_type_list = [mt.strip() for mt in mimeTypes.split(',') if mt.strip()] if mimeTypes else []
        
        # Get Gmail attachments using the Google service
        attachments = google_service.get_gmail_attachments(
            db, current_user_id, query, mime_type_list, limit
        )
        
        return {
            "attachments": attachments,
            "total": len(attachments)
        }
        
    except Exception as e:
        logger.error(f"Failed to get Gmail attachments for user {current_user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve Gmail attachments"
        )