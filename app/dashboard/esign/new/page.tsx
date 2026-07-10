'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, FileText, Loader2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dropzone } from '@/components/ui/dropzone'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { useCreateEnvelope, useEsignTemplates } from '@/hooks/useEnvelopes'

export default function NewEnvelopePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const createEnvelope = useCreateEnvelope()
  const templatesQuery = useEsignTemplates()

  const [title, setTitle] = React.useState('')
  const [message, setMessage] = React.useState('')
  const [signingType, setSigningType] = React.useState('sequential')
  const [expiresInDays, setExpiresInDays] = React.useState('30')
  const [reminderHours, setReminderHours] = React.useState('72')
  const [templateId, setTemplateId] = React.useState<string>(searchParams?.get('template') ?? 'none')
  const [files, setFiles] = React.useState<File[]>([])

  const usingTemplate = templateId !== 'none'
  const canCreate = usingTemplate || files.length > 0

  const addFiles = (incoming: File[]) => {
    const pdfs = incoming.filter((f) => f.name.toLowerCase().endsWith('.pdf'))
    if (pdfs.length !== incoming.length) {
      toast({ title: 'Only PDF files are supported', variant: 'destructive' })
    }
    setFiles((prev) => [...prev, ...pdfs])
  }

  const handleCreate = async () => {
    try {
      const result = await createEnvelope.mutateAsync({
        title: title.trim() || undefined,
        message: message.trim() || undefined,
        signingType,
        expiresInDays: expiresInDays ? Number(expiresInDays) : undefined,
        reminderIntervalHours: reminderHours ? Number(reminderHours) : undefined,
        templateId: usingTemplate ? templateId : undefined,
        files: usingTemplate ? undefined : files,
      })
      const envelopeId = result.envelope.id
      router.push(
        usingTemplate
          ? `/dashboard/esign/${envelopeId}/edit?template=${templateId}`
          : `/dashboard/esign/${envelopeId}/edit`,
      )
    } catch (error) {
      toast({
        title: 'Failed to create envelope',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        eyebrow="E-Signature"
        title="New envelope"
        description="Upload the PDFs to be signed, or start from a saved template."
        actions={
          <Button variant="ghost" asChild>
            <Link href="/dashboard/esign">
              <ArrowLeft className="mr-1.5 size-4" /> Back
            </Link>
          </Button>
        }
      />

      <div className="space-y-5 rounded-lg border border-border bg-surface p-5">
        <div className="space-y-1.5">
          <Label htmlFor="esign-title">Title</Label>
          <Input
            id="esign-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. 2025 Engagement Letter — Smith LLC"
            maxLength={255}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="esign-message">Message to signers (optional)</Label>
          <Textarea
            id="esign-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Included in the signature request email."
            rows={3}
          />
        </div>

        {(templatesQuery.data?.templates.length ?? 0) > 0 && (
          <div className="space-y-1.5">
            <Label>Start from template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No template — upload PDFs</SelectItem>
                {templatesQuery.data!.templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {!usingTemplate && (
          <div className="space-y-2">
            <Label>Documents</Label>
            <Dropzone
              onFiles={addFiles}
              accept="application/pdf,.pdf"
              title="Drop PDFs here or click to upload"
              description="Documents are signed in the order listed."
            />
            {files.length > 0 && (
              <ul className="divide-y divide-border rounded-md border border-border">
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <FileText className="size-4 shrink-0 text-foreground-muted" />
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="text-xs text-foreground-subtle">
                      {(file.size / (1024 * 1024)).toFixed(1)} MB
                    </span>
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                      className="text-foreground-muted hover:text-destructive"
                      aria-label={`Remove ${file.name}`}
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Signing order</Label>
            <Select value={signingType} onValueChange={setSigningType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sequential">Sequential</SelectItem>
                <SelectItem value="parallel">Any order</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="esign-expires">Expires in (days)</Label>
            <Input
              id="esign-expires"
              type="number"
              min={1}
              max={365}
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="esign-reminder">Remind every (hours)</Label>
            <Input
              id="esign-reminder"
              type="number"
              min={1}
              max={720}
              value={reminderHours}
              onChange={(e) => setReminderHours(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" asChild>
            <Link href="/dashboard/esign">Cancel</Link>
          </Button>
          <Button onClick={handleCreate} disabled={!canCreate || createEnvelope.isPending}>
            {createEnvelope.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Create & add recipients
          </Button>
        </div>
      </div>
    </div>
  )
}
