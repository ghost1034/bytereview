"""
PDF extraction routes - handles file upload and AI-powered data extraction only
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from typing import List, Optional
import json
import time
import logging

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
            extract_multiple_rows
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

# Template routes have been moved to routes/templates.py