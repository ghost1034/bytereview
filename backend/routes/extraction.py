"""
PDF extraction routes - handles file upload and AI-powered data extraction only
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from typing import List, Optional
import json
import time
import logging
import zipfile
import io
import tempfile
import os
import csv
import uuid
import shutil
from pathlib import Path
from openpyxl import Workbook
from openpyxl.utils.dataframe import dataframe_to_rows
import pandas as pd
from services.gcs_service import get_storage_service

logger = logging.getLogger(__name__)
from dependencies.auth import get_current_user_id
from services.ai_extraction_service import AIExtractionService
from services.user_service import UserService
from services.template_service import TemplateService
from models.extraction import FieldConfig, ExtractionResponse, ProcessedFile

router = APIRouter()

# Initialize services
ai_service = AIExtractionService()
user_service = UserService()
template_service = TemplateService()

# Initialize storage service
storage_service = get_storage_service()

# In-memory cache for uploaded file metadata with extracted files info
uploaded_files_cache = {}

# Import the proper models
from models.upload import UploadedFileInfo, FileUploadResponse

def cleanup_temp_file(file_id: str, user_id: str = None):
    """Clean up temporary file from storage and remove from cache"""
    file_info = None
    
    # Find file info in user-grouped cache
    if user_id and user_id in uploaded_files_cache:
        if file_id in uploaded_files_cache[user_id]:
            file_info = uploaded_files_cache[user_id][file_id]
    else:
        # Fallback: search all users for backward compatibility
        for uid in uploaded_files_cache:
            if file_id in uploaded_files_cache[uid]:
                file_info = uploaded_files_cache[uid][file_id]
                user_id = uid  # Set user_id for cleanup
                break
    
    if file_info:
        try:
            # Delete main file from storage
            storage_service.delete_temp_file(file_id, user_id)
            
            # Clean up extracted files if any
            for extracted_file in file_info.extracted_files:
                storage_service.delete_temp_file(extracted_file['file_id'], user_id)
                
        except Exception as e:
            logger.warning(f"Failed to cleanup temp file {file_id}: {e}")
        finally:
            # Remove from cache
            if user_id and user_id in uploaded_files_cache:
                if file_id in uploaded_files_cache[user_id]:
                    del uploaded_files_cache[user_id][file_id]
                    # Clean up empty user cache
                    if not uploaded_files_cache[user_id]:
                        del uploaded_files_cache[user_id]

def extract_files_from_zip(zip_content: bytes, filename: str) -> List[dict]:
    """Extract PDF files from ZIP archive"""
    extracted_files = []
    
    try:
        with zipfile.ZipFile(io.BytesIO(zip_content), 'r') as zip_ref:
            for file_info in zip_ref.filelist:
                # Skip hidden macOS system files and directories
                basename = os.path.basename(file_info.filename)
                if (file_info.filename.lower().endswith('.pdf') and 
                    not file_info.is_dir() and 
                    not basename.startswith('._')):  # Skip macOS resource fork files
                    try:
                        pdf_content = zip_ref.read(file_info.filename)
                        if len(pdf_content) > 0:  # Skip empty files
                            extracted_files.append({
                                'filename': basename,
                                'content': pdf_content,
                                'original_path': file_info.filename
                            })
                    except Exception as e:
                        logger.warning(f"Failed to extract {file_info.filename} from {filename}: {e}")
                        continue
    except Exception as e:
        logger.error(f"Failed to process ZIP file {filename}: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid ZIP file: {filename}")
    
    return extracted_files

@router.post("/upload", response_model=FileUploadResponse)
async def upload_files(
    files: List[UploadFile] = File(...),
    user_id: str = Depends(get_current_user_id)
) -> FileUploadResponse:
    """Upload files temporarily to server storage"""
    try:
        uploaded_file_ids = []
        
        for file in files:
            if not file.filename:
                continue
            
            # Read file content
            file_content = await file.read()
            
            # Validate file size (50MB limit for ZIP, 10MB for PDF)
            max_size = 50 * 1024 * 1024 if file.filename.lower().endswith('.zip') else 10 * 1024 * 1024
            if len(file_content) > max_size:
                raise HTTPException(
                    status_code=400, 
                    detail=f"File {file.filename} too large. Maximum size is {max_size // (1024*1024)}MB"
                )
            
            # Validate file type
            if not (file.filename.lower().endswith('.pdf') or file.filename.lower().endswith('.zip')):
                raise HTTPException(
                    status_code=400, 
                    detail=f"File {file.filename} must be a PDF or ZIP file"
                )
            
            # Upload to storage service (GCS or local)
            try:
                file_id = storage_service.upload_temp_file(file_content, file.filename, user_id)
            except Exception as e:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to store file {file.filename}: {str(e)}"
                )
            
            # Create file info object
            file_info = UploadedFileInfo(
                file_id=file_id,
                filename=file.filename,
                size_bytes=len(file_content),
                is_zip=file.filename.lower().endswith('.zip'),
                extracted_count=1,
                upload_time=time.time(),
                extracted_files=[]
            )
            
            # Handle ZIP file extraction
            if file.filename.lower().endswith('.zip'):
                try:
                    extracted_files = extract_files_from_zip(file_content, file.filename)
                    
                    if not extracted_files:
                        cleanup_temp_file(file_id)
                        raise HTTPException(
                            status_code=400, 
                            detail=f"No PDF files found in ZIP: {file.filename}"
                        )
                    
                    # Upload extracted PDFs to storage service
                    for i, extracted_file in enumerate(extracted_files):
                        try:
                            # Upload extracted PDF to storage
                            extracted_file_id = storage_service.upload_temp_file(
                                extracted_file['content'], 
                                extracted_file['filename'],
                                user_id
                            )
                            
                            file_info.extracted_files.append({
                                'file_id': extracted_file_id,
                                'filename': extracted_file['filename'],
                                'size_bytes': len(extracted_file['content']),
                                'original_path': extracted_file['original_path']
                            })
                            
                        except Exception as e:
                            logger.error(f"Failed to store extracted file {extracted_file['filename']}: {e}")
                            # Continue with other files, don't fail the entire upload
                            continue
                    
                    if not file_info.extracted_files:
                        cleanup_temp_file(file_id)
                        raise HTTPException(
                            status_code=500,
                            detail=f"Failed to store any extracted files from ZIP: {file.filename}"
                        )
                    
                    # Keep the original ZIP file for now - it will be cleaned up at the end
                    logger.info(f"Extracted {len(extracted_files)} PDF files from {file.filename}")
                    
                    logger.info(f"Extracted and stored {len(file_info.extracted_files)} PDF files from {file.filename}")
                    
                except Exception as e:
                    cleanup_temp_file(file_id)
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Failed to process ZIP file {file.filename}: {str(e)}"
                    )
            
            # Store in cache (grouped by user)
            if user_id not in uploaded_files_cache:
                uploaded_files_cache[user_id] = {}
            uploaded_files_cache[user_id][file_id] = file_info
            uploaded_file_ids.append({
                'file_id': file_id,
                'filename': file.filename,
                'size_bytes': file_info.size_bytes,
                'is_zip': file.filename.lower().endswith('.zip'),
                'extracted_count': len(file_info.extracted_files) if file.filename.lower().endswith('.zip') else 1
            })
            
            logger.info(f"Uploaded file {file.filename} with ID {file_id}")
        
        return FileUploadResponse(
            success=True,
            uploaded_files=[
                UploadedFileInfo(
                    file_id=file_info['file_id'],
                    filename=file_info['filename'],
                    size_bytes=file_info['size_bytes'],
                    is_zip=file_info['is_zip'],
                    extracted_count=file_info['extracted_count'],
                    upload_time=time.time(),
                    extracted_files=[]
                ) for file_info in uploaded_file_ids
            ],
            total_files=len(uploaded_file_ids),
            message=f"Successfully uploaded {len(uploaded_file_ids)} files"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"File upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")

@router.post("/extract", response_model=ExtractionResponse)
async def extract_data_from_pdfs(
    files: List[UploadFile] = File(..., description="PDF files to process"),
    fields: str = Form(..., description="JSON string of field configurations"),
    extract_multiple_rows: bool = Form(default=False, description="Extract multiple rows"),
    user_id: str = Depends(get_current_user_id)
):
    """
    Extract structured data from PDF files using AI
    """
    start_time = time.time()
    
    try:
        # Parse field configurations
        try:
            field_configs = [FieldConfig(**field) for field in json.loads(fields)]
        except (json.JSONDecodeError, ValueError) as e:
            raise HTTPException(status_code=400, detail=f"Invalid field configuration: {str(e)}")
        
        # Validate field configuration
        field_errors = ai_service.validate_field_config(field_configs)
        if field_errors:
            raise HTTPException(status_code=400, detail=f"Field validation errors: {'; '.join(field_errors)}")
        
        # Check user limits
        user = await user_service.get_user(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Calculate pages that will be used
        total_pages = 0
        processed_files = []
        
        # Process each file
        files_data = []
        for file in files:
            if not file.filename:
                continue
                
            # Read file content
            file_content = await file.read()
            
            # Basic file validation
            if len(file_content) > 10 * 1024 * 1024:  # 10MB limit
                raise HTTPException(status_code=400, detail=f"File {file.filename} too large. Maximum size is 10MB")
            
            if not file.filename.lower().endswith('.pdf'):
                raise HTTPException(status_code=400, detail=f"File {file.filename} must be a PDF")
            
            # Simple metadata (we'll estimate pages as 1 for now since we don't extract)
            metadata = {'num_pages': 1}
            
            # Prepare file data for AI
            files_data.append({
                'filename': file.filename,
                'content': file_content
            })
            
            processed_file = ProcessedFile(
                filename=file.filename,
                size_bytes=len(file_content),
                num_pages=metadata.get('num_pages', 1),
                metadata=metadata
            )
            processed_files.append(processed_file)
            total_pages += processed_file.num_pages
        
        # Check if user has enough pages remaining
        if user.pages_used + total_pages > user.pages_limit:
            raise HTTPException(
                status_code=403, 
                detail=f"Insufficient pages remaining. Need {total_pages}, have {user.pages_limit - user.pages_used}"
            )
        
        # Perform AI extraction directly from PDF files
        extraction_result = await ai_service.extract_data_from_files(
            files_data, 
            field_configs, 
            extract_multiple_rows,
            processed_files
        )
        
        # Update user's page usage
        await user_service.increment_pages_used(user_id, total_pages)
        
        total_time = time.time() - start_time
        extraction_result.processing_time = total_time
        
        return ExtractionResponse(
            success=extraction_result.success,
            files_processed=processed_files,
            extraction_result=extraction_result,
            pages_used=total_pages,
            total_processing_time=total_time,
            error=extraction_result.error
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Extraction failed: {e}")
        # Update progress to failed
        if 'extraction_id' in locals():
            extraction_progress[extraction_id]["status"] = "failed"
            extraction_progress[extraction_id]["error"] = str(e)
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")

@router.post("/cleanup-temp-files")
async def cleanup_temp_files(
    max_age_hours: int = 24,
    user_id: str = Depends(get_current_user_id)
):
    """Manually trigger cleanup of old temporary files (admin endpoint - GCS lifecycle policies handle automatic cleanup)"""
    try:
        deleted_count = storage_service.cleanup_old_files(max_age_hours)
        
        return {
            'success': True,
            'deleted_count': deleted_count,
            'message': f"Manual cleanup completed: deleted {deleted_count} files older than {max_age_hours} hours",
            'note': "Automatic cleanup is handled by GCS lifecycle policies"
        }
        
    except Exception as e:
        logger.error(f"Manual cleanup failed: {e}")
        raise HTTPException(status_code=500, detail=f"Manual cleanup failed: {str(e)}")

@router.delete("/cleanup/{file_id}")
async def cleanup_uploaded_file(
    file_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """Delete a specific uploaded file from storage and cache"""
    try:
        cleanup_temp_file(file_id, user_id)
        return {
            'success': True,
            'message': f"File {file_id} deleted successfully"
        }
    except Exception as e:
        logger.error(f"Failed to cleanup file {file_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to cleanup file: {str(e)}")

@router.delete("/cleanup-multiple")
async def cleanup_multiple_files(
    file_ids: List[str],
    user_id: str = Depends(get_current_user_id)
):
    """Delete multiple uploaded files from storage and cache"""
    try:
        deleted_count = 0
        errors = []
        
        for file_id in file_ids:
            try:
                cleanup_temp_file(file_id, user_id)
                deleted_count += 1
            except Exception as e:
                errors.append(f"Failed to delete {file_id}: {str(e)}")
                logger.error(f"Failed to cleanup file {file_id}: {e}")
        
        return {
            'success': True,
            'deleted_count': deleted_count,
            'total_requested': len(file_ids),
            'errors': errors if errors else None,
            'message': f"Deleted {deleted_count} of {len(file_ids)} files"
        }
    except Exception as e:
        logger.error(f"Failed to cleanup multiple files: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to cleanup files: {str(e)}")



# Template routes have been moved to routes/templates.py
