'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Database, Download, Loader2, Shield, Trash2 } from 'lucide-react'

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
import { Section } from '@/components/ui/section'
import { useToast } from '@/hooks/use-toast'
import { useAnalyticsFirm } from '@/hooks/useAnalyticsTeam'
import { useExportFirmData, usePurgeFirm } from '@/hooks/useAnalyticsSettings'
import { useAuth } from '@/contexts/AuthContext'
import { isAdmin } from '@/lib/analytics/labels'

const SECURITY_CONTROLS = [
  'Data encrypted at rest (AES-256)',
  'Data encrypted in transit (TLS 1.3)',
  'Database-level row security (Tenant Isolation)',
  'No PII / financial data in application logs',
]

export function ComplianceTab() {
  const { user } = useAuth()
  const { data: firmData } = useAnalyticsFirm()
  const exportMutation = useExportFirmData()
  const purgeMutation = usePurgeFirm()
  const { toast } = useToast()
  const router = useRouter()

  const firm = firmData?.firm
  const currentRole = firmData?.members?.find((m) => m.user_id === user?.uid)?.role
  const admin = isAdmin(currentRole)

  const [purgeStep, setPurgeStep] = useState<0 | 1 | 2>(0)

  const handleExport = async () => {
    try {
      const payload = await exportMutation.mutateAsync()
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const firmId = firm?.id ?? 'firm'
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      a.download = `firm_${firmId}_export_${timestamp}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast({ title: 'Export ready', description: 'Your firm data has been downloaded.' })
    } catch (error) {
      toast({
        title: 'Export failed',
        description: error instanceof Error ? error.message : 'Could not export data.',
        variant: 'destructive',
      })
    }
  }

  const handlePurge = async () => {
    try {
      await purgeMutation.mutateAsync()
      toast({
        title: 'Firm data purged',
        description: 'All firm data has been permanently deleted.',
      })
      setPurgeStep(0)
      router.push('/dashboard')
    } catch (error) {
      toast({
        title: 'Purge failed',
        description: error instanceof Error ? error.message : 'Could not purge data.',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6">
      <Section
        variant="card"
        title={
          <span className="flex items-center gap-2">
            <Shield className="size-4 text-primary" aria-hidden />
            Data privacy & GDPR
          </span>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-muted/40 p-4">
            <div className="min-w-0">
              <p className="font-semibold text-foreground">Right to data export</p>
              <p className="text-sm text-foreground-muted">
                Download a machine-readable JSON snapshot of every firm record.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={exportMutation.isPending || !admin}
              title={admin ? undefined : 'Admins only'}
            >
              {exportMutation.isPending ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />
              ) : (
                <Download className="mr-1.5 size-4" aria-hidden />
              )}
              {exportMutation.isPending ? 'Exporting…' : 'Export all data'}
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <div className="min-w-0">
              <p className="font-semibold text-destructive">Right to deletion</p>
              <p className="text-sm text-destructive/80">
                Permanently purge every record tied to this firm. This cannot be undone.
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={() => setPurgeStep(1)}
              disabled={purgeMutation.isPending || !admin}
              title={admin ? undefined : 'Admins only'}
            >
              <Trash2 className="mr-1.5 size-4" aria-hidden />
              Purge firm data
            </Button>
          </div>
        </div>
      </Section>

      <Section
        variant="card"
        title={
          <span className="flex items-center gap-2">
            <Database className="size-4 text-primary" aria-hidden />
            Security controls
          </span>
        }
      >
        <ul className="space-y-2">
          {SECURITY_CONTROLS.map((control) => (
            <li
              key={control}
              className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
            >
              <span className="flex items-center gap-2">
                <Shield className="size-4 text-success" aria-hidden />
                {control}
              </span>
              <span className="rounded-full border border-success/20 bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">
                Active
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <AlertDialog
        open={purgeStep > 0}
        onOpenChange={(open) => !open && setPurgeStep(0)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              {purgeStep === 1 ? 'Permanent data deletion' : 'Final warning'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {purgeStep === 1
                ? 'Are you absolutely sure you want to permanently delete all firm data? This action cannot be undone.'
                : 'This will WIPE every client, project, analysis, waterfall, reconciliation, amortization, chat session, journal entry, and audit log for this firm. Are you REALLY sure?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={purgeMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                if (purgeStep === 1) {
                  setPurgeStep(2)
                } else {
                  void handlePurge()
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={purgeMutation.isPending}
            >
              {purgeMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  Purging…
                </>
              ) : purgeStep === 1 ? (
                'Yes, I am sure'
              ) : (
                'WIPE ALL DATA'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
