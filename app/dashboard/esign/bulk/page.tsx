'use client'

import * as React from 'react'
import { Download, FileSpreadsheet, RotateCcw, Upload } from 'lucide-react'
import { apiClient } from '@/lib/api'
import { useEsignTemplates } from '@/hooks/useEnvelopes'
import { useBulkJobAction, useBulkJobs, useCreateBulkJob, useTemplateVersions } from '@/hooks/useEsignScale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
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
  const [defaultSchedule, setDefaultSchedule] = React.useState('')
  const [preview, setPreview] = React.useState<Awaited<ReturnType<typeof apiClient.createEsignBulkJob>> | null>(null)
  React.useEffect(() => setVersionId(versions.data?.versions[0]?.id ?? ''), [versions.data])

  const act = async (operation: ReturnType<typeof useBulkJobAction>, id: string, success: string) => {
    try { const result = await operation.mutateAsync(id); if (preview?.id === id) setPreview(result); toast({ title: success }) }
    catch (error) { toast({ title: 'Action failed', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) }
  }

  return <div className="space-y-6">
    <div><p className="text-sm font-medium text-primary">Sending at scale</p><h1 className="text-2xl font-semibold">Bulk sends</h1>
      <p className="mt-1 text-sm text-foreground-muted">Validate up to 1,000 template-specific rows before any envelope is created.</p></div>

    <section className="grid gap-5 rounded-xl border border-border bg-surface p-5 shadow-sm lg:grid-cols-[1fr_auto]">
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label>Template</Label><Select value={templateId} onValueChange={setTemplateId}><SelectTrigger><SelectValue placeholder="Choose a template" /></SelectTrigger>
          <SelectContent>{templates.data?.templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Published version</Label><Select value={versionId} onValueChange={setVersionId} disabled={!templateId}><SelectTrigger><SelectValue placeholder="Publish the template first" /></SelectTrigger>
          <SelectContent>{versions.data?.versions.map(v => <SelectItem key={v.id} value={v.id}>Version {v.version}</SelectItem>)}</SelectContent></Select></div>
        <div><Label htmlFor="bulk-csv">Completed CSV</Label><Input id="bulk-csv" type="file" accept=".csv,text/csv" onChange={e => setFile(e.target.files?.[0] ?? null)} /></div>
        <div><Label htmlFor="bulk-schedule">Batch schedule (optional)</Label><Input id="bulk-schedule" type="datetime-local" min={new Date(Date.now() + 5 * 60_000).toISOString().slice(0, 16)} value={defaultSchedule} onChange={e => setDefaultSchedule(e.target.value)} /><p className="mt-1 text-xs text-foreground-muted">Rows with their own schedule override this default.</p></div>
      </div>
      <div className="flex min-w-48 flex-col justify-end gap-2">
        <Button variant="outline" disabled={!versionId} onClick={async () => saveBlob(await apiClient.downloadEsignBulkSample(versionId), 'bulk-send-sample.csv')}><Download className="mr-2 size-4" /> Sample CSV</Button>
        <Button disabled={!versionId || !file || create.isPending} onClick={async () => { if (!file) return; try { setPreview(await create.mutateAsync({ templateVersionId: versionId, file, defaultSchedule: defaultSchedule ? { at: new Date(defaultSchedule).toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } : undefined })) } catch (error) { toast({ title: 'Validation failed', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) } }}><Upload className="mr-2 size-4" /> Validate upload</Button>
      </div>
    </section>

    {preview && <section className="space-y-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Validation preview</h2><p className="text-sm text-foreground-muted">{preview.valid_rows} valid · {preview.invalid_rows} invalid · {preview.total_rows} total</p></div>
        <div className="flex gap-2">{preview.invalid_rows > 0 && <Button variant="outline" onClick={async () => saveBlob(await apiClient.downloadEsignBulkErrors(preview.id), 'bulk-send-errors.csv')}><Download className="mr-2 size-4" /> Errors</Button>}
          <Button disabled={preview.valid_rows === 0 || preview.status !== 'ready'} onClick={() => void act(confirm, preview.id, 'Bulk send queued')}>Confirm {preview.valid_rows} rows</Button></div></div>
      {preview.rows?.some(r => r.error_message) && <div className="max-h-64 overflow-auto rounded-lg border border-border"><table className="w-full text-left text-sm"><thead className="bg-surface-muted"><tr><th className="p-2">Row</th><th className="p-2">Status</th><th className="p-2">Issue</th></tr></thead><tbody>{preview.rows.filter(r => r.error_message).map(r => <tr key={r.id} className="border-t"><td className="p-2">{r.row_number}</td><td className="p-2"><Badge variant="outline">{r.status}</Badge></td><td className="p-2 text-destructive">{r.error_message}</td></tr>)}</tbody></table></div>}
    </section>}

    <section className="rounded-xl border border-border bg-surface shadow-sm"><div className="border-b p-5"><h2 className="font-semibold">Recent jobs</h2></div>
      {jobs.data?.jobs.length ? <ul className="divide-y">{jobs.data.jobs.map(job => <li key={job.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="flex items-center gap-3"><FileSpreadsheet className="size-5 text-foreground-muted" /><div><p className="text-sm font-medium">{job.total_rows} rows</p><p className="text-xs text-foreground-muted">{job.processed_rows} processed · {job.invalid_rows} invalid</p></div><Badge variant="outline">{job.status}</Badge></div>
        <div className="flex gap-2">{job.status === 'partial_failed' && <Button size="sm" variant="outline" onClick={() => void act(retry, job.id, 'Failed rows queued')}><RotateCcw className="mr-1 size-3" /> Retry</Button>}{['queued', 'processing'].includes(job.status) && <Button size="sm" variant="outline" onClick={() => void act(cancel, job.id, 'Unsent rows cancelled')}>Cancel</Button>}</div></li>)}</ul>
        : <p className="p-8 text-center text-sm text-foreground-muted">No bulk jobs yet.</p>}</section>
  </div>
}
