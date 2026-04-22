'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/AuthContext'
import {
  apiClient,
  type FormFillExtractionSourcePreview,
  type FormFillRun,
  type FormFillTemplate,
} from '@/lib/api'
import { useToast } from '@/hooks/use-toast'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

function mimeToExtension(mimeType?: string | null) {
  if (mimeType === 'application/pdf') return 'PDF'
  if (mimeType === DOCX_MIME) return 'DOCX'
  if (mimeType === 'text/csv') return 'CSV'
  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'XLSX'
  return mimeType || 'Unknown'
}

function formatStrategy(strategy?: string | null) {
  switch (strategy) {
    case 'fillable_pdf':
      return 'Fillable PDF'
    case 'pdf_overlay':
      return 'PDF Overlay'
    case 'docx_placeholders':
      return 'DOCX Placeholder Replacement'
    case 'docx_edit_in_place':
      return 'DOCX Edited In Place'
    default:
      return strategy || 'Unknown'
  }
}

export default function FormFillPage() {
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const { toast } = useToast()

  const sourceJobId = searchParams.get('job_id') || ''
  const sourceRunId = searchParams.get('run_id') || ''
  const sourceTaskId = searchParams.get('task_id') || ''
  const hasExtractionSource = Boolean(sourceJobId && sourceRunId && sourceTaskId)

  const [sourceMode, setSourceMode] = useState<'upload' | 'extraction'>(hasExtractionSource ? 'extraction' : 'upload')
  const [targetMode, setTargetMode] = useState<'upload' | 'template'>('upload')
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [targetFile, setTargetFile] = useState<File | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [saveAsTemplate, setSaveAsTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateDescription, setTemplateDescription] = useState('')
  const [allowDocxTableExpansion, setAllowDocxTableExpansion] = useState(false)
  const [outputFormat, setOutputFormat] = useState<'pdf' | 'docx'>('pdf')
  const [creating, setCreating] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [currentRunId, setCurrentRunId] = useState<string | null>(null)

  const { data: templatesData, refetch: refetchTemplates } = useQuery({
    queryKey: ['form-fill-templates'],
    queryFn: () => apiClient.listFormFillTemplates(),
    enabled: !!user,
    staleTime: 60_000,
  })

  const { data: extractionPreview } = useQuery<FormFillExtractionSourcePreview>({
    queryKey: ['form-fill-extraction-preview', sourceJobId, sourceRunId, sourceTaskId],
    queryFn: () => apiClient.getFormFillExtractionSourcePreview({ jobId: sourceJobId, runId: sourceRunId, taskId: sourceTaskId }),
    enabled: !!user && hasExtractionSource,
    staleTime: 60_000,
  })

  const { data: currentRun } = useQuery<FormFillRun>({
    queryKey: ['form-fill-run', currentRunId],
    queryFn: () => apiClient.getFormFillRun(currentRunId!),
    enabled: !!user && !!currentRunId,
    refetchInterval: (query) => {
      const run = query.state.data as FormFillRun | undefined
      if (!run) return 2500
      return run.status === 'completed' || run.status === 'failed' ? false : 2500
    },
  })

  const templates = templatesData?.templates || []
  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === selectedTemplateId) || null,
    [templates, selectedTemplateId]
  )

  const targetMimeType = useMemo(() => {
    if (targetMode === 'upload' && targetFile) return targetFile.type || ''
    return selectedTemplate?.file_type || ''
  }, [targetMode, targetFile, selectedTemplate])

  useEffect(() => {
    if (targetMimeType === DOCX_MIME) {
      setOutputFormat((current) => (current === 'pdf' || current === 'docx' ? current : 'docx'))
      return
    }
    setOutputFormat('pdf')
  }, [targetMimeType])

  useEffect(() => {
    if (targetMode === 'template' && selectedTemplate?.file_type === DOCX_MIME) {
      setAllowDocxTableExpansion(Boolean(selectedTemplate.allow_docx_table_expansion))
      return
    }
    if (targetMimeType !== DOCX_MIME) {
      setAllowDocxTableExpansion(false)
    }
  }, [selectedTemplate, targetMimeType, targetMode])

  const canSubmit = useMemo(() => {
    const sourceReady = sourceMode === 'upload' ? !!sourceFile : !!extractionPreview
    const targetReady = targetMode === 'upload' ? !!targetFile : !!selectedTemplateId
    const templateReady = !saveAsTemplate || templateName.trim().length > 0
    return sourceReady && targetReady && templateReady && !creating
  }, [creating, extractionPreview, saveAsTemplate, selectedTemplateId, sourceFile, sourceMode, targetFile, targetMode, templateName])

  const handleCreate = async () => {
    if (!canSubmit) return
    setCreating(true)
    try {
      const response = await apiClient.createFormFillRun({
        sourceFile: sourceMode === 'upload' ? sourceFile || undefined : undefined,
        targetFile: targetMode === 'upload' ? targetFile || undefined : undefined,
        templateId: targetMode === 'template' ? selectedTemplateId : undefined,
        outputFormat,
        allowDocxTableExpansion: targetMimeType === DOCX_MIME ? allowDocxTableExpansion : undefined,
        saveTemplateName: targetMode === 'upload' && saveAsTemplate ? templateName.trim() : undefined,
        saveTemplateDescription: targetMode === 'upload' && saveAsTemplate ? templateDescription.trim() : undefined,
        sourceJobId: sourceMode === 'extraction' ? sourceJobId : undefined,
        sourceRunId: sourceMode === 'extraction' ? sourceRunId : undefined,
        sourceTaskId: sourceMode === 'extraction' ? sourceTaskId : undefined,
      })

      setCurrentRunId(response.run.id)
      if (saveAsTemplate && targetMode === 'upload') {
        refetchTemplates()
      }
      toast({
        title: 'Form Fill started',
        description: 'Your document is being prepared in the background.',
      })
    } catch (error) {
      toast({
        title: 'Form Fill failed to start',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
    }
  }

  const handleDownload = async () => {
    if (!currentRunId) return
    setDownloading(true)
    try {
      const { blob, filename } = await apiClient.downloadFormFillRun(currentRunId)
      downloadBlob(blob, filename)
    } catch (error) {
      toast({
        title: 'Download failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Form Fill</h1>
        <p className="text-muted-foreground">
          Upload supporting information and a PDF or DOCX target, or send one selected extraction result directly into Form Fill.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Source</CardTitle>
          <CardDescription>The information used to fill the target document.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasExtractionSource && (
            <div className="flex gap-2">
              <Button variant={sourceMode === 'extraction' ? 'default' : 'outline'} onClick={() => setSourceMode('extraction')}>
                Extraction Results
              </Button>
              <Button variant={sourceMode === 'upload' ? 'default' : 'outline'} onClick={() => setSourceMode('upload')}>
                Upload File
              </Button>
            </div>
          )}

          {sourceMode === 'upload' ? (
            <div className="space-y-2">
              <Label htmlFor="source-file">Source file</Label>
              <Input
                id="source-file"
                type="file"
                accept=".csv,.xlsx,.pdf,.docx"
                onChange={(event) => setSourceFile(event.target.files?.[0] || null)}
              />
              <p className="text-sm text-muted-foreground">Supported: CSV, XLSX, PDF, DOCX.</p>
            </div>
          ) : (
            <div className="rounded-lg border p-4 space-y-3 bg-slate-50">
              <div className="font-medium">Selected extraction result</div>
              <div className="text-sm text-muted-foreground">
                Job run `{sourceRunId}` task `{sourceTaskId}`
              </div>
              {extractionPreview ? (
                <>
                  <div className="text-sm">
                    Source files: {extractionPreview.source_files.length ? extractionPreview.source_files.join(', ') : '(manual rows)'}
                  </div>
                  <div className="overflow-x-auto rounded border bg-white">
                    <table className="min-w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          {extractionPreview.columns.map((column) => (
                            <th key={column} className="text-left px-3 py-2 font-medium">{column}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {extractionPreview.rows.slice(0, 5).map((row, rowIndex) => (
                          <tr key={rowIndex} className="border-t">
                            {extractionPreview.columns.map((column, columnIndex) => (
                              <td key={`${column}-${rowIndex}`} className="px-3 py-2 align-top">
                                {String(row[columnIndex] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {extractionPreview.rows.length > 5 && (
                    <p className="text-xs text-muted-foreground">Showing first 5 rows of {extractionPreview.rows.length}.</p>
                  )}
                </>
              ) : (
                <div className="text-sm text-muted-foreground">Loading extraction preview…</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Target</CardTitle>
          <CardDescription>The PDF or DOCX to fill.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button variant={targetMode === 'upload' ? 'default' : 'outline'} onClick={() => setTargetMode('upload')}>
              Upload Target
            </Button>
            <Button variant={targetMode === 'template' ? 'default' : 'outline'} onClick={() => setTargetMode('template')}>
              Saved Template
            </Button>
          </div>

          {targetMode === 'upload' ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="target-file">Target file</Label>
                <Input
                  id="target-file"
                  type="file"
                  accept=".pdf,.docx"
                  onChange={(event) => setTargetFile(event.target.files?.[0] || null)}
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={saveAsTemplate}
                  onChange={(event) => setSaveAsTemplate(event.target.checked)}
                />
                Save this target as a reusable Form Fill template
              </label>

              {saveAsTemplate && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="template-name">Template name</Label>
                    <Input id="template-name" value={templateName} onChange={(event) => setTemplateName(event.target.value)} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="template-description">Template description</Label>
                    <Textarea
                      id="template-description"
                      value={templateDescription}
                      onChange={(event) => setTemplateDescription(event.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="template-select">Saved target template</Label>
              <select
                id="template-select"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedTemplateId}
                onChange={(event) => setSelectedTemplateId(event.target.value)}
              >
                <option value="">Select a template</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} ({mimeToExtension(template.file_type)})
                  </option>
                ))}
              </select>
              {selectedTemplate && (
                <div className="text-sm text-muted-foreground">
                  {selectedTemplate.original_filename}
                  {selectedTemplate.description ? ` - ${selectedTemplate.description}` : ''}
                </div>
              )}
              {targetMode === 'template' && templates.length === 0 && (
                <p className="text-sm text-muted-foreground">No saved templates yet. Upload a target and save it as a template first.</p>
              )}
            </div>
          )}

          {targetMimeType === DOCX_MIME && (
            <div className="flex items-start gap-3 rounded-md border p-4">
              <Checkbox
                id="allow-docx-table-expansion"
                checked={allowDocxTableExpansion}
                onCheckedChange={(checked) => setAllowDocxTableExpansion(checked === true)}
              />
              <div className="space-y-1">
                <Label htmlFor="allow-docx-table-expansion" className="text-sm font-medium">
                  Allow AI to add new rows or columns in the form
                </Label>
                <p className="text-sm text-muted-foreground">
                  Use this when a DOCX table may need to grow to fit the extracted data.
                  {targetMode === 'upload' && saveAsTemplate ? ' This setting will be saved on the template.' : ''}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Output</CardTitle>
          <CardDescription>Output format follows the target by default.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="output-format">Output format</Label>
            <select
              id="output-format"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm max-w-xs"
              value={outputFormat}
              onChange={(event) => setOutputFormat(event.target.value as 'pdf' | 'docx')}
            >
              {targetMimeType === DOCX_MIME ? (
                <>
                  <option value="docx">DOCX</option>
                  <option value="pdf">PDF</option>
                </>
              ) : (
                <option value="pdf">PDF</option>
              )}
            </select>
          </div>

          <Button onClick={handleCreate} disabled={!canSubmit}>
            {creating ? 'Starting…' : 'Run Form Fill'}
          </Button>
        </CardContent>
      </Card>

      {(currentRun || currentRunId) && (
        <Card>
          <CardHeader>
            <CardTitle>Run Status</CardTitle>
            <CardDescription>Background processing status for the current Form Fill run.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm">
              <span className="font-medium">Run ID:</span> {currentRun?.id || currentRunId}
            </div>
            <div className="text-sm">
              <span className="font-medium">Status:</span> {currentRun?.status || 'pending'}
            </div>
            {currentRun?.processing_strategy && (
              <div className="text-sm">
                <span className="font-medium">Strategy:</span> {formatStrategy(currentRun.processing_strategy)}
              </div>
            )}
            {currentRun?.warnings?.length ? (
              <div className="space-y-1">
                <div className="font-medium text-sm">Warnings</div>
                <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                  {currentRun.warnings.map((warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {currentRun?.error_message && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {currentRun.error_message}
              </div>
            )}
            {currentRun?.status === 'completed' && (
              <Button onClick={handleDownload} disabled={downloading}>
                {downloading ? 'Downloading…' : `Download ${currentRun.result_filename || 'Result'}`}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
