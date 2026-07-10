'use client'

import * as React from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowLeft, ArrowRight, GripVertical, Loader2, Plus, Trash2 } from 'lucide-react'

import {
  EsignWizardFrame,
  EsignWizardFooter,
  useDraftEnvelope,
} from '@/components/esign/wizard/EsignWizardFrame'
import { participantColor } from '@/components/esign/pdf'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { useReplaceRecipients } from '@/hooks/useEnvelopes'
import type { EsignEnvelopeResponse } from '@/lib/api'
import { cn } from '@/lib/utils'

interface RecipientRow {
  /** Local drag identity only — not the server recipient id. */
  key: string
  email: string
  name: string
  role: 'signer' | 'cc'
}

let rowCounter = 0
const nextRowKey = () => `recipient-row-${++rowCounter}`

function rowsFromEnvelope(envelope: EsignEnvelopeResponse): RecipientRow[] {
  const sorted = [...envelope.recipients].sort((a, b) => a.routing_order - b.routing_order)
  if (sorted.length === 0) {
    return [{ key: nextRowKey(), email: '', name: '', role: 'signer' }]
  }
  return sorted.map((r) => ({
    key: nextRowKey(),
    email: r.email,
    name: r.name,
    role: (r.role as 'signer' | 'cc') ?? 'signer',
  }))
}

/** True when the cleaned rows match what the server already has (so saving
 * again — which would drop any placed fields — can be skipped). */
function matchesServer(envelope: EsignEnvelopeResponse, rows: RecipientRow[]): boolean {
  const server = [...envelope.recipients].sort((a, b) => a.routing_order - b.routing_order)
  if (server.length !== rows.length) return false
  return server.every(
    (r, i) =>
      r.email === rows[i].email &&
      r.name === rows[i].name &&
      r.role === rows[i].role &&
      r.routing_order === i + 1,
  )
}

function SortableRecipientRow({
  row,
  index,
  signerNumber,
  sequential,
  removable,
  onChange,
  onRemove,
}: {
  row: RecipientRow
  index: number
  /** 1-based position among signers (signing sequence); null for CC rows */
  signerNumber: number | null
  sequential: boolean
  removable: boolean
  onChange: (patch: Partial<RecipientRow>) => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.key,
  })
  const color = participantColor(index)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex flex-wrap items-end gap-2 rounded-md border border-border bg-surface p-3',
        isDragging && 'z-10 opacity-80 shadow-md',
      )}
    >
      <button
        type="button"
        className="mb-2 cursor-grab touch-none text-foreground-subtle hover:text-foreground active:cursor-grabbing"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      {sequential && (
        <span
          className={cn(
            'mb-1.5 inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-semibold',
            signerNumber !== null
              ? 'bg-primary-soft text-primary'
              : 'bg-surface-muted text-foreground-subtle',
          )}
          title={signerNumber !== null ? `Signs ${ordinal(signerNumber)}` : 'Receives a copy'}
        >
          {signerNumber !== null ? signerNumber : 'CC'}
        </span>
      )}
      <span
        className="mb-2.5 inline-block size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: color.border }}
        aria-hidden
      />
      <div className="min-w-40 flex-1 space-y-1">
        <Label className="text-xs">Name</Label>
        <Input
          value={row.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Jane Client"
        />
      </div>
      <div className="min-w-52 flex-1 space-y-1">
        <Label className="text-xs">Email</Label>
        <Input
          type="email"
          value={row.email}
          onChange={(e) => onChange({ email: e.target.value })}
          placeholder="jane@client.com"
        />
      </div>
      <div className="w-28 space-y-1">
        <Label className="text-xs">Role</Label>
        <Select value={row.role} onValueChange={(v) => onChange({ role: v as 'signer' | 'cc' })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="signer">Signer</SelectItem>
            <SelectItem value="cc">CC</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="mb-0.5 text-foreground-muted hover:text-destructive"
        onClick={onRemove}
        disabled={!removable}
        aria-label="Remove recipient"
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  )
}

function ordinal(n: number): string {
  const suffixes: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' }
  const v = n % 100
  return `${n}${suffixes[(v - 20) % 10] ?? suffixes[v] ?? 'th'}`
}

