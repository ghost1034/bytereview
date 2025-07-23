"""
PostgreSQL-only template service for ByteReview
Clean implementation without Firestore dependencies
"""
from models.extraction import ExtractionTemplate, FieldConfig, TemplateUpdateRequest
from models.db_models import Template as DBTemplate, TemplateField as DBTemplateField, DataType
from core.database import db_config
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from datetime import datetime
from typing import List, Optional
import logging
import uuid

logger = logging.getLogger(__name__)

class TemplateService:
    """
    Template service that uses only PostgreSQL
    Clean implementation for the new ByteReview architecture
    """
    
    def __init__(self):
        """Initialize with PostgreSQL connection"""
        try:
            # Test connection
            db = db_config.get_session()
            db.close()
            logger.info("PostgreSQL template service initialized")
        except Exception as e:
            logger.error(f"Failed to initialize template service: {e}")
            raise

    def _get_session(self) -> Session:
        """Get PostgreSQL session"""
        return db_config.get_session()

    async def create_template(
        self, 
        user_id: str, 
        name: str, 
        fields: List[FieldConfig],
        description: Optional[str] = None,
        is_public: bool = False
    ) -> ExtractionTemplate:
        """Create a new extraction template"""
        db = self._get_session()
        try:
            # Create template
            template = DBTemplate(
                user_id=user_id if not is_public else None,  # Public templates have no user_id
                name=name,
                description=description,
                is_public=is_public
            )
            db.add(template)
            db.flush()  # Get the ID
            
            # Create template fields
            for i, field in enumerate(fields):
                template_field = DBTemplateField(
                    template_id=template.id,
                    field_name=field.name,
                    data_type_id=field.data_type,
                    ai_prompt=field.prompt,
                    display_order=i
                )
                db.add(template_field)
            
            db.commit()
            db.refresh(template)
            
            logger.info(f"Created template {template.id} for user {user_id}")
            
            # Convert to response format
            return ExtractionTemplate(
                id=str(template.id),
                name=template.name,
                description=template.description,
                fields=fields,
                created_by=template.user_id,  # Will be None for public templates
                created_at=template.created_at,
                updated_at=template.updated_at,
                is_public=template.is_public
            )
            
        except SQLAlchemyError as e:
            logger.error(f"Failed to create template: {e}")
            db.rollback()
            raise
        finally:
            db.close()

    async def get_user_templates(self, user_id: str) -> List[ExtractionTemplate]:
        """Get all templates for a user"""
        db = self._get_session()
        try:
            templates = db.query(DBTemplate).filter(DBTemplate.user_id == user_id).all()
            
            result = []
            for template in templates:
                # Get template fields
                fields = db.query(DBTemplateField).filter(
                    DBTemplateField.template_id == template.id
                ).order_by(DBTemplateField.display_order).all()
                
                field_configs = [
                    FieldConfig(
                        name=field.field_name,
                        data_type=field.data_type_id,
                        prompt=field.ai_prompt
                    )
                    for field in fields
                ]
                
                result.append(ExtractionTemplate(
                    id=str(template.id),
                    name=template.name,
                    description=template.description,
                    fields=field_configs,
                    created_by=template.user_id,  # Will be the actual user_id
                    created_at=template.created_at,
                    updated_at=template.updated_at,
                    is_public=template.is_public
                ))
            
            return result
            
        except SQLAlchemyError as e:
            logger.error(f"Error getting templates for user {user_id}: {e}")
            raise
        finally:
            db.close()

    async def get_template(self, template_id: str, user_id: str) -> Optional[ExtractionTemplate]:
        """Get a specific template (user's own template or public template)"""
        db = self._get_session()
        try:
            # Allow access to user's own templates OR public templates
            template = db.query(DBTemplate).filter(
                DBTemplate.id == template_id,
                (DBTemplate.user_id == user_id) | (DBTemplate.is_public == True)
            ).first()
            
            if not template:
                return None
            
            # Get template fields
            fields = db.query(DBTemplateField).filter(
                DBTemplateField.template_id == template.id
            ).order_by(DBTemplateField.display_order).all()
            
            field_configs = [
                FieldConfig(
                    name=field.field_name,
                    data_type=field.data_type_id,
                    prompt=field.ai_prompt
                )
                for field in fields
            ]
            
            return ExtractionTemplate(
                id=str(template.id),
                name=template.name,
                description=template.description,
                fields=field_configs,
                created_by=template.user_id,  # Will be None for public templates
                created_at=template.created_at,
                updated_at=template.updated_at,
                is_public=template.is_public
            )
            
        except SQLAlchemyError as e:
            logger.error(f"Error getting template {template_id}: {e}")
            raise
        finally:
            db.close()

    async def update_template(
        self,
        template_id: str,
        user_id: str,
        update_data: TemplateUpdateRequest
    ) -> Optional[ExtractionTemplate]:
        """Update an existing template"""
        db = self._get_session()
        try:
            template = db.query(DBTemplate).filter(
                DBTemplate.id == template_id,
                DBTemplate.user_id == user_id
            ).first()
            
            if not template:
                return None
            
            # Update template fields if provided
            if update_data.name:
                template.name = update_data.name
            if update_data.description is not None:
                template.description = update_data.description
            if update_data.is_public is not None:
                template.is_public = update_data.is_public
                # If making public, remove user_id; if making private, ensure user_id is set
                if update_data.is_public:
                    template.user_id = None
                else:
                    template.user_id = user_id
            
            template.updated_at = datetime.utcnow()
            
            # Update fields if provided
            if update_data.fields:
                # Delete existing fields
                db.query(DBTemplateField).filter(
                    DBTemplateField.template_id == template.id
                ).delete()
                
                # Add new fields
                for i, field in enumerate(update_data.fields):
                    template_field = DBTemplateField(
                        template_id=template.id,
                        field_name=field.name,
                        data_type_id=field.data_type,
                        ai_prompt=field.prompt,
                        display_order=i
                    )
                    db.add(template_field)
            
            db.commit()
            db.refresh(template)
            
            logger.info(f"Updated template {template_id}")
            
            # Return updated template
            return await self.get_template(template_id, user_id)
            
        except SQLAlchemyError as e:
            logger.error(f"Failed to update template {template_id}: {e}")
            db.rollback()
            raise
        finally:
            db.close()

    async def delete_template(self, template_id: str, user_id: str) -> bool:
        """Delete a template"""
        db = self._get_session()
        try:
            template = db.query(DBTemplate).filter(
                DBTemplate.id == template_id,
                DBTemplate.user_id == user_id
            ).first()
            
            if not template:
                return False
            
            db.delete(template)
            db.commit()
            
            logger.info(f"Deleted template {template_id}")
            return True
            
        except SQLAlchemyError as e:
            logger.error(f"Failed to delete template {template_id}: {e}")
            db.rollback()
            raise
        finally:
            db.close()

    async def get_public_templates(self) -> List[ExtractionTemplate]:
        """Get publicly available templates"""
        db = self._get_session()
        try:
            templates = db.query(DBTemplate).filter(DBTemplate.is_public == True).all()
            
            result = []
            for template in templates:
                # Get template fields
                fields = db.query(DBTemplateField).filter(
                    DBTemplateField.template_id == template.id
                ).order_by(DBTemplateField.display_order).all()
                
                field_configs = [
                    FieldConfig(
                        name=field.field_name,
                        data_type=field.data_type_id,
                        prompt=field.ai_prompt
                    )
                    for field in fields
                ]
                
                result.append(ExtractionTemplate(
                    id=str(template.id),
                    name=template.name,
                    description=template.description,
                    fields=field_configs,
                    created_by=None,  # Public templates have no specific creator
                    created_at=template.created_at,
                    updated_at=template.updated_at,
                    is_public=True
                ))
            
            return result
            
        except SQLAlchemyError as e:
            logger.error(f"Error getting public templates: {e}")
            raise
        finally:
            db.close()