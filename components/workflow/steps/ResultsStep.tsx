/**
 * Results Step for Job Workflow
 * Display extraction results and export options
 */
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Download, 
  FileText, 
  BarChart3, 
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Eye,
  FileSpreadsheet
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useJobDetails, useJobResults } from '@/hooks/useJobs'

interface ResultsStepProps {
  jobId: string
  onStartNew: () => void
}

export default function ResultsStep({ jobId, onStartNew }: ResultsStepProps) {
  const { toast } = useToast()
  const { data: jobDetails } = useJobDetails(jobId)
  const { data: results, isLoading: resultsLoading } = useJobResults(jobId)
  const [selectedResult, setSelectedResult] = useState<number>(0)

  const handleExportCSV = async () => {
    if (!results?.results) return

    try {
      // Convert results to CSV format
      const csvData = convertToCSV(results.results)
      downloadFile(csvData, `extraction-results-${jobId}.csv`, 'text/csv')
      
      toast({
        title: "Export successful",
        description: "Results exported as CSV file"
      })
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export results",
        variant: "destructive"
      })
    }
  }

  const handleExportJSON = async () => {
    if (!results?.results) return

    try {
      const jsonData = JSON.stringify(results.results, null, 2)
      downloadFile(jsonData, `extraction-results-${jobId}.json`, 'application/json')
      
      toast({
        title: "Export successful",
        description: "Results exported as JSON file"
      })
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export results",
        variant: "destructive"
      })
    }
  }

  const convertToCSV = (data: any[]) => {
    if (!data || data.length === 0) return ''

    // Get all unique field names
    const allFields = new Set<string>()
    data.forEach(result => {
      if (result.extracted_data) {
        Object.keys(result.extracted_data).forEach(key => allFields.add(key))
      }
    })

    const fields = Array.from(allFields)
    
    // Create CSV header
    const header = ['Task ID', 'Source Files', 'Processing Mode', ...fields].join(',')
    
    // Create CSV rows
    const rows = data.map(result => {
      const row = [
        result.task_id,
        result.source_files.join('; '),
        result.processing_mode,
        ...fields.map(field => {
          const value = result.extracted_data[field]
          if (value === null || value === undefined) return ''
          if (typeof value === 'string' && value.includes(',')) {
            return `"${value.replace(/"/g, '""')}"`
          }
          return String(value)
        })
      ]
      return row.join(',')
    })

    return [header, ...rows].join('\n')
  }

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const formatValue = (value: any) => {
    if (value === null || value === undefined) {
      return <span className="text-gray-400 italic">Not found</span>
    }
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No'
    }
    if (typeof value === 'object') {
      return JSON.stringify(value)
    }
    return String(value)
  }

  const getSuccessRate = () => {
    if (!results?.results) return 0
    const successful = results.results.filter(r => 
      r.extracted_data && Object.keys(r.extracted_data).length > 0
    ).length
    return Math.round((successful / results.results.length) * 100)
  }

  if (resultsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-8 h-8 animate-spin" />
        <span className="ml-2">Loading results...</span>
      </div>
    )
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
                {results?.total || 0}
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
              <div className="text-sm text-muted-foreground">Fields Extracted</div>
            </div>
            <div className="space-y-1">
              <div className="text-2xl font-bold text-orange-600">
                {results?.results?.reduce((sum, r) => sum + r.source_files.length, 0) || 0}
              </div>
              <div className="text-sm text-muted-foreground">Files Processed</div>
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
          <div className="flex gap-2">
            <Button onClick={handleExportCSV} variant="outline">
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
            <Button onClick={handleExportJSON} variant="outline">
              <FileText className="w-4 h-4 mr-2" />
              Export JSON
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results Display */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Extraction Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          {results?.results && results.results.length > 0 ? (
            <Tabs defaultValue="table" className="w-full">
              <TabsList>
                <TabsTrigger value="table">Table View</TabsTrigger>
                <TabsTrigger value="details">Detailed View</TabsTrigger>
              </TabsList>
              
              <TabsContent value="table" className="space-y-4">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Source Files</TableHead>
                        <TableHead>Processing Mode</TableHead>
                        {jobDetails?.job_fields?.map(field => (
                          <TableHead key={field.field_name}>{field.field_name}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.results.map((result, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <div className="space-y-1">
                              {result.source_files.map((file, i) => (
                                <Badge key={i} variant="outline" className="text-xs">
                                  {file}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {result.processing_mode}
                            </Badge>
                          </TableCell>
                          {jobDetails?.job_fields?.map(field => (
                            <TableCell key={field.field_name}>
                              {formatValue(result.extracted_data[field.field_name])}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
              
              <TabsContent value="details" className="space-y-4">
                <div className="space-y-4">
                  {results.results.map((result, index) => (
                    <Card key={index} className="border">
                      <CardHeader>
                        <CardTitle className="text-lg">
                          Result {index + 1}
                        </CardTitle>
                        <div className="flex gap-2">
                          <Badge variant="outline">
                            {result.processing_mode}
                          </Badge>
                          <Badge variant="secondary">
                            {result.source_files.length} file(s)
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div>
                            <h4 className="font-medium mb-2">Source Files:</h4>
                            <div className="flex flex-wrap gap-1">
                              {result.source_files.map((file, i) => (
                                <Badge key={i} variant="outline">
                                  {file}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          
                          <div>
                            <h4 className="font-medium mb-2">Extracted Data:</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {Object.entries(result.extracted_data).map(([key, value]) => (
                                <div key={key} className="border rounded p-3">
                                  <div className="font-medium text-sm text-muted-foreground mb-1">
                                    {key}
                                  </div>
                                  <div>{formatValue(value)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Results Found</h3>
              <p className="text-gray-500">
                The extraction job completed but no data was extracted. 
                This might be due to the documents not containing the requested information.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onStartNew}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Start New Extraction
        </Button>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.location.href = '/dashboard'}>
            <Eye className="w-4 h-4 mr-2" />
            View All Jobs
          </Button>
        </div>
      </div>
    </div>
  )
}