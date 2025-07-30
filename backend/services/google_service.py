"""
Google API service for Drive and Gmail operations.
Handles authenticated requests using stored OAuth tokens.
"""
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from models.db_models import IntegrationAccount
from services.encryption_service import encryption_service

try:
    from googleapiclient.discovery import build
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    import google.auth.exceptions
    GOOGLE_AVAILABLE = True
except ImportError:
    GOOGLE_AVAILABLE = False

logger = logging.getLogger(__name__)

class GoogleService:
    """Service for interacting with Google APIs using stored OAuth tokens"""
    
    def __init__(self):
        if not GOOGLE_AVAILABLE:
            logger.warning("Google client libraries not available")
    
    def _get_credentials(self, db: Session, user_id: str) -> Optional[Credentials]:
        """Get Google credentials for a user"""
        if not GOOGLE_AVAILABLE:
            return None
            
        account = db.query(IntegrationAccount).filter(
            IntegrationAccount.user_id == user_id,
            IntegrationAccount.provider == "google"
        ).first()
        
        if not account:
            logger.warning(f"No Google integration found for user {user_id}")
            return None
        
        access_token = account.get_access_token()
        refresh_token = account.get_refresh_token()
        
        if not access_token:
            logger.warning(f"No access token found for user {user_id}")
            return None
        
        # Create credentials object
        creds = Credentials(
            token=access_token,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=None,  # Not needed for API calls
            client_secret=None,  # Not needed for API calls
            scopes=account.scopes
        )
        
        # Check if token needs refresh
        if account.expires_at and datetime.utcnow() > account.expires_at:
            logger.info(f"Token expired for user {user_id}, attempting refresh")
            try:
                creds.refresh(Request())
                
                # Update stored tokens
                account.set_access_token(creds.token)
                if creds.refresh_token:
                    account.set_refresh_token(creds.refresh_token)
                
                # Update expiry
                if creds.expiry:
                    account.expires_at = creds.expiry
                
                account.updated_at = datetime.utcnow()
                db.commit()
                
                logger.info(f"Token refreshed successfully for user {user_id}")
                
            except google.auth.exceptions.RefreshError as e:
                logger.error(f"Failed to refresh token for user {user_id}: {e}")
                return None
        
        return creds
    
    def get_drive_service(self, db: Session, user_id: str):
        """Get authenticated Google Drive service"""
        if not GOOGLE_AVAILABLE:
            raise RuntimeError("Google client libraries not available")
            
        creds = self._get_credentials(db, user_id)
        if not creds:
            return None
        
        return build('drive', 'v3', credentials=creds)
    
    def get_gmail_service(self, db: Session, user_id: str):
        """Get authenticated Gmail service"""
        if not GOOGLE_AVAILABLE:
            raise RuntimeError("Google client libraries not available")
            
        creds = self._get_credentials(db, user_id)
        if not creds:
            return None
        
        return build('gmail', 'v1', credentials=creds)
    
    def list_drive_files(
        self, 
        db: Session, 
        user_id: str, 
        query: str = None,
        page_size: int = 100,
        page_token: str = None
    ) -> Optional[Dict[str, Any]]:
        """List files from Google Drive"""
        drive_service = self.get_drive_service(db, user_id)
        if not drive_service:
            return None
        
        try:
            # Build query parameters
            params = {
                'pageSize': page_size,
                'fields': 'nextPageToken, files(id, name, mimeType, size, parents, createdTime, modifiedTime)'
            }
            
            if query:
                params['q'] = query
            
            if page_token:
                params['pageToken'] = page_token
            
            # Execute request
            results = drive_service.files().list(**params).execute()
            return results
            
        except Exception as e:
            logger.error(f"Failed to list Drive files for user {user_id}: {e}")
            return None
    
    def get_drive_file_metadata(
        self, 
        db: Session, 
        user_id: str, 
        file_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get metadata for a specific Drive file"""
        drive_service = self.get_drive_service(db, user_id)
        if not drive_service:
            return None
        
        try:
            file_metadata = drive_service.files().get(
                fileId=file_id,
                fields='id, name, mimeType, size, parents, createdTime, modifiedTime, webViewLink'
            ).execute()
            return file_metadata
            
        except Exception as e:
            logger.error(f"Failed to get Drive file metadata for user {user_id}, file {file_id}: {e}")
            return None
    
    def download_drive_file(
        self, 
        db: Session, 
        user_id: str, 
        file_id: str
    ) -> Optional[bytes]:
        """Download a file from Google Drive"""
        drive_service = self.get_drive_service(db, user_id)
        if not drive_service:
            return None
        
        try:
            # Get file content
            request = drive_service.files().get_media(fileId=file_id)
            file_content = request.execute()
            return file_content
            
        except Exception as e:
            logger.error(f"Failed to download Drive file for user {user_id}, file {file_id}: {e}")
            return None
    
    def list_gmail_messages(
        self,
        db: Session,
        user_id: str,
        query: str = "has:attachment",
        max_results: int = 100,
        page_token: str = None
    ) -> Optional[Dict[str, Any]]:
        """List Gmail messages matching query"""
        gmail_service = self.get_gmail_service(db, user_id)
        if not gmail_service:
            return None
        
        try:
            params = {
                'userId': 'me',
                'q': query,
                'maxResults': max_results
            }
            
            if page_token:
                params['pageToken'] = page_token
            
            results = gmail_service.users().messages().list(**params).execute()
            return results
            
        except Exception as e:
            logger.error(f"Failed to list Gmail messages for user {user_id}: {e}")
            return None
    
    def get_gmail_message(
        self,
        db: Session,
        user_id: str,
        message_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get a specific Gmail message with attachments"""
        gmail_service = self.get_gmail_service(db, user_id)
        if not gmail_service:
            return None
        
        try:
            message = gmail_service.users().messages().get(
                userId='me',
                id=message_id,
                format='full'
            ).execute()
            return message
            
        except Exception as e:
            logger.error(f"Failed to get Gmail message for user {user_id}, message {message_id}: {e}")
            return None
    
    def download_gmail_attachment(
        self,
        db: Session,
        user_id: str,
        message_id: str,
        attachment_id: str
    ) -> Optional[bytes]:
        """Download a Gmail attachment"""
        gmail_service = self.get_gmail_service(db, user_id)
        if not gmail_service:
            return None
        
        try:
            attachment = gmail_service.users().messages().attachments().get(
                userId='me',
                messageId=message_id,
                id=attachment_id
            ).execute()
            
            # Decode base64 data
            import base64
            file_data = base64.urlsafe_b64decode(attachment['data'])
            return file_data
            
        except Exception as e:
            logger.error(f"Failed to download Gmail attachment for user {user_id}, message {message_id}, attachment {attachment_id}: {e}")
            return None

# Singleton instance
google_service = GoogleService()