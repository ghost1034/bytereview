/**
 * File Upload Step for Job Workflow
 * Handles file selection and upload with pre-signed URLs
 */
'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { 
  Upload, 
  X, 
  FileText, 
  FolderOpen, 
  Archive, 
  Loader2,
  CheckCircle,
  AlertCircle
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useInitiateAndUploadFiles } from '@/hooks/useJobs'
import { UploadedFile } from '@/lib/job-types'

interface FileUploadStepProps {
  onFilesUploaded: (jobId: string, files: UploadedFile[]) => void
  isLoading?: boolean
}

export default function FileUploadStep({ onFilesUploaded, isLoading }: FileUploadStepProps) {
  const { toast } = useToast()
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<Record<number, number>>({})
  
  const initiateAndUpload = useInitiateAndUploadFiles()

  const isValidFile = (file: File) => {
    const validTypes = [
      'application/pdf',
      'application/zip',
      'application/x-zip-compressed'
    ]
    
    const validExtensions = ['.pdf', '.zip']
    const hasValidType = validTypes.includes(file.type)
    const hasValidExtension = validExtensions.some(ext => 
      file.name.toLowerCase().endsWith(ext)
    )
    
    return hasValidType || hasValidExtension
  }

  const handleFileSelection = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files)
    const validFiles = fileArray.filter(isValidFile)
    const invalidFiles = fileArray.filter(file => !isValidFile(file))

    if (invalidFiles.length > 0) {
      toast({
        title: "Invalid files detected",
        description: `${invalidFiles.length} files were skipped. Only PDF and ZIP files are supported.`,
        variant: "destructive"
      })
    }

    if (validFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...validFiles])
      toast({
        title: "Files selected",
        description: `${validFiles.length} files ready for upload`
      })
    }
  }, [toast])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    
    const files = e.dataTransfer.files
    handleFileSelection(files)
  }, [handleFileSelection])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFileSelection(e.target.files)
    }
  }, [handleFileSelection])

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
    setUploadProgress(prev => {
      const newProgress = { ...prev }
      delete newProgress[index]
      return newProgress
    })
  }

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      toast({
        title: "No files selected",
        description: "Please select at least one file to upload",
        variant: "destructive"
      })
      return
    }

    try {
      const result = await initiateAndUpload.mutateAsync({
        files: selectedFiles,
        onProgress: (fileIndex, progress) => {
          setUploadProgress(prev => ({
            ...prev,
            [fileIndex]: progress
          }))
        }
      })

      // Convert to UploadedFile format
      const uploadedFiles: UploadedFile[] = result.uploadedFiles

      toast({
        title: "Upload successful",
        description: `${selectedFiles.length} files uploaded successfully`
      })

      onFilesUploaded(result.jobId, uploadedFiles)
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      })
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getFileIcon = (filename: string) => {
    if (filename.toLowerCase().endsWith('.pdf')) {
      return <FileText className="w-5 h-5 text-red-500" />
    } else if (filename.toLowerCase().endsWith('.zip')) {
      return <Archive className="w-5 h-5 text-blue-500" />
    }
    return <FileText className="w-5 h-5 text-gray-500" />
  }

  const totalProgress = Object.keys(uploadProgress).length > 0 
    ? Object.values(uploadProgress).reduce((sum, progress) => sum + progress, 0) / selectedFiles.length
    : 0

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <Card 
        className={`border-2 border-dashed transition-colors ${
          isDragOver 
            ? 'border-blue-500 bg-blue-50' 
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragOver(true)
        }}
        onDragLeave={() => setIsDragOver(false)}
      >
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="p-4 bg-gray-100 rounded-full">
                <Upload className="w-8 h-8 text-gray-600" />
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-medium">Upload your documents</h3>
              <p className="text-muted-foreground">
                Drag and drop files here, or click to browse
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Supports PDF and ZIP files
              </p>
            </div>

            <div className="flex gap-2 justify-center">
              <Button
                variant="outline"
                onClick={() => document.getElementById('file-input')?.click()}
                disabled={isLoading || initiateAndUpload.isPending}
              >
                <FolderOpen className="w-4 h-4 mr-2" />
                Browse Files
              </Button>
              
              <Button
                variant="outline"
                onClick={() => document.getElementById('folder-input')?.click()}
                disabled={isLoading || initiateAndUpload.isPending}
              >
                <FolderOpen className="w-4 h-4 mr-2" />
                Browse Folder
              </Button>
            </div>

            <input
              id="file-input"
              type="file"
              multiple
              accept=".pdf,.zip"
              onChange={handleFileInput}
              className="hidden"
            />
            
            <input
              id="folder-input"
              type="file"
              multiple
              webkitdirectory=""
              onChange={handleFileInput}
              className="hidden"
            />
          </div>
        </CardContent>
      </Card>

      {/* Selected Files */}
      {selectedFiles.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">
                  Selected Files ({selectedFiles.length})
                </h3>
                <Badge variant="secondary">
                  Total: {formatFileSize(selectedFiles.reduce((sum, file) => sum + file.size, 0))}
                </Badge>
              </div>

              {/* Upload Progress */}
              {initiateAndUpload.isPending && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Uploading files...</span>
                    <span>{Math.round(totalProgress)}%</span>
                  </div>
                  <Progress value={totalProgress} />
                </div>
              )}

              {/* File List */}
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {selectedFiles.map((file, index) => {
                  const progress = uploadProgress[index] || 0
                  const isUploading = initiateAndUpload.isPending && progress < 100
                  const isUploaded = progress === 100

                  return (
                    <div key={`${file.name}-${index}`} className="flex items-center gap-3 p-3 border rounded-lg">
                      {getFileIcon(file.name)}
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{file.name}</p>
                          {isUploaded && <CheckCircle className="w-4 h-4 text-green-500" />}
                          {isUploading && <Loader2 className="w-4 h-4 animate-spin" />}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(file.size)}
                        </p>
                        {isUploading && (
                          <Progress value={progress} className="h-1 mt-1" />
                        )}
                      </div>

                      {!initiateAndUpload.isPending && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(index)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Upload Button */}
              <div className="flex justify-end">
                <Button
                  onClick={handleUpload}
                  disabled={isLoading || initiateAndUpload.isPending || selectedFiles.length === 0}
                  size="lg"
                >
                  {initiateAndUpload.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Upload Files & Continue
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Display */}
      {initiateAndUpload.error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-800">
              <AlertCircle className="w-5 h-5" />
              <div>
                <strong>Upload Error:</strong> {initiateAndUpload.error.message}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}