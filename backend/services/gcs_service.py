"""
Google Cloud Storage service for temporary file storage
"""
import os
import uuid
import time
import logging
from typing import Optional, List, Dict
from pathlib import Path
from google.cloud import storage
from google.cloud.exceptions import NotFound
import tempfile

logger = logging.getLogger(__name__)

class GCSService:
    def __init__(self):
        """Initialize Google Cloud Storage client"""
        self.bucket_name = os.getenv('GCS_BUCKET_NAME')
        self.temp_folder_prefix = os.getenv('GCS_TEMP_FOLDER', 'temp_uploads')
        
        if not self.bucket_name:
            logger.warning("GCS_BUCKET_NAME not configured, falling back to local storage")
            self.client = None
            self.bucket = None
            return
        
        try:
            # Initialize GCS client with explicit service account path
            service_account_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
            if not service_account_path:
                # Try to find service account file in backend directory
                backend_dir = Path(__file__).parent.parent  # Go up to backend/ directory
                service_account_file = backend_dir / "service-account.json"
                if service_account_file.exists():
                    service_account_path = str(service_account_file)
                    os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = service_account_path
                    logger.info(f"Using service account file: {service_account_path}")
                else:
                    raise Exception(f"Service account file not found at {service_account_file}")
            
            self.client = storage.Client()
            self.bucket = self.client.bucket(self.bucket_name)
            
            # Test bucket access
            if not self.bucket.exists():
                raise Exception(f"GCS bucket '{self.bucket_name}' does not exist")
            
            logger.info(f"GCS service initialized with bucket: {self.bucket_name}")
            
        except Exception as e:
            logger.error(f"Failed to initialize GCS: {e}")
            logger.warning("Falling back to local storage")
            self.client = None
            self.bucket = None
    
    def is_available(self) -> bool:
        """Check if GCS is available and configured"""
        return self.client is not None and self.bucket is not None
    
    def get_bucket_name(self) -> str:
        """Get the configured bucket name"""
        if not self.bucket_name:
            raise Exception("GCS bucket name not configured")
        return self.bucket_name
    
    def construct_gcs_uri_for_object(self, object_name: str) -> str:
        """
        Construct a GCS URI for an object in this service's bucket
        
        Args:
            object_name: Path/name of the object in the bucket
            
        Returns:
            Properly formatted GCS URI for this bucket
        """
        return construct_gcs_uri(self.get_bucket_name(), object_name)
    
    def upload_temp_file(self, file_content: bytes, original_filename: str, user_id: str = None) -> str:
        """
        Upload file content to GCS temporary storage
        Returns: file_id for later retrieval
        """
        if not self.is_available():
            raise Exception("GCS not available")
        
        try:
            # Generate unique file ID
            file_id = str(uuid.uuid4())
            
            # Create blob path with timestamp for auto-cleanup
            timestamp = int(time.time())
            if user_id:
                blob_name = f"{self.temp_folder_prefix}/{user_id}/{timestamp}_{file_id}_{original_filename}"
            else:
                # Fallback for backward compatibility
                blob_name = f"{self.temp_folder_prefix}/{timestamp}_{file_id}_{original_filename}"
            
            # Upload to GCS
            blob = self.bucket.blob(blob_name)
            blob.upload_from_string(
                file_content,
                content_type=self._get_content_type(original_filename)
            )
            
            # Set metadata
            blob.metadata = {
                'file_id': file_id,
                'original_filename': original_filename,
                'upload_time': str(timestamp),
                'size_bytes': str(len(file_content)),
                'user_id': user_id or 'unknown'
            }
            blob.patch()
            
            logger.info(f"Uploaded file {original_filename} to GCS with ID {file_id}")
            return file_id
            
        except Exception as e:
            logger.error(f"Failed to upload file {original_filename} to GCS: {e}")
            raise Exception(f"GCS upload failed: {str(e)}")
    
    def download_temp_file(self, file_id: str, user_id: str = None) -> Optional[bytes]:
        """
        Download file content from GCS by file_id
        Returns: file content as bytes or None if not found
        """
        if not self.is_available():
            raise Exception("GCS not available")
        
        try:
            # Find blob by file_id (search in user's folder first if user_id provided)
            if user_id:
                blobs = self.bucket.list_blobs(prefix=f"{self.temp_folder_prefix}/{user_id}/")
                for blob in blobs:
                    if blob.metadata and blob.metadata.get('file_id') == file_id:
                        content = blob.download_as_bytes()
                        logger.info(f"Downloaded file with ID {file_id} from GCS (user: {user_id})")
                        return content
            
            # Fallback: search all temp files for backward compatibility
            blobs = self.bucket.list_blobs(prefix=f"{self.temp_folder_prefix}/")
            for blob in blobs:
                if blob.metadata and blob.metadata.get('file_id') == file_id:
                    # Security check: if user_id provided, verify ownership
                    if user_id and blob.metadata.get('user_id') != user_id:
                        logger.warning(f"User {user_id} attempted to access file {file_id} owned by {blob.metadata.get('user_id')}")
                        continue
                    content = blob.download_as_bytes()
                    logger.info(f"Downloaded file with ID {file_id} from GCS")
                    return content
            
            logger.warning(f"File with ID {file_id} not found in GCS")
            return None
            
        except Exception as e:
            logger.error(f"Failed to download file {file_id} from GCS: {e}")
            raise Exception(f"GCS download failed: {str(e)}")
    
    def get_temp_file_info(self, file_id: str) -> Optional[Dict]:
        """
        Get file metadata from GCS by file_id
        Returns: file info dict or None if not found
        """
        if not self.is_available():
            raise Exception("GCS not available")
        
        try:
            # Find blob by file_id
            blobs = self.bucket.list_blobs(prefix=f"{self.temp_folder_prefix}/")
            
            for blob in blobs:
                if blob.metadata and blob.metadata.get('file_id') == file_id:
                    return {
                        'file_id': file_id,
                        'original_filename': blob.metadata.get('original_filename'),
                        'size_bytes': int(blob.metadata.get('size_bytes', 0)),
                        'upload_time': float(blob.metadata.get('upload_time', 0)),
                        'blob_name': blob.name
                    }
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to get file info {file_id} from GCS: {e}")
            return None
    
    def delete_temp_file(self, file_id: str, user_id: str = None) -> bool:
        """
        Delete temporary file from GCS by file_id
        Returns: True if deleted, False if not found
        """
        if not self.is_available():
            return False
        
        try:
            # Find and delete blob by file_id (search user's folder first if user_id provided)
            if user_id:
                blobs = self.bucket.list_blobs(prefix=f"{self.temp_folder_prefix}/{user_id}/")
                for blob in blobs:
                    if blob.metadata and blob.metadata.get('file_id') == file_id:
                        blob.delete()
                        logger.info(f"Deleted temp file {file_id} from GCS (user: {user_id})")
                        return True
            
            # Fallback: search all temp files for backward compatibility
            blobs = self.bucket.list_blobs(prefix=f"{self.temp_folder_prefix}/")
            for blob in blobs:
                if blob.metadata and blob.metadata.get('file_id') == file_id:
                    # Security check: if user_id provided, verify ownership
                    if user_id and blob.metadata.get('user_id') != user_id:
                        logger.warning(f"User {user_id} attempted to delete file {file_id} owned by {blob.metadata.get('user_id')}")
                        continue
                    blob.delete()
                    logger.info(f"Deleted temp file {file_id} from GCS")
                    return True
            
            logger.warning(f"File {file_id} not found for deletion in GCS")
            return False
            
        except Exception as e:
            logger.error(f"Failed to delete file {file_id} from GCS: {e}")
            return False

    def get_user_temp_files(self, user_id: str) -> List[Dict]:
        """
        Get all temp files for a specific user
        Returns: list of file info dictionaries
        """
        try:
            user_files = []
            
            # List blobs in user's temp folder
            blobs = self.bucket.list_blobs(prefix=f"{self.temp_folder_prefix}/{user_id}/")
            
            for blob in blobs:
                try:
                    if blob.metadata:
                        file_id = blob.metadata.get('file_id')
                        filename = blob.metadata.get('original_filename')
                        
                        # Skip files with missing essential data
                        if not file_id or not filename:
                            logger.warning(f"Skipping blob {blob.name} - missing file_id or filename")
                            continue
                            
                        file_info = {
                            'file_id': file_id,
                            'filename': filename,  # Always use 'filename' as the key
                            'size_bytes': int(blob.metadata.get('size_bytes', 0)),
                            'upload_time': float(blob.metadata.get('upload_time', 0)),
                            'user_id': blob.metadata.get('user_id')
                        }
                        user_files.append(file_info)
                except Exception as e:
                    logger.error(f"Failed to process blob {blob.name}: {e}")
                    continue
            
            logger.info(f"Found {len(user_files)} temp files for user {user_id}")
            return user_files
            
        except Exception as e:
            logger.error(f"Failed to get user temp files for {user_id}: {e}")
            return []
    
    def cleanup_old_files(self, max_age_hours: int = 24) -> int:
        """
        Clean up temporary files older than max_age_hours
        Returns: number of files deleted
        """
        if not self.is_available():
            return 0
        
        try:
            current_time = time.time()
            cutoff_time = current_time - (max_age_hours * 3600)
            deleted_count = 0
            
            blobs = self.bucket.list_blobs(prefix=f"{self.temp_folder_prefix}/")
            
            for blob in blobs:
                if blob.metadata and blob.metadata.get('upload_time'):
                    upload_time = float(blob.metadata.get('upload_time', 0))
                    if upload_time < cutoff_time:
                        try:
                            blob.delete()
                            deleted_count += 1
                            logger.info(f"Cleaned up old temp file: {blob.name}")
                        except Exception as e:
                            logger.warning(f"Failed to delete old file {blob.name}: {e}")
            
            logger.info(f"Cleaned up {deleted_count} old temp files from GCS")
            return deleted_count
            
        except Exception as e:
            logger.error(f"Failed to cleanup old files from GCS: {e}")
            return 0
    
    async def generate_presigned_put_url(self, gcs_object_name: str, expiration_minutes: int = 60) -> str:
        """
        Generate a pre-signed URL for PUT operations (file uploads)
        """
        if not self.is_available():
            raise Exception("GCS not available")
            
        try:
            from datetime import timedelta
            
            blob = self.bucket.blob(gcs_object_name)
            
            # Generate a signed URL for PUT operations
            url = blob.generate_signed_url(
                version="v4",
                expiration=timedelta(minutes=expiration_minutes),
                method="PUT",
                content_type="application/octet-stream"  # Generic content type
            )
            
            logger.info(f"Generated pre-signed PUT URL for: {gcs_object_name}")
            return url
            
        except Exception as e:
            logger.error(f"Failed to generate pre-signed URL for {gcs_object_name}: {e}")
            raise

    async def download_file(self, gcs_object_name: str, local_path: str) -> None:
        """
        Download a file from GCS to local path
        """
        if not self.is_available():
            raise Exception("GCS not available")
            
        try:
            blob = self.bucket.blob(gcs_object_name)
            blob.download_to_filename(local_path)
            logger.info(f"Downloaded {gcs_object_name} to {local_path}")
            
        except Exception as e:
            logger.error(f"Failed to download {gcs_object_name}: {e}")
            raise

    async def upload_file(self, local_path: str, gcs_object_name: str) -> None:
        """
        Upload a file from local path to GCS
        """
        if not self.is_available():
            raise Exception("GCS not available")
            
        try:
            blob = self.bucket.blob(gcs_object_name)
            blob.upload_from_filename(local_path)
            logger.info(f"Uploaded {local_path} to {gcs_object_name}")
            
        except Exception as e:
            logger.error(f"Failed to upload {local_path} to {gcs_object_name}: {e}")
            raise

    async def upload_file_content(self, file_content: bytes, gcs_object_name: str) -> None:
        """
        Upload file content (bytes) directly to GCS
        """
        if not self.is_available():
            raise Exception("GCS not available")
            
        try:
            blob = self.bucket.blob(gcs_object_name)
            blob.upload_from_string(file_content)
            logger.info(f"Uploaded content to {gcs_object_name}")
            
        except Exception as e:
            logger.error(f"Failed to upload content to {gcs_object_name}: {e}")
            raise

    async def delete_file(self, gcs_object_name: str) -> None:
        """
        Delete a file from GCS
        """
        if not self.is_available():
            raise Exception("GCS not available")
            
        try:
            blob = self.bucket.blob(gcs_object_name)
            blob.delete()
            logger.info(f"Deleted {gcs_object_name} from GCS")
            
        except Exception as e:
            logger.error(f"Failed to delete {gcs_object_name}: {e}")
            raise

    def _get_content_type(self, filename: str) -> str:
        """Get content type based on file extension"""
        if filename.lower().endswith('.pdf'):
            return 'application/pdf'
        elif filename.lower().endswith('.zip'):
            return 'application/zip'
        else:
            return 'application/octet-stream'

