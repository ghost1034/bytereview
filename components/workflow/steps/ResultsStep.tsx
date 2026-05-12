/**
 * Results Step for Job Workflow
 * Display extraction results and export options
 */
"use client";

import { useState, useEffect, useMemo, memo, useRef } from "react";
import { useRouter } from 'next/navigation'
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
import { useExportRefs } from "@/hooks/useExportRefs";
import { EditableResultsTable } from "@/components/results/EditableResultsTable";
import { Section } from "@/components/ui/section";
import { StatCard } from "@/components/ui/stat-card";
import { cn, pluralize } from "@/lib/utils";
import { downloadBlob } from "@/lib/utils/download-blob";

// Type definitions for file tree structure
type JobResult = {
  task_id: string;
  source_files: string[];
  processing_mode: string;
  extracted_data: Record<string, any>;
  result_set_index?: number;
};

type FileNode = {
  id: string; // unique identifier for selection (task_id)
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
  isSetHeader?: boolean;
};

type TreeNode = FileNode | FolderNode;

// Helper function to build file tree from job results
const buildFileTree = (results: JobResult[]): TreeNode[] => {
  if (!results || results.length === 0) return [];

  // Group results into result sets
  const groupsBySet: Record<number, JobResult[]> = {};
  for (const r of results) {
    const idx = r.result_set_index ?? 0;
    (groupsBySet[idx] ||= []).push(r);
  }
  const orderedSetIndexes = Object.keys(groupsBySet)
    .map((k) => parseInt(k, 10))
    .sort((a, b) => a - b);

  const tree: TreeNode[] = [];

  for (const setIndex of orderedSetIndexes) {
    const setResults = groupsBySet[setIndex];

    // Header/separator node for this result set
    const headerNode: FolderNode = {
      name: setIndex === 0 ? 'Results (original)' : `Results (append ${setIndex})`,
      path: `__set_${setIndex}__`,
      type: 'folder',
      children: [],
      isSetHeader: true,
    };
    tree.push(headerNode);

    // Build a folder tree under the header node
    const folderMap: Record<string, FolderNode> = {};
    const resultsByTask = new Map<string, JobResult[]>();

    // Coalesce results by task (multiple rows per task)
    for (const result of setResults) {
      const taskId = result.task_id;
      if (!resultsByTask.has(taskId)) resultsByTask.set(taskId, []);
      resultsByTask.get(taskId)!.push(result);
    }

    // For each task, create a single file node, placed in the appropriate folder structure under header
    resultsByTask.forEach((taskResults) => {
      const firstResult = taskResults[0];

      // Manual task (unattached manual rows)
      if (
        firstResult.processing_mode === 'manual' ||
        (Array.isArray(firstResult.source_files) && firstResult.source_files.length === 1 && firstResult.source_files[0] === '(manual)')
      ) {
        const fileNode: FileNode = {
          id: firstResult.task_id,
          name: 'Manual rows',
          path: `__manual__/${firstResult.task_id}`,
          type: 'file',
          result: firstResult,
        };
        headerNode.children.push(fileNode);
        return;
      }

      if (firstResult.processing_mode === 'combined') {
        const sourceFiles = firstResult.source_files || [];
        if (sourceFiles.length === 0) return;

        // Determine common folder path of involved files
        let commonPath = '';
        if (sourceFiles.length > 1) {
          const paths = sourceFiles.map((f) => f.split('/').slice(0, -1));
          const minLen = Math.min(...paths.map((p) => p.length));
          const common: string[] = [];
          for (let i = 0; i < minLen; i++) {
            const seg = paths[0][i];
            if (paths.every((p) => p[i] === seg)) common.push(seg); else break;
          }
          commonPath = common.join('/');
        } else {
          const only = sourceFiles[0];
          commonPath = only.split('/').slice(0, -1).join('/');
        }

        const combinedName = sourceFiles.length > 1
          ? `Combined (${sourceFiles.length} files)`
          : `${sourceFiles[0].split('/').pop()}`;
        const combinedPath = commonPath ? `${commonPath}/${combinedName}` : combinedName;

        const fileNode: FileNode = {
          id: firstResult.task_id,
          name: combinedName,
          path: combinedPath,
          type: 'file',
          result: firstResult,
        };

        if (!commonPath) {
          headerNode.children.push(fileNode);
        } else {
          // Build intermediate folders within this set
          const segments = commonPath.split('/').filter(Boolean);
          let currentPath = '';
          let parent: FolderNode = headerNode;
          for (const seg of segments) {
            currentPath = currentPath ? `${currentPath}/${seg}` : seg;
            if (!folderMap[currentPath]) {
              folderMap[currentPath] = { name: seg, path: currentPath, type: 'folder', children: [] };
              parent.children.push(folderMap[currentPath]);
            }
            parent = folderMap[currentPath];
          }
          parent.children.push(fileNode);
        }
      } else {
        // individual mode
        const filePath = firstResult.extracted_data?.original_path || firstResult.source_files?.[0];
        if (!filePath) return;
        const segments = filePath.split('/').filter(Boolean);
        const fileName = segments.pop() || filePath;

        const fileNode: FileNode = { id: firstResult.task_id, name: fileName, path: filePath, type: 'file', result: firstResult };

        if (segments.length === 0) {
          headerNode.children.push(fileNode);
        } else {
          let currentPath = '';
          let parent: FolderNode = headerNode;
          for (const seg of segments) {
            currentPath = currentPath ? `${currentPath}/${seg}` : seg;
            if (!folderMap[currentPath]) {
              folderMap[currentPath] = { name: seg, path: currentPath, type: 'folder', children: [] };
              parent.children.push(folderMap[currentPath]);
            }
            parent = folderMap[currentPath];
          }
          parent.children.push(fileNode);
        }
      }
    });
  }

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
  selectedFileId: string | null;
  onSelect: (fileId: string, path: string) => void;
  level: number;
}

