"""
Template management routes - PostgreSQL-only implementation
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List
from dependencies.auth import get_current_user_id
from services.ai_extraction_service import AIExtractionService
from services.template_service import TemplateService
from models.extraction import TemplateCreateRequest, TemplateUpdateRequest
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

# Initialize services
ai_service = AIExtractionService()
template_service = TemplateService()

@router.get("/")
async def get_user_templates(user_id: str = Depends(get_current_user_id)):
    """Get user's extraction templates"""
    try:
        templates = await template_service.get_user_templates(user_id)
        return {"templates": templates}
    except Exception as e:
        logger.error(f"Failed to get templates for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get templates: {str(e)}")

@router.post("/")
async def create_template(
    template_request: TemplateCreateRequest,
    user_id: str = Depends(get_current_user_id)
):
    """Create a new extraction template"""
    try:
        # Validate fields
        field_errors = ai_service.validate_field_config(template_request.fields)
        if field_errors:
            raise HTTPException(status_code=400, detail=f"Field validation errors: {'; '.join(field_errors)}")
        
        template = await template_service.create_template(
            user_id=user_id,
            name=template_request.name,
            description=template_request.description,
            fields=template_request.fields,
            is_public=template_request.is_public
        )
        
        return {"success": True, "template": template}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create template for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create template: {str(e)}")

@router.get("/{template_id}")
async def get_template(
    template_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """Get a specific template"""
    try:
        template = await template_service.get_template(template_id, user_id)
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        return template
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get template {template_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get template: {str(e)}")


@router.put("/{template_id}")
async def update_template(
    template_id: str,
    template_request: TemplateUpdateRequest,
    user_id: str = Depends(get_current_user_id)
):
    """Update an existing template"""
    try:
        # Validate fields if provided
        if template_request.fields:
            field_errors = ai_service.validate_field_config(template_request.fields)
            if field_errors:
                raise HTTPException(status_code=400, detail=f"Field validation errors: {'; '.join(field_errors)}")
        
        template = await template_service.update_template(
            template_id=template_id,
            user_id=user_id,
            update_data=template_request
        )
        
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        
        return {"success": True, "template": template}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update template {template_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update template: {str(e)}")

@router.delete("/{template_id}")
async def delete_template(
    template_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """Delete a template"""
    try:
        success = await template_service.delete_template(template_id, user_id)
        if not success:
            raise HTTPException(status_code=404, detail="Template not found")
        
        return {"success": True, "message": "Template deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete template {template_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete template: {str(e)}")

@router.get("/public/all")
async def get_public_templates():
    """Get publicly available templates"""
    try:
        templates = await template_service.get_public_templates()
        return {"templates": templates}
    except Exception as e:
        logger.error(f"Failed to get public templates: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get public templates: {str(e)}")