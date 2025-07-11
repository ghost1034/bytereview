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
            # Initialize GCS client
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
    
    def upload_temp_file(self, file_content: bytes, original_filename: str) -> str:
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
                'size_bytes': str(len(file_content))
            }
            blob.patch()
            
            logger.info(f"Uploaded file {original_filename} to GCS with ID {file_id}")
            return file_id
            
        except Exception as e:
            logger.error(f"Failed to upload file {original_filename} to GCS: {e}")
            raise Exception(f"GCS upload failed: {str(e)}")
    
    def download_temp_file(self, file_id: str) -> Optional[bytes]:
        """
        Download file content from GCS by file_id
        Returns: file content as bytes or None if not found
        """
        if not self.is_available():
            raise Exception("GCS not available")
        
        try:
            # Find blob by file_id (search in temp folder)
            blobs = self.bucket.list_blobs(prefix=f"{self.temp_folder_prefix}/")
            
            for blob in blobs:
                if blob.metadata and blob.metadata.get('file_id') == file_id:
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
    
    def delete_temp_file(self, file_id: str) -> bool:
        """
        Delete temporary file from GCS by file_id
        Returns: True if deleted, False if not found
        """
        if not self.is_available():
            return False
        
        try:
            # Find and delete blob by file_id
            blobs = self.bucket.list_blobs(prefix=f"{self.temp_folder_prefix}/")
            
            for blob in blobs:
                if blob.metadata and blob.metadata.get('file_id') == file_id:
                    blob.delete()
                    logger.info(f"Deleted temp file {file_id} from GCS")
                    return True
            
            logger.warning(f"File {file_id} not found for deletion in GCS")
            return False
            
        except Exception as e:
            logger.error(f"Failed to delete file {file_id} from GCS: {e}")
            return False
    
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
    
    def _get_content_type(self, filename: str) -> str:
        """Get content type based on file extension"""
        if filename.lower().endswith('.pdf'):
            return 'application/pdf'
        elif filename.lower().endswith('.zip'):
            return 'application/zip'
        else:
            return 'application/octet-stream'

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
    
    def upload_temp_file(self, file_content: bytes, original_filename: str) -> str:
        """Upload file to local temporary storage"""
        file_id = str(uuid.uuid4())
        timestamp = int(time.time())
        
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