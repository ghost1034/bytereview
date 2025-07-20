# Design Document

## Overview

This design implements true combined processing for AI extraction where multiple files are sent to the AI service together in a single request. The current system has the infrastructure for combined vs individual processing modes, but the AI extraction service still processes files individually. This enhancement modifies the AI service to actually combine files when processing_mode="combined".

## Architecture

### Current vs New Flow

**Current Flow (Individual Processing):**

```
Files → [AI Call 1, AI Call 2, AI Call 3, ...] → Individual Results → Combine Results
```

**New Flow (Combined Processing):**

```
Files → [Single AI Call with All Files] → Combined Results → Attribute to Source Files
```

### Component Changes

1. **AIExtractionService**: Add new method for true combined processing
2. **Worker**: Route to appropriate processing method based on mode
3. **Result Attribution**: Track which files contribute to each data point

## Components and Interfaces

### Enhanced AIExtractionService

```python
class AIExtractionService:
    async def extract_data_combined(
        self,
        files_data: List[Dict],
        fields: List[FieldConfig],
        data_types_map: Dict[str, Dict],
        system_prompt: str,
        processed_files: List = None
    ) -> ExtractionResult:
        """Extract data from multiple files in a single AI request"""

    async def extract_data_individual(
        self,
        files_data: List[Dict],
        fields: List[FieldConfig],
        data_types_map: Dict[str, Dict],
        system_prompt: str,
        processed_files: List = None
    ) -> ExtractionResult:
        """Extract data from files individually (current behavior)"""
```

### Combined Processing Logic

#### File Upload Strategy

- Upload all files to Gemini in a single batch
- Use file references in the prompt to distinguish between documents
- Maintain file order and naming for result attribution

#### Prompt Engineering

```
System: {system_prompt}

You are processing {N} documents together. Please extract the following fields from ALL documents:

Document 1: {filename1}
Document 2: {filename2}
...

Fields to extract:
- field1: description
- field2: description

For each extracted data point, indicate which document(s) it came from using the document numbers.
Return results as an array where each item includes a "source_documents" field.
```

#### JSON Schema Enhancement

```python
# Enhanced schema for combined processing
schema = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            **field_properties,  # Original field properties
            "source_documents": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of document filenames that contributed to this data"
            }
        },
        "required": list(field_properties.keys()) + ["source_documents"]
    }
}
```

### Result Processing

#### Combined Result Structure

```python
{
    "processing_mode": "combined",
    "source_files": ["file1.pdf", "file2.pdf", "file3.pdf"],
    "data": [
        {
            "field1": "value1",
            "field2": "value2",
            "source_documents": ["file1.pdf", "file2.pdf"]
        },
        {
            "field1": "value3",
            "field2": "value4",
            "source_documents": ["file3.pdf"]
        }
    ],
    "by_document": [
        {
            "filename": "file1.pdf",
            "success": True,
            "data": {...},
            "contributed_to": [0]  # Indices of combined results this file contributed to
        },
        ...
    ]
}
```

## Error Handling

### File Upload Failures

- **Partial Upload**: If some files fail to upload, process available files and note missing ones
- **Complete Upload Failure**: Fall back to individual processing mode
- **Size Limits**: Check total file size before attempting combined upload

### AI Processing Failures

- **Timeout**: Implement longer timeout for combined processing
- **Rate Limits**: Handle rate limiting with exponential backoff
- **Malformed Response**: Validate source_documents field and handle missing attributions

### Result Attribution Issues

- **Missing Attribution**: If AI doesn't provide source_documents, attempt to infer from content
- **Invalid File References**: Validate that referenced files exist in the uploaded set
- **Empty Results**: Handle cases where no data is extracted from any file

## Testing Strategy

### Unit Tests

1. **Combined Upload Logic**

   - Test file batching and upload sequencing
   - Verify file reference generation
   - Test error handling for upload failures

2. **Prompt Generation**

   - Test multi-document prompt formatting
   - Verify field instruction generation
   - Test schema generation with source attribution

3. **Result Processing**
   - Test source document attribution parsing
   - Verify combined result structure
   - Test fallback for missing attributions

### Integration Tests

1. **End-to-End Combined Processing**

   - Test complete flow from task creation to result storage
   - Verify processing mode routing works correctly
   - Test with various file types and sizes

2. **Comparison Testing**
   - Compare combined vs individual processing results
   - Verify combined processing is more efficient
   - Test accuracy of cross-document references

### Performance Tests

1. **Efficiency Validation**

   - Measure API call reduction (N calls → 1 call)
   - Compare processing times for multiple files
   - Test memory usage with large file batches

2. **Scalability Testing**
   - Test with varying numbers of files (2-20)
   - Test with different file sizes
   - Verify rate limiting handling

## Implementation Phases

### Phase 1: Core Combined Processing

- Implement `extract_data_combined` method
- Add enhanced JSON schema with source attribution
- Update worker to route based on processing mode

### Phase 2: Result Attribution

- Implement source document tracking
- Update result structure to include attribution
- Add validation for file references

### Phase 3: Error Handling & Optimization

- Add comprehensive error handling
- Implement fallback mechanisms
- Optimize for performance and reliability

### Phase 4: Frontend Integration

- Update results display to show source attribution
- Enhance file tree to indicate combined processing
- Add UI indicators for processing mode

## Performance Considerations

### API Efficiency

- **Reduced Calls**: Single API call instead of N calls reduces latency and rate limiting
- **Batch Upload**: More efficient file transfer to AI service
- **Context Sharing**: AI has full context, potentially improving accuracy

### Memory Management

- **File Buffering**: Manage memory usage when uploading multiple large files
- **Result Caching**: Cache combined results efficiently
- **Cleanup**: Properly clean up uploaded files after processing

### Rate Limiting

- **Combined Requests**: Larger requests may hit different rate limits
- **Timeout Handling**: Longer processing times require adjusted timeouts
- **Fallback Strategy**: Graceful degradation to individual processing if needed