def normalize_path(path: str) -> str:
    """
    Normalize file path for consistent storage
    Replace backslashes with forward slashes and remove leading/trailing slashes
    """
    if not path:
        return ""
    
    # Replace backslashes with forward slashes
    normalized = path.replace('\\', '/')
    
    # Remove leading and trailing slashes
    normalized = normalized.strip('/')
    
    # Handle empty path
    if not normalized:
        return ""
    
    return normalized

def construct_gcs_uri(bucket_name: str, object_name: str) -> str:
    """
    Construct a gs:// URI from bucket and object name
    
    Args:
        bucket_name: Name of the GCS bucket
        object_name: Path/name of the object in the bucket
        
    Returns:
        Properly formatted GCS URI
        
    Raises:
        ValueError: If bucket_name or object_name is invalid
    """
    if not bucket_name or not bucket_name.strip():
        raise ValueError("bucket_name is required and cannot be empty")
    
    if not object_name or not object_name.strip():
        raise ValueError("object_name is required and cannot be empty")
    
    # Clean up bucket name (remove any gs:// prefix if present)
    bucket_name = bucket_name.strip()
    if bucket_name.startswith('gs://'):
        bucket_name = bucket_name[5:]
    
    # Clean up object name (remove leading slashes)
    object_name = object_name.strip().lstrip('/')
    
    # Validate bucket name format (basic validation)
    if not bucket_name.replace('-', '').replace('_', '').replace('.', '').isalnum():
        raise ValueError(f"Invalid bucket name format: {bucket_name}")
    
    return f"gs://{bucket_name}/{object_name}"