const FileTreeNode = memo(
  ({ node, selectedPath, selectedFileId, onSelect, level }: FileTreeNodeProps) => {
    const [expanded, setExpanded] = useState(true);
    const isSelected = node.type === 'file' ? (selectedFileId === node.id) : (selectedPath === node.path);
    // Indent driven by --indent CSS variable on the tree container (default 0.75rem),
    // multiplied by depth. Replaces the prior `${level * 12}px` magic.
    const indentStyle: React.CSSProperties = {
      paddingInlineStart: `calc(var(--indent, 0.75rem) * ${level})`,
    };

    const renderChildren = (children: TreeNode[]) => (
      <div>
        {children.map((child, index) => (
          <FileTreeNode
            key={`${child.path}-${index}`}
            node={child}
            selectedPath={selectedPath}
            selectedFileId={selectedFileId}
            onSelect={onSelect}
            level={level + 1}
          />
        ))}
      </div>
    );

    if (node.type === "file") {
      const isCombined = node.result.processing_mode === "combined";
      const IconComponent = isCombined ? Files : FileText;
      const iconColor = isCombined ? "text-info" : "text-foreground-muted";
      const handleSelect = () => onSelect(node.id, node.path);

      return (
        <div
          role="treeitem"
          aria-selected={isSelected}
          tabIndex={0}
          className={cn(
            "flex items-center py-1 px-2 rounded cursor-pointer outline-none",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
            isSelected
              ? "bg-primary-soft text-primary-soft-foreground"
              : "hover:bg-surface-muted",
          )}
          style={indentStyle}
          onClick={handleSelect}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              handleSelect();
            }
          }}
        >
          <IconComponent
            className={cn("w-4 h-4 mr-2 flex-shrink-0", iconColor)}
            aria-hidden
          />
          <span className="text-sm truncate text-foreground">{node.name}</span>
          {isCombined && (
            <span className="ml-1 rounded bg-primary-soft px-1 text-xs text-primary-soft-foreground tabular-nums">
              {node.result.source_files.length}
            </span>
          )}
        </div>
      );
    }

    // Render set header as a divider-style row
    if (node.isSetHeader) {
      return (
        <div className="my-2" style={indentStyle}>
          <div className="flex items-center gap-2">
            <div className="h-px bg-border flex-1" />
            <span className="text-xs uppercase tracking-wide text-foreground-subtle">
              {node.name}
            </span>
            <div className="h-px bg-border flex-1" />
          </div>
          <div className="mt-2">{renderChildren(node.children)}</div>
        </div>
      );
    }

    return (
      <div role="treeitem" aria-expanded={expanded}>
        <div
          tabIndex={0}
          role="button"
          aria-label={`${expanded ? 'Collapse' : 'Expand'} folder ${node.name}`}
          className={cn(
            "flex items-center py-1 px-2 rounded cursor-pointer outline-none",
            "hover:bg-surface-muted",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          )}
          style={indentStyle}
          onClick={() => setExpanded(!expanded)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setExpanded((value) => !value);
            } else if (event.key === 'ArrowRight') {
              event.preventDefault();
              setExpanded(true);
            } else if (event.key === 'ArrowLeft') {
              event.preventDefault();
              setExpanded(false);
            }
          }}
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-foreground-subtle mr-2 flex-shrink-0" aria-hidden />
          ) : (
            <ChevronRight className="w-4 h-4 text-foreground-subtle mr-2 flex-shrink-0" aria-hidden />
          )}
          <Folder className="w-4 h-4 text-warning mr-2 flex-shrink-0" aria-hidden />
          <span className="text-sm font-medium text-foreground">{node.name}</span>
        </div>

        {expanded && <div role="group">{renderChildren(node.children)}</div>}
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
  const router = useRouter()
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: jobDetails } = useJobDetails(jobId, runId);
  const {
    data: results,
    isLoading: resultsLoading,
    error,
  } = useJobResults(jobId, 1000, runId); // Get up to 1000 results for the specific run
  const { status: googleStatus, connect: connectGoogle, isConnecting } = useGoogleIntegration();
  const { csvUrl, xlsxUrl, loading: refsLoading, refresh: refreshExportRefs } = useExportRefs(jobId, runId);


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
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [resultsView, setResultsView] = useState<'selected' | 'all'>('selected');
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

    if (fileTreeMemo.length === 0) return;

    // Preserve selection if the selected task still exists after refresh
    if (selectedFileId) {
      const findById = (nodes: TreeNode[]): FileNode | null => {
        for (const node of nodes) {
          if (node.type === 'file' && node.id === selectedFileId) return node;
          if (node.type === 'folder') {
            const found = findById(node.children);
            if (found) return found;
          }
        }
        return null;
      };

      const stillSelected = findById(fileTreeMemo);
      if (stillSelected) {
        setSelectedPath(stillSelected.path);
        return;
      }
    }

    // Select first file by default
    const firstFile = findFirstFile(fileTreeMemo);
    if (firstFile) {
      setSelectedPath(firstFile.path);
      setSelectedFileId(firstFile.id);
    }
  }, [fileTreeMemo]);

  // Find the selected result based on path
  const selectedFileNode = useMemo(() => {
    if (!selectedFileId || !fileTree.length) return null;

    const findNode = (nodes: TreeNode[]): FileNode | null => {
      for (const node of nodes) {
        if (node.type === "file" && node.id === selectedFileId) {
          return node;
        } else if (node.type === "folder") {
          const found = findNode(node.children);
          if (found) return found;
        }
      }
      return null;
    };

    return findNode(fileTree);
  }, [selectedFileId, fileTree]);

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
      
      const sseUrl = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/jobs/${jobId}/events?token=${encodeURIComponent(token)}&include_full_state=false`;
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
                        className="text-primary underline flex items-center gap-1 hover:opacity-80"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View in {data.destination}
                      </a>
                    )}
                  </div>
                ),
              });
              
              // Refresh export refs so UI updates without reload
              refreshExportRefs().catch(() => {});
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

            // Ignore other event types not related to exports
            case 'task_started':
            case 'task_completed':
            case 'task_failed':
            case 'import_started':
            case 'import_progress':
            case 'import_completed':
            case 'import_failed':
            case 'import_batch_completed':
            case 'files_extracted':
            case 'file_status_changed':
            case 'extraction_failed':
            case 'job_completed':
            case 'job_submitted':
            case 'job_cancelled':
              // Ignore non-export events
              break;

            default:
              console.log('Unknown export SSE event type:', data.type);
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
      downloadBlob(blob, filename);

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
      
      // Use the API client export method with runId to preserve backend filename
      const { blob, filename } = await apiClient.exportJobExcel(jobId, runId);
      downloadBlob(blob, filename);

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

      // Build filename using job name and current UTC timestamp to match CSV/XLSX convention
      const slugify = (name: string) => {
        const trimmed = (name || 'job').trim();
        return trimmed
          .replace(/\s+/g, '_')
          .replace(/[^A-Za-z0-9._-]/g, '')
          .replace(/_+/g, '_')
          .slice(0, 80) || 'job';
      };
      const safeJob = slugify(jobDetails?.name || 'job');
      const ts = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const filename = `${safeJob}_${ts.getUTCFullYear()}${pad(ts.getUTCMonth() + 1)}${pad(ts.getUTCDate())}_${pad(ts.getUTCHours())}${pad(ts.getUTCMinutes())}${pad(ts.getUTCSeconds())}Z.json`;

      const blob = new Blob([jsonData], { type: "application/json" });
      downloadBlob(blob, filename);

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

  const formatValue = (value: any) => {
    if (value === null || value === undefined) {
      return <span className="text-foreground-subtle italic">Not found</span>;
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
      {/* Results summary */}
      <Section
        variant="card"
        title={
          <span className="inline-flex items-center gap-2">
            <CheckCircle className="size-5 text-success" aria-hidden />
            Extraction complete
          </span>
        }
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Total results" value={results?.results?.length || 0} />
          <StatCard label="Success rate" value={`${getSuccessRate()}%`} />
          <StatCard
            label="Fields extracted"
            value={jobDetails?.job_fields?.length || 0}
          />
          <StatCard label="Files processed" value={uniqueFilesCount} />
        </div>
      </Section>

      {/* Export options */}
      <Section
        variant="card"
        title={
          <span className="inline-flex items-center gap-2">
            <Download className="size-5 text-foreground-muted" aria-hidden />
            Export results
          </span>
        }
      >
        <div className="space-y-4">
          {/* Local download options */}
          <div>
            <h4 className="text-sm font-medium text-foreground-muted mb-2">
              Download to computer
            </h4>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleExportCSV}
                variant="outline"
                disabled={exportLoading === 'csv' || !results?.results?.length}
                aria-label="Export results as CSV"
              >
                {exportLoading === 'csv' ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" aria-hidden />
                ) : (
                  <FileSpreadsheet className="w-4 h-4 mr-2" aria-hidden />
                )}
                Export CSV
              </Button>
              <Button
                onClick={handleExportExcel}
                variant="outline"
                disabled={exportLoading === 'excel' || !results?.results?.length}
                aria-label="Export results as Excel"
              >
                {exportLoading === 'excel' ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" aria-hidden />
                ) : (
                  <FileSpreadsheet className="w-4 h-4 mr-2" aria-hidden />
                )}
                Export Excel
              </Button>
              <Button
                onClick={handleExportJSON}
                variant="outline"
                disabled={exportLoading === 'json' || !results?.results?.length}
                aria-label="Export results as JSON"
              >
                {exportLoading === 'json' ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" aria-hidden />
                ) : (
                  <FileText className="w-4 h-4 mr-2" aria-hidden />
                )}
                Export JSON
              </Button>
            </div>
          </div>

          {/* Google Drive export options */}
          <div>
            <h4 className="text-sm font-medium text-foreground-muted mb-2">
              Export to Google Drive
            </h4>
            {googleStatus?.connected ? (
              <div className="space-y-4">
                {!(csvUrl && xlsxUrl) && (
                  <div>
                    <GoogleDriveFolderPicker
                      onFolderSelected={(folder) => setSelectedExportFolder(folder)}
                      selectedFolder={selectedExportFolder}
                      showCard={false}
                      buttonText="Select export folder"
                    />
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={handleExportToGoogleDriveCSV}
                    variant="outline"
                    disabled={exportLoading === 'gdrive-csv' || !results?.results?.length}
                  >
                    {exportLoading === 'gdrive-csv' ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" aria-hidden />
                    ) : (
                      <Cloud className="w-4 h-4 mr-2" aria-hidden />
                    )}
                    {csvUrl ? 'Update CSV in Drive' : 'Export CSV to Drive'}
                  </Button>
                  {refsLoading ? (
                    <span className="ml-1 text-xs text-foreground-muted">Checking Drive links…</span>
                  ) : (
                    csvUrl && (
                      <a
                        href={csvUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-sm text-primary underline"
                      >
                        <ExternalLink className="w-3 h-3" aria-hidden />
                        View CSV in Drive
                      </a>
                    )
                  )}
                  <Button
                    onClick={handleExportToGoogleDriveExcel}
                    variant="outline"
                    disabled={exportLoading === 'gdrive-excel' || !results?.results?.length}
                  >
                    {exportLoading === 'gdrive-excel' ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" aria-hidden />
                    ) : (
                      <Cloud className="w-4 h-4 mr-2" aria-hidden />
                    )}
                    {xlsxUrl ? 'Update Excel in Drive' : 'Export Excel to Drive'}
                  </Button>
                  {refsLoading ? (
                    <span className="ml-1 text-xs text-foreground-muted">Checking Drive links…</span>
                  ) : (
                    xlsxUrl && (
                      <a
                        href={xlsxUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-sm text-primary underline"
                      >
                        <ExternalLink className="w-3 h-3" aria-hidden />
                        View Excel in Drive
                      </a>
                    )
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-primary/15 bg-primary-soft p-3">
                <Cloud
                  className="size-5 text-primary-soft-foreground"
                  aria-hidden
                />
                <div className="flex-1">
                  <p className="text-sm text-primary-soft-foreground">
                    Connect your Google account to export directly to Google
                    Drive.
                  </p>
                </div>
                <Button
                  onClick={() => connectGoogle('drive')}
                  size="sm"
                  disabled={isConnecting}
                >
                  {isConnecting ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" aria-hidden />
                  ) : null}
                  Connect Google Drive
                </Button>
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* Results display */}
      <Section
        variant="card"
        title={
          <span className="inline-flex items-center gap-2">
            <BarChart3 className="size-5 text-foreground-muted" aria-hidden />
            Extraction results ({results?.results?.length || 0} {pluralize(results?.results?.length || 0, 'result')})
          </span>
        }
      >
        {results?.results && results.results.length > 0 ? (
          <div className="flex h-[600px] gap-6">
            {/* File-tree sidebar */}
            <div className="w-64 flex-shrink-0">
              <h3 className="mb-3 flex items-center text-sm font-medium text-foreground">
                <Folder className="mr-2 size-4 text-foreground-muted" aria-hidden />
                Files ({uniqueFilesCount})
              </h3>

              <div
                className="h-[548px] overflow-y-auto rounded-lg border border-border p-2 [--indent:0.75rem]"
                role="tree"
                aria-label="Result files"
              >
                {fileTree.length > 0 ? (
                  fileTree.map((node, index) => (
                    <FileTreeNode
                      key={`${node.path}-${index}`}
                      node={node}
                      selectedPath={selectedPath}
                      selectedFileId={selectedFileId}
                      onSelect={(fileId, path) => {
                        setSelectedFileId(fileId);
                        setSelectedPath(path);
                        setResultsView('selected');
                      }}
                      level={0}
                    />
                  ))
                ) : (
                  <div className="py-4 text-center text-sm text-foreground-muted">
                    No files to display
                  </div>
                )}
              </div>
            </div>

            {/* Main content area */}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="mb-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  {resultsView === 'selected' && selectedFileNode ? (
                    <>
                      <h3 className="truncate text-sm font-medium text-foreground">
                        {selectedFileNode.name}
                      </h3>
                      <div className="mt-1 truncate text-xs text-foreground-muted">
                        {selectedFileNode.result.source_files?.length
                          ? selectedFileNode.result.source_files.join(', ')
                          : '(manual)'}
                      </div>
                      <Badge variant="secondary" className="mt-2">
                        {selectedFileNode.result.processing_mode}
                      </Badge>
                    </>
                  ) : (
                    <>
                      <h3 className="text-sm font-medium text-foreground">All rows</h3>
                      <div className="mt-1 text-xs text-foreground-muted">
                        Across all tasks in this run
                      </div>
                    </>
                  )}
                </div>

                <div className="flex flex-shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    data-tour="use-in-form-fill-button"
                    onClick={() => {
                      if (!runId || (resultsView === 'selected' && !selectedFileId)) return
                      const params = new URLSearchParams({
                        job_id: jobId,
                        run_id: runId,
                      })
                      if (resultsView === 'all') {
                        params.set('source_scope', 'all')
                      } else if (selectedFileId) {
                        params.set('task_id', selectedFileId)
                      }
                      router.push(`/dashboard/form-fill?${params.toString()}`)
                    }}
                    disabled={!runId || (resultsView === 'selected' && !selectedFileId)}
                  >
                    Use in Form Fill
                  </Button>
                  <Button
                    size="sm"
                    variant={resultsView === 'selected' ? 'default' : 'outline'}
                    onClick={() => setResultsView('selected')}
                    disabled={!selectedFileId}
                  >
                    Selected file
                  </Button>
                  <Button
                    size="sm"
                    variant={resultsView === 'all' ? 'default' : 'outline'}
                    onClick={() => setResultsView('all')}
                  >
                    All rows
                  </Button>
                </div>
              </div>

              <div className="min-h-0 flex-1">
                {resultsView === 'selected' ? (
                  selectedFileId ? (
                    <EditableResultsTable
                      jobId={jobId}
                      runId={runId}
                      filterTaskId={selectedFileId}
                      defaultAttachToTaskId={selectedFileId}
                    />
                  ) : (
                    <div className="py-8 text-center text-sm text-foreground-muted">
                      Select a file to view results.
                    </div>
                  )
                ) : (
                  <EditableResultsTable jobId={jobId} runId={runId} defaultAttachToTaskId={null} />
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center">
            <AlertCircle
              className="mx-auto mb-4 size-12 text-foreground-subtle"
              aria-hidden
            />
            <h3 className="mb-2 text-base font-medium text-foreground">
              No results found
            </h3>
            <p className="text-sm text-foreground-muted">
              The extraction job completed but no data was extracted. This
              might be due to the documents not containing the requested
              information.
            </p>
          </div>
        )}
      </Section>

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
