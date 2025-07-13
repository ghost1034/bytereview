"""
Template management service - handles extraction template CRUD operations
"""
from core.firebase_config import firebase_config
from models.extraction import ExtractionTemplate, FieldConfig, TemplateUpdateRequest
from datetime import datetime
from typing import List, Optional
import logging
import uuid

logger = logging.getLogger(__name__)

class TemplateService:
    def __init__(self):
        try:
            self.db = firebase_config.firestore
            self.templates_collection = self.db.collection('extraction_templates') if self.db else None
            if not self.templates_collection:
                logger.warning("Firestore not available, using mock mode")
        except Exception as e:
            logger.warning(f"Template service initialization failed: {e}. Using mock mode.")
            self.db = None
            self.templates_collection = None

    async def create_template(
        self, 
        user_id: str, 
        name: str, 
        fields: List[FieldConfig],
        description: Optional[str] = None,
        is_public: bool = False
    ) -> ExtractionTemplate:
        """Create a new extraction template"""
        if not self.templates_collection:
            # Mock mode
            template_id = str(uuid.uuid4())
            return ExtractionTemplate(
                id=template_id,
                name=name,
                description=description,
                fields=fields,
                created_by=user_id,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
                is_public=is_public,
            )

        try:
            template_id = str(uuid.uuid4())
            template_data = {
                'id': template_id,
                'name': name,
                'description': description,
                'fields': [field.dict() for field in fields],
                'created_by': user_id,
                'created_at': datetime.utcnow(),
                'updated_at': datetime.utcnow(),
                'is_public': is_public,
            }
            
            self.templates_collection.document(template_id).set(template_data)
            logger.info(f"Created template {template_id} for user {user_id}")
            
            return ExtractionTemplate(**template_data)
        except Exception as e:
            logger.error(f"Error creating template: {e}")
            raise

    async def get_user_templates(self, user_id: str) -> List[ExtractionTemplate]:
        """Get all templates created by a user"""
        if not self.templates_collection:
            return []

        try:
            query = self.templates_collection.where('created_by', '==', user_id)
            docs = query.stream()
            
            templates = []
            for doc in docs:
                template_data = doc.to_dict()
                # Convert field dicts back to FieldConfig objects
                template_data['fields'] = [FieldConfig(**field) for field in template_data['fields']]
                templates.append(ExtractionTemplate(**template_data))
            
            return sorted(templates, key=lambda t: t.updated_at, reverse=True)
        except Exception as e:
            logger.error(f"Error getting user templates: {e}")
            raise

    async def get_template(self, template_id: str, user_id: str) -> Optional[ExtractionTemplate]:
        """Get a specific template (must be owned by user or public)"""
        if not self.templates_collection:
            return None

        try:
            doc = self.templates_collection.document(template_id).get()
            if not doc.exists:
                return None
            
            template_data = doc.to_dict()
            
            # Check if user has access (owner or public template)
            if template_data['created_by'] != user_id and not template_data.get('is_public', False):
                return None
            
            # Convert field dicts back to FieldConfig objects
            template_data['fields'] = [FieldConfig(**field) for field in template_data['fields']]
            
            return ExtractionTemplate(**template_data)
        except Exception as e:
            logger.error(f"Error getting template {template_id}: {e}")
            raise

    async def update_template(
        self, 
        template_id: str, 
        user_id: str, 
        update_data: TemplateUpdateRequest
    ) -> Optional[ExtractionTemplate]:
        """Update a template (must be owned by user)"""
        if not self.templates_collection:
            return None

        try:
            doc_ref = self.templates_collection.document(template_id)
            doc = doc_ref.get()
            
            if not doc.exists:
                return None
            
            template_data = doc.to_dict()
            
            # Check ownership
            if template_data['created_by'] != user_id:
                return None
            
            # Update fields
            update_dict = {'updated_at': datetime.utcnow()}
            
            if update_data.name is not None:
                update_dict['name'] = update_data.name
            if update_data.description is not None:
                update_dict['description'] = update_data.description
            if update_data.fields is not None:
                update_dict['fields'] = [field.dict() for field in update_data.fields]
            if update_data.is_public is not None:
                update_dict['is_public'] = update_data.is_public
            
            doc_ref.update(update_dict)
            
            # Get updated document
            updated_doc = doc_ref.get()
            updated_data = updated_doc.to_dict()
            updated_data['fields'] = [FieldConfig(**field) for field in updated_data['fields']]
            
            return ExtractionTemplate(**updated_data)
        except Exception as e:
            logger.error(f"Error updating template {template_id}: {e}")
            raise

    async def delete_template(self, template_id: str, user_id: str) -> bool:
        """Delete a template (must be owned by user)"""
        if not self.templates_collection:
            return False

        try:
            doc_ref = self.templates_collection.document(template_id)
            doc = doc_ref.get()
            
            if not doc.exists:
                return False
            
            template_data = doc.to_dict()
            
            # Check ownership
            if template_data['created_by'] != user_id:
                return False
            
            doc_ref.delete()
            logger.info(f"Deleted template {template_id}")
            return True
        except Exception as e:
            logger.error(f"Error deleting template {template_id}: {e}")
            raise

    async def get_public_templates(self, limit: int = 50) -> List[ExtractionTemplate]:
        """Get publicly available templates"""
        if not self.templates_collection:
            return []

        try:
            query = self.templates_collection.where('is_public', '==', True).limit(limit)
            docs = query.stream()
            
            templates = []
            for doc in docs:
                template_data = doc.to_dict()
                template_data['fields'] = [FieldConfig(**field) for field in template_data['fields']]
                templates.append(ExtractionTemplate(**template_data))
            
            return sorted(templates, key=lambda t: t.created_at, reverse=True)
        except Exception as e:
            logger.error(f"Error getting public templates: {e}")
            raise

    async def increment_usage_count(self, template_id: str):
        """Increment the usage count for a template"""
        if not self.templates_collection:
            return

        try:
            doc_ref = self.templates_collection.document(template_id)
            doc = doc_ref.get()
            
            if doc.exists:
                current_count = doc.to_dict().get('usage_count', 0)
                doc_ref.update({'usage_count': current_count + 1})
        except Exception as e:
            logger.error(f"Error incrementing usage count for template {template_id}: {e}")