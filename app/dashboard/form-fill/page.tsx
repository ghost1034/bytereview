'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/AuthContext'
import {
  apiClient,
  type FormFillExtractionSourcePreview,
  type FormFillRun,
} from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const TERMINAL_RUN_STATUSES = new Set(['completed', 'completed_with_errors', 'failed'])

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

function inferTargetMimeType(file: File) {
  if (file.type) return file.type
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf')) return 'application/pdf'
  if (name.endsWith('.docx')) return DOCX_MIME
  return ''
}

function targetDefaultOutputFormat(mimeType: string): 'pdf' | 'docx' {
  return mimeType === DOCX_MIME ? 'docx' : 'pdf'
}

function isTabularSourceFile(file: File) {
  const name = file.name.toLowerCase()
  return file.type === 'text/csv'
    || file.type === 'application/vnd.ms-excel'
    || file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || name.endsWith('.csv')
    || name.endsWith('.xlsx')
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, exponent)
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`
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

function isTerminalRunStatus(status?: string | null) {
  return status ? TERMINAL_RUN_STATUSES.has(status) : false
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Not completed'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function formatStatus(status?: string | null) {
  return (status || 'pending').replace(/_/g, ' ')
}

export default function FormFillPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const { toast } = useToast()

  const sourceJobId = searchParams.get('job_id') || ''
  const sourceRunId = searchParams.get('run_id') || ''
  const sourceTaskId = searchParams.get('task_id') || ''
  const sourceScope = searchParams.get('source_scope') === 'all' ? 'all' : 'task'
  const hasExtractionSource = Boolean(sourceJobId && sourceRunId && (sourceTaskId || sourceScope === 'all'))
  const runIdParam = hasExtractionSource
    ? searchParams.get('form_fill_run_id') || ''
    : searchParams.get('run_id') || searchParams.get('form_fill_run_id') || ''

  const [sourceMode, setSourceMode] = useState<'upload' | 'extraction'>(hasExtractionSource ? 'extraction' : 'upload')
  const [targetMode, setTargetMode] = useState<'upload' | 'template'>('upload')
  const [sourceFiles, setSourceFiles] = useState<File[]>([])
  const [targetFile, setTargetFile] = useState<File | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [saveAsTemplate, setSaveAsTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateDescription, setTemplateDescription] = useState('')
  const [allowDocxTableExpansion, setAllowDocxTableExpansion] = useState(false)
  const [outputFormat, setOutputFormat] = useState<'pdf' | 'docx'>('pdf')
  const [hasOutputFormatOverride, setHasOutputFormatOverride] = useState(false)
  const [repeatMode, setRepeatMode] = useState<'single' | 'source_rows'>('single')
  const [creating, setCreating] = useState(false)
  const [downloadingRunId, setDownloadingRunId] = useState<string | null>(null)
  const [currentRunId, setCurrentRunId] = useState<string | null>(runIdParam || null)

  const { data: templatesData, refetch: refetchTemplates } = useQuery({
    queryKey: ['form-fill-templates'],
    queryFn: () => apiClient.listFormFillTemplates(),
    enabled: !!user,
    staleTime: 60_000,
  })

  const { data: extractionPreview } = useQuery<FormFillExtractionSourcePreview>({
    queryKey: ['form-fill-extraction-preview', sourceJobId, sourceRunId, sourceTaskId, sourceScope],
    queryFn: () => apiClient.getFormFillExtractionSourcePreview({
      jobId: sourceJobId,
      runId: sourceRunId,
      taskId: sourceScope === 'all' ? undefined : sourceTaskId,
      sourceScope,
    }),
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
      return run.status === 'completed' || run.status === 'completed_with_errors' || run.status === 'failed' ? false : 2500
    },
  })

  const { data: runsData, refetch: refetchRuns } = useQuery({
    queryKey: ['form-fill-runs'],
    queryFn: () => apiClient.listFormFillRuns({ limit: 10, offset: 0 }),
    enabled: !!user,
    refetchInterval: (query) => {
      const data = query.state.data
      return data?.runs?.some((run) => !isTerminalRunStatus(run.status)) ? 2500 : false
    },
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  })

  const templates = templatesData?.templates || []
  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === selectedTemplateId) || null,
    [templates, selectedTemplateId]
  )

  const recentRuns = runsData?.runs || []

  const selectRun = (runId: string, options?: { replace?: boolean }) => {
    setCurrentRunId(runId)
    const params = new URLSearchParams(searchParams.toString())
    if (hasExtractionSource) {
      params.set('form_fill_run_id', runId)
    } else {
      params.set('run_id', runId)
      params.delete('form_fill_run_id')
    }
    const url = `${pathname}?${params.toString()}`
    if (options?.replace) {
      router.replace(url)
    } else {
      router.push(url)
    }
  }

  const targetMimeType = useMemo(() => {
    if (targetMode === 'upload') return targetFile ? inferTargetMimeType(targetFile) : ''
    return selectedTemplate?.file_type || ''
  }, [targetMode, targetFile, selectedTemplate])

  const repeatModeSupported = useMemo(() => {
    if (sourceMode === 'extraction') return Boolean(extractionPreview?.rows.length)
    return sourceFiles.length === 1 && isTabularSourceFile(sourceFiles[0])
  }, [extractionPreview, sourceFiles, sourceMode])

  useEffect(() => {
    setCurrentRunId(runIdParam || null)
  }, [runIdParam])

  useEffect(() => {
    if (runIdParam || currentRunId || hasExtractionSource) return
    const activeRun = recentRuns.find((run) => !isTerminalRunStatus(run.status))
    if (activeRun) {
      selectRun(activeRun.id, { replace: true })
    }
  }, [currentRunId, hasExtractionSource, recentRuns, runIdParam])

  useEffect(() => {
    if (repeatMode === 'source_rows' && !repeatModeSupported) {
      setRepeatMode('single')
    }
  }, [repeatMode, repeatModeSupported])

  useEffect(() => {
    if (targetMimeType !== DOCX_MIME) {
      setOutputFormat('pdf')
      setHasOutputFormatOverride(false)
      return
    }

    if (!hasOutputFormatOverride) {
      setOutputFormat(targetDefaultOutputFormat(targetMimeType))
    }
  }, [hasOutputFormatOverride, targetMimeType])

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
    const sourceReady = sourceMode === 'upload' ? sourceFiles.length > 0 : !!extractionPreview
    const targetReady = targetMode === 'upload' ? !!targetFile : !!selectedTemplateId
    const templateReady = !saveAsTemplate || templateName.trim().length > 0
    const repeatReady = repeatMode === 'single' || repeatModeSupported
    return sourceReady && targetReady && templateReady && repeatReady && !creating
  }, [creating, extractionPreview, repeatMode, repeatModeSupported, saveAsTemplate, selectedTemplateId, sourceFiles, sourceMode, targetFile, targetMode, templateName])

  const handleCreate = async () => {
    if (!canSubmit) return
    setCreating(true)
    try {
      const response = await apiClient.createFormFillRun({
        sourceFiles: sourceMode === 'upload' ? sourceFiles : undefined,
        targetFile: targetMode === 'upload' ? targetFile || undefined : undefined,
        templateId: targetMode === 'template' ? selectedTemplateId : undefined,
        outputFormat: hasOutputFormatOverride ? outputFormat : undefined,
        repeatMode,
        allowDocxTableExpansion: targetMimeType === DOCX_MIME ? allowDocxTableExpansion : undefined,
        saveTemplateName: targetMode === 'upload' && saveAsTemplate ? templateName.trim() : undefined,
        saveTemplateDescription: targetMode === 'upload' && saveAsTemplate ? templateDescription.trim() : undefined,
        sourceJobId: sourceMode === 'extraction' ? sourceJobId : undefined,
        sourceRunId: sourceMode === 'extraction' ? sourceRunId : undefined,
        sourceTaskId: sourceMode === 'extraction' && sourceScope !== 'all' ? sourceTaskId : undefined,
        sourceScope: sourceMode === 'extraction' ? sourceScope : undefined,
      })

      selectRun(response.run.id, { replace: true })
      refetchRuns()
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

  const handleDownload = async (runId?: string | null) => {
    if (!runId) return
    setDownloadingRunId(runId)
    try {
      const { blob, filename } = await apiClient.downloadFormFillRun(runId)
      downloadBlob(blob, filename)
    } catch (error) {
      toast({
        title: 'Download failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setDownloadingRunId(null)
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Form Fill"
        description="Drop in supporting information and a PDF or DOCX target — the AI fills it out for you."
      />

      <Section
        variant="card"
        title="Source"
        description="The information used to fill the target document."
        contentClassName=""
      >
        <div data-tour="form-fill-source" className="space-y-4">
          {hasExtractionSource && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant={sourceMode === 'extraction' ? 'default' : 'outline'}
                onClick={() => setSourceMode('extraction')}
              >
                Extraction results
              </Button>
              <Button
                variant={sourceMode === 'upload' ? 'default' : 'outline'}
                onClick={() => setSourceMode('upload')}
              >
                Upload files
              </Button>
            </div>
          )}

          {sourceMode === 'upload' ? (
            <div className="space-y-2">
              <Label htmlFor="source-files">Source files</Label>
              <Input
                id="source-files"
                type="file"
                multiple
                accept=".csv,.xlsx,.pdf,.docx"
                onChange={(event) => setSourceFiles(Array.from(event.target.files || []))}
              />
              <p className="text-xs text-foreground-muted">
                Supported: CSV, XLSX, PDF, DOCX. Up to 100 source files, 1000 MB total. Multiple source files fill one form each.
              </p>
              {sourceFiles.length > 0 && (
                <div className="rounded-md border border-border bg-surface-raised divide-y divide-border">
                  {sourceFiles.map((file, index) => (
                    <div
                      key={`${file.name}-${file.lastModified}-${index}`}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate text-foreground">{file.name}</div>
                        <div className="text-xs text-foreground-muted">
                          {mimeToExtension(file.type)} · {formatBytes(file.size)}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSourceFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-surface-muted p-4 space-y-3">
              <div className="text-sm font-medium text-foreground">Selected extraction result</div>
              <div className="text-xs text-foreground-muted">
                Job run <code className="font-mono">{sourceRunId}</code>{' '}
                {sourceScope === 'all' ? (
                  <span>all rows, grouped by extraction task</span>
                ) : (
                  <>
                    task <code className="font-mono">{sourceTaskId}</code>
                  </>
                )}
              </div>
              {extractionPreview ? (
                <>
                  <div className="text-sm text-foreground">
                    Source files:{' '}
                    {extractionPreview.source_files.length
                      ? extractionPreview.source_files.join(', ')
                      : '(manual rows)'}
                  </div>
                  <div className="overflow-x-auto rounded-md border border-border bg-surface-raised">
                    <table className="min-w-full text-sm">
                      <thead className="bg-surface-muted">
                        <tr>
                          {extractionPreview.columns.map((column) => (
                            <th
                              key={column}
                              className="text-left px-3 py-2 font-medium text-foreground-muted"
                            >
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {extractionPreview.rows.slice(0, 5).map((row, rowIndex) => (
                          <tr key={rowIndex} className="border-t border-border">
                            {extractionPreview.columns.map((column, columnIndex) => (
                              <td
                                key={`${column}-${rowIndex}`}
                                className="px-3 py-2 align-top text-foreground"
                              >
                                {String(row[columnIndex] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {extractionPreview.rows.length > 5 && (
                    <p className="text-xs text-foreground-subtle">
                      Showing first 5 rows of {extractionPreview.rows.length}.
                    </p>
                  )}
                </>
              ) : (
                <div className="text-sm text-foreground-muted">Loading extraction preview…</div>
              )}
            </div>
          )}
        </div>
      </Section>

      <Section
        variant="card"
        title="Target"
        description="The PDF or DOCX to fill."
      >
        <div data-tour="form-fill-target" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant={targetMode === 'upload' ? 'default' : 'outline'}
              onClick={() => setTargetMode('upload')}
            >
              Upload target
            </Button>
            <Button
              variant={targetMode === 'template' ? 'default' : 'outline'}
              onClick={() => setTargetMode('template')}
            >
              Saved template
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

              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox
                  checked={saveAsTemplate}
                  onCheckedChange={(checked) => setSaveAsTemplate(checked === true)}
                />
                Save this target as a reusable Form Fill template
              </label>

              {saveAsTemplate && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="template-name">Template name</Label>
                    <Input
                      id="template-name"
                      value={templateName}
                      onChange={(event) => setTemplateName(event.target.value)}
                    />
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
              <Select
                value={selectedTemplateId || undefined}
                onValueChange={(value) => setSelectedTemplateId(value)}
              >
                <SelectTrigger id="template-select">
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name} ({mimeToExtension(template.file_type)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedTemplate && (
                <p className="text-xs text-foreground-muted">
                  {selectedTemplate.original_filename}
                  {selectedTemplate.description ? ` — ${selectedTemplate.description}` : ''}
                </p>
              )}
              {targetMode === 'template' && templates.length === 0 && (
                <p className="text-xs text-foreground-muted">
                  No saved templates yet. Upload a target and save it as a template first.
                </p>
              )}
            </div>
          )}

          {targetMimeType === DOCX_MIME && (
            <div className="rounded-md border border-border bg-surface p-4">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="allow-docx-table-expansion"
                  checked={allowDocxTableExpansion}
                  onCheckedChange={(checked) => setAllowDocxTableExpansion(checked === true)}
                />
                <Label htmlFor="allow-docx-table-expansion" className="text-sm font-medium">
                  Allow AI to add new rows or columns in the form
                </Label>
              </div>
              <p className="mt-1 ml-7 text-xs text-foreground-muted">
                Use this when a DOCX table may need to grow to fit the extracted data.
                {targetMode === 'upload' && saveAsTemplate ? ' This setting will be saved on the template.' : ''}
              </p>
            </div>
          )}
        </div>
      </Section>

      <Section
        variant="card"
        title="Output"
        description="Output format follows the target by default."
      >
        <div data-tour="form-fill-run" className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="output-format">Output format</Label>
            <Select
              value={outputFormat}
              onValueChange={(value) => {
                const nextOutputFormat = value as 'pdf' | 'docx'
                setOutputFormat(nextOutputFormat)
                setHasOutputFormatOverride(
                  targetMimeType === DOCX_MIME && nextOutputFormat !== targetDefaultOutputFormat(targetMimeType)
                )
              }}
            >
              <SelectTrigger id="output-format" className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {targetMimeType === DOCX_MIME ? (
                  <>
                    <SelectItem value="docx">DOCX</SelectItem>
                    <SelectItem value="pdf">PDF</SelectItem>
                  </>
                ) : (
                  <SelectItem value="pdf">PDF</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Fill mode</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={repeatMode === 'single' ? 'default' : 'outline'}
                onClick={() => setRepeatMode('single')}
              >
                Fill once per file (default)
              </Button>
              <Button
                type="button"
                variant={repeatMode === 'source_rows' ? 'default' : 'outline'}
                disabled={!repeatModeSupported}
                onClick={() => setRepeatMode('source_rows')}
              >
                Fill once per row (special)
              </Button>
            </div>
            <p className="text-xs text-foreground-muted">
              “Fill once per file/row" fills the form once for each file/row and downloads a ZIP of filled documents.
            </p>
            {!repeatModeSupported && sourceMode === 'upload' && sourceFiles.length > 0 && (
              <p className="text-xs text-warning">
                Row mode currently requires exactly one CSV or XLSX source file.
              </p>
            )}
          </div>

          <Button onClick={handleCreate} disabled={!canSubmit}>
            {creating ? 'Starting…' : 'Run Form Fill'}
          </Button>
        </div>
      </Section>

      {recentRuns.length > 0 && (
        <Section
          variant="card"
          title="Recent Form Fill runs"
          description="Persisted runs stay available after you leave this page."
        >
          <div className="rounded-md border border-border bg-surface-raised divide-y divide-border">
            {recentRuns.map((run) => {
              const isSelected = run.id === currentRunId
              const isDownloadReady =
                run.status === 'completed' || run.status === 'completed_with_errors'
              return (
                <div
                  key={run.id}
                  className={cn(
                    'flex flex-col gap-3 px-3 py-3 text-sm md:flex-row md:items-center md:justify-between',
                    isSelected && 'bg-primary-soft/40',
                  )}
                >
                  <button
                    type="button"
                    aria-label={`Select form-fill run ${run.target_filename}`}
                    className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                    onClick={() => selectRun(run.id)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium truncate text-foreground">
                        {run.target_filename}
                      </span>
                      {isSelected && (
                        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary-soft-foreground">
                          Selected
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-foreground-muted">
                      {formatStatus(run.status)} · {formatDateTime(run.created_at)}
                      {run.total_outputs > 1 || run.repeat_mode === 'source_rows'
                        ? ` · ${run.completed_outputs}/${run.total_outputs} completed`
                        : ''}
                    </div>
                  </button>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      variant={isSelected ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => selectRun(run.id)}
                    >
                      View
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!isDownloadReady || downloadingRunId === run.id}
                      onClick={() => handleDownload(run.id)}
                    >
                      {downloadingRunId === run.id ? 'Downloading…' : 'Download'}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {(currentRun || currentRunId) && (
        <Section
          variant="card"
          title="Run status"
          description="Background processing status for the current Form Fill run."
        >
          <div className="space-y-3 text-sm">
            <div>
              <span className="font-medium text-foreground">Run ID:</span>{' '}
              <span className="text-foreground-muted">{currentRun?.id || currentRunId}</span>
            </div>
            <div>
              <span className="font-medium text-foreground">Status:</span>{' '}
              <span className="text-foreground-muted">{currentRun?.status || 'pending'}</span>
            </div>
            {currentRun && (currentRun.total_outputs > 1 || currentRun.repeat_mode === 'source_rows') && (
              <div>
                <span className="font-medium text-foreground">Progress:</span>{' '}
                <span className="text-foreground-muted">
                  {currentRun.completed_outputs} of {currentRun.total_outputs} completed
                  {currentRun.failed_outputs > 0 ? `, ${currentRun.failed_outputs} failed` : ''}
                </span>
              </div>
            )}
            {currentRun?.processing_strategy && (
              <div>
                <span className="font-medium text-foreground">Strategy:</span>{' '}
                <span className="text-foreground-muted">
                  {formatStrategy(currentRun.processing_strategy)}
                </span>
              </div>
            )}
            {currentRun?.warnings?.length ? (
              <div className="space-y-1">
                <div className="font-medium text-foreground text-sm">Warnings</div>
                <ul className="list-disc pl-5 space-y-1 text-foreground-muted">
                  {currentRun.warnings.map((warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {currentRun?.error_message && (
              <Alert variant="destructive">
                <AlertDescription>{currentRun.error_message}</AlertDescription>
              </Alert>
            )}
            {(currentRun?.status === 'completed' ||
              currentRun?.status === 'completed_with_errors') && (
              <Button
                onClick={() => handleDownload(currentRun.id)}
                disabled={downloadingRunId === currentRun.id}
              >
                {downloadingRunId === currentRun.id
                  ? 'Downloading…'
                  : `Download ${
                      currentRun.repeat_mode === 'source_rows' || currentRun.total_outputs > 1
                        ? 'ZIP'
                        : currentRun.result_filename || 'Result'
                    }`}
              </Button>
            )}
          </div>
        </Section>
      )}
    </div>
  )
}
