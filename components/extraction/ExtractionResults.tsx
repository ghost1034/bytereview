'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Download, FileSpreadsheet, FileText, Archive } from "lucide-react"
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import type { ColumnConfig } from './FieldConfiguration'

interface DocumentResult {
  filename: string
  data: any
  success: boolean
  error?: string
}

interface ExtractionResultsProps {
  extractionResults: any
  columnConfigs: ColumnConfig[]
}

export default function ExtractionResults({ extractionResults, columnConfigs }: ExtractionResultsProps) {
  const [selectedDocumentIndex, setSelectedDocumentIndex] = useState<number>(0)

  // Parse results by document
  const getDocumentResults = (): DocumentResult[] => {
    if (!extractionResults?.extraction_result?.data) return []
    
    // If the backend returns results grouped by document
    if (extractionResults.extraction_result.by_document) {
      return extractionResults.extraction_result.by_document.map((doc: any) => ({
        filename: doc.filename,
        data: doc.data,
        success: doc.success,
        error: doc.error
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
        success: true
      }))
    }
    
    // Single document or combined result
    return [{
      filename: processedFiles[0]?.filename || 'combined_results',
      data: Array.isArray(data) ? data : [data],
      success: true
    }]
  }

  const documentResults = getDocumentResults()

  const exportDocumentToCSV = (document: DocumentResult) => {
    if (!document.data || document.data.length === 0) {
      alert("No data to export for this document")
      return
    }

    const rows = Array.isArray(document.data) ? document.data : [document.data]
    const headers = columnConfigs.map(config => config.customName)
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => 
        headers.map(header => {
          const value = row[header] || ''
          return typeof value === 'string' && (value.includes(',') || value.includes('"')) 
            ? `"${value.replace(/"/g, '""')}"` 
            : value
        }).join(',')
      )
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const fileName = `${document.filename.replace(/\.[^/.]+$/, "")}_results.csv`
    saveAs(blob, fileName)
  }

  const exportDocumentToExcel = (document: DocumentResult) => {
    if (!document.data || document.data.length === 0) {
      alert("No data to export for this document")
      return
    }

    const rows = Array.isArray(document.data) ? document.data : [document.data]
    const headers = columnConfigs.map(config => config.customName)
    
    const worksheetData = [
      headers,
      ...rows.map(row => headers.map(header => row[header] || ''))
    ]

    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData)
    
    const colWidths = headers.map(header => ({
      wch: Math.max(header.length, 15)
    }))
    worksheet['!cols'] = colWidths

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Results')

    const fileName = `${document.filename.replace(/\.[^/.]+$/, "")}_results.xlsx`
    XLSX.writeFile(workbook, fileName)
  }

  const exportAllToCSV = () => {
    const allRows: any[] = []
    documentResults.forEach(doc => {
      if (doc.data && doc.success) {
        const rows = Array.isArray(doc.data) ? doc.data : [doc.data]
        rows.forEach(row => {
          allRows.push({
            ...row,
            source_document: doc.filename // Add source document column
          })
        })
      }
    })

    if (allRows.length === 0) {
      alert("No data to export")
      return
    }

    const headers = ['source_document', ...columnConfigs.map(config => config.customName)]
    
    const csvContent = [
      headers.join(','),
      ...allRows.map(row => 
        headers.map(header => {
          const value = row[header] || ''
          return typeof value === 'string' && (value.includes(',') || value.includes('"')) 
            ? `"${value.replace(/"/g, '""')}"` 
            : value
        }).join(',')
      )
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const fileName = `all_extraction_results_${new Date().toISOString().split('T')[0]}.csv`
    saveAs(blob, fileName)
  }

  const exportAllToExcel = () => {
    const workbook = XLSX.utils.book_new()
    
    // Create a combined sheet
    const allRows: any[] = []
    documentResults.forEach(doc => {
      if (doc.data && doc.success) {
        const rows = Array.isArray(doc.data) ? doc.data : [doc.data]
        rows.forEach(row => {
          allRows.push({
            source_document: doc.filename,
            ...row
          })
        })
      }
    })

    if (allRows.length > 0) {
      const headers = ['source_document', ...columnConfigs.map(config => config.customName)]
      const worksheetData = [
        headers,
        ...allRows.map(row => headers.map(header => row[header] || ''))
      ]

      const combinedSheet = XLSX.utils.aoa_to_sheet(worksheetData)
      const colWidths = headers.map(header => ({
        wch: Math.max(header.length, 15)
      }))
      combinedSheet['!cols'] = colWidths
      XLSX.utils.book_append_sheet(workbook, combinedSheet, 'All Results')
    }

    // Create individual sheets for each document
    documentResults.forEach((doc, index) => {
      if (doc.data && doc.success) {
        const rows = Array.isArray(doc.data) ? doc.data : [doc.data]
        const headers = columnConfigs.map(config => config.customName)
        
        const worksheetData = [
          headers,
          ...rows.map(row => headers.map(header => row[header] || ''))
        ]

        const worksheet = XLSX.utils.aoa_to_sheet(worksheetData)
        const colWidths = headers.map(header => ({
          wch: Math.max(header.length, 15)
        }))
        worksheet['!cols'] = colWidths

        const sheetName = doc.filename.replace(/\.[^/.]+$/, "").substring(0, 31) // Excel sheet name limit
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
      }
    })

    const fileName = `all_extraction_results_${new Date().toISOString().split('T')[0]}.xlsx`
    XLSX.writeFile(workbook, fileName)
  }

  if (documentResults.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Extraction Results ({documentResults.length} documents)</CardTitle>
          <div className="flex space-x-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={exportAllToCSV}
              disabled={documentResults.length === 0}
            >
              <Download className="w-4 h-4 mr-2" />
              Export All CSV
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={exportAllToExcel}
              disabled={documentResults.length === 0}
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
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
              <h3 className="font-medium text-gray-900">{documentResults[0].filename}</h3>
              <div className="flex space-x-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => exportDocumentToCSV(documentResults[0])}
                >
                  <Download className="w-4 h-4 mr-2" />
                  CSV
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => exportDocumentToExcel(documentResults[0])}
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
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
          // Multiple documents - show sidebar layout
          <div className="flex gap-6">
            {/* Sidebar with file list */}
            <div className="w-64 flex-shrink-0">
              <h3 className="font-medium text-gray-900 mb-3">Documents ({documentResults.length})</h3>
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
                        <p className={`text-xs ${doc.success ? 'text-green-600' : 'text-red-600'}`}>
                          {doc.success ? 'Success' : 'Failed'}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Main content area */}
            <div className="flex-1 min-w-0">
              {selectedDocumentIndex !== null && documentResults[selectedDocumentIndex] && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-gray-900">
                      {documentResults[selectedDocumentIndex].filename}
                    </h3>
                    <div className="flex space-x-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => exportDocumentToCSV(documentResults[selectedDocumentIndex])}
                        disabled={!documentResults[selectedDocumentIndex].success || !documentResults[selectedDocumentIndex].data}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        CSV
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => exportDocumentToExcel(documentResults[selectedDocumentIndex])}
                        disabled={!documentResults[selectedDocumentIndex].success || !documentResults[selectedDocumentIndex].data}
                      >
                        <FileSpreadsheet className="w-4 h-4 mr-2" />
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