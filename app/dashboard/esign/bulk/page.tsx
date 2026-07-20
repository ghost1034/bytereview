'use client'

import * as React from 'react'
import Link from 'next/link'
import { Download, ExternalLink, FileSpreadsheet, RotateCcw, Upload } from 'lucide-react'
import { apiClient } from '@/lib/api'
import { useEsignTemplates } from '@/hooks/useEnvelopes'
import { useBulkJob, useBulkJobAction, useBulkJobs, useCreateBulkJob, useTemplateVersions } from '@/hooks/useEsignScale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/hooks/use-toast'

function saveBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob); const link = document.createElement('a')
  link.href = href; link.download = filename; link.click(); URL.revokeObjectURL(href)
}

export default function BulkSendsPage() {
  const { toast } = useToast()
  const templates = useEsignTemplates(); const jobs = useBulkJobs(); const create = useCreateBulkJob()
  const confirm = useBulkJobAction('confirm'); const retry = useBulkJobAction('retry'); const cancel = useBulkJobAction('cancel')
  const [templateId, setTemplateId] = React.useState(''); const versions = useTemplateVersions(templateId)
  const [versionId, setVersionId] = React.useState(''); const [file, setFile] = React.useState<File | null>(null)
  const [defaultSchedule, setDefaultSchedule] = React.useState(''); const [selectedJobId, setSelectedJobId] = React.useState<string>()
  const detail = useBulkJob(selectedJobId); const selectedJob = detail.data
  React.useEffect(() => setVersionId(versions.data?.versions[0]?.id ?? ''), [versions.data])

  const upload = async () => {
    if (!file || !versionId) return
    try {
      const result = await create.mutateAsync({ templateVersionId: versionId, file, defaultSchedule: defaultSchedule ? { at: new Date(defaultSchedule).toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } : undefined })
      setSelectedJobId(result.id); setFile(null); toast({ title: 'File validated', description: `${result.valid_rows} rows are ready; ${result.invalid_rows} need correction.` })
    } catch (error) { toast({ title: 'Validation failed', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) }
  }
  const act = async (operation: ReturnType<typeof useBulkJobAction>, id: string, success: string) => {
    try { await operation.mutateAsync(id); await detail.refetch(); toast({ title: success }) }
    catch (error) { toast({ title: 'Action failed', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) }
  }
  const progress = selectedJob ? Math.round((selectedJob.processed_rows / Math.max(1, selectedJob.total_rows)) * 100) : 0

  return <div className="space-y-6">
    <div><p className="text-sm font-medium text-primary">Sending at scale</p><h1 className="text-2xl font-semibold">Bulk sends</h1>
      <p className="mt-1 text-sm text-foreground-muted">Validate up to 1,000 template-specific rows before any envelope is created.</p></div>

    <section className="grid gap-5 rounded-xl border border-border bg-surface p-5 shadow-sm lg:grid-cols-[1fr_auto]">
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label>Template</Label><Select value={templateId} onValueChange={setTemplateId}><SelectTrigger><SelectValue placeholder="Choose a template" /></SelectTrigger><SelectContent>{templates.data?.templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Published version</Label><Select value={versionId} onValueChange={setVersionId} disabled={!templateId}><SelectTrigger><SelectValue placeholder="Publish the template first" /></SelectTrigger><SelectContent>{versions.data?.versions.map(v => <SelectItem key={v.id} value={v.id}>Version {v.version}</SelectItem>)}</SelectContent></Select></div>
        <div><Label htmlFor="bulk-csv">Completed or corrected CSV</Label><Input id="bulk-csv" type="file" accept=".csv,text/csv" onChange={e => setFile(e.target.files?.[0] ?? null)} /></div>
        <div><Label htmlFor="bulk-schedule">Batch schedule (optional)</Label><Input id="bulk-schedule" type="datetime-local" min={new Date(Date.now() + 5 * 60_000).toISOString().slice(0, 16)} value={defaultSchedule} onChange={e => setDefaultSchedule(e.target.value)} /><p className="mt-1 text-xs text-foreground-muted">Rows with their own schedule override this default.</p></div>
      </div>
      <div className="flex min-w-48 flex-col justify-end gap-2"><Button variant="outline" disabled={!versionId} onClick={async () => saveBlob(await apiClient.downloadEsignBulkSample(versionId), 'bulk-send-sample.csv')}><Download className="mr-2 size-4" /> Sample CSV</Button><Button disabled={!versionId || !file || create.isPending} onClick={() => void upload()}><Upload className="mr-2 size-4" /> Validate upload</Button></div>
    </section>

    <div className="grid gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
      <section className="rounded-xl border border-border bg-surface shadow-sm"><div className="border-b p-4"><h2 className="font-semibold">Recent jobs</h2></div>{jobs.data?.jobs.length ? <ul className="divide-y">{jobs.data.jobs.map(job => <li key={job.id}><button className="flex w-full items-center gap-3 p-4 text-left hover:bg-surface-muted/50" onClick={() => setSelectedJobId(job.id)}><FileSpreadsheet className="size-5 shrink-0 text-foreground-muted" /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{job.total_rows} rows</span><span className="block text-xs text-foreground-muted">{new Date(job.created_at).toLocaleString()}</span></span><Badge variant="outline">{job.status}</Badge></button></li>)}</ul> : <p className="p-8 text-center text-sm text-foreground-muted">No bulk jobs yet.</p>}</section>

      <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
        {!selectedJob ? <p className="py-16 text-center text-sm text-foreground-muted">Choose a job to inspect its live progress and row results.</p> : <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="font-semibold">Job detail</h2><Badge variant="outline">{selectedJob.status}</Badge></div><p className="mt-1 text-sm text-foreground-muted">{selectedJob.valid_rows} valid · {selectedJob.invalid_rows} invalid · {selectedJob.total_rows} total</p></div><div className="flex flex-wrap gap-2">{selectedJob.invalid_rows > 0 && <Button size="sm" variant="outline" onClick={async () => saveBlob(await apiClient.downloadEsignBulkErrors(selectedJob.id), 'bulk-send-correct-and-reupload.csv')}><Download className="mr-1 size-3" /> Original rows + errors</Button>}{selectedJob.status === 'ready' && <Button size="sm" disabled={!selectedJob.valid_rows || confirm.isPending} onClick={() => void act(confirm, selectedJob.id, 'Bulk send queued')}>Confirm {selectedJob.valid_rows} rows</Button>}{selectedJob.status === 'partial_failed' && <Button size="sm" variant="outline" disabled={retry.isPending} onClick={() => void act(retry, selectedJob.id, 'Failed rows queued')}><RotateCcw className="mr-1 size-3" /> Retry failures</Button>}{['ready', 'queued', 'processing'].includes(selectedJob.status) && <Button size="sm" variant="outline" disabled={cancel.isPending} onClick={() => void act(cancel, selectedJob.id, 'Unsent rows cancelled')}>Cancel unsent</Button>}</div></div>
          <div><div className="mb-2 flex justify-between text-xs text-foreground-muted"><span>{selectedJob.processed_rows} of {selectedJob.total_rows} processed</span><span>{progress}%</span></div><Progress value={progress} /></div>
          <p className="rounded-md bg-surface-muted p-3 text-xs text-foreground-muted">Cancellation policy: envelopes already sent are retained. Unsent materialized envelopes are retained as ordinary drafts for review or deletion; rows that have not materialized are cancelled.</p>
          <div className="max-h-[470px] overflow-auto rounded-lg border border-border"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-surface-muted"><tr><th className="p-2">Row</th><th className="p-2">Status</th><th className="p-2">Attempts</th><th className="p-2">Result</th></tr></thead><tbody>{(selectedJob.rows ?? []).map(row => <tr key={row.id} className="border-t"><td className="p-2 tabular-nums">{row.row_number}</td><td className="p-2"><Badge variant="outline">{row.status}</Badge></td><td className="p-2 tabular-nums">{row.attempts}</td><td className="p-2">{row.envelope_id ? <Link className="inline-flex items-center text-primary hover:underline" href={`/dashboard/esign/${row.envelope_id}`}>Envelope <ExternalLink className="ml-1 size-3" /></Link> : row.error_message ? <span className="text-destructive"><span className="font-medium">{row.error_code}</span> · {row.error_message}</span> : <span className="text-foreground-muted">Pending</span>}</td></tr>)}</tbody></table></div>
        </div>}
      </section>
    </div>
  </div>
}
