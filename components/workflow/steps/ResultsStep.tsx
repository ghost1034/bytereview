/**
 * Results Step for Job Workflow
 * Display extraction results and export options
 */
"use client";

import { useState, useEffect, useMemo, memo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import {
  Download,
  FileText,
  BarChart3,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Eye,
  FileSpreadsheet,
  ChevronDown,
  ChevronRight,
  Folder,
  Files,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useJobDetails, useJobResults } from "@/hooks/useJobs";

// Type definitions for file tree structure
type JobResult = {
  task_id: string;
  source_files: string[];
  processing_mode: string;
  extracted_data: Record<string, any>;
  row_index: number;
};

type FileNode = {
  name: string;
  path: string;
  type: "file";
  result: JobResult;
};

type FolderNode = {
  name: string;
  path: string;
  type: "folder";
  children: (FileNode | FolderNode)[];
};

type TreeNode = FileNode | FolderNode;

// Helper function to build file tree from job results
const buildFileTree = (results: JobResult[]): TreeNode[] => {
  if (!results || results.length === 0) return [];

  const tree: TreeNode[] = [];
  const folderMap: Record<string, FolderNode> = {};

  // Group results by task_id to handle multiple rows per task
  const resultsByTask = new Map<string, JobResult[]>();
  results.forEach((result) => {
    const taskId = result.task_id;
    if (!resultsByTask.has(taskId)) {
      resultsByTask.set(taskId, []);
    }
    resultsByTask.get(taskId)!.push(result);
  });

  // Process each task group - create ONE node per task, not per row
  resultsByTask.forEach((taskResults, taskId) => {
    // Sort by row_index to maintain order
    taskResults.sort((a, b) => a.row_index - b.row_index);
    
    const firstResult = taskResults[0];
    
    if (firstResult.processing_mode === "combined") {
      // For combined processing, create one node representing all files
      const sourceFiles = firstResult.source_files || [];
      
      if (sourceFiles.length === 0) return;
      
      // Find the common folder path for all source files
      let commonPath = "";
      if (sourceFiles.length > 1) {
        // Find common directory path
        const paths = sourceFiles.map(file => file.split("/").slice(0, -1));
        if (paths.length > 0) {
          const minLength = Math.min(...paths.map(p => p.length));
          const commonSegments = [];
          
          for (let i = 0; i < minLength; i++) {
            const segment = paths[0][i];
            if (paths.every(path => path[i] === segment)) {
              commonSegments.push(segment);
            } else {
              break;
            }
          }
          commonPath = commonSegments.join("/");
        }
      } else {
        // Single file in combined mode - use its directory
        const filePath = sourceFiles[0];
        const pathSegments = filePath.split("/").slice(0, -1);
        commonPath = pathSegments.join("/");
      }

      // Create ONE node for the combined result (not per row)
      const combinedName = sourceFiles.length > 1 
        ? `Combined (${sourceFiles.length} files, ${taskResults.length} rows)`
        : `${sourceFiles[0].split("/").pop()} (${taskResults.length} rows)`;
      
      const combinedPath = commonPath 
        ? `${commonPath}/${combinedName}`
        : combinedName;

      // Create file node for combined result - use first result as representative
      const fileNode: FileNode = {
        name: combinedName,
        path: combinedPath,
        type: "file",
        result: firstResult, // Use first result as representative
      };

      // Build folder structure if needed
      if (commonPath) {
        const pathSegments = commonPath.split("/").filter(segment => segment.length > 0);
        
        if (pathSegments.length === 0) {
          tree.push(fileNode);
          return;
        }

        // Build folder structure
        let currentPath = "";
        let parentFolder: FolderNode | null = null;

        pathSegments.forEach((segment) => {
          currentPath = currentPath ? `${currentPath}/${segment}` : segment;

          if (!folderMap[currentPath]) {
            const newFolder: FolderNode = {
              name: segment,
              path: currentPath,
              type: "folder",
              children: [],
            };

            folderMap[currentPath] = newFolder;

            if (parentFolder) {
              parentFolder.children.push(newFolder);
            } else {
              tree.push(newFolder);
            }
          }

          parentFolder = folderMap[currentPath];
        });

        if (parentFolder) {
          parentFolder.children.push(fileNode);
        }
      } else {
        tree.push(fileNode);
      }
    } else {
      // Individual processing mode - create ONE node per file (not per row)
      const filePath = firstResult.extracted_data?.original_path || firstResult.source_files[0];
      if (!filePath) return;

      const pathSegments = filePath
        .split("/")
        .filter((segment) => segment.length > 0);
      const baseFileName = pathSegments.pop() || filePath;
      
      // Show row count in filename if multiple rows
      const fileName = taskResults.length > 1 
        ? `${baseFileName} (${taskResults.length} rows)`
        : baseFileName;

      const fileNode: FileNode = {
        name: fileName,
        path: filePath,
        type: "file",
        result: firstResult, // Use first result as representative
      };

      if (pathSegments.length === 0) {
        tree.push(fileNode);
        return;
      }

      let currentPath = "";
      let parentFolder: FolderNode | null = null;

      pathSegments.forEach((segment) => {
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;

        if (!folderMap[currentPath]) {
          const newFolder: FolderNode = {
            name: segment,
            path: currentPath,
            type: "folder",
            children: [],
          };

          folderMap[currentPath] = newFolder;

          if (parentFolder) {
            parentFolder.children.push(newFolder);
          } else {
            tree.push(newFolder);
          }
        }

        parentFolder = folderMap[currentPath];
      });

      if (parentFolder) {
        parentFolder.children.push(fileNode);
      }
    }
  });

  return tree;
};

// Helper function to find the first file in the tree
const findFirstFile = (nodes: TreeNode[]): FileNode | null => {
  for (const node of nodes) {
    if (node.type === "file") {
      return node;
    } else if (node.type === "folder" && node.children.length > 0) {
      const found = findFirstFile(node.children);
      if (found) return found;
    }
  }
  return null;
};

// FileTreeNode Component
interface FileTreeNodeProps {
  node: TreeNode;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  level: number;
}

const FileTreeNode = memo(
  ({ node, selectedPath, onSelect, level }: FileTreeNodeProps) => {
    const [expanded, setExpanded] = useState(true);
    const isSelected = selectedPath === node.path;
    const paddingLeft = `${level * 12}px`;

    if (node.type === "file") {
      const isCombined = node.result.processing_mode === "combined";
      const IconComponent = isCombined ? Files : FileText;
      const iconColor = isCombined ? "text-purple-500" : "text-blue-500";
      
      return (
        <div
          className={`flex items-center py-1 px-2 rounded cursor-pointer ${
            isSelected ? "bg-blue-100 text-blue-900" : "hover:bg-gray-100"
          }`}
          style={{ paddingLeft }}
          onClick={() => onSelect(node.path)}
        >
          <IconComponent className={`w-4 h-4 ${iconColor} mr-2 flex-shrink-0`} />
          <span className="text-sm truncate">{node.name}</span>
          {isCombined && (
            <span className="ml-1 text-xs text-purple-600 bg-purple-100 px-1 rounded">
              {node.result.source_files.length}
            </span>
          )}
        </div>
      );
    }

    return (
      <div>
        <div
          className="flex items-center py-1 px-2 rounded cursor-pointer hover:bg-gray-100"
          style={{ paddingLeft }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-gray-500 mr-2 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500 mr-2 flex-shrink-0" />
          )}
          <Folder className="w-4 h-4 text-amber-500 mr-2 flex-shrink-0" />
          <span className="text-sm font-medium">{node.name}</span>
        </div>

        {expanded && (
          <div>
            {node.children.map((child, index) => (
              <FileTreeNode
                key={`${child.path}-${index}`}
                node={child}
                selectedPath={selectedPath}
                onSelect={onSelect}
                level={level + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }
);

interface ResultsStepProps {
  jobId: string;
  onStartNew: () => void;
}

export default function ResultsStep({ jobId, onStartNew }: ResultsStepProps) {
  const { toast } = useToast();
  const { data: jobDetails } = useJobDetails(jobId);
  const {
    data: results,
    isLoading: resultsLoading,
    error,
  } = useJobResults(jobId);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileTree, setFileTree] = useState<TreeNode[]>([]);

  // Build file tree from results with memoization
  const fileTreeMemo = useMemo(() => {
    if (results?.results && results.results.length > 0) {
      return buildFileTree(results.results);
    }
    return [];
  }, [results?.results]);

  // Update file tree and selection when memoized tree changes
  useEffect(() => {
    setFileTree(fileTreeMemo);

    // Select first file by default
    if (fileTreeMemo.length > 0) {
      const firstFile = findFirstFile(fileTreeMemo);
      if (firstFile) {
        setSelectedPath(firstFile.path);
      }
    }
  }, [fileTreeMemo]);

  // Find the selected result based on path
  const selectedFileNode = useMemo(() => {
    if (!selectedPath || !fileTree.length) return null;

    const findNode = (nodes: TreeNode[]): FileNode | null => {
      for (const node of nodes) {
        if (node.type === "file" && node.path === selectedPath) {
          return node;
        } else if (node.type === "folder") {
          const found = findNode(node.children);
          if (found) return found;
        }
      }
      return null;
    };

    return findNode(fileTree);
  }, [selectedPath, fileTree]);

  // Debug logging to see what we're actually getting from the API
  console.log("ResultsStep Debug:", {
    jobId,
    results,
    resultsLoading,
    error,
    resultsType: typeof results,
    resultsKeys: results ? Object.keys(results) : null,
    hasResults: results?.results ? results.results.length > 0 : false,
    resultsArray: results?.results,
    resultsArrayLength: results?.results?.length,
  });

  const handleExportCSV = async () => {
    if (!results?.results) return;

    try {
      // Convert results to CSV format
      const csvData = convertToCSV(results.results);
      downloadFile(csvData, `extraction-results-${jobId}.csv`, "text/csv");

      toast({
        title: "Export successful",
        description: "Results exported as CSV file",
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export results",
        variant: "destructive",
      });
    }
  };

  const handleExportJSON = async () => {
    if (!results?.results) return;

    try {
      const jsonData = JSON.stringify(results.results, null, 2);
      downloadFile(
        jsonData,
        `extraction-results-${jobId}.json`,
        "application/json"
      );

      toast({
        title: "Export successful",
        description: "Results exported as JSON file",
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export results",
        variant: "destructive",
      });
    }
  };

  const convertToCSV = (data: any[]) => {
    if (!data || data.length === 0) return "";

    // Get all unique field names
    const allFields = new Set<string>();
    data.forEach((result) => {
      if (result.extracted_data) {
        Object.keys(result.extracted_data).forEach((key) => allFields.add(key));
      }
    });

    const fields = Array.from(allFields);

    // Create CSV header
    const header = [
      "Task ID",
      "Row Index",
      "Source Files",
      "Processing Mode",
      ...fields,
    ].join(",");

    // Create CSV rows - each result is already a separate row
    const rows = data.map((result) => {
      const row = [
        result.task_id,
        result.row_index || 0,
        result.source_files.join("; "),
        result.processing_mode,
        ...fields.map((field) => {
          const value = result.extracted_data[field];
          if (value === null || value === undefined) return "";
          if (typeof value === "string" && value.includes(",")) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return String(value);
        }),
      ];
      return row.join(",");
    });

    return [header, ...rows].join("\n");
  };

  const downloadFile = (
    content: string,
    filename: string,
    mimeType: string
  ) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formatValue = (value: any) => {
    if (value === null || value === undefined) {
      return <span className="text-gray-400 italic">Not found</span>;
    }
    if (typeof value === "boolean") {
      return value ? "Yes" : "No";
    }
    if (typeof value === "object") {
      return JSON.stringify(value);
    }
    return String(value);
  };

  const getSuccessRate = () => {
    if (!results?.results) return 0;
    const successful = results.results.filter(
      (r) => r.extracted_data && Object.keys(r.extracted_data).length > 0
    ).length;
    return Math.round((successful / results.results.length) * 100);
  };

  if (resultsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-8 h-8 animate-spin" />
        <span className="ml-2">Loading results...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Results Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            Extraction Complete
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="space-y-1">
              <div className="text-2xl font-bold text-blue-600">
                {results?.total || 0}
              </div>
              <div className="text-sm text-muted-foreground">Total Results</div>
            </div>
            <div className="space-y-1">
              <div className="text-2xl font-bold text-green-600">
                {getSuccessRate()}%
              </div>
              <div className="text-sm text-muted-foreground">Success Rate</div>
            </div>
            <div className="space-y-1">
              <div className="text-2xl font-bold text-purple-600">
                {jobDetails?.job_fields?.length || 0}
              </div>
              <div className="text-sm text-muted-foreground">
                Fields Extracted
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-2xl font-bold text-orange-600">
                {(() => {
                  if (!results?.results) return 0;
                  // Count unique source files across all results
                  const uniqueFiles = new Set();
                  results.results.forEach(r => {
                    r.source_files.forEach(file => uniqueFiles.add(file));
                  });
                  return uniqueFiles.size;
                })()}
              </div>
              <div className="text-sm text-muted-foreground">
                Files Processed
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Export Options */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Export Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button onClick={handleExportCSV} variant="outline">
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
            <Button onClick={handleExportJSON} variant="outline">
              <FileText className="w-4 h-4 mr-2" />
              Export JSON
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results Display */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Extraction Results ({results?.results?.length || 0} results)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {results?.results && results.results.length > 0 ? (
            results.results.length === 1 ? (
              // Single result - show simple table
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">
                      {results.results[0].source_files.join(", ")}
                    </h3>
                    <Badge variant="secondary" className="mt-1">
                      {results.results[0].processing_mode}
                    </Badge>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-gray-200 rounded-lg">
                    <thead className="bg-gray-50">
                      <tr>
                        {jobDetails?.job_fields?.map((field) => (
                          <th
                            key={field.field_name}
                            className="text-left px-4 py-2 font-medium text-gray-900 border-b"
                          >
                            {field.field_name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b">
                        {jobDetails?.job_fields?.map((field) => (
                          <td key={field.field_name} className="px-4 py-2">
                            {formatValue(
                              results.results[0].extracted_data[
                                field.field_name
                              ]
                            )}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              // Multiple results - show sidebar layout with file tree
              <div className="flex gap-6">
                {/* Sidebar with file tree */}
                <div className="w-64 flex-shrink-0">
                  <h3 className="font-medium text-gray-900 mb-3 flex items-center">
                    <Folder className="w-4 h-4 mr-2" />
                    Files ({results.results.length})
                  </h3>

                  <div className="max-h-96 overflow-y-auto border rounded-lg p-2">
                    {/* Render file tree */}
                    {fileTree.length > 0 ? (
                      fileTree.map((node, index) => (
                        <FileTreeNode
                          key={`${node.path}-${index}`}
                          node={node}
                          selectedPath={selectedPath}
                          onSelect={setSelectedPath}
                          level={0}
                        />
                      ))
                    ) : (
                      <div className="text-center py-4 text-gray-500 text-sm">
                        No files to display
                      </div>
                    )}
                  </div>
                </div>

                {/* Main content area */}
                <div className="flex-1 min-w-0">
                  {selectedFileNode ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium text-gray-900">
                            {selectedFileNode.name}
                          </h3>
                          <div className="text-sm text-gray-500 mt-1">
                            {selectedFileNode.path}
                          </div>
                          {selectedFileNode.result.processing_mode === "combined" && (
                            <div className="text-sm text-gray-600 mt-2">
                              <strong>Source files:</strong>
                              <ul className="list-disc list-inside mt-1 space-y-1">
                                {selectedFileNode.result.source_files.map((file, index) => (
                                  <li key={index} className="text-xs">
                                    {file.split("/").pop() || file}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <Badge variant="secondary" className="mt-2">
                            {selectedFileNode.result.processing_mode}
                          </Badge>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        {(() => {
                          // Find all rows for this task to display them together
                          const taskId = selectedFileNode.result.task_id;
                          const allTaskRows = results?.results?.filter(r => r.task_id === taskId) || [];
                          allTaskRows.sort((a, b) => a.row_index - b.row_index);
                          
                          return (
                            <table className="w-full border-collapse border border-gray-200 rounded-lg">
                              <thead className="bg-gray-50">
                                <tr>
                                  {allTaskRows.length > 1 && (
                                    <th className="text-left px-4 py-2 font-medium text-gray-900 border-b">
                                      Row
                                    </th>
                                  )}
                                  {jobDetails?.job_fields?.map((field) => (
                                    <th
                                      key={field.field_name}
                                      className="text-left px-4 py-2 font-medium text-gray-900 border-b"
                                    >
                                      {field.field_name}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {allTaskRows.map((row, rowIndex) => (
                                  <tr 
                                    key={`${row.task_id}-${row.row_index}`} 
                                    className="border-b"
                                  >
                                    {allTaskRows.length > 1 && (
                                      <td className="px-4 py-2 font-medium text-gray-600">
                                        {rowIndex + 1}
                                      </td>
                                    )}
                                    {jobDetails?.job_fields?.map((field) => (
                                      <td
                                        key={field.field_name}
                                        className="px-4 py-2"
                                      >
                                        {formatValue(
                                          row.extracted_data[field.field_name]
                                        )}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          );
                        })()}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">
                        Select a File
                      </h3>
                      <p className="text-gray-500">
                        Choose a file from the tree on the left to view its
                        extraction results.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )
          ) : (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No Results Found
              </h3>
              <p className="text-gray-500">
                The extraction job completed but no data was extracted. This
                might be due to the documents not containing the requested
                information.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onStartNew}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Start New Extraction
        </Button>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => (window.location.href = "/dashboard")}
          >
            <Eye className="w-4 h-4 mr-2" />
            View All Jobs
          </Button>
        </div>
      </div>
    </div>
  );
}
