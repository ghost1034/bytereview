'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { CloudUpload, X, FileText, FolderOpen, Archive } from "lucide-react"

interface FileUploadProps {
  uploadedFiles: File[]
  setUploadedFiles: (files: File[]) => void
}

export default function FileUpload({ uploadedFiles, setUploadedFiles }: FileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false)

  const isValidFile = (file: File) => {
    return file.type === 'application/pdf' || 
           file.type === 'application/zip' || 
           file.type === 'application/x-zip-compressed' ||
           file.name.toLowerCase().endsWith('.pdf') ||
           file.name.toLowerCase().endsWith('.zip')
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
            const folderFiles = await readDirectory(entry as FileSystemDirectoryEntry)
            files.push(...folderFiles.filter(isValidFile))
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
      setUploadedFiles([...uploadedFiles, ...files])
    } else {
      alert('Please upload PDF files, ZIP files, or folders containing PDF files.')
    }
  }

  const readDirectory = (directoryEntry: FileSystemDirectoryEntry): Promise<File[]> => {
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
              files.push(file)
            } else if (entry.isDirectory) {
              const subFiles = await readDirectory(entry as FileSystemDirectoryEntry)
              files.push(...subFiles)
            }
          }
          readEntries() // Continue reading if there are more entries
        })
      }
      readEntries()
    })
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    if (fileList) {
      const files = Array.from(fileList).filter(isValidFile)
      if (files.length > 0) {
        setUploadedFiles([...uploadedFiles, ...files])
      } else {
        alert('Please upload PDF or ZIP files.')
      }
    }
    // Reset the input so the same files can be selected again
    e.target.value = ''
  }

  const removeFile = (index: number) => {
    const newFiles = uploadedFiles.filter((_, i) => i !== index)
    setUploadedFiles(newFiles)
  }

  const getFileIcon = (file: File) => {
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      return <FileText className="w-5 h-5 text-red-600" />
    } else if (file.type.includes('zip') || file.name.toLowerCase().endsWith('.zip')) {
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
        <p className="text-lg font-medium text-gray-900 mb-2">Drop files, folders, or ZIP files here</p>
        <p className="text-sm text-gray-500 mb-2">Supports PDF files and ZIP archives</p>
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
          className="flex-1"
        >
          <FileText className="w-4 h-4 mr-2" />
          Select Files
        </Button>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => document.getElementById('file-upload-folder')?.click()}
          className="flex-1"
        >
          <FolderOpen className="w-4 h-4 mr-2" />
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
              onClick={() => setUploadedFiles([])}
              className="text-gray-400 hover:text-red-500"
            >
              Clear All
            </Button>
          </div>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {uploadedFiles.map((file, index) => (
              <div key={`${file.name}-${index}`} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                <div className="flex items-center space-x-3">
                  {getFileIcon(file)}
                  <div>
                    <span className="text-sm font-medium text-gray-900">{file.name}</span>
                    <p className="text-xs text-gray-500">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => removeFile(index)}
                  className="text-gray-400 hover:text-red-500"
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