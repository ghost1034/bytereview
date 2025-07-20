# Requirements Document

## Introduction

This feature implements true combined processing for AI extraction jobs where all files in a folder are sent to the AI service together with a single prompt, rather than processing each file individually. Currently, the system has the infrastructure for combined processing but the AI service still processes files one by one, which is inefficient and doesn't leverage the AI's ability to understand relationships between documents.

## Requirements

### Requirement 1

**User Story:** As a user processing multiple related documents, I want all files to be sent to the AI service together in combined mode, so that the AI can understand relationships between documents and provide more accurate extraction results.

#### Acceptance Criteria

1. WHEN a task is configured with processing_mode="combined" THEN the system SHALL send all files to the AI service in a single request
2. WHEN processing in combined mode THEN the system SHALL use a single prompt that references all documents
3. WHEN the AI processes combined files THEN it SHALL return structured data that can reference information across multiple documents
4. WHEN combined processing completes THEN the system SHALL store results with proper source file attribution

### Requirement 2

**User Story:** As a user, I want the AI to receive context about all documents in a folder, so that it can extract information that spans multiple files or understand document relationships.

#### Acceptance Criteria

1. WHEN processing in combined mode THEN the AI prompt SHALL indicate that multiple documents are being processed together
2. WHEN the AI processes multiple files THEN it SHALL have access to content from all files simultaneously
3. WHEN extracting data THEN the AI SHALL be able to cross-reference information between documents
4. WHEN returning results THEN the AI SHALL indicate which source files contributed to each extracted data point

### Requirement 3

**User Story:** As a system administrator, I want combined processing to be more efficient than individual processing, so that we can reduce API calls and processing time for related documents.

#### Acceptance Criteria

1. WHEN processing N files in combined mode THEN the system SHALL make 1 AI API call instead of N calls
2. WHEN uploading files to the AI service THEN all files SHALL be uploaded in a single batch
3. WHEN processing completes THEN the total processing time SHALL be less than individual processing for multiple files
4. WHEN API limits are reached THEN combined processing SHALL handle rate limiting gracefully

### Requirement 4

**User Story:** As a user, I want to see which files contributed to each piece of extracted data, so that I can verify the accuracy and source of the information.

#### Acceptance Criteria

1. WHEN viewing combined processing results THEN each extracted data field SHALL show which source files it came from
2. WHEN data spans multiple files THEN the result SHALL list all contributing files
3. WHEN no data is found in any file THEN the result SHALL indicate that all files were checked
4. WHEN displaying results THEN the file tree SHALL show the combined result with proper file attribution
