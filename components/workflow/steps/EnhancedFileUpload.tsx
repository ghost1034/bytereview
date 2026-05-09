/**
 * Enhanced File Upload Component for CPAAutomation
 * Handles file uploads with real progress tracking and SSE for ZIP extraction
 */
'use client'

import { useState, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { 
  Upload,
  File,
  FileText,
  Archive,
  Folder,
  Download,
  X,
  Plus,
  Loader2,
  CheckCircle,
  AlertCircle,
  Clock,
  Cloud,
  HardDrive,
  FolderOpen,
  Paperclip,
  Trash2
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { apiClient, type JobFileInfo, type FileStatus, type JobFileAllRunsInfo } from '@/lib/api'
import { GoogleDrivePicker } from '@/components/integrations/GoogleDrivePicker'
import { IntegrationPrompt } from '@/components/integrations/IntegrationBanner'
import { cn } from '@/lib/utils'

interface EnhancedFileUploadProps {
  jobId: string
  runId?: string
  onFilesReady: (files: JobFileInfo[]) => void
  onBack?: () => void
  readOnly?: boolean
  isLatestSelected?: boolean
  hideFooter?: boolean
  fileListScope?: 'run' | 'allRuns'  // 'run' = show only current run's files (default), 'allRuns' = show files from all runs (CPE)
  onUploadConflict?: () => void  // Called when upload fails due to run being submitted/completed (409)
}

// Extended file info that includes job_run_id for all-runs mode
interface DisplayFile extends JobFileInfo {
  job_run_id?: string
}

export default function EnhancedFileUpload({ jobId, runId, onFilesReady, onBack, readOnly = false, isLatestSelected = true, hideFooter = false, fileListScope = 'run', onUploadConflict }: EnhancedFileUploadProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const MAX_DIRECT_UPLOAD_BYTES = 50 * 1024 * 1024
  const [files, setFiles] = useState<DisplayFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null)
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [hasTriggeredImports, setHasTriggeredImports] = useState(false)
  const [deleteFileTarget, setDeleteFileTarget] = useState<{ id: string; runId?: string; label: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const connectionAttemptedRef = useRef<boolean>(false)
  const acceptedExtensions = '.pdf,.docx,.pptx,.xlsx,.zip'
  const driveMimeTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'application/x-zip-compressed'
  ]
  const pendingFilesRef = useRef<Set<string>>(new Set())
  const expectedFilesRef = useRef<Set<string>>(new Set())
  const receivedFilesRef = useRef<Set<string>>(new Set())

  // Helper function to invalidate job files queries
  const invalidateJobFiles = () => {
    if (fileListScope === 'allRuns') {
      queryClient.invalidateQueries({ queryKey: ['job-files-all', jobId] })
    } else {
      queryClient.invalidateQueries({ queryKey: ['job-files', jobId, runId] })
    }
  }

  // Helper function to sort files alphabetically by full path
  // Uses original_path (includes folder structure) for proper hierarchical sorting
  const sortFilesByPath = (files: DisplayFile[]): DisplayFile[] => {
    return [...files].sort((a, b) => {
      const pathA = (a.original_path || a.original_filename || '').toLowerCase()
      const pathB = (b.original_path || b.original_filename || '').toLowerCase()
      return pathA.localeCompare(pathB)
    })
  }

  // Handle Google Drive file selection
  const handleDriveFiles = (driveFiles: any[]) => {
    if (driveFiles.length > 0) {
      setHasTriggeredImports(true);
      
      // Setup SSE connection if not already active
      if (!eventSourceRef.current) {
        setupSSEConnection();
      }
    }
  };

  // Check if all files are ready (allow continuing with no files for testing)
  const allFilesReady = files.length === 0 || (files.every(f => 
    f.status === 'unpacked' || f.status === 'uploaded'
  ) && files.filter(f => f.status === 'unpacking' || f.status === 'importing').length === 0)

  // Get files by status for display
  const readyFiles = files.filter(f => f.status === 'unpacked' || f.status === 'uploaded')
  const importingFiles = files.filter(f => f.status === 'importing')
  const unpackingFiles = files.filter(f => f.status === 'unpacking')
  const failedFiles = files.filter(f => f.status === 'failed')

  // Unified SSE connection setup - handles all job events
  const setupSSEConnection = async () => {
    if (!jobId || eventSourceRef.current || connectionAttemptedRef.current) return

    connectionAttemptedRef.current = true
    try {
      console.log('Setting up unified SSE connection for job events')
      const token = await apiClient.getAuthTokenForSSE()
      if (!token) {
        console.warn('No auth token available for SSE')
        return
      }
      
      const sseUrl = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/jobs/${jobId}/events?token=${encodeURIComponent(token)}&include_full_state=false`
      const eventSource = new EventSource(sseUrl)
      eventSourceRef.current = eventSource

      eventSource.onopen = () => {
        console.log('Unified SSE connection established')
      }

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          switch (data.type) {
            case 'connected':
              console.log('SSE connection confirmed')
              break

            // Import events
            case 'import_started':
              console.log(`Import started: ${data.source} - ${data.file_count} files`)
              toast({
                title: `${data.source} Import Started`,
                description: `Importing ${data.file_count} item(s)`,
              });
              break

            case 'import_progress':
              console.log(`Import progress: ${data.filename} - ${data.status}`)
              if (data.status === 'importing') {
                setFiles(prev => updateOrAddFile(
                  prev,
                  {
                    id: `importing-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${data.filename}`,
                    original_filename: data.filename,
                    original_path: data.original_path || data.filename,
                    file_size_bytes: data.file_size || 0,
                    status: 'importing' as FileStatus,
                    job_run_id: runId
                  },
                  f => f.original_filename === data.filename || f.original_path === data.filename
                ))
              }
              break

            case 'import_completed':
              console.log(`Import completed: ${data.filename}`)
              const importedFile: DisplayFile = {
                id: data.file_id,
                original_filename: data.filename,
                original_path: data.original_path || data.filename,
                file_size_bytes: data.file_size || 0,
                status: data.status as FileStatus,
                job_run_id: runId
              }
              
              setFiles(prev => {
                const updatedFiles = updateOrAddFile(
                  prev,
                  importedFile,
                  f => f.id === data.file_id || 
                       f.original_filename === data.filename ||
                       f.original_path === data.original_path ||
                       (f.id.startsWith('importing-') && f.original_filename === data.filename)
                )
                
                invalidateJobFiles()
                return updatedFiles
              })
              break

            case 'import_failed':
              console.log(`Import failed: ${data.filename} - ${data.error}`)
              toast({
                title: "Import Failed",
                description: `Failed to import ${data.filename}: ${data.error}`,
                variant: "destructive"
              });
              break

            case 'import_batch_completed':
              console.log(`Import batch completed: ${data.source} - ${data.successful}/${data.total} items`)
              toast({
                title: `${data.source} Import Completed`,
                description: `Successfully imported ${data.successful} of ${data.total} item(s)`,
              });
              // Don't close SSE immediately; wait to see if ZIP unpacking triggers follow-up events
              setTimeout(() => checkAndCloseSSEIfDone(), 1500)
              break

            // ZIP extraction events
            case 'files_extracted':
              console.log('ZIP extraction completed')

              // New backend behavior: signal-only event (no files array). Fall back to refetch.
              const hasInlineFiles = Array.isArray(data.files)
              if (hasInlineFiles) {
                const extractedFiles: DisplayFile[] = data.files.map((file: any) => ({
                  id: file.id,
                  original_filename: file.filename,
                  original_path: file.original_path,
                  file_size_bytes: file.file_size,
                  status: file.status as FileStatus,
                  job_run_id: runId
                }))

                setFiles(prev => {
                  const newFiles = extractedFiles.filter(newFile =>
                    !prev.some(existingFile => existingFile.id === newFile.id)
                  )
                  console.log(`Adding ${newFiles.length} extracted files`)

                  const updatedFiles = sortFilesByPath([...prev, ...newFiles])

                  // Update ZIP files to "unpacked" status
                  const finalFiles = updatedFiles.map(file => {
                    if (file.original_filename?.toLowerCase().endsWith('.zip') &&
                        (file.status === 'unpacking' || file.status === 'uploaded')) {
                      console.log(`Updating ZIP file ${file.original_filename} status to unpacked`)
                      return { ...file, status: 'unpacked' as FileStatus }
                    }
                    return file
                  })

                  return finalFiles
                })
              }

              // Always refetch from API to ensure we have the full canonical list.
              invalidateJobFiles()
              try {
                window.dispatchEvent(new CustomEvent('cpaautomation:job-files-changed', { detail: { jobId } }))
              } catch (e) {
                // Ignore
              }

              // If we have the zip file id, update it to unpacked immediately.
              if (data.zip_file_id) {
                setFiles(prev => prev.map(f =>
                  f.id === data.zip_file_id ? { ...f, status: 'unpacked' as FileStatus } : f
                ))
              }

              // Let UI update before evaluating closure
              setTimeout(() => checkAndCloseSSEIfDone(), 500)
              break

            case 'file_status_changed':
              console.log(`File status changed: ${data.file_id} to ${data.status}`)
              setFiles(prev => {
                const updatedFiles = prev.map(f => 
                  f.id === data.file_id ? { ...f, status: data.status as FileStatus } : f
                )
                // Delay slightly to ensure state update lands before we evaluate closure
                setTimeout(() => checkAndCloseSSEIfDone(), 500)
                return updatedFiles
              })
              break

            case 'extraction_failed':
              console.log(`ZIP extraction failed for file: ${data.file_id}`)
              setFiles(prev => prev.map(f => 
                f.id === data.file_id ? { ...f, status: 'failed' as FileStatus } : f
              ))
              toast({
                title: "ZIP unpacking failed",
                description: data.error,
                variant: "destructive"
              })
              break

            case 'keepalive':
              break

            default:
              console.log('Unknown SSE event type:', data.type)
              break
          }
        } catch (error) {
          console.error('Error parsing SSE event:', error)
        }
      }

      eventSource.onerror = (error) => {
        console.error('SSE connection error:', error)
        if (eventSource.readyState === EventSource.CLOSED) {
          eventSourceRef.current = null
        }
      }

    } catch (error) {
      console.error('Error setting up SSE:', error)
    }
  }

  // Close SSE connection when no longer needed
  const closeSSEConnection = () => {
    if (eventSourceRef.current) {
      console.log('Closing SSE connection')
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    connectionAttemptedRef.current = false
  }

  // Keep a ref to the latest files to avoid stale closures in delayed checks
  const filesRef = useRef<JobFileInfo[]>(files)
  useEffect(() => { filesRef.current = files }, [files])

  // Check if all processing is complete and close SSE if so
  const checkAndCloseSSEIfDone = () => {
    if (!eventSourceRef.current) return

    // Use the latest files snapshot to avoid stale state
    const currentFiles = filesRef.current

    // Check if any files still need processing (unpacking, importing, uploading)
    const hasProcessingFiles = currentFiles.some(f => 
      f.status === 'unpacking' || f.status === 'importing' || f.status === 'uploading'
    )
    
    if (hasProcessingFiles) {
      console.log('Files still processing - keeping SSE connection open')
    } else {
      console.log('All processing completed - closing SSE connection')
      closeSSEConnection()
    }
  }

  // Cleanup SSE connection
  useEffect(() => {
    return () => {
      closeSSEConnection()
    }
  }, [])


  // Track if we've already loaded files for this job+run to prevent duplicate loads
  const loadedKeyRef = useRef<string | null>(null)

  // Load existing files function
  const loadExistingFiles = async () => {
    try {
      let loadedFiles: DisplayFile[]

      if (fileListScope === 'allRuns') {
        // Load files from all runs for this job (CPE mode)
        const data = await apiClient.getJobFilesAllRuns(jobId, { processable: false })
        loadedFiles = (data.files || []).map(f => ({
          ...f,
          job_run_id: f.job_run_id
        }))
      } else {
        // Load files from current run only (normal mode)
        const data = await apiClient.getJobFiles(jobId, { runId })
        loadedFiles = (data.files || []).map(f => ({
          ...f,
          job_run_id: runId  // Tag with current runId for consistency
        }))
      }

      setFiles(sortFilesByPath(loadedFiles))

      // Check if there are processing files and setup SSE if needed
      const hasProcessingFiles = loadedFiles.some(file =>
        file.status === 'unpacking' || file.status === 'importing'
      )

      if (hasProcessingFiles && !eventSourceRef.current && !connectionAttemptedRef.current) {
        console.log('Processing files detected on load, setting up SSE connection')
        if (loadedFiles.some(file => file.status === 'importing')) {
          setHasTriggeredImports(true)
        }
        setupSSEConnection()
      }
    } catch (error) {
      console.error('Error loading existing files:', error)
    }
  }

  // Load existing files when jobId, runId, or fileListScope changes
  useEffect(() => {
    // In allRuns mode, key doesn't depend on runId since we show all runs
    const key = fileListScope === 'allRuns'
      ? `${jobId}:allRuns`
      : `${jobId}:${runId || 'latest'}`
    if (jobId && loadedKeyRef.current !== key) {
      // On run change, close SSE and reset state to avoid showing stale data
      if (loadedKeyRef.current && loadedKeyRef.current !== key) {
        closeSSEConnection()
        setFiles([])
        setUploadProgress({})
      }
      loadedKeyRef.current = key
      loadExistingFiles()
    }
  }, [jobId, runId, fileListScope])

  // Reload files when other parts of the UI delete files indirectly
  // (e.g. deleting the last extracted row for a task also deletes its files).
  useEffect(() => {
    if (!jobId) return

    const onFilesChanged = (e: Event) => {
      const ce = e as CustomEvent
      const changedJobId = ce?.detail?.jobId
      if (changedJobId && changedJobId !== jobId) return
      loadExistingFiles()
    }

    window.addEventListener('cpaautomation:job-files-changed', onFilesChanged)
    return () => window.removeEventListener('cpaautomation:job-files-changed', onFilesChanged)
  }, [jobId, runId, fileListScope])

  // Helper function to check if a file is a system file
  const isSystemFile = (fileName: string): boolean => {
    const name = fileName.toLowerCase()
    return name === '.ds_store' || 
           name === 'thumbs.db' || 
           name === 'desktop.ini' ||
           name.startsWith('._') ||
           name === '.localized'
  }

  // Helper function to check if a directory is a system directory
  const isSystemDirectory = (dirName: string): boolean => {
    const name = dirName.toLowerCase()
    return name === '__macosx' || name.startsWith('.')
  }

  // Helper function to update or add files while maintaining alphabetical order
  const updateOrAddFile = (files: DisplayFile[], newFile: DisplayFile, matchCondition: (f: DisplayFile) => boolean) => {
    const existingIndex = files.findIndex(matchCondition)
    if (existingIndex !== -1) {
      // Update existing file in place
      return files.map((file, index) => index === existingIndex ? newFile : file)
    } else {
      // Add new file and sort the entire list
      return sortFilesByPath([...files, newFile])
    }
  }

  // Handle file selection
  const handleFileSelect = async (selectedFiles: FileList) => {
    if (selectedFiles.length === 0) return

    console.log(`Starting upload of ${selectedFiles.length} files`)
    
    // Filter out system files and empty/folder entries
    const validFiles = Array.from(selectedFiles).filter(file => {
      if (isSystemFile(file.name)) {
        console.log(`Filtering out system file: ${file.name}`)
        return false
      }
      
      // Filter out empty/folder entries (size 0 and no type)
      const isValid = file.size > 0 || file.type !== ''
      console.log(`File "${file.name}": size=${file.size}, type="${file.type}", lastModified=${file.lastModified}, valid=${isValid}`)
      return isValid
    })
    
    // For drag-and-drop, sometimes files show as size 0 initially but are actually valid
    // Let's be more lenient with PDF files
    if (validFiles.length === 0) {
      console.log('No valid files found with strict filtering, trying lenient filtering...')
      const lenientFiles = Array.from(selectedFiles).filter(file => {
        if (isSystemFile(file.name)) {
          console.log(`Filtering out system file in lenient mode: ${file.name}`)
          return false
        }
        
        const name = file.name.toLowerCase()
        const isSupportedDocument = ['.pdf', '.docx', '.pptx', '.xlsx', '.zip'].some((ext) => name.endsWith(ext))
        const hasName = file.name && file.name.trim() !== ''
        const isLenientValid = hasName && (file.size > 0 || isSupportedDocument)
        console.log(`Lenient check for "${file.name}": isSupportedDocument=${isSupportedDocument}, hasName=${hasName}, valid=${isLenientValid}`)
        return isLenientValid
      })
      
      if (lenientFiles.length > 0) {
        console.log(`Found ${lenientFiles.length} files with lenient filtering`)
        validFiles.push(...lenientFiles)
      }
    }
    
    // Enforce per-file size limit (50MB)
    const tooLarge = validFiles.filter(f => f.size > MAX_DIRECT_UPLOAD_BYTES)
    const sizeOk = validFiles.filter(f => f.size <= MAX_DIRECT_UPLOAD_BYTES)
    if (tooLarge.length > 0) {
      toast({
        title: "File too large",
        description: `Skipped ${tooLarge.length} file(s) over 50MB.`,
        variant: "destructive"
      })
    }

    if (sizeOk.length === 0) {
      toast({
        title: "No files to upload",
        description: tooLarge.length > 0 ? "All selected files exceed the 50MB limit." : "Please select files (not empty folders).",
        variant: "destructive"
      })
      return
    }
    
    console.log(`Processing ${sizeOk.length} valid files out of ${selectedFiles.length} selected`)
    
    // Check if this is a folder upload by looking for webkitRelativePath
    const isFolder = sizeOk.some(f => f.webkitRelativePath && f.webkitRelativePath !== '')
    console.log('Is folder upload:', isFolder)

    console.log('File details:', Array.from(sizeOk).map(f => ({ 
      name: f.name, 
      size: f.size, 
      type: f.type,
      webkitRelativePath: f.webkitRelativePath || 'none'
    })))

    setUploading(true)
    try {
      // Don't set up SSE connection yet - we'll do it only if there are ZIP files

      // Add files to the list immediately with uploading status
       const tempFiles: DisplayFile[] = sizeOk.map((f: any, index: number) => ({
        id: `temp-${Date.now()}-${index}`,
        original_filename: f.name,
        original_path: f.webkitRelativePath || f.name,
        file_size_bytes: f.size,
        status: 'uploading' as FileStatus,
        job_run_id: runId  // Tag with current runId for all-runs mode
      }))
      
      setFiles(prev => sortFilesByPath([...prev, ...tempFiles]))
      
      // Real progress callback
      const handleProgress = (filePath: string, progress: number) => {
        setUploadProgress(prev => ({
          ...prev,
          [filePath]: progress
        }))
      }
      
      // Handle individual file completion
      const handleFileComplete = (fileData: any, filePath: string) => {
        // Remove from progress tracking
        setUploadProgress(prev => {
          const newProgress = { ...prev }
          delete newProgress[filePath]
          return newProgress
        })
        
        // Replace the temp file with the real file data
        setFiles(prev => {
          const updatedFiles = prev.map(file => {
            if (file.original_path === filePath && file.id.startsWith('temp-')) {
              return {
                id: fileData.id,
                original_filename: fileData.filename,
                original_path: filePath, // Keep the original path from upload
                file_size_bytes: fileData.file_size,
                status: fileData.status as FileStatus,
                job_run_id: runId  // Tag with current runId for all-runs mode
              }
            }
            return file
          })
          // Re-sort in case the filename changed during upload
          return sortFilesByPath(updatedFiles)
        })
        
        // Invalidate job files queries when file upload completes
        invalidateJobFiles()
        
        console.log(`Completed file: ${fileData.filename}`)
      }
      
      // Upload files with real progress tracking and individual completion
       const result = await apiClient.addFilesToJob(jobId, sizeOk, handleProgress, handleFileComplete, runId)
      
      // Check if any uploaded files are ZIP files that need extraction
      const hasZipFiles = result.files.some(file => 
        file.filename.toLowerCase().endsWith('.zip') || 
        file.file_type === 'application/zip' ||
        file.file_type === 'application/x-zip-compressed'
      )
      
      if (hasZipFiles) {
        console.log('ZIP files detected, setting up SSE connection for extraction monitoring')
        if (!eventSourceRef.current && !connectionAttemptedRef.current) {
          await setupSSEConnection()
        }
      } else {
        console.log('No ZIP files detected, skipping SSE connection setup')
      }

      // Clear progress and uploading files after all uploads complete
      setTimeout(() => {
        setUploadProgress({})
        pendingFilesRef.current.clear()
        
        // Clean up any remaining temporary files
        setFiles(prev => prev.filter(f => !f.id.startsWith('temp-')))
      }, 1000)
      
      toast({
        title: "Files uploaded",
        description: `Successfully uploaded ${result.files.length} files`
      })

    } catch (error: any) {
      console.error('Error uploading files:', error)
      console.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined
      })

      // Check for 409 Conflict (run already submitted/completed)
      const is409 = error?.status === 409 ||
                    error?.message?.includes('409') ||
                    error?.message?.includes('submitted') ||
                    error?.message?.includes('completed')

      if (is409 && onUploadConflict) {
        // Call the conflict handler to refresh state
        onUploadConflict()
        toast({
          title: "Run completed",
          description: "The current run has completed. Refreshing to the latest run...",
        })
        // Clear temp files
        setFiles(prev => prev.filter(f => !f.id.startsWith('temp-')))
      } else {
        toast({
          title: "Upload failed",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive"
        })
      }
    } finally {
      setUploading(false)
    }
  }

  // Handle file removal
  const handleRemoveFile = async (fileId: string, fileRunId?: string) => {
    if (readOnly) return
    
    try {
      // In allRuns mode (CPE), delete must be scoped to the file's owning run.
      await apiClient.removeFileFromJob(jobId, fileId, fileRunId || runId)
      
      // Directly remove the file from the list - no need to wait for SSE
      setFiles(prev => prev.filter(f => f.id !== fileId))
      
      // Invalidate job files queries so other pages refresh
      invalidateJobFiles()

      // Deleting a file may remove results (when tasks become fileless)
      queryClient.invalidateQueries({ queryKey: ['job-results', jobId] })
      
      toast({
        title: "File removed",
        description: "File has been removed successfully"
      })

    } catch (error) {
      console.error('Error removing file:', error)
      toast({
        title: "Remove failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      })
    }
  }

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    
    if (readOnly) return
    
    console.log('Drop event - files:', e.dataTransfer.files.length, 'items:', e.dataTransfer.items?.length)
    
    // Check if we have DataTransferItems (better folder support)
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      console.log('Using DataTransferItem API for enhanced folder support')
      
      const allFiles: File[] = []
      
      // Process each dropped item
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const item = e.dataTransfer.items[i]
        
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry()
          
          if (entry) {
            if (entry.isDirectory) {
              console.log('Processing folder:', entry.name)
              const folderFiles = await getAllFilesFromDirectory(entry)
              allFiles.push(...folderFiles)
            } else {
              console.log('Processing file:', entry.name)
              const file = item.getAsFile()
              if (file) allFiles.push(file)
            }
          }
        }
      }
      
      if (allFiles.length > 0) {
        console.log(`Found ${allFiles.length} total files:`, allFiles.map(f => f.name))
        handleFileSelect(createFileList(allFiles))
        return
      }
    }
    
    // Fallback to standard file handling
    if (e.dataTransfer.files.length > 0) {
      console.log('Using standard file handling')
      handleFileSelect(e.dataTransfer.files)
    }
  }

  // Clean helper to get all files from a directory
  const getAllFilesFromDirectory = async (dirEntry: any): Promise<File[]> => {
    const files: File[] = []
    const reader = dirEntry.createReader()
    
    // Get file from file entry
    const getFileFromEntry = (fileEntry: any): Promise<File> => {
      return new Promise((resolve) => {
        fileEntry.file((file: File) => {
          resolve(file)
        })
      })
    }
    
    // Read ALL entries from the directory (may require multiple calls)
    const readAllEntries = async (): Promise<any[]> => {
      const allEntries: any[] = []
      
      const readBatch = (): Promise<any[]> => {
        return new Promise((resolve) => {
          reader.readEntries((entries: any[]) => {
            resolve(entries)
          }, (error: any) => {
            console.error('Error reading entries:', error)
            resolve([])
          })
        })
      }
      
      // Keep reading until we get an empty array (indicating no more entries)
      let batchCount = 0
      while (true) {
        const entries = await readBatch()
        batchCount++
        
        if (entries.length === 0) {
          console.log(`Finished reading ${dirEntry.name} after ${batchCount} batches`)
          break
        }
        
        console.log(`Batch ${batchCount}: Read ${entries.length} entries from ${dirEntry.name}:`, entries.map((e: any) => e.name))
        allEntries.push(...entries)
      }
      
      console.log(`Total entries found in ${dirEntry.name}: ${allEntries.length}`)
      return allEntries
    }
    
    const allEntries = await readAllEntries()
    
    // Process all entries
    for (const entry of allEntries) {
      if (entry.isFile) {
        console.log(`Processing file: ${entry.name}`)
        
        if (isSystemFile(entry.name)) {
          console.log(`Skipping system file during directory traversal: ${entry.name}`)
          continue
        }
        
        const file = await getFileFromEntry(entry)
        files.push(file)
      } else if (entry.isDirectory) {
        if (isSystemDirectory(entry.name)) {
          console.log(`Skipping system directory: ${entry.name}`)
          continue
        }
        
        console.log(`Processing subdirectory: ${entry.name}`)
        // Recursively process subdirectories
        const subFiles = await getAllFilesFromDirectory(entry)
        files.push(...subFiles)
      }
    }
    
    console.log(`Directory ${dirEntry.name} yielded ${files.length} files`)
    return files
  }

  // Helper to create a proper FileList from File array
  const createFileList = (files: File[]): FileList => {
    const fileList = {
      length: files.length,
      item: (index: number) => files[index] || null,
      [Symbol.iterator]: function* () {
        for (const file of files) {
          yield file
        }
      }
    }
    
    // Add array-like access
    files.forEach((file, index) => {
      (fileList as any)[index] = file
    })
    
    return fileList as FileList
  }

  // Get file icon based on type. Uses semantic tones so dark-mode adapts cleanly.
  const getFileIcon = (file: JobFileInfo) => {
    const filename = file.original_filename || ''

    if (filename.toLowerCase().endsWith('.zip')) {
      return <Archive className="w-5 h-5 text-warning" aria-hidden />
    } else if (filename.toLowerCase().endsWith('.pdf')) {
      return <FileText className="w-5 h-5 text-destructive" aria-hidden />
    } else if (filename.toLowerCase().endsWith('.docx')) {
      return <FileText className="w-5 h-5 text-info" aria-hidden />
    } else if (filename.toLowerCase().endsWith('.pptx')) {
      return <FileText className="w-5 h-5 text-warning" aria-hidden />
    } else if (filename.toLowerCase().endsWith('.xlsx')) {
      return <FileText className="w-5 h-5 text-success" aria-hidden />
    } else if ((file.original_path || '').includes('/')) {
      return <Folder className="w-5 h-5 text-info" aria-hidden />
    } else {
      return <File className="w-5 h-5 text-foreground-muted" aria-hidden />
    }
  }


  // Get status badge
  const getStatusBadge = (status: FileStatus) => {
    switch (status) {
      case 'uploaded':
        return <Badge variant="outline" className="bg-success-soft text-success border-success/20">
          <CheckCircle className="w-3 h-3 mr-1" aria-hidden />
          Uploaded
        </Badge>
      case 'unpacked':
        return <Badge variant="outline" className="bg-success-soft text-success border-success/20">
          <CheckCircle className="w-3 h-3 mr-1" aria-hidden />
          Unpacked
        </Badge>
      case 'importing':
        return <Badge variant="outline" className="bg-info-soft text-info border-info/20">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" aria-hidden />
          Importing
        </Badge>
      case 'unpacking':
        return <Badge variant="outline" className="bg-info-soft text-info border-info/20">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" aria-hidden />
          Unpacking
        </Badge>
      case 'uploading':
        return <Badge variant="outline" className="bg-info-soft text-info border-info/20">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" aria-hidden />
          Uploading
        </Badge>
      case 'failed':
        return <Badge variant="destructive">
          <AlertCircle className="w-3 h-3 mr-1" aria-hidden />
          Failed
        </Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const triggerBrowserDownload = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }

  const isRealFileId = (id: string) => !id.startsWith('temp-') && !id.startsWith('importing-')

  const isDownloadable = (file: DisplayFile) =>
    isRealFileId(file.id) && (file.status === 'uploaded' || file.status === 'unpacked')

  const handleDownloadFile = async (file: DisplayFile) => {
    if (!isDownloadable(file)) return
    setDownloadingFileId(file.id)
    try {
      const { blob, filename } = await apiClient.downloadJobFile(jobId, file.id)
      triggerBrowserDownload(blob, filename)
    } catch (error: any) {
      toast({
        title: 'Download failed',
        description: error?.message || 'Failed to download file',
        variant: 'destructive'
      })
    } finally {
      setDownloadingFileId(null)
    }
  }

  const handleDownloadAll = async () => {
    const fileIds = files.filter(isDownloadable).map(f => f.id)
    if (fileIds.length === 0) {
      toast({
        title: 'No files to download',
        description: 'Upload files first, or wait for processing to complete.',
      })
      return
    }

    setDownloadingAll(true)
    try {
      const { blob, filename } = await apiClient.downloadJobFilesZip(jobId, fileIds)
      triggerBrowserDownload(blob, filename)
    } catch (error: any) {
      toast({
        title: 'Download failed',
        description: error?.message || 'Failed to download ZIP',
        variant: 'destructive'
      })
    } finally {
      setDownloadingAll(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Integration prompt */}
      <IntegrationPrompt />


      {/* Multi-source upload tabs */}
      <Tabs defaultValue="computer" className="w-full">
        <TabsList className="grid w-full grid-cols-2 gap-2">
          <TabsTrigger value="computer" className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            Computer
          </TabsTrigger>
          <TabsTrigger
            value="drive"
            className={`flex items-center gap-2 ${!isLatestSelected ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={!isLatestSelected}
          >
            <Cloud className="h-4 w-4" />
            Google Drive
          </TabsTrigger>
        </TabsList>

        <TabsContent value="computer" className="mt-6">
          {/* Upload Area */}
          <Card data-tour="upload-files">
        <CardContent className="pt-6">
          {/* Drag & drop zone */}
          <div
            role="button"
            tabIndex={readOnly ? -1 : 0}
            aria-disabled={readOnly || undefined}
            aria-label="Drop files here or activate to browse"
            className={cn(
              'rounded-lg border-2 border-dashed p-8 text-center transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              dragOver
                ? 'border-primary bg-primary-soft'
                : 'border-border hover:border-border-strong',
              readOnly && 'cursor-not-allowed opacity-60',
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onKeyDown={(event) => {
              if (readOnly) return
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                fileInputRef.current?.click()
              }
            }}
          >
            <Upload
              className="mx-auto mb-4 h-12 w-12 text-foreground-subtle"
              aria-hidden
            />
            <p className="mb-2 text-lg font-medium text-foreground">
              Drop files here or click to browse
            </p>
            <p className="mb-4 text-sm text-foreground-muted">
              Supports PDF, DOCX, PPTX, XLSX, ZIP files, and folders
            </p>

            <div className="flex justify-center gap-2">
              <Button
                variant="outline"
                onClick={(event) => {
                  event.stopPropagation()
                  fileInputRef.current?.click()
                }}
                disabled={uploading || readOnly}
              >
                <Plus className="w-4 h-4 mr-2" aria-hidden />
                Add files
              </Button>

              <Button
                variant="outline"
                onClick={(event) => {
                  event.stopPropagation()
                  if (folderInputRef.current) {
                    folderInputRef.current.click()
                  }
                }}
                disabled={uploading || readOnly}
              >
                <Folder className="w-4 h-4 mr-2" aria-hidden />
                Add folder
              </Button>
            </div>
          </div>

          {/* Polite live region for screen-reader-driven progress announcements */}
          <div role="status" aria-live="polite" className="sr-only">
            {uploading ? 'Uploading files…' : ''}
          </div>

          {/* Hidden file inputs */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={acceptedExtensions}
            className="hidden"
            onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
          />
          
          <input
            ref={folderInputRef}
            type="file"
            {...({ webkitdirectory: "" } as any)}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFileSelect(e.target.files)
              }
            }}
          />
        </CardContent>
      </Card>

        </TabsContent>

        <TabsContent value="drive" className="mt-6">
          <GoogleDrivePicker
            onFilesSelected={handleDriveFiles}
            jobId={jobId}
            multiSelect
            mimeTypes={driveMimeTypes}
          />
        </TabsContent>

      </Tabs>

      {/* Uploaded Files - Always visible regardless of tab */}
      {files.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Uploaded Files ({files.length})
              </CardTitle>

              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadAll}
                disabled={downloadingAll}
              >
                {downloadingAll ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Download All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-y-auto space-y-2">
              {files.map((file) => (
                <div key={file.id} className="flex items-center justify-between p-3 border rounded-lg min-w-0">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {getFileIcon(file)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="font-medium truncate min-w-0" title={file.original_filename || 'Unknown file'}>
                          {file.original_filename || 'Unknown file'}
                        </p>
                      </div>
                      {file.original_path && file.original_path !== file.original_filename && (
                        <p className="text-sm text-foreground-muted truncate" title={file.original_path}>
                          {file.original_path}
                        </p>
                      )}
                      <p className="text-xs text-foreground-subtle">
                        {file.file_size_bytes ? formatFileSize(file.file_size_bytes) : 'Unknown size'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {getStatusBadge(file.status)}

                    {isDownloadable(file) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDownloadFile(file)}
                        disabled={downloadingAll || downloadingFileId === file.id}
                        aria-label={`Download ${file.original_filename || 'file'}`}
                        className="size-8 text-foreground-muted hover:text-foreground"
                        title="Download file"
                      >
                        {downloadingFileId === file.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                        ) : (
                          <Download className="w-4 h-4" aria-hidden />
                        )}
                      </Button>
                    )}

                    {/* Delete button — only when uploaded/unpacked and not readOnly */}
                    {(file.status === 'uploaded' || file.status === 'unpacked') &&
                     !readOnly &&
                     (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setDeleteFileTarget({
                            id: file.id,
                            runId: file.job_run_id,
                            label: file.original_path || file.original_filename || 'this file',
                          })
                        }
                        aria-label={`Remove ${file.original_filename || 'file'}`}
                        className="size-8 text-destructive/80 hover:text-destructive"
                        title="Remove file"
                      >
                        <X className="w-4 h-4" aria-hidden />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Progress summary */}
      {importingFiles.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-primary/15 bg-primary-soft p-4"
        >
          <div className="flex items-center gap-2 text-primary-soft-foreground">
            <Cloud className="w-4 h-4" aria-hidden />
            <span className="font-medium">Importing file(s)…</span>
          </div>
          <p className="mt-1 text-sm text-primary-soft-foreground/80">
            Please wait while we import your files from Google Drive/Gmail.
          </p>
        </div>
      )}

      {unpackingFiles.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-primary/15 bg-primary-soft p-4"
        >
          <div className="flex items-center gap-2 text-primary-soft-foreground">
            <Clock className="w-4 h-4" aria-hidden />
            <span className="font-medium">
              Unpacking {unpackingFiles.length} ZIP file(s)…
            </span>
          </div>
          <p className="mt-1 text-sm text-primary-soft-foreground/80">
            Please wait while we unpack your ZIP files.
          </p>
        </div>
      )}

      {/* Navigation - Hidden when hideFooter is true */}
      {!hideFooter && (
        <div className="flex justify-between">
          {onBack && (
            <Button variant="outline" onClick={onBack}>
              Back
            </Button>
          )}

          <div className="flex-1" />

          <Button
            onClick={async () => {
              // Get only processable files from the backend for data extraction
              try {
                const data = await apiClient.getJobFiles(jobId, { processable: true, runId })
                onFilesReady(data.files || [])
              } catch (error) {
                console.error('Error getting processable files:', error)
                // Fallback to client-side filtering if API call fails
                const processableFiles = files.filter(file => {
                  const filename = file.original_filename?.toLowerCase() || ''
                  return !filename.endsWith('.zip') &&
                         !filename.endsWith('.7z') &&
                         !filename.endsWith('.rar')
                })
                onFilesReady(processableFiles)
              }
            }}
            disabled={!allFilesReady}
            className="min-w-[200px]"
          >
            {allFilesReady ? (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                {files.length === 0 ? 'Continue (No Files)' : 'Continue to Configuration'}
              </>
            ) : (
              <>
                <Clock className="w-4 h-4 mr-2" />
                Waiting for files to be ready...
              </>
            )}
          </Button>
        </div>
      )}

      <AlertDialog open={!!deleteFileTarget} onOpenChange={(open) => !open && setDeleteFileTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete file?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete “{deleteFileTarget?.label}”. If this was the last file linked to a task, the corresponding extracted data may also be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const t = deleteFileTarget
                setDeleteFileTarget(null)
                if (!t) return
                handleRemoveFile(t.id, t.runId)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
