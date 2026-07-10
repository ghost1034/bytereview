'use client'

import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, FileCheck2, Loader2, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react'

import { sha256HexOfFile } from '@/components/esign/pdf'
import { Button } from '@/components/ui/button'
import { Dropzone } from '@/components/ui/dropzone'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { useToast } from '@/hooks/use-toast'
import { useVerifyDocument } from '@/hooks/useEnvelopes'
import type { EsignVerifyResponse } from '@/lib/api'

function VerdictBanner({ result }: { result: EsignVerifyResponse }) {
  const valid = result.signature_valid === true && result.hash_match !== false
  const tampered = result.signature_valid === false || result.hash_match === false
  const Icon = valid ? ShieldCheck : tampered ? ShieldX : ShieldAlert
  const tone = valid
    ? 'border-success/30 bg-success-soft text-success'
    : tampered
      ? 'border-destructive/30 bg-destructive-soft text-destructive'
      : 'border-warning/30 bg-warning-soft text-warning'
  const headline = valid
    ? 'Document verified — unmodified since sealing'
    : tampered
      ? 'Verification failed — the document does not match its seal'
      : 'Inconclusive'
  return (
    <div className={`flex items-center gap-3 rounded-lg border p-4 ${tone}`}>
      <Icon className="size-6 shrink-0" />
      <div>
        <p className="text-sm font-semibold">{headline}</p>
        {result.details && <p className="text-xs opacity-90">{result.details}</p>}
      </div>
    </div>
  )
}

export default function EsignVerifyPage() {
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const verify = useVerifyDocument()

  const [envelopeId, setEnvelopeId] = React.useState(searchParams?.get('envelope') ?? '')
  const [file, setFile] = React.useState<File | null>(null)
  const [clientSha, setClientSha] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<EsignVerifyResponse | null>(null)

  const handleFile = async (files: File[]) => {
    const pdf = files.find((f) => f.name.toLowerCase().endsWith('.pdf'))
    if (!pdf) {
      toast({ title: 'Please choose a PDF file', variant: 'destructive' })
      return
    }
    setFile(pdf)
    setResult(null)
    setClientSha(null)
    try {
      setClientSha(await sha256HexOfFile(pdf))
    } catch {
      // non-fatal preview
    }
  }

  const handleVerify = async () => {
    setResult(null)
    try {
      const response = await verify.mutateAsync({
        envelopeId: envelopeId.trim() || undefined,
        file: file ?? undefined,
      })
      setResult(response)
    } catch (error) {
      toast({
        title: 'Verification failed',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        eyebrow="E-Signature"
        title="Verify a document"
        description="Re-check a sealed document at any time: we recompute its SHA-256 hash and validate the embedded PAdES digital signature."
        actions={
          <Button variant="ghost" asChild>
            <Link href="/dashboard/esign">
              <ArrowLeft className="mr-1.5 size-4" /> Envelopes
            </Link>
          </Button>
        }
      />

      <div className="space-y-5 rounded-lg border border-border bg-surface p-5">
        <div className="space-y-2">
          <Label>Upload the PDF to verify</Label>
          <Dropzone
            onFiles={handleFile}
            accept="application/pdf,.pdf"
            multiple={false}
            title="Drop a sealed PDF here or click to upload"
            description="Works with any copy of the document, even one downloaded years ago."
          />
          {file && (
            <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <FileCheck2 className="size-4 shrink-0 text-foreground-muted" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
            </div>
          )}
          {clientSha && (
            <p className="break-all font-mono text-[11px] text-foreground-subtle">
              SHA-256 (computed in your browser): {clientSha}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="verify-envelope">…or verify a stored envelope by ID</Label>
          <Input
            id="verify-envelope"
            value={envelopeId}
            onChange={(e) => setEnvelopeId(e.target.value)}
            placeholder="Envelope ID"
          />
        </div>

        <div className="flex justify-end border-t border-border pt-4">
          <Button onClick={handleVerify} disabled={verify.isPending || (!file && !envelopeId.trim())}>
            {verify.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <ShieldCheck className="mr-1.5 size-4" />
            )}
            Verify
          </Button>
        </div>
      </div>

      {result && (
        <div className="space-y-4">
          <VerdictBanner result={result} />
          <dl className="grid gap-3 rounded-lg border border-border bg-surface p-5 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-foreground-subtle">Digital seal</dt>
              <dd>
                {result.signature_found
                  ? result.signature_valid
                    ? 'Present and valid'
                    : 'Present but INVALID'
                  : 'Not found'}
              </dd>
            </div>
            <div>
              <dt className="text-foreground-subtle">Modification level</dt>
              <dd>{result.modification_level ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-foreground-subtle">Hash match vs. stored record</dt>
              <dd>
                {result.hash_match === true ? 'Match' : result.hash_match === false ? 'MISMATCH' : 'No stored record'}
              </dd>
            </div>
            <div>
              <dt className="text-foreground-subtle">Sealed at</dt>
              <dd>{result.signed_at ? new Date(result.signed_at).toLocaleString() : '—'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-foreground-subtle">Sealing certificate</dt>
              <dd className="break-all">{result.signer_subject ?? '—'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-foreground-subtle">Computed SHA-256</dt>
              <dd className="break-all font-mono text-xs">{result.computed_sha256 ?? '—'}</dd>
            </div>
            {result.envelope_id && (
              <div className="sm:col-span-2">
                <dt className="text-foreground-subtle">Matched envelope</dt>
                <dd>
                  <Link className="text-primary underline-offset-2 hover:underline" href={`/dashboard/esign/${result.envelope_id}`}>
                    {result.envelope_id}
                  </Link>{' '}
                  ({result.envelope_status})
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  )
}
