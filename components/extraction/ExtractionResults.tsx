'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { Download, FileSpreadsheet, FileText, Archive, Loader2, Folder } from "lucide-react"
import { apiClient } from '@/lib/api'
import type { ColumnConfig } from './FieldConfiguration'
import FolderStructureView from './FolderStructureView'

interface DocumentResult {
  filename: string
  data: any
  success: boolean
  error?: string
  original_path?: string
  source_zip?: string
  size_bytes?: number
}

interface ExtractionResultsProps {
  extractionResults: any
  columnConfigs: ColumnConfig[]
}

export default function ExtractionResults({ extractionResults, columnConfigs }: ExtractionResultsProps) {
  const [selectedDocumentIndex, setSelectedDocumentIndex] = useState<number>(0)
  const [exportLoading, setExportLoading] = useState<string | null>(null)
  const { toast } = useToast()

  // Parse results by document
  const getDocumentResults = (): DocumentResult[] => {
    if (!extractionResults?.extraction_result?.data) return []
    
    // If the backend returns results grouped by document
    if (extractionResults.extraction_result.by_document) {
      return extractionResults.extraction_result.by_document.map((doc: any) => ({
        filename: doc.filename,
        data: doc.data,
        success: doc.success,
        error: doc.error,
        original_path: doc.original_path,
        source_zip: doc.source_zip,
        size_bytes: doc.size_bytes
      }))
    }
    
    // If results are combined, try to separate by filename if available
    const data = extractionResults.extraction_result.data
    const processedFiles = extractionResults.files_processed || []
    
    if (Array.isArray(data) && processedFiles.length > 1) {
      // Try to distribute rows across files (this is a fallback)
      const rowsPerFile = Math.ceil(data.length / processedFiles.length)
      return processedFiles.map((file: any, index: number) => ({
        filename: file.filename,
        data: data.slice(index * rowsPerFile, (index + 1) * rowsPerFile),
        success: true,
        original_path: file.metadata?.original_path,
        source_zip: file.metadata?.source_zip,
        size_bytes: file.size_bytes
      }))
    }
    
    // Single document or combined result
    return [{
      filename: processedFiles[0]?.filename || 'combined_results',
      data: Array.isArray(data) ? data : [data],
      success: true,
      original_path: processedFiles[0]?.metadata?.original_path,
      source_zip: processedFiles[0]?.metadata?.source_zip,
      size_bytes: processedFiles[0]?.size_bytes
    }]
  }

  const documentResults = getDocumentResults()

  // Check if we have files with folder structure
  const hasFolder = documentResults.some(doc => doc.original_path && doc.original_path.includes('/'))

  const downloadFile = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }

  const exportDocumentToCSV = async (documentIndex: number) => {
    const loadingKey = `csv-${documentIndex}`
    setExportLoading(loadingKey)
    
    try {
      const { blob, filename } = await apiClient.exportToCSV({
        document_results: documentResults,
        field_names: columnConfigs.map(config => config.customName),
        export_type: 'individual',
        document_id: documentIndex
      })
      
      downloadFile(blob, filename)
    } catch (error: any) {
      console.error('CSV export failed:', error)
      toast({
        title: "Export failed",
        description: error.message,
        variant: "destructive"
      })
    } finally {
      setExportLoading(null)
    }
  }

  const exportDocumentToExcel = async (documentIndex: number) => {
    const loadingKey = `excel-${documentIndex}`
    setExportLoading(loadingKey)
    
    try {
      const { blob, filename } = await apiClient.exportToExcel({
        document_results: documentResults,
        field_names: columnConfigs.map(config => config.customName),
        export_type: 'individual',
        document_id: documentIndex
      })
      
      downloadFile(blob, filename)
    } catch (error: any) {
      console.error('Excel export failed:', error)
      toast({
        title: "Export failed",
        description: error.message,
        variant: "destructive"
      })
    } finally {
      setExportLoading(null)
    }
  }

  const exportAllToCSV = async () => {
    setExportLoading('csv-all')
    
    try {
      const { blob, filename } = await apiClient.exportToCSV({
        document_results: documentResults,
        field_names: columnConfigs.map(config => config.customName),
        export_type: 'combined'
      })
      
      downloadFile(blob, filename)
    } catch (error: any) {
      console.error('CSV export failed:', error)
      toast({
        title: "Export failed",
        description: error.message,
        variant: "destructive"
      })
    } finally {
      setExportLoading(null)
    }
  }

  const exportAllToExcel = async () => {
    setExportLoading('excel-all')
    
    try {
      const { blob, filename } = await apiClient.exportToExcel({
        document_results: documentResults,
        field_names: columnConfigs.map(config => config.customName),
        export_type: 'combined'
      })
      
      downloadFile(blob, filename)
    } catch (error: any) {
      console.error('Excel export failed:', error)
      toast({
        title: "Export failed",
        description: error.message,
        variant: "destructive"
      })
    } finally {
      setExportLoading(null)
    }
  }

  if (documentResults.length === 0) {
    return null
  }

  return (
    <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              <div className="flex items-center">
                Extraction Results ({documentResults.length} documents)
                {hasFolder && <Folder className="w-4 h-4 ml-2 text-blue-500" />}
              </div>
            </CardTitle>
          <div className="flex space-x-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={exportAllToCSV}
              disabled={documentResults.length === 0 || exportLoading === 'csv-all'}
            >
              {exportLoading === 'csv-all' ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Export All CSV
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={exportAllToExcel}
              disabled={documentResults.length === 0 || exportLoading === 'excel-all'}
            >
              {exportLoading === 'excel-all' ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4 mr-2" />
              )}
              Export All Excel
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {documentResults.length === 1 ? (
          // Single document - show simple table
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-gray-900">{documentResults[0].filename}</h3>
                {documentResults[0].original_path && documentResults[0].original_path !== documentResults[0].filename && (
                  <p className="text-xs text-gray-500 mt-1">
                    Path: {documentResults[0].original_path}
                  </p>
                )}
                {documentResults[0].source_zip && (
                  <p className="text-xs text-blue-600 mt-1">
                    From: {documentResults[0].source_zip}
                  </p>
                )}
              </div>
              <div className="flex space-x-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => exportDocumentToCSV(0)}
                  disabled={exportLoading === 'csv-0'}
                >
                  {exportLoading === 'csv-0' ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  CSV
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => exportDocumentToExcel(0)}
                  disabled={exportLoading === 'excel-0'}
                >
                  {exportLoading === 'excel-0' ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                  )}
                  Excel
                </Button>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-200 rounded-lg">
                <thead className="bg-gray-50">
                  <tr>
                    {columnConfigs.map(column => (
                      <th key={column.id} className="text-left px-4 py-2 font-medium text-gray-900 border-b">
                        {column.customName}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {documentResults[0].success && documentResults[0].data ? (
                    (Array.isArray(documentResults[0].data) ? documentResults[0].data : [documentResults[0].data]).map((row: any, index: number) => (
                      <tr key={index} className="border-b">
                        {columnConfigs.map(column => (
                          <td key={column.id} className="px-4 py-2">
                            {row[column.customName] || 'N/A'}
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={columnConfigs.length} className="px-4 py-2 text-center text-red-500">
                        {documentResults[0].error || 'No data extracted'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          // Multiple documents - show sidebar layout with integrated folder structure
          <div className="flex gap-6">
            {/* Sidebar with clean file list */}
            <div className="w-64 flex-shrink-0">
              <h3 className="font-medium text-gray-900 mb-3 flex items-center">
                {hasFolder && <Folder className="w-4 h-4 mr-2" />}
                Documents ({documentResults.length})
              </h3>
              
              {hasFolder ? (
                // Show folder structure directly in Documents section
                <FolderStructureView 
                  files={documentResults.map(doc => {
                    return {
                      filename: doc.filename,
                      original_path: doc.original_path,
                      size_bytes: doc.size_bytes || 0,
                      source_zip: doc.source_zip
                    }
                  })}
                  onFileSelect={(path) => {
                    const index = documentResults.findIndex(doc => (doc.original_path || doc.filename) === path)
                    if (index !== -1) setSelectedDocumentIndex(index)
                  }}
                  selectedPath={(documentResults[selectedDocumentIndex]?.original_path || documentResults[selectedDocumentIndex]?.filename) as string}
                  className="max-h-96 overflow-y-auto"
                />
              ) : (
                // Show simple file list when no folder structure
                <div className="space-y-2">
                  {documentResults.map((doc, index) => (
                    <button
                      key={index}
                      onClick={() => setSelectedDocumentIndex(index)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedDocumentIndex === index
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        {doc.success ? (
                          <FileText className="w-4 h-4 text-green-600" />
                        ) : (
                          <FileText className="w-4 h-4 text-red-600" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {doc.filename}
                          </p>
                          <div className="flex items-center space-x-2 mt-1">
                            <p className={`text-xs ${doc.success ? 'text-green-600' : 'text-red-600'}`}>
                              {doc.success ? 'Success' : 'Failed'}
                            </p>
                            {doc.source_zip && (
                              <p className="text-xs text-blue-600">
                                from {doc.source_zip}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Main content area */}
            <div className="flex-1 min-w-0">
              {selectedDocumentIndex !== null && documentResults[selectedDocumentIndex] && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900">
                        {documentResults[selectedDocumentIndex].filename}
                      </h3>
                      {documentResults[selectedDocumentIndex].original_path && 
                       documentResults[selectedDocumentIndex].original_path !== documentResults[selectedDocumentIndex].filename && (
                        <p className="text-xs text-gray-500 mt-1">
                          Path: {documentResults[selectedDocumentIndex].original_path}
                        </p>
                      )}
                      {documentResults[selectedDocumentIndex].source_zip && (
                        <p className="text-xs text-blue-600 mt-1">
                          From: {documentResults[selectedDocumentIndex].source_zip}
                        </p>
                      )}
                    </div>
                    <div className="flex space-x-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => exportDocumentToCSV(selectedDocumentIndex)}
                        disabled={!documentResults[selectedDocumentIndex].success || !documentResults[selectedDocumentIndex].data || exportLoading === `csv-${selectedDocumentIndex}`}
                      >
                        {exportLoading === `csv-${selectedDocumentIndex}` ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4 mr-2" />
                        )}
                        CSV
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => exportDocumentToExcel(selectedDocumentIndex)}
                        disabled={!documentResults[selectedDocumentIndex].success || !documentResults[selectedDocumentIndex].data || exportLoading === `excel-${selectedDocumentIndex}`}
                      >
                        {exportLoading === `excel-${selectedDocumentIndex}` ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <FileSpreadsheet className="w-4 h-4 mr-2" />
                        )}
                        Excel
                      </Button>
                    </div>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-gray-200 rounded-lg">
                      <thead className="bg-gray-50">
                        <tr>
                          {columnConfigs.map(column => (
                            <th key={column.id} className="text-left px-4 py-2 font-medium text-gray-900 border-b">
                              {column.customName}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {documentResults[selectedDocumentIndex].success && documentResults[selectedDocumentIndex].data ? (
                          (Array.isArray(documentResults[selectedDocumentIndex].data) 
                            ? documentResults[selectedDocumentIndex].data 
                            : [documentResults[selectedDocumentIndex].data]
                          ).map((row: any, rowIndex: number) => (
                            <tr key={rowIndex} className="border-b">
                              {columnConfigs.map(column => (
                                <td key={column.id} className="px-4 py-2">
                                  {row[column.customName] || 'N/A'}
                                </td>
                              ))}
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={columnConfigs.length} className="px-4 py-2 text-center text-red-500">
                              {documentResults[selectedDocumentIndex].error || 'No data extracted'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}