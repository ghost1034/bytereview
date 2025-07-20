# Design Document

## Overview

This design implements a hierarchical file tree visualization for the Results step in job workflows. The feature transforms the current flat file list into an organized tree structure that displays folders, subfolders, and files based on their original paths. Users can navigate through the tree to select files and view their extraction results in a table format.

## Architecture

### Component Structure

```
ResultsStep
├── FileTreeView (new component)
│   └── FileTreeNode (recursive component)
│       ├── FolderNode (expandable/collapsible)
│       └── FileNode (selectable)
└── ExtractionTable (enhanced existing table)
```

### Data Flow

1. **Data Ingestion**: Job results are fetched via `useJobResults` hook
2. **Tree Building**: Results are processed to build hierarchical tree structure
3. **State Management**: Selected file state is managed at ResultsStep level
4. **Display**: Tree and table are rendered side-by-side with synchronized selection

## Components and Interfaces

### Data Models

```typescript
type FileNode = {
  name: string;
  path: string;
  type: "file";
  result: JobResult; // The extraction result data
};

type FolderNode = {
  name: string;
  path: string;
  type: "folder";
  children: (FileNode | FolderNode)[];
};

type TreeNode = FileNode | FolderNode;

type JobResult = {
  task_id: string;
  source_files: string[];
  processing_mode: string;
  extracted_data: Record<string, any>;
};
```

### FileTreeView Component

**Props:**

- `fileTree: TreeNode[]` - The hierarchical tree structure
- `selectedPath: string | null` - Currently selected file path
- `onSelect: (path: string) => void` - File selection handler

**Responsibilities:**

- Render the complete file tree structure
- Handle scrolling for large trees
- Provide container styling and layout

### FileTreeNode Component

**Props:**

- `node: TreeNode` - The tree node to render
- `selectedPath: string | null` - Currently selected file path
- `onSelect: (path: string) => void` - File selection handler
- `level: number` - Nesting depth for indentation

**Responsibilities:**

- Render individual tree nodes (files or folders)
- Handle expand/collapse state for folders
- Apply proper indentation based on nesting level
- Manage selection highlighting

### Tree Building Algorithm

The tree building process transforms flat file results into a hierarchical structure:

1. **Path Processing**: Extract file paths from `source_files[0]` or `extracted_data.original_path`
2. **Path Segmentation**: Split paths by '/' to identify folder hierarchy
3. **Node Creation**: Create file nodes with associated result data
4. **Folder Structure**: Build folder nodes and establish parent-child relationships
5. **Tree Assembly**: Organize nodes into a root-level tree array

```typescript
const buildFileTree = (results: JobResult[]): TreeNode[] => {
  const tree: TreeNode[] = [];
  const folderMap: Record<string, FolderNode> = {};

  results.forEach((result) => {
    const filePath =
      result.extracted_data?.original_path || result.source_files[0];
    const pathSegments = filePath.split("/");
    const fileName = pathSegments.pop() || filePath;

    // Create file node
    const fileNode: FileNode = {
      name: fileName,
      path: filePath,
      type: "file",
      result: result,
    };

    // Build folder hierarchy and add file
    // ... (detailed implementation in tasks)
  });

  return tree;
};
```

## Error Handling

### Missing Path Data

- **Fallback**: Use `source_files[0]` if `original_path` is not available
- **Default Behavior**: Place files without paths at root level

### Empty Results

- **Display**: Show "No Results Found" message with appropriate icon
- **User Action**: Provide option to start new extraction

### Malformed Paths

- **Sanitization**: Handle paths with invalid characters or formats
- **Fallback**: Use filename only if path parsing fails

## Testing Strategy

### Unit Tests

1. **Tree Building Logic**

   - Test with various path structures (flat, nested, mixed)
   - Verify correct parent-child relationships
   - Handle edge cases (empty paths, duplicate names)

2. **Component Rendering**

   - Test FileTreeNode with different node types
   - Verify proper indentation calculations
   - Test expand/collapse functionality

3. **Selection Handling**
   - Test file selection and state updates
   - Verify table content updates on selection change
   - Test default selection behavior

### Integration Tests

1. **Data Flow**

   - Test complete flow from API data to tree rendering
   - Verify synchronization between tree selection and table display
   - Test with real job results data

2. **User Interactions**
   - Test folder expand/collapse interactions
   - Test file selection and highlighting
   - Test scrolling behavior with large trees

### Visual Tests

1. **Layout Verification**

   - Verify proper indentation at different nesting levels
   - Test responsive behavior with varying content sizes
   - Verify icon and styling consistency

2. **Accessibility**
   - Test keyboard navigation through tree
   - Verify screen reader compatibility
   - Test focus management and visual indicators

## Performance Considerations

### Tree Building Optimization

- **Memoization**: Cache tree structure to avoid rebuilding on re-renders
- **Lazy Loading**: Consider virtualization for very large file trees
- **Path Processing**: Optimize string operations for large datasets

### Rendering Performance

- **React.memo**: Memoize FileTreeNode components to prevent unnecessary re-renders
- **Key Optimization**: Use stable keys for tree nodes to optimize React reconciliation
- **State Management**: Minimize state updates to reduce re-render frequency

### Memory Management

- **Data Structure**: Use efficient data structures for tree representation
- **Cleanup**: Properly clean up event listeners and state on unmount
- **Reference Management**: Avoid circular references in tree structure
