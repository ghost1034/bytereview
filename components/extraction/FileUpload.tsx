'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { CloudUpload, X, FileText, FolderOpen, Archive, Loader2 } from "lucide-react"
import { apiClient } from '@/lib/api'
import JSZip from 'jszip'

interface FileUploadProps {
  uploadedFiles: {file_id: string, filename: string, size_bytes: number}[]
  onFileUploaded: (fileInfo: {file_id: string, filename: string, size_bytes: number}) => void
  onFileRemoved: (file_id: string) => void
}

export default function FileUpload({ uploadedFiles, onFileUploaded, onFileRemoved }: FileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  const isValidFile = (file: File) => {
    return file.type === 'application/pdf' || 
           file.type === 'application/zip' || 
           file.type === 'application/x-zip-compressed' ||
           file.name.toLowerCase().endsWith('.pdf') ||
           file.name.toLowerCase().endsWith('.zip')
  }

  const uploadFilesImmediately = async (files: File[]) => {
    if (files.length === 0) return

    setIsUploading(true)
    try {
      const uploadResult = await apiClient.uploadFiles(files)
      
      // Add each uploaded file to the list
      uploadResult.uploaded_files.forEach((fileInfo: any) => {
        onFileUploaded({
          file_id: fileInfo.file_id,
          filename: fileInfo.filename,
          size_bytes: fileInfo.size_bytes
        })
      })
      
    } catch (error: any) {
      console.error('Upload failed:', error)
      alert(`Upload failed: ${error.message}`)
    } finally {
      setIsUploading(false)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    
    const items = Array.from(e.dataTransfer.items)
    const files: File[] = []

    // Handle folder drops
    for (const item of items) {
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry()
        if (entry) {
          if (entry.isDirectory) {
            // Create a ZIP file from the folder contents
            const folderFiles = await readDirectory(entry as FileSystemDirectoryEntry, entry.name)
            const validFiles = folderFiles.filter(isValidFile)
            
            if (validFiles.length > 0) {
              // Create a ZIP file from the folder
              const zipFile = await createZipFromFiles(validFiles, entry.name)
              files.push(zipFile)
            }
          } else {
            const file = item.getAsFile()
            if (file && isValidFile(file)) {
              files.push(file)
            }
          }
        }
      }
    }

    if (files.length > 0) {
      await uploadFilesImmediately(files)
    } else {
      alert('Please upload PDF files, ZIP files, or folders containing PDF files.')
    }
  }

  const createZipFromFiles = async (files: File[], folderName: string): Promise<File> => {
    const zip = new JSZip()
    
    // Add each file to the ZIP preserving folder structure
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer()
      
      // Use webkitRelativePath if available (from folder selection)
      // or fall back to just the filename for drag & drop
      const relativePath = (file as any).webkitRelativePath || file.name
      
      // Remove the root folder name from the path since we'll use it as ZIP name
      const pathParts = relativePath.split('/')
      const pathWithoutRoot = pathParts.length > 1 ? pathParts.slice(1).join('/') : file.name
      
      zip.file(pathWithoutRoot, arrayBuffer)
    }
    
    // Generate the ZIP file
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    
    // Create a File object from the blob
    return new File([zipBlob], `${folderName}.zip`, { type: 'application/zip' })
  }

  const readDirectory = (directoryEntry: FileSystemDirectoryEntry, basePath: string = ''): Promise<File[]> => {
    return new Promise((resolve) => {
      const files: File[] = []
      const reader = directoryEntry.createReader()
      
      const readEntries = () => {
        reader.readEntries(async (entries) => {
          if (entries.length === 0) {
            resolve(files)
            return
          }
          
          for (const entry of entries) {
            if (entry.isFile) {
              const file = await new Promise<File>((resolve) => {
                (entry as FileSystemFileEntry).file(resolve)
              })
              
              // Add the relative path information to the file
              const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name
              Object.defineProperty(file, 'webkitRelativePath', {
                value: relativePath,
                writable: false
              })
              
              files.push(file)
            } else if (entry.isDirectory) {
              const subPath = basePath ? `${basePath}/${entry.name}` : entry.name
              const subFiles = await readDirectory(entry as FileSystemDirectoryEntry, subPath)
              files.push(...subFiles)
            }
          }
          readEntries() // Continue reading if there are more entries
        })
      }
      readEntries()
    })
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    if (fileList) {
      const files = Array.from(fileList)
      
      // Check if this is a folder selection (webkitdirectory)
      const input = e.target as HTMLInputElement & { webkitdirectory?: boolean }
      if (input.webkitdirectory && files.length > 0) {
        // This is a folder selection - create a ZIP from all valid files
        const validFiles = files.filter(isValidFile)
        if (validFiles.length > 0) {
          // Extract folder name from the first file's path
          const firstFile = files[0]
          const pathParts = firstFile.webkitRelativePath.split('/')
          const folderName = pathParts[0] || 'folder'
          
          const zipFile = await createZipFromFiles(validFiles, folderName)
          await uploadFilesImmediately([zipFile])
        } else {
          alert('No PDF files found in the selected folder.')
        }
      } else {
        // Regular file selection
        const validFiles = files.filter(isValidFile)
        if (validFiles.length > 0) {
          await uploadFilesImmediately(validFiles)
        } else {
          alert('Please upload PDF or ZIP files.')
        }
      }
    }
    // Reset the input so the same files can be selected again
    e.target.value = ''
  }

  const removeFile = async (file_id: string) => {
    try {
      // Delete from cloud storage immediately
      await apiClient.deleteUploadedFile(file_id)
      // Remove from UI
      onFileRemoved(file_id)
    } catch (error: any) {
      console.error('Failed to delete file from storage:', error)
      // Still remove from UI even if storage deletion fails
      onFileRemoved(file_id)
      alert(`Warning: File removed from list but may still be in storage: ${error.message}`)
    }
  }

  const getFileIcon = (filename: string) => {
    if (filename.toLowerCase().endsWith('.pdf')) {
      return <FileText className="w-5 h-5 text-red-600" />
    } else if (filename.toLowerCase().endsWith('.zip')) {
      return <Archive className="w-5 h-5 text-blue-600" />
    }
    return <FileText className="w-5 h-5 text-gray-600" />
  }

  return (
    <div className="space-y-4">
      <div 
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragOver 
            ? 'border-blue-400 bg-blue-50' 
            : 'border-gray-300 hover:border-blue-500'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-upload')?.click()}
      >
        <CloudUpload className={`w-12 h-12 mx-auto mb-4 ${
          isDragOver ? 'text-blue-500' : 'text-gray-400'
        }`} />
        <p className="text-lg font-medium text-gray-900 mb-2">
          {isUploading ? 'Uploading files...' : 'Drop files, folders, or ZIP files here'}
        </p>
        <p className="text-sm text-gray-500 mb-2">
          {isUploading ? 'Please wait while files are uploaded to cloud storage' : 'Supports PDF files and ZIP archives'}
        </p>
        <div className="flex items-center justify-center space-x-4 text-xs text-gray-400">
          <div className="flex items-center space-x-1">
            <FileText className="w-4 h-4" />
            <span>PDF Files</span>
          </div>
          <div className="flex items-center space-x-1">
            <Archive className="w-4 h-4" />
            <span>ZIP Archives</span>
          </div>
          <div className="flex items-center space-x-1">
            <FolderOpen className="w-4 h-4" />
            <span>Folders</span>
          </div>
        </div>
        
        <input
          type="file"
          accept=".pdf,.zip"
          multiple
          className="hidden"
          id="file-upload-multiple"
          onChange={handleFileSelect}
        />
        <input
          type="file"
          accept=".pdf,.zip"
          {...({ webkitdirectory: "" } as any)}
          className="hidden"
          id="file-upload-folder"
          onChange={handleFileSelect}
        />
      </div>

      <div className="flex space-x-2">
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => document.getElementById('file-upload-multiple')?.click()}
          disabled={isUploading}
          className="flex-1"
        >
          {isUploading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <FileText className="w-4 h-4 mr-2" />
          )}
          Select Files
        </Button>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => document.getElementById('file-upload-folder')?.click()}
          disabled={isUploading}
          className="flex-1"
        >
          {isUploading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <FolderOpen className="w-4 h-4 mr-2" />
          )}
          Select Folder
        </Button>
      </div>

      {uploadedFiles.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-gray-900">Uploaded Files ({uploadedFiles.length}):</h4>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={async () => {
                try {
                  // Delete all files from cloud storage
                  const fileIds = uploadedFiles.map(file => file.file_id)
                  await apiClient.deleteMultipleFiles(fileIds)
                  // Remove all from UI
                  uploadedFiles.forEach(file => onFileRemoved(file.file_id))
                } catch (error: any) {
                  console.error('Failed to delete files from storage:', error)
                  // Still remove from UI even if storage deletion fails
                  uploadedFiles.forEach(file => onFileRemoved(file.file_id))
                  alert(`Warning: Files removed from list but may still be in storage: ${error.message}`)
                }
              }}
              className="text-gray-400 hover:text-red-500"
              disabled={isUploading}
            >
              Clear All
            </Button>
          </div>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {uploadedFiles.map((file) => (
              <div key={file.file_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                <div className="flex items-center space-x-3">
                  {getFileIcon(file.filename)}
                  <div>
                    <span className="text-sm font-medium text-gray-900">{file.filename}</span>
                    <p className="text-xs text-gray-500">
                      {(file.size_bytes / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => removeFile(file.file_id)}
                  className="text-gray-400 hover:text-red-500"
                  disabled={isUploading}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}