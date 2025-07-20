# Implementation Plan

- [x] 1. Rename existing method and create combined processing method

  - Rename current `extract_data_from_files` to `extract_data_individual` for clarity
  - Create new `extract_data_combined` method that processes all files in a single AI request
  - Add method routing logic based on processing mode
  - _Requirements: 1.1, 1.2_

- [x] 2. Implement combined file upload to AI service

  - Modify file upload logic to batch all files in a single request to Gemini
  - Update file reference handling to work with multiple files simultaneously
  - Add proper file naming and ordering for AI context
  - _Requirements: 1.1, 2.2, 3.2_

- [x] 3. Enhance JSON schema for source attribution

  - Add `source_documents` field to JSON schema for combined processing
  - Update schema generation to include file attribution requirements
  - Ensure backward compatibility with individual processing schema
  - _Requirements: 2.4, 4.1_

- [x] 4. Create combined processing prompt template

  - Design prompt that references multiple documents by name/number
  - Add instructions for AI to indicate source files for each extracted data point
  - Include field extraction instructions that work across multiple documents
  - _Requirements: 2.1, 2.3_

- [x] 5. Update worker to route processing based on mode

  - Modify worker.py to call appropriate extraction method based on task.processing_mode
  - Ensure proper parameter passing to both individual and combined methods
  - Add logging to track which processing mode is being used
  - _Requirements: 1.1, 1.3_

- [x] 6. Implement result attribution and validation

  - Parse and validate `source_documents` field from AI response
  - Create proper result structure that maps data to source files
  - Add fallback logic for missing or invalid file attributions
  - _Requirements: 1.4, 4.2, 4.3_

- [ ] 7. Add error handling and fallback mechanisms

  - Implement fallback to individual processing if combined processing fails
  - Add proper error handling for file upload failures in combined mode
  - Handle AI response validation errors gracefully
  - _Requirements: 3.4_

- [ ] 8. Update result processing in job service
  - Ensure job service properly handles combined processing results
  - Verify that file tree display works correctly with combined results
  - Test that source file attribution is preserved through the entire pipeline
  - _Requirements: 4.4_
