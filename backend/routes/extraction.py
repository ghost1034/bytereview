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

# Initialize storage service (GCS or local fallback)
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

def get_uploaded_file(file_id: str, user_id: str = None) -> UploadedFileInfo:
    """Get uploaded file info, raise 404 if not found"""
    # Search in user's cache first if user_id provided
    if user_id and user_id in uploaded_files_cache:
        if file_id in uploaded_files_cache[user_id]:
            return uploaded_files_cache[user_id][file_id]
    
    # Fallback: search all users for backward compatibility
    for uid in uploaded_files_cache:
        if file_id in uploaded_files_cache[uid]:
            # Security check: if user_id provided, verify ownership
            if user_id and uid != user_id:
                raise HTTPException(status_code=403, detail=f"Access denied to file {file_id}")
            return uploaded_files_cache[uid][file_id]
    
    raise HTTPException(status_code=404, detail=f"File {file_id} not found or expired")

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
                    
                    # Delete the original ZIP file since we only need the extracted PDFs
                    try:
                        storage_service.delete_temp_file(file_id, user_id)
                        logger.info(f"Deleted original ZIP file {file.filename} after extraction")
                    except Exception as e:
                        logger.warning(f"Failed to delete original ZIP file {file_id}: {e}")
                    
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

@router.post("/extract-from-uploaded")
async def extract_data_from_uploaded_files(
    file_ids: List[str],
    fields: str = Form(...),
    extract_multiple_rows: bool = Form(default=False),
    user_id: str = Depends(get_current_user_id)
):
    """Extract data from previously uploaded files"""
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
            raise HTTPException(status_code=400, detail=f"Invalid field configuration: {'; '.join(field_errors)}")
        
        # Get user and check limits
        user = await user_service.get_user(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Prepare files data from uploaded files
        files_data = []
        processed_files = []
        total_pages = 0
        
        print(f"DEBUG: Starting extraction for {len(file_ids)} uploaded file(s)")
        
        for file_id in file_ids:
            file_info = get_uploaded_file(file_id, user_id)
            print(f"DEBUG: Processing file: {file_info.original_filename} (ZIP: {file_info.original_filename.lower().endswith('.zip')})")
            
            if file_info.original_filename.lower().endswith('.zip'):
                # Process extracted files from ZIP (don't count the ZIP itself)
                print(f"DEBUG: ZIP file contains {len(file_info.extracted_files)} extracted PDFs")
                for extracted_file in file_info.extracted_files:
                    # Download file content from storage
                    file_content = storage_service.download_temp_file(extracted_file['file_id'], user_id)
                    
                    if file_content is None:
                        logger.warning(f"Could not download extracted file {extracted_file['filename']}")
                        continue
                    
                    files_data.append({
                        'filename': extracted_file['filename'],
                        'content': file_content
                    })
                    
                    processed_file = ProcessedFile(
                        filename=extracted_file['filename'],
                        size_bytes=extracted_file['size_bytes'],
                        num_pages=1,
                        metadata={
                            'source_zip': file_info.original_filename,
                            'original_path': extracted_file['original_path']
                        }
                    )
                    processed_files.append(processed_file)
                    total_pages += 1  # Only count the extracted PDFs, not the ZIP
                    print(f"DEBUG: Added PDF from ZIP: {extracted_file['filename']} (total_pages now: {total_pages})")
            else:
                # Process single PDF file
                file_content = storage_service.download_temp_file(file_id)
                
                if file_content is None:
                    logger.warning(f"Could not download file {file_info.original_filename}")
                    continue
                
                files_data.append({
                    'filename': file_info.original_filename,
                    'content': file_content
                })
                
                processed_file = ProcessedFile(
                    filename=file_info.original_filename,
                    size_bytes=file_info.size_bytes,
                    num_pages=1,
                    metadata={}
                )
                processed_files.append(processed_file)
                total_pages += 1
        
        # Debug logging for page counting
        print(f"DEBUG: {len(files_data)} files to process, total_pages={total_pages}")
        print(f"DEBUG: User has used {user.pages_used}/{user.pages_limit} pages")
        
        # Check user page limits
        if user.pages_used + total_pages > user.pages_limit:
            raise HTTPException(
                status_code=403, 
                detail=f"Insufficient pages remaining. Need {total_pages}, have {user.pages_limit - user.pages_used}"
            )
        
        # Process with AI
        extraction_result = await ai_service.extract_data_from_files(
            files_data, field_configs, extract_multiple_rows, processed_files
        )
        
        # Update user usage
        await user_service.increment_pages_used(user_id, total_pages)
        
        # Clean up temporary files
        for file_id in file_ids:
            cleanup_temp_file(file_id)
        
        processing_time = time.time() - start_time
        
        return ExtractionResponse(
            success=extraction_result.success,
            files_processed=processed_files,
            extraction_result=extraction_result,
            pages_used=total_pages,
            total_processing_time=processing_time
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Extraction from uploaded files failed: {e}")
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")

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
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")

@router.post("/export/csv")
async def export_results_to_csv(
    extraction_data: dict,
    user_id: str = Depends(get_current_user_id)
):
    """Export extraction results to CSV format"""
    try:
        # Parse the extraction data
        document_results = extraction_data.get('document_results', [])
        field_names = extraction_data.get('field_names', [])
        export_type = extraction_data.get('export_type', 'combined')  # 'combined' or 'individual'
        
        if export_type == 'individual':
            # Export individual document
            document_id = extraction_data.get('document_id')
            if document_id is None:
                raise HTTPException(status_code=400, detail="document_id required for individual export")
            
            if document_id >= len(document_results):
                raise HTTPException(status_code=400, detail="Invalid document_id")
            
            doc = document_results[document_id]
            if not doc.get('success') or not doc.get('data'):
                raise HTTPException(status_code=400, detail="No data available for this document")
            
            # Create CSV for single document
            output = io.StringIO()
            writer = csv.writer(output)
            
            # Write header
            writer.writerow(field_names)
            
            # Write data rows
            data = doc['data']
            rows = data if isinstance(data, list) else [data]
            for row in rows:
                csv_row = [row.get(field, '') for field in field_names]
                writer.writerow(csv_row)
            
            csv_content = output.getvalue()
            output.close()
            
            # Return as streaming response
            filename = f"{doc['filename'].replace('.pdf', '')}_results.csv"
            
        else:
            # Export combined data
            output = io.StringIO()
            writer = csv.writer(output)
            
            # Write header with source document and folder info columns
            headers = ['source_document', 'folder_path'] + field_names
            writer.writerow(headers)
            
            # Write data from all successful documents
            for doc in document_results:
                if doc.get('success') and doc.get('data'):
                    data = doc['data']
                    rows = data if isinstance(data, list) else [data]
                    folder_path = doc.get('original_path', doc['filename'])
                    for row in rows:
                        csv_row = [doc['filename'], folder_path] + [row.get(field, '') for field in field_names]
                        writer.writerow(csv_row)
            
            csv_content = output.getvalue()
            output.close()
            
            filename = f"all_extraction_results_{time.strftime('%Y-%m-%d')}.csv"
        
        # Return CSV as streaming response
        return StreamingResponse(
            io.BytesIO(csv_content.encode('utf-8')),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except Exception as e:
        logger.error(f"CSV export failed: {e}")
        raise HTTPException(status_code=500, detail=f"CSV export failed: {str(e)}")

@router.post("/export/excel")
async def export_results_to_excel(
    extraction_data: dict,
    user_id: str = Depends(get_current_user_id)
):
    """Export extraction results to Excel format"""
    try:
        document_results = extraction_data.get('document_results', [])
        field_names = extraction_data.get('field_names', [])
        export_type = extraction_data.get('export_type', 'combined')
        
        # Create workbook
        wb = Workbook()
        
        if export_type == 'individual':
            # Export individual document
            document_id = extraction_data.get('document_id')
            if document_id is None:
                raise HTTPException(status_code=400, detail="document_id required for individual export")
            
            if document_id >= len(document_results):
                raise HTTPException(status_code=400, detail="Invalid document_id")
            
            doc = document_results[document_id]
            if not doc.get('success') or not doc.get('data'):
                raise HTTPException(status_code=400, detail="No data available for this document")
            
            # Create single worksheet with sanitized name
            base_name = doc['filename'].replace('.pdf', '').replace('.zip', '')
            # Remove invalid Excel sheet name characters
            invalid_chars = ['/', '\\', '?', '*', '[', ']', ':']
            sheet_name = base_name
            for char in invalid_chars:
                sheet_name = sheet_name.replace(char, '_')
            
            # Ensure sheet name is within Excel limits
            sheet_name = sheet_name[:31] if sheet_name else "Results"
            
            ws = wb.active
            ws.title = sheet_name
            
            # Write header
            ws.append(field_names)
            
            # Write data
            data = doc['data']
            rows = data if isinstance(data, list) else [data]
            for row in rows:
                excel_row = [row.get(field, '') for field in field_names]
                ws.append(excel_row)
            
            filename = f"{doc['filename'].replace('.pdf', '')}_results.xlsx"
            
        else:
            # Export combined data with multiple sheets
            
            # Sheet 1: Combined data
            ws_combined = wb.active
            ws_combined.title = "All Results"
            
            # Write header with source document and folder info columns
            headers = ['source_document', 'folder_path'] + field_names
            ws_combined.append(headers)
            
            # Write combined data
            for doc in document_results:
                if doc.get('success') and doc.get('data'):
                    data = doc['data']
                    rows = data if isinstance(data, list) else [data]
                    folder_path = doc.get('original_path', doc['filename'])
                    for row in rows:
                        excel_row = [doc['filename'], folder_path] + [row.get(field, '') for field in field_names]
                        ws_combined.append(excel_row)
            
            # Individual sheets for each document
            for i, doc in enumerate(document_results):
                if doc.get('success') and doc.get('data'):
                    # Create sheet for this document - sanitize filename for Excel
                    base_name = doc['filename'].replace('.pdf', '').replace('.zip', '')
                    # Remove invalid Excel sheet name characters
                    invalid_chars = ['/', '\\', '?', '*', '[', ']', ':']
                    sheet_name = base_name
                    for char in invalid_chars:
                        sheet_name = sheet_name.replace(char, '_')
                    
                    # Ensure sheet name is unique and within Excel limits
                    sheet_name = sheet_name[:31]  # Excel sheet name limit
                    if not sheet_name:  # If name becomes empty after sanitization
                        sheet_name = f"Document_{i+1}"
                    
                    # Ensure uniqueness (in case of duplicate names)
                    original_name = sheet_name
                    counter = 1
                    existing_names = [ws.title for ws in wb.worksheets]
                    while sheet_name in existing_names:
                        suffix = f"_{counter}"
                        max_base_len = 31 - len(suffix)
                        sheet_name = original_name[:max_base_len] + suffix
                        counter += 1
                    
                    ws_doc = wb.create_sheet(title=sheet_name)
                    
                    # Write header
                    ws_doc.append(field_names)
                    
                    # Write data
                    data = doc['data']
                    rows = data if isinstance(data, list) else [data]
                    for row in rows:
                        excel_row = [row.get(field, '') for field in field_names]
                        ws_doc.append(excel_row)
            
            filename = f"all_extraction_results_{time.strftime('%Y-%m-%d')}.xlsx"
        
        # Save to BytesIO
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        
        # Return Excel as streaming response
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except Exception as e:
        logger.error(f"Excel export failed: {e}")
        raise HTTPException(status_code=500, detail=f"Excel export failed: {str(e)}")

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
