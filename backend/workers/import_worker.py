"""
Import workers for Drive and Gmail file ingestion.
Handles downloading files from external sources and uploading to GCS.
"""
import logging
import asyncio
import zipfile
import io
import os
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from arq import ArqRedis
from arq.jobs import Job

from core.database import get_db
from models.db_models import SourceFile, ExtractionJob
from services.google_service import google_service
from services.gcs_service import _storage_service as storage_service

logger = logging.getLogger(__name__)

class ImportWorker:
    """Worker for importing files from external sources (Drive, Gmail)"""
    
    def __init__(self):
        self.redis: Optional[ArqRedis] = None
    
    async def startup(self, ctx: Dict[str, Any]) -> None:
        """Initialize worker resources"""
        logger.info("Import worker starting up...")
        self.redis = ctx.get('redis')
    
    async def shutdown(self, ctx: Dict[str, Any]) -> None:
        """Cleanup worker resources"""
        logger.info("Import worker shutting down...")
    
    async def import_drive_files(
        self, 
        ctx: Dict[str, Any],
        job_id: str, 
        user_id: str, 
        drive_file_ids: List[str]
    ) -> Dict[str, Any]:
        """
        Import files from Google Drive
        
        Args:
            job_id: Extraction job ID
            user_id: User ID for OAuth credentials
            drive_file_ids: List of Google Drive file IDs to import
            
        Returns:
            Dict with import results and status
        """
        logger.info(f"Starting Drive import for job {job_id}, {len(drive_file_ids)} files")
        
        results = {
            'job_id': job_id,
            'total_files': len(drive_file_ids),
            'successful': 0,
            'failed': 0,
            'errors': []
        }
        
        with next(get_db()) as db:
            try:
                # Verify job exists and user has access
                job = db.query(ExtractionJob).filter(
                    ExtractionJob.id == job_id,
                    ExtractionJob.user_id == user_id
                ).first()
                
                if not job:
                    raise ValueError(f"Job {job_id} not found or access denied")
                
                # Process each Drive file
                for file_id in drive_file_ids:
                    try:
                        await self._import_single_drive_file(db, job_id, user_id, file_id)
                        results['successful'] += 1
                        logger.info(f"Successfully imported Drive file {file_id}")
                        
                    except Exception as e:
                        logger.error(f"Failed to import Drive file {file_id}: {e}")
                        results['failed'] += 1
                        results['errors'].append({
                            'file_id': file_id,
                            'error': str(e)
                        })
                
                # Update job status
                if results['failed'] == 0:
                    logger.info(f"Drive import completed successfully for job {job_id}")
                else:
                    logger.warning(f"Drive import completed with {results['failed']} failures for job {job_id}")
                
                return results
                
            except Exception as e:
                logger.error(f"Drive import failed for job {job_id}: {e}")
                results['errors'].append({'general': str(e)})
                raise
    
    async def _import_single_drive_file(
        self, 
        db: Session, 
        job_id: str, 
        user_id: str, 
        file_id: str
    ) -> None:
        """Import a single file from Google Drive"""
        
        # Get file metadata from Drive
        file_metadata = google_service.get_drive_file_metadata(db, user_id, file_id)
        if not file_metadata:
            raise ValueError(f"Could not get metadata for Drive file {file_id}")
        
        filename = file_metadata['name']
        file_size = int(file_metadata.get('size', 0))
        mime_type = file_metadata.get('mimeType', 'application/octet-stream')
        
        logger.info(f"Importing Drive file: {filename} ({file_size} bytes)")
        
        # Create source file record
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
        
        try:
            # Download file from Drive
            file_content = google_service.download_drive_file(db, user_id, file_id)
            if not file_content:
                raise ValueError(f"Could not download Drive file {file_id}")
            
            # Upload to GCS
            storage_service.upload_file(
                object_name=source_file.gcs_object_name,
                file_data=file_content,
                content_type=mime_type
            )
            
            # Check if it's a ZIP file and handle accordingly
            if mime_type == 'application/zip' or filename.lower().endswith('.zip'):
                await self._handle_zip_file(db, source_file, file_content)
            
            # Update status to completed
            source_file.status = 'completed'
            source_file.updated_at = datetime.now(timezone.utc)
            db.commit()
            
            logger.info(f"Successfully imported Drive file {filename} to GCS")
            
        except Exception as e:
            # Update status to failed
            source_file.status = 'failed'
            source_file.updated_at = datetime.now(timezone.utc)
            db.commit()
            raise
    
    async def import_gmail_attachments(
        self,
        ctx: Dict[str, Any],
        job_id: str,
        user_id: str,
        attachment_data: List[Dict[str, str]]
    ) -> Dict[str, Any]:
        """
        Import attachments from Gmail
        
        Args:
            job_id: Extraction job ID
            user_id: User ID for OAuth credentials
            attachment_data: List of dicts with message_id, attachment_id, filename
            
        Returns:
            Dict with import results and status
        """
        logger.info(f"Starting Gmail import for job {job_id}, {len(attachment_data)} attachments")
        
        results = {
            'job_id': job_id,
            'total_files': len(attachment_data),
            'successful': 0,
            'failed': 0,
            'errors': []
        }
        
        with next(get_db()) as db:
            try:
                # Verify job exists and user has access
                job = db.query(ExtractionJob).filter(
                    ExtractionJob.id == job_id,
                    ExtractionJob.user_id == user_id
                ).first()
                
                if not job:
                    raise ValueError(f"Job {job_id} not found or access denied")
                
                # Process each Gmail attachment
                for attachment in attachment_data:
                    try:
                        await self._import_single_gmail_attachment(
                            db, job_id, user_id, attachment
                        )
                        results['successful'] += 1
                        logger.info(f"Successfully imported Gmail attachment {attachment['filename']}")
                        
                    except Exception as e:
                        logger.error(f"Failed to import Gmail attachment {attachment['filename']}: {e}")
                        results['failed'] += 1
                        results['errors'].append({
                            'filename': attachment['filename'],
                            'message_id': attachment['message_id'],
                            'error': str(e)
                        })
                
                # Update job status
                if results['failed'] == 0:
                    logger.info(f"Gmail import completed successfully for job {job_id}")
                else:
                    logger.warning(f"Gmail import completed with {results['failed']} failures for job {job_id}")
                
                return results
                
            except Exception as e:
                logger.error(f"Gmail import failed for job {job_id}: {e}")
                results['errors'].append({'general': str(e)})
                raise
    
    async def _import_single_gmail_attachment(
        self,
        db: Session,
        job_id: str,
        user_id: str,
        attachment: Dict[str, str]
    ) -> None:
        """Import a single attachment from Gmail"""
        
        message_id = attachment['message_id']
        attachment_id = attachment['attachment_id']
        filename = attachment['filename']
        
        logger.info(f"Importing Gmail attachment: {filename}")
        
        # Download attachment from Gmail
        file_content = google_service.download_gmail_attachment(
            db, user_id, message_id, attachment_id
        )
        if not file_content:
            raise ValueError(f"Could not download Gmail attachment {filename}")
        
        file_size = len(file_content)
        
        # Determine MIME type from filename
        mime_type = 'application/pdf' if filename.lower().endswith('.pdf') else 'application/octet-stream'
        
        # Create source file record
        source_file = SourceFile(
            job_id=job_id,
            original_filename=filename,
            original_path=filename,
            gcs_object_name=f"imports/{job_id}/{message_id}_{attachment_id}_{filename}",
            file_type=mime_type,
            file_size_bytes=file_size,
            status='importing',
            source_type='gmail',
            external_id=f"{message_id}:{attachment_id}"
        )
        db.add(source_file)
        db.commit()
        db.refresh(source_file)
        
        try:
            # Upload to GCS
            storage_service.upload_file(
                object_name=source_file.gcs_object_name,
                file_data=file_content,
                content_type=mime_type
            )
            
            # Check if it's a ZIP file and handle accordingly
            if mime_type == 'application/zip' or filename.lower().endswith('.zip'):
                await self._handle_zip_file(db, source_file, file_content)
            
            # Update status to completed
            source_file.status = 'completed'
            source_file.updated_at = datetime.now(timezone.utc)
            db.commit()
            
            logger.info(f"Successfully imported Gmail attachment {filename} to GCS")
            
        except Exception as e:
            # Update status to failed
            source_file.status = 'failed'
            source_file.updated_at = datetime.now(timezone.utc)
            db.commit()
            raise
    
    async def _handle_zip_file(
        self,
        db: Session,
        source_file: SourceFile,
        zip_content: bytes
    ) -> None:
        """Handle ZIP file extraction and create individual source file records"""
        logger.info(f"Processing ZIP file: {source_file.original_filename}")
        
        try:
            with zipfile.ZipFile(io.BytesIO(zip_content), 'r') as zip_ref:
                for file_info in zip_ref.infolist():
                    # Skip directories and hidden files
                    if file_info.is_dir() or file_info.filename.startswith('.'):
                        continue
                    
                    # Extract individual file
                    extracted_content = zip_ref.read(file_info.filename)
                    extracted_filename = os.path.basename(file_info.filename)
                    
                    # Determine MIME type
                    if extracted_filename.lower().endswith('.pdf'):
                        mime_type = 'application/pdf'
                    else:
                        mime_type = 'application/octet-stream'
                    
                    # Create source file record for extracted file
                    extracted_source_file = SourceFile(
                        job_id=source_file.job_id,
                        original_filename=extracted_filename,
                        original_path=file_info.filename,  # Full path within ZIP
                        gcs_object_name=f"imports/{source_file.job_id}/extracted_{extracted_filename}",
                        file_type=mime_type,
                        file_size_bytes=len(extracted_content),
                        status='importing',
                        source_type=source_file.source_type,
                        external_id=f"{source_file.external_id}:{file_info.filename}"
                    )
                    db.add(extracted_source_file)
                    db.flush()  # Get ID without committing
                    
                    try:
                        # Upload extracted file to GCS
                        storage_service.upload_file(
                            object_name=extracted_source_file.gcs_object_name,
                            file_data=extracted_content,
                            content_type=mime_type
                        )
                        
                        extracted_source_file.status = 'completed'
                        logger.info(f"Extracted and uploaded: {extracted_filename}")
                        
                    except Exception as e:
                        extracted_source_file.status = 'failed'
                        logger.error(f"Failed to upload extracted file {extracted_filename}: {e}")
                
                db.commit()
                logger.info(f"ZIP processing completed for {source_file.original_filename}")
                
        except Exception as e:
            logger.error(f"Failed to process ZIP file {source_file.original_filename}: {e}")
            raise

# Worker instance
import_worker = ImportWorker()