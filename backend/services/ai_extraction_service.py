"""
AI-powered data extraction service using Google Gemini
Direct PDF processing with structured JSON schema output
"""
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
    
    
    def create_json_schema(self, fields: List[FieldConfig], extract_multiple_rows: bool = False) -> Dict:
        """Create JSON schema for structured output with comprehensive data type mapping"""
        
        # Data type mapping for all supported types
        data_type_mapping = {
            # Text types
            "Text": {"type": "string"},
            "Email": {"type": "string", "description_suffix": "Extract as valid email address"},
            "Phone Number": {"type": "string", "description_suffix": "Extract phone number in standard format"},
            "Address": {"type": "string", "description_suffix": "Extract complete address"},
            "Name": {"type": "string", "description_suffix": "Extract full name"},
            "Invoice Number": {"type": "string", "description_suffix": "Extract invoice/reference number"},
            "Tax ID": {"type": "string", "description_suffix": "Extract tax identification number"},
            "SKU/Product Code": {"type": "string", "description_suffix": "Extract product SKU or code"},
            "URL": {"type": "string", "description_suffix": "Extract as valid URL"},
            
            # Number types
            "Number": {"type": "number", "description_suffix": "Extract as numeric value"},
            "Currency": {"type": "number", "description_suffix": "Extract numeric value without currency symbols"},
            "Percentage": {"type": "number", "description_suffix": "Extract as decimal (e.g., 15% as 15)"},
            "Decimal (2 places)": {"type": "number", "description_suffix": "Extract as decimal number"},
            "Integer": {"type": "integer", "description_suffix": "Extract as whole number"},
            
            # Date types
            "Date (MM/DD/YYYY)": {"type": "string", "description_suffix": "Format as MM/DD/YYYY"},
            "Date (DD/MM/YYYY)": {"type": "string", "description_suffix": "Format as DD/MM/YYYY"},
            "Date (YYYY-MM-DD)": {"type": "string", "description_suffix": "Format as YYYY-MM-DD"},
            
            # Time type
            "Time (HH:MM)": {"type": "string", "description_suffix": "Format as HH:MM (24-hour format)"},
            
            # Boolean type
            "Boolean (Yes/No)": {"type": "boolean", "description_suffix": "Return true for Yes/True, false for No/False"}
        }
        
        # Define properties for each field
        properties = {}
        for field in fields:
            # Get the mapping for this data type, default to string
            type_config = data_type_mapping.get(field.data_type, {"type": "string"})
            
            # Create field schema
            field_schema = {
                "type": type_config["type"],
                "description": field.prompt
            }
            
            # Add description suffix if specified
            if "description_suffix" in type_config:
                field_schema["description"] += f". {type_config['description_suffix']}"
            
            properties[field.name] = field_schema
        
        if extract_multiple_rows:
            # Return array of objects
            schema = {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": properties,
                    "required": list(properties.keys())
                }
            }
        else:
            # Return single object
            schema = {
                "type": "object",
                "properties": properties,
                "required": list(properties.keys())
            }
        
        return schema

    async def extract_data_from_files(self, files_data: List[Dict], fields: List[FieldConfig], extract_multiple_rows: bool = False) -> ExtractionResult:
        """Extract structured data from PDF files using AI with JSON schema - process each file separately"""
        if not hasattr(self, 'base_model_name'):
            return ExtractionResult(
                success=False,
                error="AI service not available - GEMINI_API_KEY not configured"
            )
        
        try:
            # Create JSON schema for structured output
            json_schema = self.create_json_schema(fields, extract_multiple_rows)
            
            # Configure model with JSON schema
            generation_config = genai.GenerationConfig(
                response_mime_type="application/json",
                response_schema=json_schema
            )
            
            model = genai.GenerativeModel(
                self.base_model_name,
                generation_config=generation_config
            )
            
            # Create clean, simple prompt for structured output
            field_list = chr(10).join([f"- {field.name}: {field.prompt}" for field in fields])
            
            if extract_multiple_rows:
                prompt = f"""
Analyze the PDF document and extract ALL instances of the following data fields:

{field_list}

Find all rows/records in the document. If a field is not found in a particular record, use null.
"""
            else:
                prompt = f"""
Analyze the PDF document and extract the following data fields:

{field_list}

Extract the first/primary instance of each field. If a field is not found, use null.
"""
            
            # Process each file separately to get individual results
            document_results = []
            all_data = []
            total_rows = 0
            
            for file_data in files_data:
                try:
                    logger.info(f"Processing file: {file_data['filename']}")
                    
                    # Upload single file to Gemini
                    uploaded_file = genai.upload_file(
                        io.BytesIO(file_data['content']),
                        mime_type="application/pdf",
                        display_name=file_data['filename']
                    )
                    
                    # Wait for file to be processed
                    import time
                    time.sleep(2)  # Give Gemini time to process the file
                    
                    # Generate response for this specific file
                    content_parts = [prompt, uploaded_file]
                    response = model.generate_content(content_parts)
                    
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
                        
                        # Store individual document result
                        document_results.append({
                            'filename': file_data['filename'],
                            'success': True,
                            'data': extracted_data,
                            'error': None
                        })
                        
                        # Add to combined data
                        if extract_multiple_rows and isinstance(extracted_data, list):
                            all_data.extend(extracted_data)
                            total_rows += len(extracted_data)
                        else:
                            all_data.append(extracted_data)
                            total_rows += 1
                            
                    except json.JSONDecodeError as e:
                        logger.error(f"Failed to parse JSON for {file_data['filename']}: {e}")
                        document_results.append({
                            'filename': file_data['filename'],
                            'success': False,
                            'error': f'Failed to parse AI response: {str(e)}',
                            'data': None
                        })
                        
                except Exception as e:
                    logger.error(f"Failed to process file {file_data['filename']}: {e}")
                    document_results.append({
                        'filename': file_data['filename'],
                        'success': False,
                        'error': f'Processing failed: {str(e)}',
                        'data': None
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
            
            if not field.prompt or not field.prompt.strip():
                errors.append(f"Field {i+1}: Prompt is required")
            elif len(field.prompt) > 500:
                errors.append(f"Field {i+1}: Prompt too long (max 500 characters)")
        
        return errors