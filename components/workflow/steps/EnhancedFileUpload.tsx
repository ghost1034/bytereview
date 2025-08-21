/**
 * Enhanced File Upload Component for CPAAutomation
 * Handles file uploads with real progress tracking and SSE for ZIP extraction
 */
'use client'

import { useState, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { 
  Upload,
  File,
  FileText,
  Archive,
  Folder,
  X,
  Plus,
  Loader2,
  CheckCircle,
  AlertCircle,
  Clock,
  Cloud,
  Mail,
  HardDrive,
  FolderOpen,
  Paperclip,
  Trash2
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { apiClient, type JobFileInfo, type FileStatus } from '@/lib/api'
import { GoogleDrivePicker } from '@/components/integrations/GoogleDrivePicker'
import { GmailPicker } from '@/components/integrations/GmailPicker'
import { IntegrationPrompt } from '@/components/integrations/IntegrationBanner'
import { ImportStatusDisplay } from '@/components/upload/ImportStatusDisplay'

interface EnhancedFileUploadProps {
  jobId: string
  onFilesReady: (files: JobFileInfo[]) => void
  onBack?: () => void
}

export default function EnhancedFileUpload({ jobId, onFilesReady, onBack }: EnhancedFileUploadProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [files, setFiles] = useState<JobFileInfo[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const [dragOver, setDragOver] = useState(false)
  const [hasTriggeredImports, setHasTriggeredImports] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const zipEventSourceRef = useRef<EventSource | null>(null)
  const importEventSourceRef = useRef<EventSource | null>(null)
  const zipConnectionAttemptedRef = useRef<boolean>(false)
  const pendingFilesRef = useRef<Set<string>>(new Set())
  const expectedFilesRef = useRef<Set<string>>(new Set())
  const receivedFilesRef = useRef<Set<string>>(new Set())

  // Helper function to invalidate job files queries
  const invalidateJobFiles = () => {
    queryClient.invalidateQueries({ queryKey: ['job-files', jobId] })
  }

  // Helper function to sort files alphabetically by full path
  // Uses original_path (includes folder structure) for proper hierarchical sorting
  const sortFilesByPath = (files: JobFileInfo[]): JobFileInfo[] => {
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
      
      // Setup import SSE connection if not already active
      if (!importEventSourceRef.current) {
        setupImportSSEConnection();
      }
    }
  };

  // Handle Gmail attachment selection
  const handleGmailAttachments = (attachments: any[]) => {
    if (attachments.length > 0) {
      setHasTriggeredImports(true);
      
      // Setup import SSE connection if not already active
      if (!importEventSourceRef.current) {
        setupImportSSEConnection();
      }
    }
  };

  // Check if all files are ready
  const allFilesReady = files.length > 0 && files.every(f => 
    f.status === 'unpacked' || f.status === 'uploaded'
  ) && files.filter(f => f.status === 'unpacking' || f.status === 'importing').length === 0

  // Get files by status for display
  const readyFiles = files.filter(f => f.status === 'unpacked' || f.status === 'uploaded')
  const importingFiles = files.filter(f => f.status === 'importing')
  const unpackingFiles = files.filter(f => f.status === 'unpacking')
  const failedFiles = files.filter(f => f.status === 'failed')

  // ZIP SSE connection setup - for ZIP extraction monitoring only
  const setupZipSSEConnection = async () => {
    if (!jobId || zipEventSourceRef.current || zipConnectionAttemptedRef.current) return

    zipConnectionAttemptedRef.current = true
    try {
      console.log('Setting up ZIP SSE connection for extraction monitoring')
      const token = await apiClient.getAuthTokenForSSE()
      if (!token) {
        console.warn('No auth token available for ZIP SSE')
        return
      }
      
      const sseUrl = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/jobs/${jobId}/zip-events?token=${encodeURIComponent(token)}`
      const eventSource = new EventSource(sseUrl)
      zipEventSourceRef.current = eventSource

      eventSource.onopen = () => {
        console.log('ZIP SSE connection established for extraction monitoring')
      }

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          switch (data.type) {
            case 'connected':
              console.log('ZIP SSE connection confirmed')
              break

            case 'files_extracted':
              // Add files unpacked from ZIP to the list in alphabetical order
              console.log('ZIP extraction completed, adding extracted files')
              const mappedFiles: JobFileInfo[] = data.files.map((file: any) => ({
                id: file.id,
                original_filename: file.filename,
                original_path: file.original_path,
                file_size_bytes: file.file_size,
                status: file.status as FileStatus
              }))
              
              setFiles(prev => {
                const newFiles = mappedFiles.filter(newFile => 
                  !prev.some(existingFile => existingFile.id === newFile.id)
                )
                console.log(`Adding ${newFiles.length} extracted files`)
                
                // Add new files and sort alphabetically
                const updatedFiles = sortFilesByPath([...prev, ...newFiles])
                checkAndCloseZipSSEIfDone(updatedFiles)
                
                // Invalidate job files queries if new files were added
                if (newFiles.length > 0) {
                  invalidateJobFiles()
                }
                
                return updatedFiles
              })
              break

            case 'file_status_changed':
              // Update file status (e.g., unpacking to unpacked)
              console.log(`File status changed: ${data.file_id} to ${data.status}`)
              setFiles(prev => {
                const updatedFiles = prev.map(f => 
                  f.id === data.file_id ? { ...f, status: data.status as FileStatus } : f
                )
                
                // Check if all ZIP files are done extracting after this status change
                setTimeout(() => checkAndCloseZipSSEIfDone(updatedFiles), 1000)
                
                // Status changes don't affect order, so no need to re-sort
                return updatedFiles
              })
              break

            case 'extraction_failed':
              // Update file status to failed
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
              // Ignore keepalive events
              break

            default:
              // Ignore other event types for ZIP connection
              break
          }
        } catch (error) {
          console.error('Error parsing ZIP SSE event:', error)
        }
      }

      eventSource.onerror = (error) => {
        console.error('ZIP SSE connection error:', error)
        if (eventSource.readyState === EventSource.CLOSED) {
          zipEventSourceRef.current = null
        }
      }

    } catch (error) {
      console.error('Error setting up ZIP SSE:', error)
    }
  }

  // Import SSE connection setup - for import monitoring only
  const setupImportSSEConnection = async () => {
    if (!jobId || importEventSourceRef.current) return

    try {
      console.log('Setting up Import SSE connection for import monitoring')
      const token = await apiClient.getAuthTokenForSSE()
      if (!token) {
        console.warn('No auth token available for Import SSE')
        return
      }
      
      const sseUrl = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/jobs/${jobId}/events?token=${encodeURIComponent(token)}`
      const eventSource = new EventSource(sseUrl)
      importEventSourceRef.current = eventSource

      eventSource.onopen = () => {
        console.log('Import SSE connection established for import monitoring')
      }

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          switch (data.type) {
            case 'connected':
              console.log('Import SSE connection confirmed')
              break

            case 'import_started':
              // Import operation started
              console.log(`Import started: ${data.source} - ${data.file_count} files`)
              toast({
                title: `${data.source} Import Started`,
                description: `Importing ${data.file_count} item(s)`,
              });
              break

            case 'import_progress':
              // Individual file import progress (e.g., started importing)
              console.log(`Import progress: ${data.filename} - ${data.status}`)
              if (data.status === 'importing') {
                setFiles(prev => updateOrAddFile(
                  prev,
                  {
                    id: `importing-${Date.now()}-${data.filename}`,
                    original_filename: data.filename,
                    original_path: data.original_path || data.filename,
                    file_size_bytes: data.file_size || 0,
                    status: 'importing' as FileStatus
                  },
                  f => f.original_filename === data.filename || f.original_path === data.filename
                ))
              }
              break

            case 'import_completed':
              // Individual file import completed
              console.log(`Import completed: ${data.filename}`)
              // Add the imported file to the list
              const importedFile: JobFileInfo = {
                id: data.file_id,
                original_filename: data.filename,
                original_path: data.original_path || data.filename, // Use original_path from backend
                file_size_bytes: data.file_size || 0,
                status: data.status as FileStatus
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
                
                // Check if we need to establish ZIP SSE connection for unpacking files
                const hasUnpackingFiles = updatedFiles.some(f => f.status === 'unpacking')
                if (hasUnpackingFiles && !zipEventSourceRef.current && !zipConnectionAttemptedRef.current) {
                  console.log('Imported file with unpacking status detected, setting up ZIP SSE connection')
                  setupZipSSEConnection()
                }
                
                // Invalidate job files queries when new file is imported
                invalidateJobFiles()
                
                return updatedFiles
              })
              break

            case 'import_failed':
              // Import operation failed
              console.log(`Import failed: ${data.filename} - ${data.error}`)
              toast({
                title: "Import Failed",
                description: `Failed to import ${data.filename}: ${data.error}`,
                variant: "destructive"
              });
              break

            case 'import_batch_completed':
              // All imports in a batch completed
              console.log(`Import batch completed: ${data.source} - ${data.successful}/${data.total} items`)
              toast({
                title: `${data.source} Import Completed`,
                description: `Successfully imported ${data.successful} of ${data.total} item(s)`,
              });
              // Check if we can close the import connection
              setTimeout(() => checkAndCloseImportSSEIfDone(), 1000)
              break

            case 'keepalive':
              // Ignore keepalive events
              break

            default:
              // Ignore other event types for import connection
              break
          }
        } catch (error) {
          console.error('Error parsing Import SSE event:', error)
        }
      }

      eventSource.onerror = (error) => {
        console.error('Import SSE connection error:', error)
        if (eventSource.readyState === EventSource.CLOSED) {
          importEventSourceRef.current = null
        }
      }

    } catch (error) {
      console.error('Error setting up Import SSE:', error)
    }
  }

  // Close ZIP SSE connection when no longer needed
  const closeZipSSEConnection = () => {
    if (zipEventSourceRef.current) {
      console.log('Closing ZIP SSE connection')
      zipEventSourceRef.current.close()
      zipEventSourceRef.current = null
    }
    zipConnectionAttemptedRef.current = false
  }

  // Close Import SSE connection when no longer needed
  const closeImportSSEConnection = () => {
    if (importEventSourceRef.current) {
      console.log('Closing Import SSE connection')
      importEventSourceRef.current.close()
      importEventSourceRef.current = null
    }
  }

  // Check if all ZIP extraction is complete and close ZIP SSE if so
  const checkAndCloseZipSSEIfDone = (currentFiles: JobFileInfo[]) => {
    if (!zipEventSourceRef.current) return

    // Check if there are any ZIP files still being processed
    const hasUnpackingFiles = currentFiles.some(f => 
      f.status === 'unpacking' || f.status === 'uploading'
    )
    
    const hasZipFiles = currentFiles.some(f => 
      f.original_filename?.toLowerCase().endsWith('.zip')
    )
    
    // If we have ZIP files but none are currently unpacking, close ZIP SSE
    if (hasZipFiles && !hasUnpackingFiles) {
      console.log('All ZIP extraction completed, closing ZIP SSE connection')
      closeZipSSEConnection()
    } else if (hasUnpackingFiles) {
      console.log('ZIP extraction still in progress, keeping ZIP SSE connection open')
    }
  }

  // Check if all imports are complete and close Import SSE if so
  const checkAndCloseImportSSEIfDone = () => {
    if (!importEventSourceRef.current) return

    // For imports, we close the connection after batch completion
    // since we get explicit batch completion events
    console.log('Import batch completed, closing Import SSE connection')
    closeImportSSEConnection()
  }

  // Cleanup both SSE connections
  useEffect(() => {
    return () => {
      closeZipSSEConnection()
      closeImportSSEConnection()
    }
  }, [])


  // Track if we've already loaded files for this job to prevent Strict Mode double execution
  const loadedJobRef = useRef<string | null>(null)

  // Load existing files function
  const loadExistingFiles = async () => {
    try {
      // Load all files for display purposes (including ZIP files for transparency)
      const data = await apiClient.getJobFiles(jobId)
      setFiles(sortFilesByPath(data.files || []))
      
      // Check if there are unpacking files and setup ZIP SSE if needed
      const hasUnpackingFiles = (data.files || []).some(file => 
        file.status === 'unpacking'
      )
      
      if (hasUnpackingFiles && !zipEventSourceRef.current && !zipConnectionAttemptedRef.current) {
        console.log('Unpacking files detected on load, setting up ZIP SSE connection')
        setupZipSSEConnection()
      }
      
      // Check if there are importing files and setup Import SSE if needed
      const hasImportingFiles = (data.files || []).some(file => 
        file.status === 'importing'
      )
      
      if (hasImportingFiles && !importEventSourceRef.current) {
        console.log('Importing files detected on load, setting up Import SSE connection')
        setHasTriggeredImports(true)
        setupImportSSEConnection()
      }
    } catch (error) {
      console.error('Error loading existing files:', error)
    }
  }

  // Load existing files when component mounts (prevent Strict Mode double execution)
  useEffect(() => {
    if (jobId && loadedJobRef.current !== jobId) {
      loadedJobRef.current = jobId
      loadExistingFiles()
    }
    // Skip duplicate loads in Strict Mode
  }, [jobId])

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
  const updateOrAddFile = (files: JobFileInfo[], newFile: JobFileInfo, matchCondition: (f: JobFileInfo) => boolean) => {
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
        
        const isPdf = file.name.toLowerCase().endsWith('.pdf')
        const hasName = file.name && file.name.trim() !== ''
        const isLenientValid = hasName && (file.size > 0 || isPdf)
        console.log(`Lenient check for "${file.name}": isPdf=${isPdf}, hasName=${hasName}, valid=${isLenientValid}`)
        return isLenientValid
      })
      
      if (lenientFiles.length > 0) {
        console.log(`Found ${lenientFiles.length} files with lenient filtering`)
        validFiles.push(...lenientFiles)
      }
    }
    
    if (validFiles.length === 0) {
      toast({
        title: "No valid files selected",
        description: "Please select files (not empty folders).",
        variant: "destructive"
      })
      return
    }
    
    console.log(`Processing ${validFiles.length} valid files out of ${selectedFiles.length} selected`)
    
    // Check if this is a folder upload by looking for webkitRelativePath
    const isFolder = validFiles.some(f => f.webkitRelativePath && f.webkitRelativePath !== '')
    console.log('Is folder upload:', isFolder)

    console.log('File details:', Array.from(validFiles).map(f => ({ 
      name: f.name, 
      size: f.size, 
      type: f.type,
      webkitRelativePath: f.webkitRelativePath || 'none'
    })))

    setUploading(true)
    try {
      // Don't set up SSE connection yet - we'll do it only if there are ZIP files

      // Add files to the list immediately with uploading status
      const tempFiles: JobFileInfo[] = validFiles.map((f: any, index: number) => ({
        id: `temp-${Date.now()}-${index}`,
        original_filename: f.name,
        original_path: f.webkitRelativePath || f.name,
        file_size_bytes: f.size,
        status: 'uploading' as FileStatus
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
                status: fileData.status as FileStatus
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
      const result = await apiClient.addFilesToJob(jobId, validFiles, handleProgress, handleFileComplete)
      
      // Check if any uploaded files are ZIP files that need extraction
      const hasZipFiles = result.files.some(file => 
        file.filename.toLowerCase().endsWith('.zip') || 
        file.file_type === 'application/zip' ||
        file.file_type === 'application/x-zip-compressed'
      )
      
      if (hasZipFiles) {
        console.log('ZIP files detected, setting up ZIP SSE connection for extraction monitoring')
        await setupZipSSEConnection()
      } else {
        console.log('No ZIP files detected, skipping ZIP SSE connection')
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

    } catch (error) {
      console.error('Error uploading files:', error)
      console.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined
      })
      
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      })
    } finally {
      setUploading(false)
    }
  }

  // Handle file removal
  const handleRemoveFile = async (fileId: string) => {
    try {
      await apiClient.removeFileFromJob(jobId, fileId)
      
      // Directly remove the file from the list - no need to wait for SSE
      setFiles(prev => prev.filter(f => f.id !== fileId))
      
      // Invalidate job files queries so other pages refresh
      invalidateJobFiles()
      
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

  // Get file icon based on type
  const getFileIcon = (file: JobFileInfo) => {
    const filename = file.original_filename || ''
    
    if (filename.toLowerCase().endsWith('.zip')) {
      return <Archive className="w-5 h-5 text-orange-500" />
    } else if (filename.toLowerCase().endsWith('.pdf')) {
      return <FileText className="w-5 h-5 text-red-500" />
    } else if ((file.original_path || '').includes('/')) {
      return <Folder className="w-5 h-5 text-blue-500" />
    } else {
      return <File className="w-5 h-5 text-gray-500" />
    }
  }


  // Get status badge
  const getStatusBadge = (status: FileStatus) => {
    switch (status) {
      case 'uploaded':
        return <Badge variant="secondary" className="bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3 mr-1" />
          Uploaded
        </Badge>
      case 'unpacked':
        return <Badge variant="secondary" className="bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3 mr-1" />
          Unpacked
        </Badge>
      case 'importing':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          Importing
        </Badge>
      case 'unpacking':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          Unpacking
        </Badge>
      case 'uploading':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          Uploading
        </Badge>
      case 'failed':
        return <Badge variant="destructive">
          <AlertCircle className="w-3 h-3 mr-1" />
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

  return (
    <div className="space-y-6">
      {/* Integration prompt */}
      <IntegrationPrompt />


      {/* Multi-source upload tabs */}
      <Tabs defaultValue="computer" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="computer" className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            Computer
          </TabsTrigger>
          <TabsTrigger value="drive" className="flex items-center gap-2">
            <Cloud className="h-4 w-4" />
            Google Drive
          </TabsTrigger>
          <TabsTrigger value="gmail" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Gmail
          </TabsTrigger>
        </TabsList>

        <TabsContent value="computer" className="mt-6">
          {/* Upload Area */}
          <Card>
        <CardContent className="pt-6">
          {/* Drag & Drop Zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragOver 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <p className="text-lg font-medium text-gray-900 mb-2">
              Drop files here or click to browse
            </p>
            <p className="text-sm text-gray-500 mb-4">
              Supports PDFs, ZIP files, and folders
            </p>
            
            <div className="flex gap-2 justify-center">
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Files
              </Button>
              
              <Button
                variant="outline"
                onClick={() => {
                  console.log('Folder button clicked')
                  console.log('Browser:', navigator.userAgent)
                  if (folderInputRef.current) {
                    folderInputRef.current.click()
                  }
                }}
                disabled={uploading}
              >
                <Folder className="w-4 h-4 mr-2" />
                Add Folder
              </Button>
            </div>
          </div>

          {/* Hidden file inputs */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.zip"
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
            allowFolders
            mimeTypes={[
              'application/pdf',
              'application/zip',
              'application/x-zip-compressed',
              'application/vnd.google-apps.folder'
            ]}
          />
        </TabsContent>

        <TabsContent value="gmail" className="mt-6">
          <GmailPicker
              onAttachmentsSelected={handleGmailAttachments}
              jobId={jobId}
              multiSelect
              mimeTypes={[
                'application/pdf',
                'application/zip',
                'application/x-zip-compressed'
              ]}
            />
        </TabsContent>
      </Tabs>

      {/* Uploaded Files - Always visible regardless of tab */}
      {files.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Uploaded Files ({files.length})
            </CardTitle>
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
                        <p className="text-sm text-gray-500 truncate" title={file.original_path}>
                          {file.original_path}
                        </p>
                      )}
                      <p className="text-xs text-gray-400">
                        {file.file_size_bytes ? formatFileSize(file.file_size_bytes) : 'Unknown size'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {getStatusBadge(file.status)}
                    
                    {/* Delete button - only show for uploaded/unpacked files */}
                    {(file.status === 'uploaded' || file.status === 'unpacked') && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveFile(file.id)}
                          className={`p-1 h-8 w-8 ${
                            file.status === 'failed' 
                              ? 'text-red-500 hover:text-red-700' 
                              : 'text-red-500 hover:text-red-700'
                          }`}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Progress Summary */}
      {importingFiles.length > 0 && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-blue-800">
              <Cloud className="w-4 h-4" />
              <span className="font-medium">
                Importing file(s)...
              </span>
            </div>
            <p className="text-sm text-blue-600 mt-1">
              Please wait while we import your files from Google Drive/Gmail.
            </p>
          </CardContent>
        </Card>
      )}

      {unpackingFiles.length > 0 && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-blue-800">
              <Clock className="w-4 h-4" />
              <span className="font-medium">
                Unpacking {unpackingFiles.length} ZIP file(s)...
              </span>
            </div>
            <p className="text-sm text-blue-600 mt-1">
              Please wait while we unpack your ZIP files.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Navigation - Always visible */}
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
              const data = await apiClient.getJobFiles(jobId, { processable: true })
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
              Continue to Configuration
            </>
          ) : (
            <>
              <Clock className="w-4 h-4 mr-2" />
              Waiting for files to be ready...
            </>
          )}
        </Button>
      </div>
    </div>
  )
}