export default function EnvelopeRecipientsPage() {
  const params = useParams<{ envelopeId: string }>()
  const envelopeId = params?.envelopeId
  const router = useRouter()
  const searchParams = useSearchParams()
  const templateIdFromQuery = searchParams?.get('template') ?? undefined
  const { toast } = useToast()

  const envelopeQuery = useDraftEnvelope(envelopeId)
  const envelope = envelopeQuery.data

  const [rows, setRows] = React.useState<RecipientRow[]>([])
  const [hydratedFor, setHydratedFor] = React.useState<string | null>(null)

  const replaceRecipients = useReplaceRecipients(envelopeId!)

  React.useEffect(() => {
    if (!envelope || hydratedFor === envelope.id) return
    setRows(rowsFromEnvelope(envelope))
    setHydratedFor(envelope.id)
  }, [envelope, hydratedFor])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setRows((prev) => {
      const from = prev.findIndex((r) => r.key === active.id)
      const to = prev.findIndex((r) => r.key === over.id)
      if (from < 0 || to < 0) return prev
      return arrayMove(prev, from, to)
    })
  }

  const stepHref = (step: string) => {
    const query = searchParams?.toString()
    return `/dashboard/esign/${envelopeId}/${step}${query ? `?${query}` : ''}`
  }

  const saveAndContinue = async () => {
    if (!envelope) return
    const cleaned = rows
      .map((r) => ({ ...r, email: r.email.trim().toLowerCase(), name: r.name.trim() }))
      .filter((r) => r.email && r.name)
    if (cleaned.length === 0) {
      toast({ title: 'Add at least one recipient with a name and email', variant: 'destructive' })
      return
    }
    // Unchanged recipients: skip the save so already-placed fields survive.
    if (matchesServer(envelope, cleaned)) {
      router.push(stepHref('fields'))
      return
    }
    try {
      await replaceRecipients.mutateAsync({
        recipients: cleaned.map((r, index) => ({
          email: r.email,
          name: r.name,
          role: r.role,
          routing_order: index + 1,
        })),
        templateId: templateIdFromQuery,
      })
      router.push(stepHref('fields'))
    } catch (error) {
      toast({
        title: 'Failed to save recipients',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    }
  }

  const sequential = envelope?.signing_type === 'sequential'
  let signerCount = 0

  return (
    <EsignWizardFrame
      step="recipients"
      envelope={envelope}
      footer={
        <EsignWizardFooter
          back={
            <Button variant="outline" onClick={() => router.push(stepHref('documents'))}>
              <ArrowLeft className="mr-1.5 size-4" /> Back
            </Button>
          }
          primary={
            <Button onClick={saveAndContinue} disabled={replaceRecipients.isPending}>
              {replaceRecipients.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Continue to fields <ArrowRight className="ml-1.5 size-4" />
            </Button>
          }
        />
      }
    >
      <div className="space-y-4 rounded-lg border border-border bg-surface p-5">
        <div>
          <h2 className="text-base font-semibold">Who needs to sign?</h2>
          <p className="text-sm text-foreground-muted">
            Every signer must sign in with a CPAAutomation account matching this email — identity is
            verified with SMS phone MFA at every login.
            {sequential &&
              ' Drag recipients to set the signing order; each signer is notified only after the previous one completes.'}
          </p>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={rows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {rows.map((row, index) => {
                const signerNumber = row.role === 'signer' ? ++signerCount : null
                return (
                  <SortableRecipientRow
                    key={row.key}
                    row={row}
                    index={index}
                    signerNumber={signerNumber}
                    sequential={sequential}
                    removable={rows.length > 1}
                    onChange={(patch) =>
                      setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, ...patch } : r)))
                    }
                    onRemove={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                  />
                )
              })}
            </div>
          </SortableContext>
        </DndContext>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setRows((prev) => [...prev, { key: nextRowKey(), email: '', name: '', role: 'signer' }])
          }
        >
          <Plus className="mr-1.5 size-4" /> Add recipient
        </Button>
      </div>
    </EsignWizardFrame>
  )
}
