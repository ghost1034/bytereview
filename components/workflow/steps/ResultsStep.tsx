/**
 * Results Step for Job Workflow
 * Display extraction results and export options
 */
"use client";

import { useState, useEffect, useMemo, memo, useRef } from "react";
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
  Cloud,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useJobDetails, useJobResults } from "@/hooks/useJobs";
import { useAuth } from "@/contexts/AuthContext";
import { useGoogleIntegration } from "@/hooks/useGoogleIntegration";
import { apiClient } from "@/lib/api";
import { GoogleDriveFolderPicker } from "@/components/integrations/GoogleDriveFolderPicker";

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
    // Results are already in processing order

    const firstResult = taskResults[0];

    if (firstResult.processing_mode === "combined") {
      // For combined processing, create one node representing all files
      const sourceFiles = firstResult.source_files || [];

      if (sourceFiles.length === 0) return;

      // Find the common folder path for all source files
      let commonPath = "";
      if (sourceFiles.length > 1) {
        // Find common directory path
        const paths = sourceFiles.map((file) => file.split("/").slice(0, -1));
        if (paths.length > 0) {
          const minLength = Math.min(...paths.map((p) => p.length));
          const commonSegments = [];

          for (let i = 0; i < minLength; i++) {
            const segment = paths[0][i];
            if (paths.every((path) => path[i] === segment)) {
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
      const combinedName =
        sourceFiles.length > 1
          ? `Combined (${sourceFiles.length} files)`
          : `${sourceFiles[0].split("/").pop()}`;

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
        const pathSegments = commonPath
          .split("/")
          .filter((segment) => segment.length > 0);

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
      const filePath =
        firstResult.extracted_data?.original_path ||
        firstResult.source_files[0];
      if (!filePath) return;

      const pathSegments = filePath
        .split("/")
        .filter((segment) => segment.length > 0);
      const fileName = pathSegments.pop() || filePath;

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
          <IconComponent
            className={`w-4 h-4 ${iconColor} mr-2 flex-shrink-0`}
          />
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
  runId?: string;
  onStartNew: () => void;
}

export default function ResultsStep({ jobId, runId, onStartNew }: ResultsStepProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: jobDetails } = useJobDetails(jobId, runId);
  const {
    data: results,
    isLoading: resultsLoading,
    error,
  } = useJobResults(jobId, 1000, runId); // Get up to 1000 results for the specific run
  const { status: googleStatus, connect: connectGoogle, isConnecting } = useGoogleIntegration();

  const getAuthToken = async () => {
    if (!user) throw new Error('User not authenticated');
    return await user.getIdToken();
  };

  // Helper function to get field value from array-based extracted data
  const getFieldValue = (result: JobResult, fieldName: string, rowIndex: number = 0) => {
    if (!result.extracted_data || !result.extracted_data.columns || !result.extracted_data.results) {
      return null;
    }
    
    const columns = result.extracted_data.columns;
    const results = result.extracted_data.results;
    
    // Find the column index for this field
    const columnIndex = columns.indexOf(fieldName);
    if (columnIndex !== -1 && results.length > rowIndex && results[rowIndex] && columnIndex < results[rowIndex].length) {
      return results[rowIndex][columnIndex];
    }
    return null;
  };

  // Helper function to get all rows from extracted data
  const getExtractedRows = (result: JobResult) => {
    if (!result.extracted_data || !result.extracted_data.results) {
      return [];
    }
    return result.extracted_data.results;
  };
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileTree, setFileTree] = useState<TreeNode[]>([]);
  const [selectedExportFolder, setSelectedExportFolder] = useState<{id: string, name: string} | null>(null);

  // Build file tree from results with memoization
  const fileTreeMemo = useMemo(() => {
    if (results?.results && results.results.length > 0) {
      return buildFileTree(results.results);
    }
    return [];
  }, [results?.results]);

  // Get unique files count directly from API response (more efficient)
  const uniqueFilesCount = results?.files_processed_count || 0;

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

  const [exportLoading, setExportLoading] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Set up SSE connection for export events (only when export starts)
  const setupExportSSEConnection = async () => {
    if (!jobId || eventSourceRef.current) {
      console.log('Export SSE connection already exists or no jobId');
      return;
    }

    try {
      console.log('Setting up Export SSE connection for export monitoring');
      const token = await apiClient.getAuthTokenForSSE();
      if (!token) {
        console.warn('No auth token available for Export SSE');
        return;
      }
      
      const sseUrl = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/jobs/${jobId}/export-events?token=${encodeURIComponent(token)}`;
      const eventSource = new EventSource(sseUrl);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('Export SSE connection established for export monitoring');
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          switch (data.type) {
            case 'connected':
              console.log('Export SSE connection confirmed');
              break;

            case 'export_started':
              console.log('Export started:', data);
              break;

            case 'export_completed':
              console.log('Export completed:', data);
              
              // Clear loading state
              setExportLoading(null);
              
              // Show success notification with link
              toast({
                title: "Export completed",
                description: (
                  <div className="flex flex-col gap-2">
                    <span>Results exported to {data.destination} as {data.file_type.toUpperCase()}</span>
                    {data.file_link && (
                      <a 
                        href={data.file_link} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View in {data.destination}
                      </a>
                    )}
                  </div>
                ),
              });
              
              // Close SSE connection after export completes
              closeExportSSEConnection();
              break;

            case 'export_failed':
              console.log('Export failed:', data);
              
              // Clear loading state
              setExportLoading(null);
              
              // Show error notification
              toast({
                title: "Export failed",
                description: `Failed to export to ${data.destination}: ${data.error}`,
                variant: "destructive",
              });
              
              // Close SSE connection after export fails
              closeExportSSEConnection();
              break;

            case 'keepalive':
              // Ignore keepalive events
              break;

            default:
              // Ignore other event types for export connection
              break;
          }
        } catch (error) {
          console.error('Error parsing Export SSE event:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('Export SSE connection error:', error);
        if (eventSource.readyState === EventSource.CLOSED) {
          eventSourceRef.current = null;
        }
      };

    } catch (error) {
      console.error('Error setting up Export SSE:', error);
    }
  };

  // Close Export SSE connection when no longer needed
  const closeExportSSEConnection = () => {
    if (eventSourceRef.current) {
      console.log('Closing Export SSE connection');
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  };

  // Only cleanup on unmount - don't auto-setup connection
  useEffect(() => {
    // Cleanup on unmount
    return () => {
      closeExportSSEConnection();
    };
  }, []);

  const handleExportToGoogleDriveCSV = async () => {
    if (!results?.results) return;

    try {
      setExportLoading('gdrive-csv');
      
      // Set up SSE connection before starting export
      await setupExportSSEConnection();
      
      // Include folder_id if a specific folder is selected
      const folderId = selectedExportFolder?.id && selectedExportFolder.id !== '' 
        ? selectedExportFolder.id 
        : undefined;
      
      const result = await apiClient.exportJobToGoogleDriveCSV(jobId, folderId, runId);
      
      const folderText = selectedExportFolder?.name && selectedExportFolder.name !== 'My Drive' 
        ? ` to "${selectedExportFolder.name}" folder` 
        : '';
      
      toast({
        title: "Export started",
        description: `Your CSV export is being processed${folderText}. You'll be notified when it's ready.`,
      });
      
      // Note: Export completion will be handled via SSE events
      // The loading state will be cleared when we receive export_completed or export_failed events
      
    } catch (error: any) {
      toast({
        title: "Export failed",
        description: error.message || "Failed to start export to Google Drive",
        variant: "destructive",
      });
      setExportLoading(null);
      // Close SSE connection if export failed to start
      closeExportSSEConnection();
    }
  };

  const handleExportToGoogleDriveExcel = async () => {
    if (!results?.results) return;

    try {
      setExportLoading('gdrive-excel');
      
      // Set up SSE connection before starting export
      await setupExportSSEConnection();
      
      // Include folder_id if a specific folder is selected
      const folderId = selectedExportFolder?.id && selectedExportFolder.id !== '' 
        ? selectedExportFolder.id 
        : undefined;
      
      const result = await apiClient.exportJobToGoogleDriveExcel(jobId, folderId, runId);
      
      const folderText = selectedExportFolder?.name && selectedExportFolder.name !== 'My Drive' 
        ? ` to "${selectedExportFolder.name}" folder` 
        : '';
      
      toast({
        title: "Export started",
        description: `Your Excel export is being processed${folderText}. You'll be notified when it's ready.`,
      });
      
      // Note: Export completion will be handled via SSE events
      // The loading state will be cleared when we receive export_completed or export_failed events
      
    } catch (error: any) {
      toast({
        title: "Export failed",
        description: error.message || "Failed to start export to Google Drive",
        variant: "destructive",
      });
      setExportLoading(null);
      // Close SSE connection if export failed to start
      closeExportSSEConnection();
    }
  };

  const handleExportCSV = async () => {
    if (!results?.results) return;

    try {
      setExportLoading('csv');
      
      // Use the API client export method with runId
      const { blob, filename } = await apiClient.exportJobCSV(jobId, runId);

      // Download the file
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

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
    } finally {
      setExportLoading(null);
    }
  };

  const handleExportExcel = async () => {
    if (!results?.results) return;

    try {
      setExportLoading('excel');
      
      // Use the new backend export endpoint
      const response = await fetch(`/api/jobs/${jobId}/export/excel`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${await getAuthToken()}`,
        },
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `job_${jobId}_results.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Export successful",
        description: "Results exported as Excel file",
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export results",
        variant: "destructive",
      });
    } finally {
      setExportLoading(null);
    }
  };

  const handleExportJSON = async () => {
    if (!results?.results) return;

    try {
      setExportLoading('json');
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
    } finally {
      setExportLoading(null);
    }
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
                {results?.results?.length || 0}
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
                {uniqueFilesCount}
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
          <div className="space-y-4">
            {/* Local Download Options */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Download to Computer</h4>
              <div className="flex gap-2">
                <Button 
                  onClick={handleExportCSV} 
                  variant="outline"
                  disabled={exportLoading === 'csv' || !results?.results?.length}
                >
                  {exportLoading === 'csv' ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                  )}
                  Export CSV
                </Button>
                <Button 
                  onClick={handleExportExcel} 
                  variant="outline"
                  disabled={exportLoading === 'excel' || !results?.results?.length}
                >
                  {exportLoading === 'excel' ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                  )}
                  Export Excel
                </Button>
                <Button 
                  onClick={handleExportJSON} 
                  variant="outline"
                  disabled={exportLoading === 'json' || !results?.results?.length}
                >
                  {exportLoading === 'json' ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4 mr-2" />
                  )}
                  Export JSON
                </Button>
              </div>
            </div>

            {/* Google Drive Export Options */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Export to Google Drive</h4>
              {googleStatus?.connected ? (
                <div className="space-y-4">
                  {/* Folder Selection */}
                  <div>
                    <GoogleDriveFolderPicker
                      onFolderSelected={(folder) => setSelectedExportFolder(folder)}
                      selectedFolder={selectedExportFolder}
                      showCard={false}
                      buttonText="Select Export Folder"
                    />
                  </div>
                  
                  {/* Export Buttons */}
                  <div className="flex gap-2">
                    <Button 
                      onClick={handleExportToGoogleDriveCSV} 
                      variant="outline"
                      disabled={exportLoading === 'gdrive-csv' || !results?.results?.length}
                    >
                      {exportLoading === 'gdrive-csv' ? (
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Cloud className="w-4 h-4 mr-2" />
                      )}
                      Export CSV to Drive
                    </Button>
                    <Button 
                      onClick={handleExportToGoogleDriveExcel} 
                      variant="outline"
                      disabled={exportLoading === 'gdrive-excel' || !results?.results?.length}
                    >
                      {exportLoading === 'gdrive-excel' ? (
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Cloud className="w-4 h-4 mr-2" />
                      )}
                      Export Excel to Drive
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <Cloud className="w-5 h-5 text-blue-600" />
                  <div className="flex-1">
                    <p className="text-sm text-blue-800">
                      Connect your Google account to export directly to Google Drive
                    </p>
                  </div>
                  <Button 
                    onClick={() => connectGoogle('drive')} 
                    size="sm"
                    disabled={isConnecting}
                  >
                    {isConnecting ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : null}
                    Connect Google Drive
                  </Button>
                </div>
              )}
            </div>
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
            // Always show sidebar layout with file tree (regardless of result count)
            <div>
              {/* Show sidebar layout with file tree */}
              <div className="flex gap-6">
                {/* Sidebar with file tree */}
                <div className="w-64 flex-shrink-0">
                  <h3 className="font-medium text-gray-900 mb-3 flex items-center">
                    <Folder className="w-4 h-4 mr-2" />
                    Files ({uniqueFilesCount})
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
                          {selectedFileNode.result.processing_mode ===
                            "combined" && (
                            <div className="text-sm text-gray-600 mt-2">
                              <strong>Source files:</strong>
                              <ul className="list-disc list-inside mt-1 space-y-1">
                                {selectedFileNode.result.source_files.map(
                                  (file, index) => (
                                    <li key={index} className="text-xs">
                                      {file.split("/").pop() || file}
                                    </li>
                                  )
                                )}
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
                          // Find the task result and expand its extracted data rows
                          const taskId = selectedFileNode.result.task_id;
                          const taskResult = results?.results?.find(
                            (r) => r.task_id === taskId
                          );
                          
                          if (!taskResult) return <div>No data found</div>;
                          
                          const extractedRows = getExtractedRows(taskResult);

                          return (
                            <table className="w-full border-collapse border border-gray-200 rounded-lg">
                              <thead className="bg-gray-50">
                                <tr>
                                  {extractedRows.length > 1 && (
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
                                {extractedRows.map((rowData, rowIndex) => (
                                  <tr
                                    key={`${taskResult.task_id}-${rowIndex}`}
                                    className="border-b"
                                  >
                                    {extractedRows.length > 1 && (
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
                                          getFieldValue(taskResult, field.field_name, rowIndex)
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
            </div>
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
      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={() => (window.location.href = "/dashboard/jobs")}
        >
          <Eye className="w-4 h-4 mr-2" />
          View All Jobs
        </Button>
      </div>
    </div>
  );
}