def validate_gcs_uri(gcs_uri: str) -> bool:
    """
    Validate that a string is a properly formatted GCS URI
    
    Args:
        gcs_uri: The URI to validate
        
    Returns:
        True if valid, False otherwise
    """
    if not gcs_uri or not isinstance(gcs_uri, str):
        return False
    
    if not gcs_uri.startswith('gs://'):
        return False
    
    # Remove gs:// prefix
    path_part = gcs_uri[5:]
    
    # Must have at least bucket/object format
    if '/' not in path_part:
        return False
    
    parts = path_part.split('/', 1)
    bucket_name = parts[0]
    object_name = parts[1]
    
    # Basic validation
    if not bucket_name or not object_name:
        return False
    
    return True

# Fallback local storage for when GCS is not available
class LocalStorageService:
    def __init__(self):
        """Initialize local storage fallback"""
        self.temp_dir = Path(tempfile.gettempdir()) / "lido_uploads"
        self.temp_dir.mkdir(exist_ok=True)
        self.file_cache = {}  # In-memory metadata cache
        logger.info(f"Local storage fallback initialized: {self.temp_dir}")
    
    def is_available(self) -> bool:
        return True
    
    async def generate_presigned_put_url(self, gcs_object_name: str, expiration_minutes: int = 60) -> str:
        """
        Local storage doesn't support pre-signed URLs, raise an error
        """
        raise Exception("Pre-signed URLs not supported with local storage fallback")
    
    async def download_file(self, gcs_object_name: str, local_path: str) -> None:
        """
        Local storage doesn't support downloading from GCS object names
        """
        raise Exception("File download not supported with local storage fallback")
    
    def upload_temp_file(self, file_content: bytes, original_filename: str, user_id: str = None) -> str:
        """Upload file to local temporary storage"""
        file_id = str(uuid.uuid4())
        timestamp = int(time.time())
        
        if user_id:
            user_dir = self.temp_dir / user_id
            user_dir.mkdir(exist_ok=True)
            file_path = user_dir / f"{timestamp}_{file_id}_{original_filename}"
        else:
            file_path = self.temp_dir / f"{timestamp}_{file_id}_{original_filename}"
        
        with open(file_path, 'wb') as f:
            f.write(file_content)
        
        # Store metadata in cache
        self.file_cache[file_id] = {
            'file_id': file_id,
            'original_filename': original_filename,
            'file_path': file_path,
            'size_bytes': len(file_content),
            'upload_time': timestamp
        }
        
        logger.info(f"Uploaded file {original_filename} to local storage with ID {file_id}")
        return file_id
    
    def download_temp_file(self, file_id: str) -> Optional[bytes]:
        """Download file from local storage"""
        if file_id not in self.file_cache:
            return None
        
        file_info = self.file_cache[file_id]
        file_path = file_info['file_path']
        
        if not file_path.exists():
            del self.file_cache[file_id]
            return None
        
        with open(file_path, 'rb') as f:
            return f.read()
    
    def get_temp_file_info(self, file_id: str) -> Optional[Dict]:
        """Get file info from local storage"""
        return self.file_cache.get(file_id)
    
    def delete_temp_file(self, file_id: str) -> bool:
        """Delete file from local storage"""
        if file_id not in self.file_cache:
            return False
        
        file_info = self.file_cache[file_id]
        file_path = file_info['file_path']
        
        try:
            if file_path.exists():
                file_path.unlink()
            del self.file_cache[file_id]
            logger.info(f"Deleted temp file {file_id} from local storage")
            return True
        except Exception as e:
            logger.error(f"Failed to delete local file {file_id}: {e}")
            return False
    
    def cleanup_old_files(self, max_age_hours: int = 24) -> int:
        """Clean up old local files"""
        current_time = time.time()
        cutoff_time = current_time - (max_age_hours * 3600)
        deleted_count = 0
        
        # Clean up files from cache
        to_delete = []
        for file_id, file_info in self.file_cache.items():
            if file_info['upload_time'] < cutoff_time:
                to_delete.append(file_id)
        
        for file_id in to_delete:
            if self.delete_temp_file(file_id):
                deleted_count += 1
        
        return deleted_count

# Global storage service instance
_storage_service = None

def get_storage_service():
    """Get the configured storage service (GCS or local fallback)"""
    global _storage_service
    
    if _storage_service is None:
        gcs_service = GCSService()
        if gcs_service.is_available():
            _storage_service = gcs_service
            logger.info("Using Google Cloud Storage for temporary files")
        else:
            _storage_service = LocalStorageService()
            logger.info("Using local storage for temporary files (GCS not available)")
    
    return _storage_service