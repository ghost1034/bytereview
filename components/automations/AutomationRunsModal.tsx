"use client"

import React from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAutomationRuns, useAutomation } from "@/hooks/useAutomations"
import { formatDistanceToNow, format } from "date-fns"
import { CheckCircle, XCircle, Clock, Play, AlertCircle } from "lucide-react"

interface AutomationRunsModalProps {
  automationId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AutomationRunsModal({ automationId, open, onOpenChange }: AutomationRunsModalProps) {
  const { data: automation, isLoading: automationLoading } = useAutomation(automationId)
  const { data: runs, isLoading: runsLoading, refetch } = useAutomationRuns(automationId)
  
  // Refetch runs data when modal opens
  React.useEffect(() => {
    if (open && automationId) {
      refetch()
    }
  }, [open, automationId, refetch])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-success" aria-hidden />
      case 'failed':
        return <XCircle className="w-4 h-4 text-destructive" aria-hidden />
      case 'running':
        return <Play className="w-4 h-4 text-info" aria-hidden />
      case 'pending':
        return <Clock className="w-4 h-4 text-warning" aria-hidden />
      default:
        return <AlertCircle className="w-4 h-4 text-foreground-muted" aria-hidden />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-success-soft text-success border-success/20'
      case 'failed':
        return 'bg-destructive-soft text-destructive border-destructive/20'
      case 'running':
        return 'bg-info-soft text-info border-info/20'
      case 'pending':
        return 'bg-warning-soft text-warning border-warning/20'
      default:
        return 'bg-surface-muted text-foreground-muted border-border'
    }
  }

  const getDuration = (run: any) => {
    if (!run.completed_at) return null
    const start = new Date(run.triggered_at)
    const end = new Date(run.completed_at)
    const duration = end.getTime() - start.getTime()
    const seconds = Math.floor(duration / 1000)
    const minutes = Math.floor(seconds / 60)
    
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    }
    return `${seconds}s`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Automation Runs</DialogTitle>
          <DialogDescription>
            {automationLoading ? (
              <span className="inline-block h-4 w-64 bg-muted animate-pulse rounded-md"></span>
            ) : (
              `Execution history for "${automation?.name}"`
            )}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          {runsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-4 w-4 rounded-full" />
                          <Skeleton className="h-4 w-20" />
                        </div>
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-4 w-32" />
                      </div>
                      <Skeleton className="h-6 w-16" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : !runs || runs.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="w-12 h-12 text-foreground-subtle mx-auto mb-4" aria-hidden />
              <h3 className="text-lg font-semibold mb-2 text-foreground">No runs yet</h3>
              <p className="text-foreground-muted">
                This automation hasn&apos;t been triggered yet. It will run automatically when matching emails are received.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {runs.map((run) => (
                <Card key={run.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(run.status)}
                          <span className="font-medium">
                            Run {run.id.slice(0, 8)}
                          </span>
                          <Badge variant="outline" className={getStatusColor(run.status)}>
                            {run.status}
                          </Badge>
                        </div>
                        
                        <div className="text-sm text-foreground-muted space-y-1">
                          <div>
                            <strong className="text-foreground">Triggered:</strong> {format(new Date(run.triggered_at), 'PPp')}
                            {' '}({formatDistanceToNow(new Date(run.triggered_at), { addSuffix: true })})
                          </div>

                          {run.completed_at && (
                            <div>
                              <strong className="text-foreground">Completed:</strong> {format(new Date(run.completed_at), 'PPp')}
                              {getDuration(run) && (
                                <span className="ml-2 text-xs bg-surface-muted text-foreground px-2 py-1 rounded">
                                  Duration: {getDuration(run)}
                                </span>
                              )}
                            </div>
                          )}

                          {run.error_message && (
                            <div className="mt-2 p-2 bg-destructive-soft border border-destructive/20 rounded text-destructive text-xs">
                              <strong>Error:</strong> {run.error_message}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="text-right text-sm text-foreground-subtle">
                        <div>Run: {run.job_run_id?.slice?.(0, 8) ?? 'unknown'}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>

        {runs && runs.length > 0 && (
          <div className="border-t border-border pt-4">
            <div className="flex justify-between text-sm text-foreground-muted">
              <span>Total runs: {runs.length}</span>
              <div className="flex gap-4">
                <span>Completed: {runs.filter(r => r.status === 'completed').length}</span>
                <span>Failed: {runs.filter(r => r.status === 'failed').length}</span>
                <span>Running: {runs.filter(r => r.status === 'running').length}</span>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}