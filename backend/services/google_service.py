"""
Google API service for Drive and Gmail operations.
Handles authenticated requests using stored OAuth tokens.
"""
import logging
import os
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
    
    # Required scopes for OAuth-friendly Drive access
    REQUIRED_DRIVE_SCOPES = [
        'https://www.googleapis.com/auth/drive.file',      # For user-selected files only
        'https://www.googleapis.com/auth/userinfo.email'
    ]
    
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
    
    def validate_drive_access(self, db: Session, user_id: str) -> bool:
        """Validate that user has the required limited Drive scopes"""
        if not GOOGLE_AVAILABLE:
            return False
            
        account = db.query(IntegrationAccount).filter(
            IntegrationAccount.user_id == user_id,
            IntegrationAccount.provider == "google"
        ).first()
        
        if not account or not account.scopes:
            return False
        
        user_scopes = account.scopes
        
        # Check if user has the required limited scopes
        for required_scope in self.REQUIRED_DRIVE_SCOPES:
            if required_scope not in user_scopes:
                logger.warning(f"User {user_id} missing required scope: {required_scope}")
                return False
        
        return True
    
    def has_drive_access(self, db: Session, user_id: str) -> bool:
        """Check if user has Drive access for user-selected files"""
        if not GOOGLE_AVAILABLE:
            return False
            
        account = db.query(IntegrationAccount).filter(
            IntegrationAccount.user_id == user_id,
            IntegrationAccount.provider == "google"
        ).first()
        
        if not account or not account.scopes:
            return False
        
        return 'https://www.googleapis.com/auth/drive.file' in account.scopes
    
    
    def get_drive_service(self, db: Session, user_id: str):
        """Get authenticated Google Drive service with limited scopes validation"""
        if not GOOGLE_AVAILABLE:
            raise RuntimeError("Google client libraries not available")
        
        # Validate that user has the required limited scopes
        if not self.validate_drive_access(db, user_id):
            logger.warning(f"User {user_id} does not have required limited Drive scopes")
            return None
            
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
                'fields': 'nextPageToken, files(id, name, mimeType, size, parents, createdTime, modifiedTime, driveId)',
                'supportsAllDrives': True,  # Required for Shared Drive files
                'includeItemsFromAllDrives': True  # Include items from all drives in search
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
                fields='id, name, mimeType, size, parents, createdTime, modifiedTime, webViewLink, driveId',
                supportsAllDrives=True  # Required for Shared Drive files
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
            request = drive_service.files().get_media(
                fileId=file_id,
                supportsAllDrives=True  # Required for Shared Drive files
            )
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

    # REMOVED: list_drive_folder_contents() - folder traversal not supported for OAuth compliance

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
                fields='id,name,webViewLink,webContentLink',
                supportsAllDrives=True  # Required for Shared Drive files
            ).execute()
            
            logger.info(f"Successfully uploaded file to Drive: {file.get('id')} - {filename}")
            return file
            
        except Exception as e:
            logger.error(f"Failed to upload file to Drive for user {user_id}: {e}")
            return None
    
    def search_gmail_messages(self, db: Session, user_id: str, query: str) -> List[str]:
        """
        Search Gmail messages using query syntax
        
        Args:
            db: Database session
            user_id: User ID
            query: Gmail search query (e.g., "has:attachment from:example@gmail.com")
            
        Returns:
            List of message IDs matching the query
        """
        gmail_service = self.get_gmail_service(db, user_id)
        if not gmail_service:
            return []
        
        try:
            # Search for messages
            results = gmail_service.users().messages().list(
                userId='me',
                q=query,
                maxResults=100  # Limit to prevent overwhelming the system
            ).execute()
            
            messages = results.get('messages', [])
            message_ids = [msg['id'] for msg in messages]
            
            logger.info(f"Found {len(message_ids)} messages for query: {query}")
            return message_ids
            
        except Exception as e:
            logger.error(f"Failed to search Gmail messages for user {user_id}: {e}")
            return []
    
    def get_gmail_message_attachments(self, db: Session, user_id: str, message_id: str) -> List[Dict[str, Any]]:
        """
        Get attachments from a specific Gmail message
        
        Args:
            db: Database session
            user_id: User ID
            message_id: Gmail message ID
            
        Returns:
            List of attachment metadata dictionaries
        """
        gmail_service = self.get_gmail_service(db, user_id)
        if not gmail_service:
            return []
        
        try:
            # Get message details
            message = gmail_service.users().messages().get(
                userId='me',
                id=message_id,
                format='full'
            ).execute()
            
            attachments = []
            
            # Process message parts to find attachments
            def process_parts(parts):
                for part in parts:
                    if part.get('parts'):
                        # Recursive call for nested parts
                        process_parts(part['parts'])
                    elif part.get('body', {}).get('attachmentId'):
                        # This is an attachment
                        filename = part.get('filename', 'unknown')
                        if filename and filename != '':
                            attachments.append({
                                'messageId': message_id,
                                'attachmentId': part['body']['attachmentId'],
                                'filename': filename,
                                'mimeType': part.get('mimeType', 'application/octet-stream'),
                                'size': part.get('body', {}).get('size', 0)
                            })
            
            # Process message payload
            payload = message.get('payload', {})
            if payload.get('parts'):
                process_parts(payload['parts'])
            elif payload.get('body', {}).get('attachmentId'):
                # Single attachment message
                filename = payload.get('filename', 'unknown')
                if filename and filename != '':
                    attachments.append({
                        'messageId': message_id,
                        'attachmentId': payload['body']['attachmentId'],
                        'filename': filename,
                        'mimeType': payload.get('mimeType', 'application/octet-stream'),
                        'size': payload.get('body', {}).get('size', 0)
                    })
            
            logger.info(f"Found {len(attachments)} attachments in message {message_id}")
            return attachments
            
        except Exception as e:
            logger.error(f"Failed to get attachments for message {message_id}: {e}")
            return []
    
    async def import_gmail_attachments(
        self, 
        db: Session, 
        job_id: str, 
        attachments: List[Dict[str, Any]],
        automation_run_id: str = None
    ) -> Dict[str, Any]:
        """
        Import Gmail attachments into a job - creates SourceFiles only
        ExtractionTasks will be created later by run_initializer_worker
        
        Args:
            db: Database session
            job_id: Extraction job ID
            attachments: List of attachment metadata with messageId, attachmentId, filename, etc.
            automation_run_id: Optional automation run ID for tracking
            
        Returns:
            Dict with import results
        """
        try:
            from models.db_models import SourceFile, ExtractionTask, ExtractionJob
            from services.gcs_service import GCSService
            from services.sse_service import sse_manager
            import uuid
            import os
            
            # Get the job to verify it exists
            job = db.query(ExtractionJob).filter(ExtractionJob.id == job_id).first()
            if not job:
                raise ValueError(f"Job {job_id} not found")
            
            user_id = job.user_id
            gmail_service = self.get_gmail_service(db, user_id)
            if not gmail_service:
                raise ValueError("Could not get Gmail service")
            
            # Send import started event
            await sse_manager.send_import_started(job_id, "Gmail", len(attachments))
            
            successful = 0
            ready = 0
            failed = 0
            
            for attachment in attachments:
                try:
                    message_id = attachment.get('messageId')
                    attachment_id = attachment.get('attachmentId')
                    filename = attachment.get('filename', 'unknown')
                    mime_type = attachment.get('mimeType', 'application/octet-stream')
                    
                    if not message_id or not attachment_id:
                        logger.error(f"Missing messageId or attachmentId for attachment {filename}")
                        failed += 1
                        continue
                    
                    logger.info(f"Downloading Gmail attachment: {filename}")
                    
                    # Download attachment from Gmail
                    attachment_data = gmail_service.users().messages().attachments().get(
                        userId='me',
                        messageId=message_id,
                        id=attachment_id
                    ).execute()
                    
                    # Decode the attachment data
                    import base64
                    file_data = base64.urlsafe_b64decode(attachment_data['data'])
                    
                    # Count pages in the file
                    from services.page_counting_service import page_counting_service
                    page_count = page_counting_service.count_pages_from_content(file_data, filename)
                    
                    # Generate unique filename for GCS
                    file_extension = os.path.splitext(filename)[1] if '.' in filename else ''
                    unique_filename = f"{uuid.uuid4()}{file_extension}"
                    gcs_path = f"jobs/{job_id}/gmail_imports/{unique_filename}"
                    
                    # Upload to GCS
                    logger.info(f"Uploading {filename} to GCS: {gcs_path}")
                    gcs_service = GCSService()
                    await gcs_service.upload_file_content(
                        file_content=file_data,
                        gcs_object_name=gcs_path
                    )
                    
                    # GCS upload successful - construct the GCS URL
                    gcs_url = f"gs://{gcs_service.bucket_name}/{gcs_path}"
                    
                    # Create SourceFile record
                    source_file = SourceFile(
                        id=str(uuid.uuid4()),
                        job_id=job_id,
                        original_filename=filename,
                        original_path=filename,  # Just the filename for Gmail (no folder structure)
                        gcs_object_name=gcs_path,  # GCS object name for storage
                        file_type=mime_type,
                        file_size_bytes=len(file_data),
                        page_count=page_count,
                        source_type='gmail',
                        status='uploaded'
                    )
                    db.add(source_file)
                    
                    # Flush to ensure the source file ID is available
                    db.flush()
                    
                    # Handle ZIP files using the existing centralized ZIP detection system
                    from services.job_service import JobService
                    job_service = JobService()
                    is_zip = await job_service._handle_zip_detection(db, source_file, mime_type, filename, automation_run_id)
                    
                    # Send import completed event for individual file
                    await sse_manager.send_import_completed(
                        job_id, 
                        str(source_file.id), 
                        filename, 
                        len(file_data), 
                        source_file.status,  # Use actual status (uploaded or unpacking)
                        source_file.original_path  # Include original path
                    )
                    
                    logger.info(f"Created SourceFile {source_file.id} for {filename}")
                    
                    # Import counted as successful
                    successful += 1
                    
                    # Non-ZIP files are considered ready
                    # ZIP files are not ready until unpacked
                    if not is_zip:
                        ready += 1
                    
                except Exception as e:
                    logger.error(f"Failed to import attachment {filename}: {e}")
                    failed += 1
                    # Failed files are neither successful nor ready
            
            # Update automation run import tracking if this is an automation
            if automation_run_id:
                logger.info(f"Updating automation import tracking for run {automation_run_id}: successful={successful}, failed={failed}, processed={ready}")
                await self._update_automation_import_tracking(
                    db, automation_run_id, 
                    successful=successful, 
                    failed=failed, 
                    processed=ready
                )
            else:
                logger.info(f"No automation_run_id provided, skipping import tracking update")
            
            # Commit all changes
            db.commit()
            
            # Send import batch completed event
            await sse_manager.send_import_batch_completed(job_id, "Gmail", successful, len(attachments))
            
            logger.info(f"Gmail import completed: {successful} successful, {failed} failed, {ready} ready for processing")
            
            return {
                "successful": successful,
                "failed": failed,
                "total": len(attachments)
            }
            
        except Exception as e:
            db.rollback()
            logger.error(f"Gmail import failed for job {job_id}: {e}")
            return {
                "successful": 0,
                "failed": len(attachments),
                "total": len(attachments),
                "error": str(e)
            }
    
    def get_last_processed_history_id(self, db: Session, user_id: str) -> str:
        """
        Get the last processed Gmail history ID for a user
        
        Args:
            db: Database session
            user_id: User ID
            
        Returns:
            Last processed history ID or None if never processed
        """
        try:
            from models.db_models import IntegrationAccount
            
            # Get the user's Gmail integration account
            integration = db.query(IntegrationAccount).filter(
                IntegrationAccount.user_id == user_id,
                IntegrationAccount.provider == 'google'
            ).first()
            
            if integration and integration.last_history_id:
                return integration.last_history_id
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to get last processed history ID for user {user_id}: {e}")
            return None
    
    def update_last_processed_history_id(self, db: Session, user_id: str, history_id: str):
        """
        Update the last processed Gmail history ID for a user
        
        Args:
            db: Database session
            user_id: User ID
            history_id: History ID to store
        """
        try:
            from models.db_models import IntegrationAccount
            
            # Get the user's Gmail integration account
            integration = db.query(IntegrationAccount).filter(
                IntegrationAccount.user_id == user_id,
                IntegrationAccount.provider == 'google'
            ).first()
            
            if integration:
                integration.last_history_id = history_id
                db.commit()
                logger.info(f"Updated last processed history ID to {history_id} for user {user_id}")
            else:
                logger.warning(f"No Google integration account found for user {user_id}")
            
        except Exception as e:
            logger.error(f"Failed to update last processed history ID for user {user_id}: {e}")
    
    def get_messages_since_history(self, db: Session, user_id: str, start_history_id: str) -> List[str]:
        """
        Get new messages since a specific history ID using Gmail history API
        
        Args:
            db: Database session
            user_id: User ID
            start_history_id: Gmail history ID to start from
            
        Returns:
            List of new message IDs
        """
        gmail_service = self.get_gmail_service(db, user_id)
        if not gmail_service:
            return []
        
        try:
            logger.info(f"Getting messages since history ID: {start_history_id}")
            
            # Get history changes since the given history ID
            history_response = gmail_service.users().history().list(
                userId='me',
                startHistoryId=start_history_id,
                historyTypes=['messageAdded']  # Only get added messages
            ).execute()
            
            message_ids = []
            history_records = history_response.get('history', [])
            
            logger.info(f"History API returned {len(history_records)} history records")
            
            for record in history_records:
                messages_added = record.get('messagesAdded', [])
                for message_added in messages_added:
                    message_id = message_added['message']['id']
                    message_ids.append(message_id)
                    logger.info(f"Found new message: {message_id}")
            
            logger.info(f"Found {len(message_ids)} new messages since history {start_history_id}")
            return message_ids
            
        except Exception as e:
            logger.error(f"Failed to get messages since history {start_history_id}: {e}")
            return []
    
    def message_matches_query(self, db: Session, user_id: str, message_id: str, query: str) -> bool:
        """
        Check if a specific message matches a Gmail query
        
        Args:
            db: Database session
            user_id: User ID
            message_id: Gmail message ID to check
            query: Gmail search query
            
        Returns:
            True if message matches query, False otherwise
        """
        gmail_service = self.get_gmail_service(db, user_id)
        if not gmail_service:
            return False
        
        try:
            logger.info(f"Checking if message {message_id} matches query: '{query}'")
            
            # Get the message with full payload to check attachments
            message = gmail_service.users().messages().get(
                userId='me',
                id=message_id,
                format='full'  # Changed to 'full' to get attachment info
            ).execute()
            
            payload = message.get('payload', {})
            logger.info(f"Message {message_id} payload keys: {list(payload.keys())}")
            
            # For now, let's do a simple check based on the query
            # This is a simplified implementation - in production you'd want more sophisticated matching
            
            # Check for "has:attachment" in query
            if 'has:attachment' in query.lower():
                logger.info(f"Checking if message {message_id} has attachments")
                # Check if message has attachments
                has_attachments = self._message_has_attachments(payload)
                logger.info(f"Message {message_id} has attachments: {has_attachments}")
                if not has_attachments:
                    logger.info(f"Message {message_id} does not match query - no attachments")
                    return False
            
            # Check for "filename:" criteria
            if 'filename:' in query.lower():
                filename_criteria = []
                parts = query.lower().split()
                for part in parts:
                    if part.startswith('filename:'):
                        filename_criteria.append(part.split('filename:')[1])
                
                logger.info(f"Checking filename criteria: {filename_criteria}")
                if filename_criteria:
                    has_matching_filename = self._message_has_matching_filename(payload, filename_criteria)
                    logger.info(f"Message {message_id} has matching filename: {has_matching_filename}")
                    if not has_matching_filename:
                        logger.info(f"Message {message_id} does not match query - no matching filename")
                        return False
            
            # Check for "from:" criteria
            if 'from:' in query.lower():
                from_criteria = []
                parts = query.split()
                for part in parts:
                    if part.lower().startswith('from:'):
                        from_criteria.append(part.split('from:')[1])
                
                if from_criteria:
                    headers = message.get('payload', {}).get('headers', [])
                    from_header = next((h['value'] for h in headers if h['name'].lower() == 'from'), '')
                    if not any(criteria.lower() in from_header.lower() for criteria in from_criteria):
                        return False
            
            # Check for "subject:" criteria
            if 'subject:' in query.lower():
                subject_criteria = []
                parts = query.split()
                for part in parts:
                    if part.lower().startswith('subject:'):
                        subject_criteria.append(part.split('subject:')[1])
                
                logger.info(f"Subject criteria extracted: {subject_criteria}")
                if subject_criteria:
                    headers = message.get('payload', {}).get('headers', [])
                    subject_header = next((h['value'] for h in headers if h['name'].lower() == 'subject'), '')
                    logger.info(f"Message subject header: '{subject_header}'")
                    logger.info(f"Checking if any of {subject_criteria} is in '{subject_header.lower()}'")
                    if not any(criteria.lower() in subject_header.lower() for criteria in subject_criteria):
                        logger.info(f"Subject match failed: '{subject_header}' does not contain any of {subject_criteria}")
                        return False
                    else:
                        logger.info(f"Subject match successful!")
            
            logger.info(f"Message {message_id} matches query: {query}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to check if message {message_id} matches query '{query}': {e}")
            return False
    
    def _message_has_attachments(self, payload: dict) -> bool:
        """Check if a message payload has attachments"""
        logger.info(f"Checking payload for attachments. Payload structure: {self._debug_payload_structure(payload)}")
        
        def check_parts(parts):
            for i, part in enumerate(parts):
                logger.info(f"Checking part {i}: mimeType={part.get('mimeType')}, filename={part.get('filename')}, has_attachmentId={bool(part.get('body', {}).get('attachmentId'))}")
                if part.get('parts'):
                    if check_parts(part['parts']):
                        return True
                elif part.get('body', {}).get('attachmentId'):
                    logger.info(f"Found attachment in part {i}")
                    return True
            return False
        
        if payload.get('parts'):
            logger.info(f"Payload has {len(payload['parts'])} parts")
            return check_parts(payload['parts'])
        elif payload.get('body', {}).get('attachmentId'):
            logger.info("Found attachment in main payload body")
            return True
        
        logger.info("No attachments found in payload")
        return False
    
    def _debug_payload_structure(self, payload: dict) -> str:
        """Helper to debug payload structure"""
        if not payload:
            return "empty"
        
        info = f"mimeType={payload.get('mimeType')}"
        if payload.get('parts'):
            info += f", parts_count={len(payload['parts'])}"
        if payload.get('body', {}).get('attachmentId'):
            info += ", has_main_attachment=True"
        if payload.get('filename'):
            info += f", filename={payload.get('filename')}"
        
        return info
    
    def _message_has_matching_filename(self, payload: dict, filename_criteria: List[str]) -> bool:
        """Check if message has attachments matching filename criteria"""
        logger.info(f"Checking for filename criteria: {filename_criteria}")
        
        def check_parts(parts):
            for i, part in enumerate(parts):
                if part.get('parts'):
                    if check_parts(part['parts']):
                        return True
                elif part.get('body', {}).get('attachmentId'):
                    filename = part.get('filename', '').lower()
                    logger.info(f"Part {i} attachment filename: '{filename}'")
                    if filename and any(criteria in filename for criteria in filename_criteria):
                        logger.info(f"Filename '{filename}' matches criteria {filename_criteria}")
                        return True
            return False
        
        if payload.get('parts'):
            return check_parts(payload['parts'])
        elif payload.get('body', {}).get('attachmentId'):
            filename = payload.get('filename', '').lower()
            logger.info(f"Main payload attachment filename: '{filename}'")
            return filename and any(criteria in filename for criteria in filename_criteria)
        
        logger.info("No matching filenames found")
        return False
    
    async def import_drive_files(
        self, 
        db: Session, 
        job_id: str, 
        user_id: str, 
        drive_file_ids: List[str]
    ) -> Dict[str, Any]:
        """
        Import files from Google Drive - creates SourceFiles only
        
        Args:
            db: Database session
            job_id: Extraction job ID
            user_id: User ID for OAuth credentials
            drive_file_ids: List of Google Drive file IDs to import
            
        Returns:
            Dict with import results
        """
        from services.sse_service import sse_manager
        
        # Send import started event
        await sse_manager.send_import_started(job_id, "Google Drive", len(drive_file_ids))
        
        successful = 0
        failed = 0
        errors = []
        
        # Process each Drive file
        for file_id in drive_file_ids:
            try:
                await self._import_single_drive_file(db, job_id, user_id, file_id)
                successful += 1
                logger.info(f"Successfully imported Drive file {file_id}")
                
            except Exception as e:
                logger.error(f"Failed to import Drive file {file_id}: {e}")
                failed += 1
                errors.append({
                    'file_id': file_id,
                    'error': str(e)
                })
        
        # Send import batch completed event
        await sse_manager.send_import_batch_completed(job_id, "Google Drive", successful, len(drive_file_ids))
        
        return {
            'total': len(drive_file_ids),
            'successful': successful,
            'failed': failed,
            'errors': errors
        }
    
    async def _import_single_drive_file(
        self, 
        db: Session, 
        job_id: str, 
        user_id: str, 
        file_id: str
    ) -> None:
        """Import a single file or folder from Google Drive"""
        from models.db_models import SourceFile
        from services.gcs_service import get_storage_service
        from services.job_service import JobService
        from services.sse_service import sse_manager
        
        try:
            logger.info(f"Getting metadata for Drive file {file_id}")
            
            # Get file metadata from Drive
            file_metadata = self.get_drive_file_metadata(db, user_id, file_id)
            if not file_metadata:
                raise ValueError(f"Could not access Drive file {file_id}. Please ensure you have permission to access this file.")
            
            filename = file_metadata['name']
            file_size = int(file_metadata.get('size', 0))
            mime_type = file_metadata.get('mimeType', 'application/octet-stream')
            
            logger.info(f"Importing Drive file: {filename} ({file_size} bytes)")
            
            # Check if this is a folder - no longer supported for OAuth compliance
            if mime_type == 'application/vnd.google-apps.folder':
                logger.warning(f"Folder import not supported for OAuth compliance: {filename}")
                raise ValueError(f"Folder import not supported. Please select individual files instead of folders.")
            
            # Create source file record for regular file
            source_file = SourceFile(
                job_id=job_id,
                original_filename=filename,
                original_path=filename,
                gcs_object_name=f"imports/{job_id}/{file_id}_{filename}",
                file_type=mime_type,
                file_size_bytes=file_size,
                status='importing',
                source_type='drive',
                external_id=file_id
            )
            db.add(source_file)
            db.commit()
            db.refresh(source_file)
            
            # Send import progress event for this individual file
            await sse_manager.send_import_progress(
                job_id, 
                filename, 
                'importing',
                file_size,
                filename
            )
            
            # Download file from Drive
            file_content = self.download_drive_file(db, user_id, file_id)
            if not file_content:
                raise ValueError(f"Could not download Drive file {file_id}. Please ensure you have permission to access this file.")
            
            # Count pages in the file
            from services.page_counting_service import page_counting_service
            page_count = page_counting_service.count_pages_from_content(file_content, filename)
            
            # Update source file with page count
            source_file.page_count = page_count
            
            # Upload to GCS
            storage_service = get_storage_service()
            await storage_service.upload_file_content(
                file_content=file_content,
                gcs_object_name=source_file.gcs_object_name
            )
            
            # Update status to uploaded
            source_file.status = 'uploaded'
            source_file.updated_at = datetime.utcnow()
            db.commit()
            
            # Handle ZIP detection using centralized logic
            job_service = JobService()
            await job_service._handle_zip_detection(db, source_file, mime_type, filename)
            
            # Send import completed event
            await sse_manager.send_import_completed(
                job_id, 
                str(source_file.id), 
                filename, 
                file_size, 
                source_file.status,  # Use actual status (uploaded or unpacking)
                source_file.original_path  # Include original path
            )
            
            logger.info(f"Successfully imported Drive file {filename} to GCS")
            
        except Exception as e:
            # Update status to failed
            if 'source_file' in locals():
                source_file.status = 'failed'
                source_file.updated_at = datetime.utcnow()
                db.commit()
            raise
    
    # REMOVED: _import_drive_folder() - recursive folder import not supported for OAuth compliance
    
    # REMOVED: _import_drive_file_from_folder() - folder-based import not supported for OAuth compliance

    
    async def _update_automation_import_tracking(
        self, 
        db: Session, 
        automation_run_id: str, 
        successful: int = 0,
        failed: int = 0, 
        processed: int = 0, 
        processing_failed: int = 0
    ):
        """Update automation run import tracking counters with atomic database operations"""
        from models.db_models import AutomationRun
        from sqlalchemy import func
        from sqlalchemy.orm import Session
        
        try:
            # Use atomic ORM update to prevent race conditions
            updated_rows = db.query(AutomationRun).filter(
                AutomationRun.id == automation_run_id
            ).update({
                AutomationRun.imports_successful: func.coalesce(AutomationRun.imports_successful, 0) + successful,
                AutomationRun.imports_failed: func.coalesce(AutomationRun.imports_failed, 0) + failed,
                AutomationRun.imports_processed: func.coalesce(AutomationRun.imports_processed, 0) + processed,
                AutomationRun.imports_processing_failed: func.coalesce(AutomationRun.imports_processing_failed, 0) + processing_failed
            }, synchronize_session=False)
            
            if updated_rows == 0:
                logger.warning(f"Automation run {automation_run_id} not found for import tracking update")
                return
            
            # Commit the atomic update
            db.commit()
            
            # Get the updated automation run to check completion
            automation_run = db.query(AutomationRun).filter(AutomationRun.id == automation_run_id).first()
            if not automation_run:
                logger.warning(f"Automation run {automation_run_id} not found after update")
                return
            
            total = automation_run.imports_total or 0
            successful_count = automation_run.imports_successful or 0
            failed_count = automation_run.imports_failed or 0
            processed_count = automation_run.imports_processed or 0
            processing_failed_count = automation_run.imports_processing_failed or 0
            
            logger.info(f"Updated automation run {automation_run_id} import tracking: {successful_count} successful, {failed_count} import failed, {processed_count} processed, {processing_failed_count} processing failed (total: {total})")
            
            # Check if all imports are complete (successful + failed = total) and all processing is done
            if total > 0 and successful_count + failed_count >= total and processed_count + processing_failed_count >= successful_count:
                logger.info(f"All imports and processing complete for automation run {automation_run_id}, triggering initialization")
                await self._trigger_automation_initialization(automation_run)
                    
        except Exception as e:
            logger.error(f"Failed to update automation import tracking for {automation_run_id}: {e}")
            db.rollback()
            raise
    
    async def _trigger_automation_initialization(self, automation_run):
        """Trigger job initialization for a specific automation run"""
        from arq import create_pool
        from workers.worker import AutomationWorkerSettings
        
        # Enqueue job initialization
        redis = await create_pool(AutomationWorkerSettings.redis_settings)
        
        await redis.enqueue_job(
            'run_initializer_worker',
            job_id=automation_run.job_id,
            automation_run_id=str(automation_run.id),
            _queue_name='automation'
        )
        
        await redis.close()
        
        logger.info(f"Enqueued job initialization for automation run {automation_run.id}")

# Singleton instance
google_service = GoogleService()