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
        # Use Gemini 3 Pro for enhanced document processing and accuracy
        self.base_model_name = 'gemini-3-pro-preview'

        # Generation defaults (override via env if desired)
        try:
            self.max_output_tokens = int(os.getenv("GEMINI_MAX_OUTPUT_TOKENS", "65536"))
        except Exception:
            self.max_output_tokens = 65536
        try:
            self.temperature = float(os.getenv("GEMINI_TEMPERATURE", "1.0"))
        except Exception:
            self.temperature = 1.0
    
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
    
    
    def create_tabular_json_schema(self, fields: List[FieldConfig]) -> types.Schema:
        """Create a compact response schema: { results: any[][] }.

        Output contract:
        - Return a JSON object with a single key: "results".
        - results is an array of rows.
        - each row is an array with exactly len(fields) cells, aligned to the provided column order.
        - cells may be string|number|integer|boolean|null.
        """
        n_cols = len(fields)

        cell_schema = types.Schema(
            any_of=[
                types.Schema(type="STRING"),
                types.Schema(type="NUMBER"),
                types.Schema(type="INTEGER"),
                types.Schema(type="BOOLEAN"),
            ],
            nullable=True,
        )

        row_schema = types.Schema(
            type="ARRAY",
            items=cell_schema,
            min_items=n_cols,  # type: ignore[arg-type]
            max_items=n_cols,  # type: ignore[arg-type]
            description=f"A single extracted record with {n_cols} columns",
        )

        results_schema = types.Schema(
            type="ARRAY",
            items=row_schema,
            description="List of extracted records (rows)",
        )

        return types.Schema(
            type="OBJECT",
            properties={"results": results_schema},
            required=["results"],
        )

    def _coerce_parsed_obj(self, obj: Any) -> Any:
        if obj is None:
            return None
        if isinstance(obj, (dict, list, str, int, float, bool)):
            return obj
        if hasattr(obj, "model_dump"):
            try:
                return obj.model_dump()
            except Exception:
                pass
        if hasattr(obj, "dict"):
            try:
                return obj.dict()
            except Exception:
                pass
        return obj

    def _parse_tabular_response(self, resp: Any) -> List[List[Any]]:
        parsed = None
        if resp is not None and hasattr(resp, "parsed"):
            parsed = self._coerce_parsed_obj(getattr(resp, "parsed"))

        if parsed is None:
            text = getattr(resp, 'text', None) if resp is not None else None
            if not text:
                raise ValueError("AI model returned empty response")
            parsed = json.loads(text)
        else:
            parsed = self._coerce_parsed_obj(parsed)

        if not isinstance(parsed, dict) or "results" not in parsed:
            raise ValueError("AI response did not match expected shape: missing 'results'")

        results = parsed.get("results")
        if results is None:
            return []
        if not isinstance(results, list):
            raise ValueError("AI response 'results' is not a list")
        for row in results:
            if not isinstance(row, list):
                raise ValueError("AI response contains a non-array row")
        return results

    async def extract_data_individual(
        self,
        files_data: List[Dict],
        fields: List[FieldConfig],
        data_types_map: Dict[str, Dict],
        system_prompt: str,
        processed_files: Optional[List] = None,
    ) -> ExtractionResult:
        """Extract structured data from files using Vertex AI with JSON schema - process each file separately."""
        if not self.client:
            return ExtractionResult(success=False, error="AI service not available - Vertex client not configured")

        try:
            # Build Vertex response schema (compact tabular output)
            response_schema = self.create_tabular_json_schema(fields)
            config = types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=response_schema,
                max_output_tokens=self.max_output_tokens,
                temperature=self.temperature,
            )

            # Build user instructions
            columns = [field.name for field in fields]
            columns_json = json.dumps(columns)
            field_list = chr(10).join([f"- {field.name} ({field.data_type}): {field.prompt}" for field in fields])
            prompt = f"""{system_prompt}

You are processing one document.

Column order: columns={columns_json}

Rules:
- Each row must have exactly {len(columns)} values, in the same order as columns.
- Unless otherwise specified, use null when a value is missing/unclear.
- Use native JSON numbers/booleans for number/boolean fields (do not quote numbers).
- Do not include any extra keys besides "results".
- Do not wrap the JSON in markdown/code fences; do not pretty-print.

Fields:
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

                    try:
                        extracted_rows = self._parse_tabular_response(resp)
                        metadata = {}
                        size_bytes = None
                        if processed_files and i < len(processed_files):
                            processed_file = processed_files[i]
                            metadata = self._extract_metadata(processed_file)
                            if hasattr(processed_file, 'size_bytes'):
                                size_bytes = processed_file.size_bytes

                        individual_data = extracted_rows[0] if extracted_rows else []
                        document_results.append({
                            'filename': file_data['filename'],
                            'success': True,
                            'data': individual_data,
                            'error': None,
                            'original_path': metadata.get('original_path', file_data['filename']),
                            'source_zip': metadata.get('source_zip'),
                            'size_bytes': size_bytes or metadata.get('size_bytes')
                        })

                        all_data.extend(extracted_rows)
                        total_rows += len(extracted_rows)

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

    async def extract_data_combined(
        self,
        files_data: List[Dict],
        fields: List[FieldConfig],
        data_types_map: Dict[str, Dict],
        system_prompt: str,
        processed_files: Optional[List] = None,
    ) -> ExtractionResult:
        """Extract structured data from multiple files using Vertex AI in a single request."""
        if not self.client:
            return ExtractionResult(success=False, error="AI service not available - Vertex client not configured")

        try:
            response_schema = self.create_tabular_json_schema(fields)
            config = types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=response_schema,
                max_output_tokens=self.max_output_tokens,
                temperature=self.temperature,
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

            columns = [field.name for field in fields]
            columns_json = json.dumps(columns)
            field_list = chr(10).join([f"- {field.name} ({field.data_type}): {field.prompt}" for field in fields])
            doc_list = chr(10).join([f"Document {i+1}: {name}" for i, name in enumerate(file_names)])
            prompt = f"""{system_prompt}

You are processing {len(file_names)} documents together.

{doc_list}

Extract records from ALL documents.

Column order: columns={columns_json}

Rules:
- Each row must have exactly {len(columns)} values, in the same order as columns.
- Unless otherwise specified, use null when a value is missing/unclear.
- Use native JSON numbers/booleans for number/boolean fields (do not quote numbers).
- Do not include any extra keys besides "results".
- Do not wrap the JSON in markdown/code fences; do not pretty-print.

Fields:
{field_list}
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

            try:
                extracted_rows = self._parse_tabular_response(resp)
                return ExtractionResult(success=True, data=extracted_rows, by_document=None, rows_extracted=len(extracted_rows), ai_model=self.base_model_name)

            except Exception as e:
                logger.error(f"Failed to parse JSON for combined processing: {e}")
                return ExtractionResult(success=False, error=f"Failed to parse AI response for combined processing: {str(e)}")

        except Exception as e:
            logger.error(f"Combined AI extraction failed: {e}")
            return ExtractionResult(success=False, error=f"Combined AI extraction failed: {str(e)}")

    async def extract_data_from_files(
        self,
        files_data: List[Dict],
        fields: List[FieldConfig],
        data_types_map: Dict[str, Dict],
        system_prompt: str,
        processed_files: Optional[List] = None,
        processing_mode: str = "individual",
    ) -> ExtractionResult:
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
            
            if field.prompt and len(field.prompt) > 1500:
                errors.append(f"Field {i+1}: Prompt too long (max 1500 characters)")
        
        return errors
