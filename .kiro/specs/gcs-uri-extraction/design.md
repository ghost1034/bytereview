# Design Document

## Overview

This design modifies the AI extraction worker to use Google Cloud Storage URIs directly with the Gemini API instead of downloading files locally and then uploading them to Gemini. This approach leverages Gemini's native support for GCS URIs to improve performance and reduce resource usage.

## Architecture

### Current Flow

1. Worker receives extraction task
2. Worker downloads files from GCS to local temporary storage
3. Worker reads file content into memory
4. Worker uploads file content to Gemini API
5. Gemini processes the uploaded files
6. Worker cleans up temporary files

### New Flow

1. Worker receives extraction task
2. Worker constructs GCS URIs from stored GCS object names
3. Worker passes GCS URIs directly to Gemini API
4. Gemini accesses files directly from GCS
5. No temporary files or cleanup needed

## Components and Interfaces

### Modified Components

#### AIExtractionService

- **Current**: `extract_data_from_files(files_data: List[Dict], ...)` where `files_data` contains file content
- **New**: `extract_data_from_gcs_uris(gcs_uris: List[str], filenames: List[str], ...)` where `gcs_uris` contains GCS URIs

#### Worker (process_extraction_task)

- **Current**: Downloads files, reads content, passes to AI service
- **New**: Constructs GCS URIs, passes URIs to AI service

### New Interfaces

#### GCS URI Construction

```python
def construct_gcs_uri(bucket_name: str, object_name: str) -> str:
    """Construct a gs:// URI from bucket and object name"""
    return f"gs://{bucket_name}/{object_name}"
```

#### Gemini File Reference

```python
# Instead of:
uploaded_file = genai.upload_file(io.BytesIO(content), mime_type="application/pdf")

# Use:
file_ref = genai.get_file(gcs_uri)  # or similar GCS URI method
```

## Data Models

### Source File Processing

- **Input**: SourceFile records with `gcs_object_name` field
- **Processing**: Convert `gcs_object_name` to full GCS URI
- **Output**: List of GCS URIs for Gemini API

### Configuration Requirements

- GCS bucket name must be accessible to both the application and Gemini API
- Service account permissions must allow Gemini to read from the GCS bucket
- GCS URIs must be properly formatted as `gs://bucket-name/object-path`

## Error Handling

### GCS Access Errors

- **Scenario**: Gemini cannot access GCS URI
- **Handling**: Catch API errors, provide meaningful error messages
- **Fallback**: Log detailed error information for debugging

### URI Construction Errors

- **Scenario**: Invalid GCS object names or missing bucket configuration
- **Handling**: Validate URIs before sending to Gemini
- **Recovery**: Fail task with clear error message

### Permission Errors

- **Scenario**: Service account lacks permissions for GCS bucket
- **Handling**: Detect permission errors in API response
- **Resolution**: Provide clear guidance on required permissions

## Testing Strategy

### Unit Tests

- Test GCS URI construction with various object names
- Test error handling for invalid URIs
- Test AI service with mock GCS URIs

### Integration Tests

- Test end-to-end extraction with real GCS files
- Test permission scenarios
- Test error handling with inaccessible files

### Performance Tests

- Compare processing time before/after changes
- Measure memory usage reduction
- Test concurrent task processing

## Implementation Notes

### Gemini API GCS Support

- Verify Gemini API supports GCS URIs for file input
- Check if special authentication is required
- Confirm supported file formats via GCS URIs

### Service Account Configuration

- Ensure service account has `storage.objects.get` permission on the bucket
- Verify Gemini service can use the same service account or has separate access
- Document required IAM roles and permissions

### Backward Compatibility

- Maintain existing error handling patterns
- Keep same result format for downstream components
- Preserve logging and monitoring capabilities

## Security Considerations

### Access Control

- GCS bucket must be properly secured
- Service account permissions should follow principle of least privilege
- Audit access patterns to ensure no unauthorized file access

### Data Privacy

- Files remain in customer's GCS bucket
- No additional data copies created during processing
- Reduced attack surface by eliminating temporary file storage
