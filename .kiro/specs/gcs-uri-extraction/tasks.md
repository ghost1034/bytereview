# Implementation Plan

- [x] 1. Research Gemini API GCS URI support and update AI service interface

  - Investigate Gemini API documentation for GCS URI support
  - Test GCS URI functionality with sample files
  - Update AIExtractionService to accept GCS URIs instead of file content
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Implement GCS URI construction utilities

  - Create utility function to construct gs:// URIs from bucket and object names
  - Add validation for GCS URI format
  - Add configuration for GCS bucket name
  - _Requirements: 1.1, 1.2_

- [x] 3. Modify AI extraction service to use GCS URIs

  - Replace file content upload with GCS URI references
  - Update method signature to accept GCS URIs and filenames
  - Modify Gemini API calls to use GCS file references
  - _Requirements: 1.1, 1.3, 4.1_

- [x] 4. Update extraction worker to pass GCS URIs instead of downloading files

  - Remove file download logic from process_extraction_task
  - Construct GCS URIs from SourceFile records
  - Pass GCS URIs to updated AI service method
  - Remove temporary file cleanup code
  - _Requirements: 2.1, 2.2, 2.3, 3.1_

- [x] 5. Update error handling for GCS URI-based processing

  - Add error handling for GCS access issues
  - Update error messages to be meaningful for GCS URI failures
  - Ensure task failure reporting still works correctly
  - _Requirements: 3.3_

- [x] 6. Test the updated extraction process

  - Create unit tests for GCS URI construction
  - Test AI service with GCS URIs
  - Test worker with real extraction tasks
  - Verify memory usage reduction and performance improvement
  - _Requirements: 2.1, 2.2, 4.1, 4.2_

- [x] 7. Update service account permissions and configuration
  - Verify GCS bucket permissions for Gemini API access
  - Document required IAM roles and permissions
  - Test with production-like service account setup
  - _Requirements: 1.2, 1.3_
