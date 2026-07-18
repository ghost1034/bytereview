'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileSignature, Inbox, Plus, Scale, ShieldCheck, Trash2 } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { EnvelopeStatusBadge } from '@/components/ui/envelope-status-badge'
import { PageHeader } from '@/components/ui/page-header'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { useDeleteEnvelope, useEnvelopes, useEsignInbox } from '@/hooks/useEnvelopes'

const PAGE_SIZE = 25

function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function EsignDashboardPage() {
  const router = useRouter()
  const [tab, setTab] = React.useState<'all' | 'inbox' | 'drafts'>('all')
  const [statusFilter, setStatusFilter] = React.useState<string>('any')
  const [offset, setOffset] = React.useState(0)

  const listStatus = tab === 'drafts' ? 'draft' : statusFilter !== 'any' ? statusFilter : undefined
  const envelopesQuery = useEnvelopes(PAGE_SIZE, offset, listStatus)
  const inboxQuery = useEsignInbox()
  const deleteEnvelope = useDeleteEnvelope()
  const { toast } = useToast()
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; title: string } | null>(null)

  const inboxItems = inboxQuery.data?.items ?? []
  const pendingItems = inboxItems.filter((item) => item.envelope_status !== 'completed')
  const completedItems = inboxItems.filter((item) => item.envelope_status === 'completed')
  const inboxCount = pendingItems.length

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="E-Signature"
        title="Envelopes"
        description="Send documents for legally defensible electronic signature — MFA-verified signers, append-only audit trail, and a tamper-evident digital seal."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/dashboard/esign/legal">
                <Scale className="mr-1.5 size-4" /> Legal basis
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard/esign/verify">
                <ShieldCheck className="mr-1.5 size-4" /> Verify
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard/esign/templates">Templates</Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/esign/new">
                <Plus className="mr-1.5 size-4" /> New envelope
              </Link>
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as typeof tab)
            setOffset(0)
          }}
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="inbox">
              Awaiting my signature{inboxCount > 0 ? ` (${inboxCount})` : ''}
            </TabsTrigger>
            <TabsTrigger value="drafts">Drafts</TabsTrigger>
          </TabsList>
        </Tabs>
        {tab === 'all' && (
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v)
              setOffset(0)
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Any status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any status</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="declined">Declined</SelectItem>
              <SelectItem value="voided">Voided</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {tab === 'inbox' ? (
        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-surface">
            {inboxQuery.isLoading ? (
              <div className="space-y-2 p-4">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            ) : inboxCount === 0 ? (
              <EmptyState
                icon={Inbox}
                title="Nothing waiting for you"
                description="Envelopes sent to your email address will appear here when it's your turn to sign."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Envelope</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingItems.map((item) => (
                    <TableRow key={item.envelope_id}>
                      <TableCell className="font-medium">{item.title}</TableCell>
                      <TableCell className="text-foreground-muted">{item.sender_email}</TableCell>
                      <TableCell>
                        {item.is_my_turn ? (
                          <span className="text-sm font-medium text-info">Your turn</span>
                        ) : (
                          <span className="text-sm text-foreground-muted">Waiting on others</span>
                        )}
                      </TableCell>
                      <TableCell className="text-foreground-muted">{formatDate(item.expires_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          disabled={!item.is_my_turn}
                          onClick={() => router.push(`/dashboard/esign/sign/${item.envelope_id}`)}
                        >
                          Review & sign
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          {completedItems.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-base font-semibold">Completed</h2>
              <p className="text-sm text-foreground-muted">
                Documents you signed that every party has now completed. Open one to download the
                sealed PDF and its certificate of completion.
              </p>
              <div className="rounded-lg border border-border bg-surface">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Envelope</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>Completed</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completedItems.map((item) => (
                      <TableRow key={item.envelope_id}>
                        <TableCell className="font-medium">{item.title}</TableCell>
                        <TableCell className="text-foreground-muted">{item.sender_email}</TableCell>
                        <TableCell className="text-foreground-muted">
                          {formatDate(item.completed_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => router.push(`/dashboard/esign/sign/${item.envelope_id}`)}
                          >
                            View document
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-surface">
          {envelopesQuery.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : envelopesQuery.isError ? (
            <p className="p-6 text-sm text-destructive">
              Failed to load envelopes: {(envelopesQuery.error as Error)?.message}
            </p>
          ) : (envelopesQuery.data?.envelopes.length ?? 0) === 0 ? (
            <EmptyState
              icon={FileSignature}
              title={tab === 'drafts' ? 'No drafts' : 'No envelopes yet'}
              description="Create an envelope to send documents for signature."
              action={
                <Button asChild>
                  <Link href="/dashboard/esign/new">
                    <Plus className="mr-1.5 size-4" /> New envelope
                  </Link>
                </Button>
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Envelope</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Signers</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {envelopesQuery.data!.envelopes.map((envelope) => (
                    <TableRow
                      key={envelope.id}
                      className="cursor-pointer"
                      onClick={() =>
                        router.push(
                          envelope.status === 'draft'
                            ? `/dashboard/esign/${envelope.id}/documents`
                            : `/dashboard/esign/${envelope.id}`,
                        )
                      }
                    >
                      <TableCell className="font-medium">{envelope.title}</TableCell>
                      <TableCell>
                        <EnvelopeStatusBadge status={envelope.status} />
                      </TableCell>
                      <TableCell className="tabular-nums text-foreground-muted">
                        {envelope.signed_count}/{envelope.recipient_count}
                      </TableCell>
                      <TableCell className="text-foreground-muted">{formatDate(envelope.sent_at)}</TableCell>
                      <TableCell className="text-foreground-muted">{formatDate(envelope.completed_at)}</TableCell>
                      <TableCell className="text-right">
                        {envelope.status === 'draft' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-foreground-muted hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation()
                              setDeleteTarget({ id: envelope.id, title: envelope.title })
                            }}
                            aria-label={`Delete ${envelope.title}`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {(envelopesQuery.data!.total ?? 0) > PAGE_SIZE && (
                <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
                  <span className="text-foreground-muted">
                    {offset + 1}–{Math.min(offset + PAGE_SIZE, envelopesQuery.data!.total)} of{' '}
                    {envelopesQuery.data!.total}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={offset === 0}
                      onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={offset + PAGE_SIZE >= envelopesQuery.data!.total}
                      onClick={() => setOffset(offset + PAGE_SIZE)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete draft envelope?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.title}” and its uploaded documents will be permanently deleted. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteEnvelope.isPending}
              onClick={async () => {
                if (!deleteTarget) return
                try {
                  await deleteEnvelope.mutateAsync(deleteTarget.id)
                  toast({ title: 'Draft deleted' })
                } catch (error) {
                  toast({
                    title: 'Failed to delete draft',
                    description: error instanceof Error ? error.message : undefined,
                    variant: 'destructive',
                  })
                } finally {
                  setDeleteTarget(null)
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
