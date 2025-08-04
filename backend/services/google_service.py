"""
Google API service for Drive and Gmail operations.
Handles authenticated requests using stored OAuth tokens.
"""
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta, timezone
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
        if account.expires_at and datetime.now(timezone.utc) > account.expires_at:
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
                
                account.updated_at = datetime.now(timezone.utc)
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

    def get_gmail_attachments(self, db: Session, user_id: str, query: str = "", 
                             mime_types: list = None, limit: int = 50) -> list:
        """
        Get Gmail attachments matching the specified criteria
        """
        gmail_service = self.get_gmail_service(db, user_id)
        if not gmail_service:
            return []

        try:
            # Search for messages with attachments
            messages_result = gmail_service.users().messages().list(
                userId='me',
                q=query,
                maxResults=limit
            ).execute()
            
            messages = messages_result.get('messages', [])
            attachments = []
            
            for message in messages:
                try:
                    # Get message details
                    msg = gmail_service.users().messages().get(
                        userId='me',
                        id=message['id']
                    ).execute()
                    
                    # Extract message metadata
                    headers = msg['payload'].get('headers', [])
                    subject = next((h['value'] for h in headers if h['name'] == 'Subject'), 'No Subject')
                    from_email = next((h['value'] for h in headers if h['name'] == 'From'), 'Unknown')
                    date = next((h['value'] for h in headers if h['name'] == 'Date'), 'Unknown')
                    
                    # Process message parts to find attachments
                    def process_parts(parts, message_id, subject, from_email, date):
                        found_attachments = []
                        for part in parts:
                            if part.get('parts'):
                                # Recursive for nested parts
                                found_attachments.extend(
                                    process_parts(part['parts'], message_id, subject, from_email, date)
                                )
                            elif part.get('body', {}).get('attachmentId'):
                                # This is an attachment
                                filename = part.get('filename', 'unknown')
                                mime_type = part.get('mimeType', 'application/octet-stream')
                                size = part.get('body', {}).get('size', 0)
                                
                                # Filter by MIME type if specified
                                if mime_types and mime_type not in mime_types:
                                    continue
                                
                                found_attachments.append({
                                    'messageId': message_id,
                                    'attachmentId': part['body']['attachmentId'],
                                    'filename': filename,
                                    'mimeType': mime_type,
                                    'size': size,
                                    'subject': subject,
                                    'from': from_email,
                                    'date': date
                                })
                        return found_attachments
                    
                    # Process message payload
                    if msg['payload'].get('parts'):
                        attachments.extend(
                            process_parts(msg['payload']['parts'], message['id'], subject, from_email, date)
                        )
                    elif msg['payload'].get('body', {}).get('attachmentId'):
                        # Single attachment message
                        filename = msg['payload'].get('filename', 'unknown')
                        mime_type = msg['payload'].get('mimeType', 'application/octet-stream')
                        size = msg['payload'].get('body', {}).get('size', 0)
                        
                        if not mime_types or mime_type in mime_types:
                            attachments.append({
                                'messageId': message['id'],
                                'attachmentId': msg['payload']['body']['attachmentId'],
                                'filename': filename,
                                'mimeType': mime_type,
                                'size': size,
                                'subject': subject,
                                'from': from_email,
                                'date': date
                            })
                
                except Exception as e:
                    logger.warning(f"Failed to process message {message['id']}: {e}")
                    continue
            
            logger.info(f"Found {len(attachments)} Gmail attachments for user {user_id}")
            return attachments
            
        except Exception as e:
            logger.error(f"Failed to get Gmail attachments: {e}")
            return []

    def list_drive_folder_contents(self, db: Session, user_id: str, folder_id: str) -> list:
        """
        List contents of a Google Drive folder
        """
        try:
            # Get Drive service using existing pattern
            drive_service = self.get_drive_service(db, user_id)
            if not drive_service:
                raise ValueError("Could not get Drive service")
            
            # List files in the folder
            results = drive_service.files().list(
                q=f"'{folder_id}' in parents and trashed=false",
                fields="files(id,name,mimeType,size,parents)",
                pageSize=1000  # Get up to 1000 items per folder
            ).execute()
            
            items = results.get('files', [])
            
            logger.info(f"Found {len(items)} items in Drive folder {folder_id}")
            return items
            
        except Exception as e:
            logger.error(f"Failed to list Drive folder contents: {e}")
            return []

    def upload_to_drive(
        self, 
        db: Session, 
        user_id: str, 
        file_content: bytes, 
        filename: str, 
        mime_type: str,
        folder_id: str = None
    ) -> Optional[Dict[str, Any]]:
        """
        Upload a file to Google Drive and return file metadata
        
        Args:
            db: Database session
            user_id: User ID
            file_content: File content as bytes
            filename: Name for the file in Drive
            mime_type: MIME type of the file
            folder_id: Optional parent folder ID (defaults to root)
            
        Returns:
            Dict with file metadata including 'id', 'name', 'webViewLink' or None if failed
        """
        drive_service = self.get_drive_service(db, user_id)
        if not drive_service:
            return None
        
        try:
            from googleapiclient.http import MediaIoBaseUpload
            from io import BytesIO
            
            # Prepare file metadata
            file_metadata = {
                'name': filename
            }
            
            # Set parent folder if specified
            if folder_id:
                file_metadata['parents'] = [folder_id]
            
            # Create media upload object
            media = MediaIoBaseUpload(
                BytesIO(file_content),
                mimetype=mime_type,
                resumable=True
            )
            
            # Upload the file
            file = drive_service.files().create(
                body=file_metadata,
                media_body=media,
                fields='id,name,webViewLink,webContentLink'
            ).execute()
            
            logger.info(f"Successfully uploaded file to Drive: {file.get('id')} - {filename}")
            return file
            
        except Exception as e:
            logger.error(f"Failed to upload file to Drive for user {user_id}: {e}")
            return None

# Singleton instance
google_service = GoogleService()