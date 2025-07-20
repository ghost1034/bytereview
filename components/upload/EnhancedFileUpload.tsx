/**
 * Enhanced File Upload Component for ByteReview
 * Handles file uploads with real progress tracking and SSE for ZIP extraction
 */
'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  Clock
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { apiClient } from '@/lib/api'
import { components } from '@/lib/api-types'

type JobFileInfo = components['schemas']['JobFileInfo']
type FileStatus = components['schemas']['FileStatus']

interface EnhancedFileUploadProps {
  jobId: string
  onFilesReady: (files: JobFileInfo[]) => void
  onBack?: () => void
}

export default function EnhancedFileUpload({ jobId, onFilesReady, onBack }: EnhancedFileUploadProps) {
  const { toast } = useToast()
  const [files, setFiles] = useState<JobFileInfo[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const pendingFilesRef = useRef<Set<string>>(new Set())
  const expectedFilesRef = useRef<Set<string>>(new Set())
  const receivedFilesRef = useRef<Set<string>>(new Set())

  // Check if all files are ready
  const allFilesReady = files.length > 0 && files.every(f => 
    f.status === 'ready' || f.status === 'unpacked' || f.status === 'uploaded'
  ) && files.filter(f => f.status === 'unpacking').length === 0

  // Get files by status for display
  const readyFiles = files.filter(f => f.status === 'ready' || f.status === 'unpacked' || f.status === 'uploaded')
  const unpackingFiles = files.filter(f => f.status === 'unpacking')
  const failedFiles = files.filter(f => f.status === 'failed')

  // SSE connection setup - only for ZIP extraction monitoring
  const setupSSEConnection = async () => {
    if (!jobId || eventSourceRef.current) return

    try {
      console.log('Setting up SSE connection for ZIP extraction monitoring')
      const token = await apiClient.getAuthTokenForSSE()
      if (!token) {
        console.warn('No auth token available for SSE')
        return
      }
      
      const sseUrl = `http://localhost:8000/api/jobs/${jobId}/events?token=${encodeURIComponent(token)}`
      const eventSource = new EventSource(sseUrl)
      eventSourceRef.current = eventSource

      eventSource.onopen = () => {
        console.log('SSE connection established for ZIP extraction monitoring')
      }

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          switch (data.type) {
            case 'connected':
              console.log('SSE connection confirmed for ZIP extraction')
              break

            case 'file_uploaded':
              // File uploads are now handled directly by API response, not SSE
              console.warn('Received file_uploaded SSE event - this should be handled directly by API response')
              break

            case 'files_extracted':
              // Add files unpacked from ZIP to the list
              console.log('ZIP extraction completed, adding extracted files')
              const mappedFiles: JobFileInfo[] = data.files.map((file: any) => ({
                id: file.id,
                original_filename: file.filename || file.original_filename,
                original_path: file.original_path || file.filename || file.original_filename,
                file_size_bytes: file.file_size_bytes || file.file_size,
                status: file.status as FileStatus
              }))
              
              setFiles(prev => {
                const newFiles = mappedFiles.filter(newFile => 
                  !prev.some(existingFile => existingFile.id === newFile.id)
                )
                console.log(`Adding ${newFiles.length} extracted files`)
                
                // Check if all ZIP files are done extracting after this update
                const updatedFiles = [...prev, ...newFiles]
                setTimeout(() => checkAndCloseSSEIfDone(updatedFiles), 1000)
                
                return updatedFiles
              })
              break

            case 'file_status_changed':
              // Update file status (e.g., unpacking to ready)
              console.log(`File status changed: ${data.file_id} to ${data.status}`)
              setFiles(prev => {
                const updatedFiles = prev.map(f => 
                  f.id === data.file_id ? { ...f, status: data.status as FileStatus } : f
                )
                
                // Check if all ZIP files are done extracting after this status change
                setTimeout(() => checkAndCloseSSEIfDone(updatedFiles), 1000)
                
                return updatedFiles
              })
              break

            case 'file_deleted':
              // File deletion is now handled directly by API response, not SSE
              console.warn('Received file_deleted SSE event - this should be handled directly by API response')
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
              console.log(`Ignoring SSE event type: ${data.type}`)
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
  }

  // Check if all ZIP extraction is complete and close SSE if so
  const checkAndCloseSSEIfDone = (currentFiles: JobFileInfo[]) => {
    if (!eventSourceRef.current) return

    // Check if there are any ZIP files still being processed
    const hasUnpackingFiles = currentFiles.some(f => 
      f.status === 'unpacking' || f.status === 'uploading'
    )
    
    const hasZipFiles = currentFiles.some(f => 
      f.original_filename?.toLowerCase().endsWith('.zip')
    )
    
    // If we have ZIP files but none are currently unpacking, close SSE
    if (hasZipFiles && !hasUnpackingFiles) {
      console.log('All ZIP extraction completed, closing SSE connection')
      closeSSEConnection()
    } else if (hasUnpackingFiles) {
      console.log('ZIP extraction still in progress, keeping SSE connection open')
    }
  }

  // Cleanup SSE connection
  useEffect(() => {
    return () => {
      closeSSEConnection()
    }
  }, [])

  // Track if we've already loaded files for this job to prevent Strict Mode double execution
  const loadedJobRef = useRef<string | null>(null)

  // Load existing files function
  const loadExistingFiles = async () => {
    try {
      // Load all files for display purposes (including ZIP files for transparency)
      const data = await apiClient.getJobFiles(jobId)
      setFiles(data.files || [])
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

  // Handle file selection
  const handleFileSelect = async (selectedFiles: FileList) => {
    if (selectedFiles.length === 0) return

    console.log(`Starting upload of ${selectedFiles.length} files`)
    
    // Filter out empty/folder entries (size 0 and no type)
    const validFiles = Array.from(selectedFiles).filter(file => {
      const isValid = file.size > 0 || file.type !== ''
      console.log(`File "${file.name}": size=${file.size}, type="${file.type}", lastModified=${file.lastModified}, valid=${isValid}`)
      return isValid
    })
    
    // For drag-and-drop, sometimes files show as size 0 initially but are actually valid
    // Let's be more lenient with PDF files
    if (validFiles.length === 0) {
      console.log('No valid files found with strict filtering, trying lenient filtering...')
      const lenientFiles = Array.from(selectedFiles).filter(file => {
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
      const tempFiles: JobFileInfo[] = validFiles.map((f, index) => ({
        id: `temp-${Date.now()}-${index}`,
        original_filename: f.name,
        original_path: (f as any).webkitRelativePath || f.name,
        file_size_bytes: f.size,
        status: 'uploading' as FileStatus
      }))
      
      setFiles(prev => [...prev, ...tempFiles])
      
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
          return prev.map(file => {
            if (file.original_path === filePath && file.id.startsWith('temp-')) {
              return {
                id: fileData.id,
                original_filename: fileData.filename,
                original_path: fileData.filename,
                file_size_bytes: fileData.file_size,
                status: fileData.status as FileStatus
              }
            }
            return file
          })
        })
        
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
        console.log('ZIP files detected, setting up SSE connection for extraction monitoring')
        await setupSSEConnection()
      } else {
        console.log('No ZIP files detected, skipping SSE connection')
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
        const file = await getFileFromEntry(entry)
        files.push(file)
      } else if (entry.isDirectory) {
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
      case 'ready':
      case 'uploaded':
        return <Badge variant="secondary" className="bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3 mr-1" />
          Ready
        </Badge>
      case 'unpacked':
        return <Badge variant="secondary" className="bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3 mr-1" />
          Unpacked
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

      {/* File List */}
      {files.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Uploaded Files ({files.length})</span>
              <div className="flex gap-2 text-sm">
                {readyFiles.length > 0 && (
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    {readyFiles.length} Ready
                  </Badge>
                )}
                {unpackingFiles.length > 0 && (
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                    {unpackingFiles.length} Unpacking
                  </Badge>
                )}
                {failedFiles.length > 0 && (
                  <Badge variant="destructive">
                    {failedFiles.length} Failed
                  </Badge>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3 flex-1">
                    {getFileIcon(file)}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{file.original_filename || 'Unknown file'}</p>
                      {file.original_path && file.original_path !== file.original_filename && (
                        <p className="text-sm text-gray-500 truncate">{file.original_path}</p>
                      )}
                      <p className="text-xs text-gray-400">
                        {file.file_size_bytes ? formatFileSize(file.file_size_bytes) : 'Unknown size'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {file.status === 'uploading' ? (
                      <div className="flex items-center gap-2 flex-1">
                        <div className="flex-1">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-blue-600">Uploading...</span>
                            <span className="text-xs text-blue-600">
                              {Math.round(uploadProgress[file.original_path] || 0)}%
                            </span>
                          </div>
                          <Progress 
                            value={uploadProgress[file.original_path] || 0} 
                            className="h-2 bg-blue-100" 
                          />
                        </div>
                        <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                      </div>
                    ) : (
                      <>
                        {getStatusBadge(file.status)}
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveFile(file.id)}
                          className="text-red-500 hover:text-red-700"
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

      {/* Navigation */}
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