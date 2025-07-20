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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useJobDetails, useJobResults } from "@/hooks/useJobs";

// Type definitions for file tree structure
type JobResult = {
  task_id: string;
  source_files: string[];
  processing_mode: string;
  extracted_data: Record<string, any>;
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

  results.forEach((result) => {
    // Use original_path if available, otherwise fall back to first source file
    const filePath =
      result.extracted_data?.original_path || result.source_files[0];
    if (!filePath) return; // Skip if no path available

    // Split path into segments and extract filename
    const pathSegments = filePath
      .split("/")
      .filter((segment) => segment.length > 0);
    const fileName = pathSegments.pop() || filePath;

    // Create file node
    const fileNode: FileNode = {
      name: fileName,
      path: filePath,
      type: "file",
      result: result,
    };

    // If no folders, add directly to tree
    if (pathSegments.length === 0) {
      tree.push(fileNode);
      return;
    }

    // Build folder structure
    let currentPath = "";
    let parentFolder: FolderNode | null = null;

    pathSegments.forEach((segment) => {
      // Build current path
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;

      // Check if folder already exists
      if (!folderMap[currentPath]) {
        // Create new folder
        const newFolder: FolderNode = {
          name: segment,
          path: currentPath,
          type: "folder",
          children: [],
        };

        folderMap[currentPath] = newFolder;

        // Add to parent or tree
        if (parentFolder) {
          parentFolder.children.push(newFolder);
        } else {
          tree.push(newFolder);
        }
      }

      // Update parent reference
      parentFolder = folderMap[currentPath];
    });

    // Add file to its parent folder
    if (parentFolder) {
      parentFolder.children.push(fileNode);
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
      return (
        <div
          className={`flex items-center py-1 px-2 rounded cursor-pointer ${
            isSelected ? "bg-blue-100 text-blue-900" : "hover:bg-gray-100"
          }`}
          style={{ paddingLeft }}
          onClick={() => onSelect(node.path)}
        >
          <FileText className="w-4 h-4 text-blue-500 mr-2 flex-shrink-0" />
          <span className="text-sm truncate">{node.name}</span>
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
      "Source Files",
      "Processing Mode",
      ...fields,
    ].join(",");

    // Create CSV rows
    const rows = data.map((result) => {
      const row = [
        result.task_id,
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
                {results?.results?.reduce(
                  (sum, r) => sum + r.source_files.length,
                  0
                ) || 0}
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
                          <Badge variant="secondary" className="mt-2">
                            {selectedFileNode.result.processing_mode}
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
                                <td
                                  key={field.field_name}
                                  className="px-4 py-2"
                                >
                                  {formatValue(
                                    selectedFileNode.result.extracted_data[
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
