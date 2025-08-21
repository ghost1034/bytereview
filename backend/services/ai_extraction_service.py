"""
AI-powered data extraction service using Google Gemini
Direct PDF processing with structured JSON schema output using GCS URIs
"""
import asyncio
import google.generativeai as genai
import json
import os
import io
from typing import List, Dict, Any, Optional
import logging
from models.extraction import FieldConfig, ExtractionResult

logger = logging.getLogger(__name__)

class AIExtractionService:
    def __init__(self):
        # Configure Gemini
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            logger.warning("GEMINI_API_KEY not found, AI extraction will not work")
            self.model = None
        else:
            genai.configure(api_key=api_key)
            # Use Gemini 2.5 Pro for enhanced document processing and accuracy
            # Model will be configured with JSON schema per request
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
    
    
    def create_json_schema(self, fields: List[FieldConfig], data_types_map: Dict[str, Dict]) -> Dict:
        """Create JSON schema for structured output using database data types"""
        
        # Define properties for each field
        properties = {}
        for field in fields:
            # Get the data type info from the database
            data_type_info = data_types_map.get(field.data_type)
            if not data_type_info:
                # Fallback to string if data type not found
                logger.warning(f"Data type '{field.data_type}' not found in database, using string")
                field_schema = {
                    "type": "string",
                    "description": field.prompt
                }
            else:
                # Create field schema using database info
                field_schema = {
                    "type": data_type_info["base_json_type"],
                    "description": field.prompt
                }
                
                # Add JSON format if specified in database
                if data_type_info.get("json_format"):
                    field_schema["format"] = data_type_info["json_format"]
            
            properties[field.name] = field_schema
        
        # Always return array of objects schema - handles both single and multi-row cases
        schema = {
            "type": "array",
            "items": {
                "type": "object",
                "properties": properties,
                "required": list(properties.keys())
            }
        }
        
        return schema

    def create_combined_json_schema(self, fields: List[FieldConfig], data_types_map: Dict[str, Dict]) -> Dict:
        """Create JSON schema for combined processing with source attribution"""
        
        # Define properties for each field
        properties = {}
        for field in fields:
            # Get the data type info from the database
            data_type_info = data_types_map.get(field.data_type)
            if not data_type_info:
                # Fallback to string if data type not found
                logger.warning(f"Data type '{field.data_type}' not found in database, using string")
                field_schema = {
                    "type": "string",
                    "description": field.prompt
                }
            else:
                # Create field schema using database info
                field_schema = {
                    "type": data_type_info["base_json_type"],
                    "description": field.prompt
                }
                
                # Add JSON format if specified in database
                if data_type_info.get("json_format"):
                    field_schema["format"] = data_type_info["json_format"]
            
            properties[field.name] = field_schema
        
        # Add source_documents field for attribution
        properties["source_documents"] = {
            "type": "array",
            "items": {"type": "string"},
            "description": "List of document filenames that contributed to this data"
        }
        
        # Return array of objects schema with source attribution
        schema = {
            "type": "array",
            "items": {
                "type": "object",
                "properties": properties,
                "required": list(properties.keys())
            }
        }
        
        return schema

    async def extract_data_individual(self, files_data: List[Dict], fields: List[FieldConfig], data_types_map: Dict[str, Dict], system_prompt: str, processed_files: List = None) -> ExtractionResult:
        """Extract structured data from PDF files using AI with JSON schema - process each file separately"""
        if not hasattr(self, 'base_model_name'):
            return ExtractionResult(
                success=False,
                error="AI service not available - GEMINI_API_KEY not configured"
            )
        
        try:
            # Create JSON schema for structured output
            json_schema = self.create_json_schema(fields, data_types_map)
            
            # Configure model with JSON schema
            generation_config = genai.GenerationConfig(
                response_mime_type="application/json",
                response_schema=json_schema
            )
            
            model = genai.GenerativeModel(
                self.base_model_name,
                generation_config=generation_config
            )
            
            # Use system prompt from database and add field-specific instructions
            field_list = chr(10).join([f"- {field.name} ({field.data_type}): {field.prompt}" for field in fields])
            
            prompt = f"""{system_prompt}

Extract the following data fields from the document. If the document contains multiple records (like multiple line items, invoices, etc.), return all of them as separate objects in the array:

{field_list}

Make sure the resulting fields are provided exactly in the order given above.
If a field is not found, use null.
If the field name, data type, or prompt includes formatting information, follow that instead of exactly matching the format of what is in the document.
"""
            
            # Debug: Log the complete prompt being sent to Gemini
            logger.info(f"=== GEMINI PROMPT DEBUG (Individual Mode) ===")
            logger.info(f"System prompt: {system_prompt}")
            logger.info(f"Field list: {field_list}")
            logger.info(f"Complete prompt: {prompt}")
            logger.info(f"=== END GEMINI PROMPT DEBUG ===")
            
            # Process each file separately to get individual results
            document_results = []
            all_data = []
            total_rows = 0
            
            for i, file_data in enumerate(files_data):
                try:
                    logger.info(f"Processing file: {file_data['filename']}")
                    
                    # Upload single file to Gemini (run in thread pool to avoid blocking)
                    uploaded_file = await asyncio.to_thread(
                        genai.upload_file,
                        io.BytesIO(file_data['content']),
                        mime_type=file_data['mime_type'],
                        display_name=file_data['filename']
                    )
                    
                    # Wait for file to be processed
                    # import time
                    # time.sleep(2)  # Give Gemini time to process the file
                    
                    # Generate response for this specific file (run in thread pool to avoid blocking)
                    content_parts = [prompt, uploaded_file]
                    response = await asyncio.to_thread(model.generate_content, content_parts)
                    
                    if not response or not response.text:
                        document_results.append({
                            'filename': file_data['filename'],
                            'success': False,
                            'error': 'AI model returned empty response',
                            'data': None
                        })
                        continue
                    
                    # Parse the JSON response for this document
                    try:
                        extracted_data = json.loads(response.text.strip())
                        logger.info(f"Successfully extracted data from {file_data['filename']}")
                        
                        # Get metadata from processed_files if available
                        metadata = {}
                        size_bytes = None
                        if processed_files and i < len(processed_files):
                            processed_file = processed_files[i]
                            metadata = self._extract_metadata(processed_file)
                            if hasattr(processed_file, 'size_bytes'):
                                size_bytes = processed_file.size_bytes
                        
                        # Store individual document result with metadata
                        # For individual files, extract the first item from the array
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
                        
                        # Add to combined data - extend with the array of rows
                        if isinstance(extracted_data, list):
                            all_data.extend(extracted_data)
                            total_rows += len(extracted_data)
                        else:
                            all_data.append(extracted_data)
                            total_rows += 1
                            
                    except json.JSONDecodeError as e:
                        logger.error(f"Failed to parse JSON for {file_data['filename']}: {e}")
                        
                        # Get metadata for failed files too
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
                    logger.error(f"Failed to process file {file_data['filename']}: {e}")
                    
                    # Get metadata for failed files too
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
                        'error': f'Processing failed: {str(e)}',
                        'data': None,
                        'original_path': metadata.get('original_path', file_data['filename']),
                        'source_zip': metadata.get('source_zip'),
                        'size_bytes': size_bytes or metadata.get('size_bytes')
                    })
            
            # Check if any documents were successfully processed
            successful_docs = [doc for doc in document_results if doc['success']]
            
            if not successful_docs:
                return ExtractionResult(
                    success=False,
                    error="Failed to extract data from any documents",
                    by_document=document_results
                )
            
            return ExtractionResult(
                success=True,
                data=all_data,  # Combined data for backward compatibility
                by_document=document_results,  # Individual document results
                rows_extracted=total_rows,
                ai_model="gemini-2.5-pro"
            )
        
        except Exception as e:
            logger.error(f"AI extraction failed: {e}")
            return ExtractionResult(
                success=False,
                error=f"AI extraction failed: {str(e)}"
            )

    async def extract_data_combined(self, files_data: List[Dict], fields: List[FieldConfig], data_types_map: Dict[str, Dict], system_prompt: str, processed_files: List = None) -> ExtractionResult:
        """Extract structured data from multiple PDF files using AI in a single request - true combined processing"""
        if not hasattr(self, 'base_model_name'):
            return ExtractionResult(
                success=False,
                error="AI service not available - GEMINI_API_KEY not configured"
            )
        
        try:
            # Create enhanced JSON schema for combined processing with source attribution
            json_schema = self.create_combined_json_schema(fields, data_types_map)
            
            # Configure model with JSON schema
            generation_config = genai.GenerationConfig(
                response_mime_type="application/json",
                response_schema=json_schema
            )
            
            model = genai.GenerativeModel(
                self.base_model_name,
                generation_config=generation_config
            )
            
            # Upload all files to Gemini in a batch
            uploaded_files = []
            file_names = []
            
            for i, file_data in enumerate(files_data):
                try:
                    logger.info(f"Uploading file for combined processing: {file_data['filename']}")
                    
                    uploaded_file = genai.upload_file(
                        io.BytesIO(file_data['content']),
                        mime_type=file_data['mime_type'],
                        display_name=file_data['filename']
                    )
                    uploaded_files.append(uploaded_file)
                    file_names.append(file_data['filename'])
                    
                except Exception as e:
                    logger.error(f"Failed to upload file {file_data['filename']}: {e}")
                    # Continue with other files, we'll handle partial uploads
            
            if not uploaded_files:
                return ExtractionResult(
                    success=False,
                    error="Failed to upload any files for combined processing"
                )
            
            # Wait for all files to be processed by Gemini
            # import time
            # time.sleep(len(uploaded_files))  # Give more time for multiple files
            
            # Create combined prompt that references all documents
            field_list = chr(10).join([f"- {field.name} ({field.data_type}): {field.prompt}" for field in fields])
            
            # Create document list for the prompt
            doc_list = chr(10).join([f"Document {i+1}: {name}" for i, name in enumerate(file_names)])
            
            prompt = f"""{system_prompt}

You are processing {len(file_names)} documents together. Please extract the following fields given ALL documents.

{doc_list}

Fields to extract:
{field_list}

Make sure the resulting fields are provided exactly in the order given above.
For each extracted data point, indicate which document(s) it came from using the document filenames.
If a field is not found in any document, use null.
If the field name, data type, or prompt includes formatting information, follow that instead of exactly matching the format of what is in the document.
"""
            
            # Debug: Log the complete prompt being sent to Gemini
            logger.info(f"=== GEMINI PROMPT DEBUG (Combined Mode) ===")
            logger.info(f"System prompt: {system_prompt}")
            logger.info(f"Document list: {doc_list}")
            logger.info(f"Field list: {field_list}")
            logger.info(f"Complete prompt: {prompt}")
            logger.info(f"=== END GEMINI PROMPT DEBUG ===")
            
            # Generate response for all files together
            content_parts = [prompt] + uploaded_files
            logger.info(f"Sending {len(uploaded_files)} files to AI for combined processing")
            logger.info(f"AI Prompt preview: {prompt[:300]}...")
            
            response = await asyncio.to_thread(model.generate_content, content_parts)
            
            if not response or not response.text:
                return ExtractionResult(
                    success=False,
                    error="AI model returned empty response for combined processing"
                )
            
            # Parse the JSON response
            try:
                extracted_data = json.loads(response.text.strip())
                logger.info(f"Successfully extracted combined data from {len(file_names)} files")
                
                # Process the combined results
                document_results = []
                all_data = extracted_data if isinstance(extracted_data, list) else [extracted_data]
                
                # Create individual document results based on source attribution
                for i, file_data in enumerate(files_data):
                    filename = file_data['filename']
                    
                    # Get metadata
                    metadata = {}
                    size_bytes = None
                    if processed_files and i < len(processed_files):
                        processed_file = processed_files[i]
                        metadata = self._extract_metadata(processed_file)
                        if hasattr(processed_file, 'size_bytes'):
                            size_bytes = processed_file.size_bytes
                    
                    # Find data points that reference this file
                    file_data_points = []
                    for data_point in all_data:
                        if isinstance(data_point, dict) and 'source_documents' in data_point:
                            if filename in data_point['source_documents']:
                                # Create a copy without source_documents for individual result
                                individual_point = {k: v for k, v in data_point.items() if k != 'source_documents'}
                                file_data_points.append(individual_point)
                    
                    # Create document result
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
                
                return ExtractionResult(
                    success=True,
                    data=all_data,  # Combined data with source attribution
                    by_document=document_results,  # Individual document results
                    rows_extracted=len(all_data),
                    ai_model="gemini-2.5-pro"
                )
                
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse JSON for combined processing: {e}")
                return ExtractionResult(
                    success=False,
                    error=f"Failed to parse AI response for combined processing: {str(e)}"
                )
        
        except Exception as e:
            logger.error(f"Combined AI extraction failed: {e}")
            return ExtractionResult(
                success=False,
                error=f"Combined AI extraction failed: {str(e)}"
            )

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
        
        if len(fields) > 20:
            errors.append("Maximum 20 fields allowed per extraction")
        
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