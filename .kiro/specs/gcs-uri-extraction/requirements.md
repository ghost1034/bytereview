# Requirements Document

## Introduction

This feature modifies the AI extraction process to use Google Cloud Storage URIs directly with the Gemini API instead of downloading files to the worker and then uploading them to Gemini. This will improve performance, reduce memory usage, and eliminate unnecessary file transfers.

## Requirements

### Requirement 1

**User Story:** As a system administrator, I want the AI extraction process to use GCS URIs directly so that the system uses less memory and processes files faster.

#### Acceptance Criteria

1. WHEN an extraction task is processed THEN the system SHALL pass GCS URIs directly to the Gemini API instead of downloading files
2. WHEN files are stored in GCS THEN the system SHALL construct proper gs:// URIs for Gemini API consumption
3. WHEN the Gemini API processes files THEN it SHALL receive the files directly from GCS without intermediate downloads

### Requirement 2

**User Story:** As a developer, I want the worker process to be more efficient so that it can handle more concurrent tasks without running out of memory.

#### Acceptance Criteria

1. WHEN processing extraction tasks THEN the worker SHALL NOT download files to local temporary storage
2. WHEN multiple files are processed THEN the worker SHALL maintain low memory usage throughout the process
3. WHEN extraction tasks complete THEN temporary file cleanup SHALL no longer be necessary

### Requirement 3

**User Story:** As a system operator, I want the extraction process to be more reliable so that large files don't cause worker crashes.

#### Acceptance Criteria

1. WHEN large PDF files are processed THEN the worker SHALL NOT consume excessive memory
2. WHEN network issues occur THEN the system SHALL rely on GCS's built-in reliability instead of handling downloads
3. WHEN extraction fails THEN error handling SHALL still provide meaningful feedback to users

### Requirement 4

**User Story:** As a user, I want my extraction jobs to complete faster so that I can get results more quickly.

#### Acceptance Criteria

1. WHEN extraction tasks are processed THEN the total processing time SHALL be reduced by eliminating download/upload steps
2. WHEN multiple files are processed THEN the system SHALL process them more efficiently
3. WHEN extraction completes THEN users SHALL receive results in less time than the current implementation
