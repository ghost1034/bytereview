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
        return <CheckCircle className="w-4 h-4 text-green-600" />
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-600" />
      case 'running':
        return <Play className="w-4 h-4 text-blue-600" />
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-600" />
      default:
        return <AlertCircle className="w-4 h-4 text-gray-600" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'failed':
        return 'bg-red-100 text-red-800'
      case 'running':
        return 'bg-blue-100 text-blue-800'
      case 'pending':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
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
              <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No runs yet</h3>
              <p className="text-gray-600">
                This automation hasn't been triggered yet. It will run automatically when matching emails are received.
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
                        
                        <div className="text-sm text-gray-600 space-y-1">
                          <div>
                            <strong>Triggered:</strong> {format(new Date(run.triggered_at), 'PPp')}
                            {' '}({formatDistanceToNow(new Date(run.triggered_at), { addSuffix: true })})
                          </div>
                          
                          {run.completed_at && (
                            <div>
                              <strong>Completed:</strong> {format(new Date(run.completed_at), 'PPp')}
                              {getDuration(run) && (
                                <span className="ml-2 text-xs bg-gray-100 px-2 py-1 rounded">
                                  Duration: {getDuration(run)}
                                </span>
                              )}
                            </div>
                          )}
                          
                          {run.error_message && (
                            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-800 text-xs">
                              <strong>Error:</strong> {run.error_message}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="text-right text-sm text-gray-500">
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
          <div className="border-t pt-4">
            <div className="flex justify-between text-sm text-gray-600">
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