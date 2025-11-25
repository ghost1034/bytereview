"""
AI-powered data extraction service using Google Gemini
Direct PDF processing with structured JSON schema output using GCS URIs
"""
import asyncio
from google import genai
from google.genai import types
import json
import os
import io
from typing import List, Dict, Any, Optional
import logging
from models.extraction import FieldConfig, ExtractionResult

logger = logging.getLogger(__name__)

class AIExtractionService:
    def __init__(self):
        # Configure Vertex AI (google-genai client)
        project = os.getenv("GOOGLE_CLOUD_PROJECT_ID")
        location = os.getenv("GOOGLE_CLOUD_LOCATION", "global")
        if not project:
            logger.warning("GOOGLE_CLOUD_PROJECT_ID not set; AI extraction will not work")
            self.client = None
        else:
            try:
                # Note: Some google-genai versions do not support types.HttpOptions; omit http_options for compatibility.
                self.client = genai.Client(vertexai=True, project=project, location=location)
            except Exception as e:
                logger.error(f"Failed to initialize Vertex AI client: {e}")
                self.client = None
        # Use Gemini 2.5 Pro for enhanced document processing and accuracy
        self.base_model_name = 'gemini-2.5-pro'
    
    def _extract_metadata(self, processed_file) -> Dict[str, Any]:
        """Extract metadata from processed_file, handling different object types"""
        metadata = {}
        if hasattr(processed_file, 'metadata') and processed_file.metadata:
            if hasattr(processed_file.metadata, '__dict__'):
                metadata = processed_file.metadata.__dict__
            elif isinstance(processed_file.metadata, dict):
                metadata = processed_file.metadata
            # If it's neither, metadata remains empty dict
        return metadata
    
    
    def create_json_schema(self, fields: List[FieldConfig], data_types_map: Dict[str, Dict]) -> types.Schema:
        """Create Vertex AI response schema using database data types (array of objects).
        Uses string-based type names supported by newer google-genai versions.
        """
        obj_properties: Dict[str, types.Schema] = {}
        for field in fields:
            data_type_info = data_types_map.get(field.data_type, {})
            base_type = (data_type_info.get("base_json_type") or "string").lower()
            schema_kwargs: Dict[str, Any] = {"type": base_type, "description": field.prompt}
            json_format = data_type_info.get("json_format")
            if json_format:
                schema_kwargs["format"] = json_format
            obj_properties[field.name] = types.Schema(**schema_kwargs)
        item_schema = types.Schema(
            type="object",
            properties=obj_properties,
            required=list(obj_properties.keys()),
        )
        return types.Schema(type="array", items=item_schema)

    def create_combined_json_schema(self, fields: List[FieldConfig], data_types_map: Dict[str, Dict]) -> types.Schema:
        """Create Vertex AI schema for combined processing with source attribution."""
        obj_properties: Dict[str, types.Schema] = {}
        for field in fields:
            data_type_info = data_types_map.get(field.data_type, {})
            base_type = (data_type_info.get("base_json_type") or "string").lower()
            schema_kwargs: Dict[str, Any] = {"type": base_type, "description": field.prompt}
            json_format = data_type_info.get("json_format")
            if json_format:
                schema_kwargs["format"] = json_format
            obj_properties[field.name] = types.Schema(**schema_kwargs)
        # Add source_documents string array
        obj_properties["source_documents"] = types.Schema(
            type="array",
            items=types.Schema(type="string"),
            description="List of document filenames that contributed to this data",
        )
        item_schema = types.Schema(
            type="object",
            properties=obj_properties,
            required=list(obj_properties.keys()),
        )
        return types.Schema(type="array", items=item_schema)

    async def extract_data_individual(self, files_data: List[Dict], fields: List[FieldConfig], data_types_map: Dict[str, Dict], system_prompt: str, processed_files: List = None) -> ExtractionResult:
        """Extract structured data from files using Vertex AI with JSON schema - process each file separately."""
        if not self.client:
            return ExtractionResult(success=False, error="AI service not available - Vertex client not configured")

        try:
            # Build Vertex response schema
            response_schema = self.create_json_schema(fields, data_types_map)
            config = types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=response_schema,
            )

            # Build user instructions
            field_list = chr(10).join([f"- {field.name} ({field.data_type}): {field.prompt}" for field in fields])
            prompt = f"""{system_prompt}

Provide the following fields. If the document contains multiple records (like multiple line items, invoices, etc.), return all of them as separate objects in the array:

{field_list}
"""

            logger.info("=== VERTEX PROMPT DEBUG (Individual Mode) ===")
            logger.info(f"System prompt: {system_prompt}")
            logger.info(f"Field list: {field_list}")
            logger.info(f"Complete prompt: {prompt}")
            logger.info("=== END VERTEX PROMPT DEBUG ===")

            document_results = []
            all_data = []
            total_rows = 0

            for i, file_data in enumerate(files_data):
                try:
                    logger.info(f"Processing file: {file_data['filename']}")
                    # Prefer GCS URI if provided, else raise
                    uri = file_data.get('uri')
                    if not uri:
                        raise ValueError("Missing GCS URI for file; expected 'uri' field")
                    mime_type = file_data.get('mime_type') or 'application/pdf'
                    file_part = types.Part.from_uri(file_uri=uri, mime_type=mime_type)

                    # Call Vertex AI
                    resp = self.client.models.generate_content(
                        model=self.base_model_name,
                        contents=[file_part, prompt],
                        config=config,
                    )

                    if not resp or not getattr(resp, 'text', None):
                        document_results.append({
                            'filename': file_data['filename'],
                            'success': False,
                            'error': 'AI model returned empty response',
                            'data': None
                        })
                        continue

                    try:
                        extracted_data = json.loads(resp.text)
                        metadata = {}
                        size_bytes = None
                        if processed_files and i < len(processed_files):
                            processed_file = processed_files[i]
                            metadata = self._extract_metadata(processed_file)
                            if hasattr(processed_file, 'size_bytes'):
                                size_bytes = processed_file.size_bytes

                        individual_data = extracted_data[0] if isinstance(extracted_data, list) and len(extracted_data) > 0 else {}
                        document_results.append({
                            'filename': file_data['filename'],
                            'success': True,
                            'data': individual_data,
                            'error': None,
                            'original_path': metadata.get('original_path', file_data['filename']),
                            'source_zip': metadata.get('source_zip'),
                            'size_bytes': size_bytes or metadata.get('size_bytes')
                        })

                        if isinstance(extracted_data, list):
                            all_data.extend(extracted_data)
                            total_rows += len(extracted_data)
                        else:
                            all_data.append(extracted_data)
                            total_rows += 1

                    except Exception as e:
                        logger.error(f"Failed to parse JSON for {file_data['filename']}: {e}")
                        metadata = {}
                        size_bytes = None
                        if processed_files and i < len(processed_files):
                            processed_file = processed_files[i]
                            metadata = self._extract_metadata(processed_file)
                            if hasattr(processed_file, 'size_bytes'):
                                size_bytes = processed_file.size_bytes
                        document_results.append({
                            'filename': file_data['filename'],
                            'success': False,
                            'error': f'Failed to parse AI response: {str(e)}',
                            'data': None,
                            'original_path': metadata.get('original_path', file_data['filename']),
                            'source_zip': metadata.get('source_zip'),
                            'size_bytes': size_bytes or metadata.get('size_bytes')
                        })
                except Exception as e:
                    logger.error(f"Failed to process file {file_data.get('filename')}: {e}")
                    metadata = {}
                    size_bytes = None
                    if processed_files and i < len(processed_files):
                        processed_file = processed_files[i]
                        metadata = self._extract_metadata(processed_file)
                        if hasattr(processed_file, 'size_bytes'):
                            size_bytes = processed_file.size_bytes
                    document_results.append({
                        'filename': file_data.get('filename'),
                        'success': False,
                        'error': f'Processing failed: {str(e)}',
                        'data': None,
                        'original_path': metadata.get('original_path', file_data.get('filename')),
                        'source_zip': metadata.get('source_zip'),
                        'size_bytes': size_bytes or metadata.get('size_bytes')
                    })

            successful_docs = [doc for doc in document_results if doc['success']]
            if not successful_docs:
                return ExtractionResult(success=False, error="Failed to extract data from any documents", by_document=document_results)

            return ExtractionResult(success=True, data=all_data, by_document=document_results, rows_extracted=total_rows, ai_model=self.base_model_name)

        except Exception as e:
            logger.error(f"AI extraction failed: {e}")
            return ExtractionResult(success=False, error=f"AI extraction failed: {str(e)}")

    async def extract_data_combined(self, files_data: List[Dict], fields: List[FieldConfig], data_types_map: Dict[str, Dict], system_prompt: str, processed_files: List = None) -> ExtractionResult:
        """Extract structured data from multiple files using Vertex AI in a single request."""
        if not self.client:
            return ExtractionResult(success=False, error="AI service not available - Vertex client not configured")

        try:
            response_schema = self.create_combined_json_schema(fields, data_types_map)
            config = types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=response_schema,
            )

            # Build file parts and names
            file_parts = []
            file_names = []
            for i, file_data in enumerate(files_data):
                uri = file_data.get('uri')
                if not uri:
                    logger.warning(f"Skipping file without URI: {file_data}")
                    continue
                mime_type = file_data.get('mime_type') or 'application/pdf'
                file_parts.append(types.Part.from_uri(file_uri=uri, mime_type=mime_type))
                file_names.append(file_data.get('filename'))

            if not file_parts:
                return ExtractionResult(success=False, error="No valid files to process in combined mode")

            field_list = chr(10).join([f"- {field.name} ({field.data_type}): {field.prompt}" for field in fields])
            doc_list = chr(10).join([f"Document {i+1}: {name}" for i, name in enumerate(file_names)])
            prompt = f"""{system_prompt}

You are processing {len(file_names)} documents together. Please provide the following fields given ALL documents.

{doc_list}

Fields to provide:
{field_list}

Indicate which document(s) results came from by providing document filenames in source_documents.
"""

            logger.info("=== VERTEX PROMPT DEBUG (Combined Mode) ===")
            logger.info(f"System prompt: {system_prompt}")
            logger.info(f"Document list: {doc_list}")
            logger.info(f"Field list: {field_list}")
            logger.info(f"Complete prompt: {prompt}")
            logger.info("=== END VERTEX PROMPT DEBUG ===")

            resp = self.client.models.generate_content(
                model=self.base_model_name,
                contents=file_parts + [prompt],
                config=config,
            )

            if not resp or not getattr(resp, 'text', None):
                return ExtractionResult(success=False, error="AI model returned empty response for combined processing")

            try:
                extracted_data = json.loads(resp.text)
                document_results = []
                all_data = extracted_data if isinstance(extracted_data, list) else [extracted_data]

                for i, file_data in enumerate(files_data):
                    filename = file_data.get('filename')
                    metadata = {}
                    size_bytes = None
                    if processed_files and i < len(processed_files):
                        processed_file = processed_files[i]
                        metadata = self._extract_metadata(processed_file)
                        if hasattr(processed_file, 'size_bytes'):
                            size_bytes = processed_file.size_bytes

                    file_data_points = []
                    for data_point in all_data:
                        if isinstance(data_point, dict) and 'source_documents' in data_point:
                            if filename in data_point['source_documents']:
                                individual_point = {k: v for k, v in data_point.items() if k != 'source_documents'}
                                file_data_points.append(individual_point)

                    if file_data_points:
                        document_results.append({
                            'filename': filename,
                            'success': True,
                            'data': file_data_points[0] if len(file_data_points) == 1 else file_data_points,
                            'error': None,
                            'original_path': metadata.get('original_path', filename),
                            'source_zip': metadata.get('source_zip'),
                            'size_bytes': size_bytes or metadata.get('size_bytes'),
                            'contributed_to': [i for i, dp in enumerate(all_data) if filename in dp.get('source_documents', [])]
                        })
                    else:
                        document_results.append({
                            'filename': filename,
                            'success': False,
                            'error': 'No data extracted from this document in combined processing',
                            'data': None,
                            'original_path': metadata.get('original_path', filename),
                            'source_zip': metadata.get('source_zip'),
                            'size_bytes': size_bytes or metadata.get('size_bytes'),
                            'contributed_to': []
                        })

                return ExtractionResult(success=True, data=all_data, by_document=document_results, rows_extracted=len(all_data), ai_model=self.base_model_name)

            except Exception as e:
                logger.error(f"Failed to parse JSON for combined processing: {e}")
                return ExtractionResult(success=False, error=f"Failed to parse AI response for combined processing: {str(e)}")

        except Exception as e:
            logger.error(f"Combined AI extraction failed: {e}")
            return ExtractionResult(success=False, error=f"Combined AI extraction failed: {str(e)}")

    async def extract_data_from_files(self, files_data: List[Dict], fields: List[FieldConfig], data_types_map: Dict[str, Dict], system_prompt: str, processed_files: List = None, processing_mode: str = "individual") -> ExtractionResult:
        """Route to appropriate extraction method based on processing mode with fallback"""
        if processing_mode == "combined":
            logger.info(f"Using combined processing for {len(files_data)} files")
            try:
                result = await self.extract_data_combined(files_data, fields, data_types_map, system_prompt, processed_files)
                if result.success:
                    return result
                else:
                    logger.warning(f"Combined processing failed: {result.error}. Falling back to individual processing.")
                    # Fall back to individual processing
                    logger.info(f"Falling back to individual processing for {len(files_data)} files")
                    return await self.extract_data_individual(files_data, fields, data_types_map, system_prompt, processed_files)
            except Exception as e:
                logger.error(f"Combined processing failed with exception: {e}. Falling back to individual processing.")
                # Fall back to individual processing
                logger.info(f"Falling back to individual processing for {len(files_data)} files")
                return await self.extract_data_individual(files_data, fields, data_types_map, system_prompt, processed_files)
        else:
            logger.info(f"Using individual processing for {len(files_data)} files")
            return await self.extract_data_individual(files_data, fields, data_types_map, system_prompt, processed_files)
    
    def validate_field_config(self, fields: List[FieldConfig]) -> List[str]:
        """Validate field configuration and return any errors"""
        errors = []
        
        if not fields:
            errors.append("At least one field must be specified")
            return errors
        
        # if len(fields) > 20:
        #     errors.append("Maximum 20 fields allowed per extraction")
        
        field_names = set()
        for i, field in enumerate(fields):
            if not field.name or not field.name.strip():
                errors.append(f"Field {i+1}: Name is required")
            elif field.name in field_names:
                errors.append(f"Field {i+1}: Duplicate field name '{field.name}'")
            else:
                field_names.add(field.name)
            
            if not field.data_type or not field.data_type.strip():
                errors.append(f"Field {i+1}: Data type is required")
            
            if field.prompt and len(field.prompt) > 500:
                errors.append(f"Field {i+1}: Prompt too long (max 500 characters)")
        
        return errors