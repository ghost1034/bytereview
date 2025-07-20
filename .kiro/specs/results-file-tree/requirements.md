# Requirements Document

## Introduction

This feature enhances the Results step of job workflows by implementing a hierarchical file tree visualization that displays extraction results in an organized folder structure. Currently, the Results step shows files as a flat list, but users need to see the actual folder hierarchy to better understand and navigate their extracted data from complex document structures.

## Requirements

### Requirement 1

**User Story:** As a user viewing extraction results, I want to see files organized in a hierarchical tree structure with folders and subfolders, so that I can easily navigate and understand the original document organization.

#### Acceptance Criteria

1. WHEN viewing results with multiple files THEN the system SHALL display a file tree structure on the left side of the interface
2. WHEN a file has an original_path field THEN the system SHALL use this path to build the folder hierarchy
3. WHEN folders contain subfolders THEN the system SHALL display them as expandable/collapsible nodes
4. WHEN a folder is clicked THEN the system SHALL toggle its expanded/collapsed state
5. WHEN a file is selected in the tree THEN the system SHALL display its extraction results in the table on the right side

### Requirement 2

**User Story:** As a user navigating the file tree, I want to see visual indicators for different node types (files vs folders), so that I can quickly distinguish between them.

#### Acceptance Criteria

1. WHEN displaying tree nodes THEN the system SHALL show folder icons for directories
2. WHEN displaying tree nodes THEN the system SHALL show file icons for individual files
3. WHEN a folder is expanded THEN the system SHALL show a down chevron icon
4. WHEN a folder is collapsed THEN the system SHALL show a right chevron icon
5. WHEN a file is selected THEN the system SHALL highlight it with a distinct background color

### Requirement 3

**User Story:** As a user with deeply nested folder structures, I want proper indentation and visual hierarchy, so that I can understand the relationship between folders and files at different levels.

#### Acceptance Criteria

1. WHEN displaying nested folders THEN the system SHALL indent child nodes based on their depth level
2. WHEN calculating indentation THEN the system SHALL use consistent spacing (12px per level)
3. WHEN displaying the tree THEN the system SHALL maintain proper visual alignment for all nodes
4. WHEN folders are deeply nested THEN the system SHALL provide scrolling for the tree view

### Requirement 4

**User Story:** As a user viewing extraction results, I want the selected file's data to be displayed in a clear table format, so that I can easily review the extracted information.

#### Acceptance Criteria

1. WHEN a file is selected THEN the system SHALL display the file name and path in the header
2. WHEN displaying extraction data THEN the system SHALL show it in a table with field names as headers
3. WHEN extraction data is missing THEN the system SHALL display "Not found" with appropriate styling
4. WHEN switching between files THEN the system SHALL update the table content immediately
5. WHEN no file is selected THEN the system SHALL show the first available file by default
