'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Ban, Copy, KeyRound, Loader2, MonitorSmartphone, Pencil, Plus } from 'lucide-react'

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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { DataTable, type ColumnDef } from '@/components/analytics/DataTable'
import { useToast } from '@/hooks/use-toast'
import { useCurrentMember } from '@/hooks/useCurrentMember'
import {
  useChronaDevices,
  useChronaPairingCodes,
  useGenerateChronaPairingCode,
  useRenameChronaDevice,
  useRevokeChronaDevice,
} from '@/hooks/useChronaDevices'
import { formatRelativeTime } from '@/lib/chrona/format'
import type { ChronaDevice, ChronaPairingCode } from '@/lib/chrona/types'

type DeviceRow = ChronaDevice & { id: string }

function expiresInLabel(code: ChronaPairingCode): string {
  const expires = new Date(code.expires_at).getTime()
  const minutes = Math.floor((expires - Date.now()) / 60000)
  if (Number.isNaN(expires) || minutes < 0) return 'Expired'
  if (minutes < 1) return 'Expires in <1m'
  return `Expires in ${minutes}m`
}

export default function ChronaDevicesPage() {
  const { toast } = useToast()
  const { canWrite } = useCurrentMember()

  const devicesQuery = useChronaDevices()
  const codesQuery = useChronaPairingCodes()
  const generateCode = useGenerateChronaPairingCode()
  const renameDevice = useRenameChronaDevice()
  const revokeDevice = useRevokeChronaDevice()

  // Generate-pairing-code dialog
  const [pairOpen, setPairOpen] = useState(false)
  const [pairName, setPairName] = useState('')
  const [mintedCode, setMintedCode] = useState<ChronaPairingCode | null>(null)

  // Rename dialog
  const [renameTarget, setRenameTarget] = useState<DeviceRow | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Revoke confirm
  const [revokeTarget, setRevokeTarget] = useState<DeviceRow | null>(null)
  const [purgeCards, setPurgeCards] = useState(false)

  const devices = useMemo<DeviceRow[]>(
    () => (devicesQuery.data?.devices ?? []).map((d) => ({ ...d, id: d.id })),
    [devicesQuery.data],
  )
  const activeCodes = codesQuery.data?.codes ?? []

  const handleOpenPairDialog = (open: boolean) => {
    setPairOpen(open)
    if (!open) {
      setPairName('')
      setMintedCode(null)
    }
  }

  const handleGenerateCode = async () => {
    const trimmed = pairName.trim()
    if (!trimmed) return
    try {
      const result = await generateCode.mutateAsync({ display_name: trimmed })
      setMintedCode(result)
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to generate pairing code.',
        variant: 'destructive',
      })
    }
  }

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      toast({ title: 'Copied', description: 'Pairing code copied to clipboard.' })
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Could not copy the pairing code.',
        variant: 'destructive',
      })
    }
  }

  const handleRename = async () => {
    if (!renameTarget) return
    const trimmed = renameValue.trim()
    if (!trimmed || trimmed === renameTarget.display_name) {
      setRenameTarget(null)
      return
    }
    try {
      await renameDevice.mutateAsync({ deviceId: renameTarget.id, displayName: trimmed })
      toast({ title: 'Device renamed', description: `Now showing as “${trimmed}”.` })
      setRenameTarget(null)
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to rename the device.',
        variant: 'destructive',
      })
    }
  }

  const handleRevoke = async () => {
    if (!revokeTarget) return
    try {
      await revokeDevice.mutateAsync({ deviceId: revokeTarget.id, purge: purgeCards })
      toast({
        title: 'Device revoked',
        description: purgeCards
          ? `${revokeTarget.display_name} can no longer sync; its synced data was deleted.`
          : `${revokeTarget.display_name} can no longer sync.`,
      })
      setRevokeTarget(null)
      setPurgeCards(false)
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to revoke the device.',
        variant: 'destructive',
      })
    }
  }

  const columns: ColumnDef<DeviceRow>[] = [
    {
      header: 'Device',
      accessorKey: 'display_name',
      sortable: true,
      cell: (value, row) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{value}</span>
          {row.revoked ? (
            <Badge variant="destructive">Revoked</Badge>
          ) : (
            <Badge variant="secondary">Active</Badge>
          )}
        </div>
      ),
    },
    {
      header: 'Platform',
      accessorKey: 'platform',
      cell: (value, row) => (
        <span className="text-foreground-muted">
          {value ?? 'Unknown'}
          {row.app_version ? ` · v${row.app_version}` : ''}
        </span>
      ),
    },
    {
      header: 'Last seen',
      accessorKey: 'last_seen_at',
      sortable: true,
      cell: (value) => <span className="text-foreground-muted">{formatRelativeTime(value)}</span>,
    },
    {
      header: 'Last sync',
      accessorKey: 'last_sync_at',
      sortable: true,
      cell: (value) => <span className="text-foreground-muted">{formatRelativeTime(value)}</span>,
    },
    {
      header: 'Syncs',
      accessorKey: 'sync_count',
      sortable: true,
      cell: (value) => <span className="tabular-nums">{value}</span>,
    },
    {
      header: 'Token',
      accessorKey: 'token_prefix',
      cell: (value) => <span className="font-mono text-xs text-foreground-subtle">{value}</span>,
    },
  ]

  const isLoading = devicesQuery.isLoading || codesQuery.isLoading

  return (
    <div className="space-y-8 pb-12">
      <PageHeader
        eyebrow={
          <Link
            href="/dashboard/analytics/chrona"
            className="inline-flex items-center gap-1 text-foreground-subtle transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3" aria-hidden />
            Time Tracking
          </Link>
        }
        title="Chrona Devices"
        description="Pair Chrona desktop installs and manage their sync access. Screenshots never leave the device — only timeline cards sync."
        actions={
          canWrite ? (
            <Button type="button" onClick={() => handleOpenPairDialog(true)}>
              <Plus className="mr-2 size-4" aria-hidden />
              Generate pairing code
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <LoadingState variant="table" label="Loading devices" />
      ) : devicesQuery.isError ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          <p>
            {devicesQuery.error instanceof Error
              ? devicesQuery.error.message
              : 'Failed to load devices.'}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => devicesQuery.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : (
        <>
          {activeCodes.length > 0 && (
            <Section
              variant="card"
              title="Active pairing codes"
              description="Single-use codes waiting to be entered in Chrona. Codes expire 15 minutes after they are generated."
            >
              <ul className="space-y-2">
                {activeCodes.map((code) => (
                  <li
                    key={code.code}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-muted p-3"
                  >
                    <div className="flex items-center gap-3">
                      <KeyRound className="size-4 text-foreground-subtle" aria-hidden />
                      <div>
                        <p className="font-mono text-sm font-semibold tracking-widest text-foreground">
                          {code.code}
                        </p>
                        <p className="text-xs text-foreground-muted">
                          {code.display_name} · {expiresInLabel(code)}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopyCode(code.code)}
                    >
                      <Copy className="mr-2 size-3.5" aria-hidden />
                      Copy
                    </Button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {devices.length === 0 ? (
            <EmptyState
              icon={MonitorSmartphone}
              title="No devices paired yet"
              description={
                canWrite
                  ? 'Generate a pairing code and enter it in Chrona under Settings → Sync to pair the first device.'
                  : 'Ask an admin, manager, or analyst to generate a pairing code.'
              }
              action={
                canWrite ? (
                  <Button type="button" onClick={() => handleOpenPairDialog(true)}>
                    <Plus className="mr-2 size-4" aria-hidden />
                    Generate pairing code
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <DataTable
              data={devices}
              columns={columns}
              title="Paired devices"
              description="Chrona installs syncing timeline cards into this firm."
              searchPlaceholder="Search devices..."
              rowActions={
                canWrite
                  ? (row) => (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Rename ${row.display_name}`}
                          onClick={() => {
                            setRenameTarget(row)
                            setRenameValue(row.display_name)
                          }}
                        >
                          <Pencil className="size-4" aria-hidden />
                        </Button>
                        {!row.revoked && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Revoke ${row.display_name}`}
                            className="text-destructive hover:text-destructive"
                            onClick={() => {
                              setRevokeTarget(row)
                              setPurgeCards(false)
                            }}
                          >
                            <Ban className="size-4" aria-hidden />
                          </Button>
                        )}
                      </div>
                    )
                  : undefined
              }
            />
          )}
        </>
      )}

      {/* Generate pairing code */}
      <Dialog open={pairOpen} onOpenChange={handleOpenPairDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate pairing code</DialogTitle>
            <DialogDescription>
              {mintedCode
                ? 'Share this single-use code with the Chrona user. It expires in 15 minutes.'
                : 'Name the device (e.g. the team member using it), then share the code with them.'}
            </DialogDescription>
          </DialogHeader>

          {mintedCode ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-surface-muted p-6 text-center">
                <p className="font-mono text-3xl font-bold tracking-[0.3em] text-foreground">
                  {mintedCode.code}
                </p>
                <p className="mt-2 text-xs text-foreground-muted">
                  {mintedCode.display_name} · {expiresInLabel(mintedCode)}
                </p>
              </div>
              <p className="text-xs text-foreground-muted">
                In Chrona, open Settings → Sync and enter this code to pair the device.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="chrona-device-name">Device name</Label>
              <Input
                id="chrona-device-name"
                value={pairName}
                onChange={(e) => setPairName(e.target.value)}
                placeholder="e.g. Dana's MacBook"
                maxLength={255}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleGenerateCode()
                  }
                }}
              />
            </div>
          )}

          <DialogFooter>
            {mintedCode ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleCopyCode(mintedCode.code)}
                >
                  <Copy className="mr-2 size-4" aria-hidden />
                  Copy code
                </Button>
                <Button type="button" onClick={() => handleOpenPairDialog(false)}>
                  Done
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenPairDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleGenerateCode}
                  disabled={!pairName.trim() || generateCode.isPending}
                >
                  {generateCode.isPending ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                      Generating…
                    </>
                  ) : (
                    'Generate code'
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename device */}
      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => !open && setRenameTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename device</DialogTitle>
            <DialogDescription>
              Shown on the time tracking dashboard and device list.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="chrona-rename">Device name</Label>
            <Input
              id="chrona-rename"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              maxLength={255}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleRename()
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleRename}
              disabled={!renameValue.trim() || renameDevice.isPending}
            >
              {renameDevice.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  Saving…
                </>
              ) : (
                'Save'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke device */}
      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open && !revokeDevice.isPending) {
            setRevokeTarget(null)
            setPurgeCards(false)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {revokeTarget?.display_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The device&apos;s sync token stops working immediately. To sync again, the
              device must be re-paired with a new code.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-start gap-2 text-sm text-foreground">
            <Checkbox
              checked={purgeCards}
              onCheckedChange={(checked) => setPurgeCards(checked === true)}
              className="mt-0.5"
            />
            <span>
              Also delete this device&apos;s synced timeline cards
              <span className="block text-xs text-foreground-muted">
                Removes its data from the dashboard permanently.
              </span>
            </span>
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeDevice.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={revokeDevice.isPending}
            >
              {revokeDevice.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  Revoking…
                </>
              ) : (
                'Revoke'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
