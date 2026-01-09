'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle
} from '@/components/ui/resizable'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { Plus, Trash2, ChevronDown, Loader2, Download, FileSpreadsheet } from 'lucide-react'
import { cn } from '@/lib/utils'

import { useCpeStates, useCpeSheets, useCreateCpeSheet, useDeleteCpeSheet, useStartCpeSheet } from '@/hooks/useCpe'
import { useJobDetails } from '@/hooks/useJobs'
import { CpeResultsTable } from '@/components/cpe/CpeResultsTable'
import EnhancedFileUpload from '@/components/workflow/steps/EnhancedFileUpload'
import { apiClient, JobFileInfo } from '@/lib/api'

export default function CpeTrackerPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // Get selected job from URL
  const selectedJobId = searchParams.get('job_id')

  // State
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [jobToDelete, setJobToDelete] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [activeRunId, setActiveRunId] = useState<string | undefined>()
  const [processingRunId, setProcessingRunId] = useState<string | undefined>()
  const [isPreparingNextRun, setIsPreparingNextRun] = useState(false)

  // Queries
  const { data: statesData, isLoading: statesLoading } = useCpeStates()
  const { data: sheetsData, isLoading: sheetsLoading, refetch: refetchSheets } = useCpeSheets()

  // Get selected sheet details
  const selectedSheet = sheetsData?.sheets.find(s => s.job_id === selectedJobId)
  const { data: jobDetails, refetch: refetchJobDetails } = useJobDetails(
    selectedJobId || undefined,
    activeRunId || selectedSheet?.latest_run_id
  )

  // Mutations
  const createSheet = useCreateCpeSheet()
  const deleteSheet = useDeleteCpeSheet()
  const startSheet = useStartCpeSheet()

  // Auto-select first sheet if none selected
  useEffect(() => {
    if (!selectedJobId && sheetsData?.sheets.length) {
      const firstSheet = sheetsData.sheets[0]
      router.replace(`/dashboard/cpe-tracker?job_id=${firstSheet.job_id}`)
    }
  }, [selectedJobId, sheetsData, router])

  // Update activeRunId when sheet changes
  // Only sync when not processing to avoid race conditions
  useEffect(() => {
    if (!isProcessing && !isPreparingNextRun && selectedSheet?.latest_run_id) {
      setActiveRunId(selectedSheet.latest_run_id)
    }
  }, [selectedSheet, isProcessing, isPreparingNextRun])

  // Poll for job status when processing
  useEffect(() => {
    if (!isProcessing || !selectedJobId) return

    const pollInterval = setInterval(async () => {
      // Use the return value from refetch to get fresh data (avoid stale closure)
      const { data: freshData } = await refetchJobDetails()
      const status = freshData?.status
      if (status === 'completed' || status === 'failed' || status === 'partially_completed') {
        // Keep uploads blocked while preparing next run
        setIsPreparingNextRun(true)

        try {
          // Create next append run so new uploads go to the right place
          const newRun = await apiClient.createJobRun(selectedJobId, {
            clone_from_run_id: processingRunId ?? activeRunId,
            append_results: true
          })

          // Switch to new run before re-enabling uploads
          setActiveRunId(newRun.run_id)
        } catch (error) {
          console.error('Failed to create next run:', error)
          // Even if this fails, we need to clear processing state
        }

        // Clear processing state
        setIsProcessing(false)
        setProcessingRunId(undefined)
        setIsPreparingNextRun(false)

        // Refresh UI data
        await refetchSheets()
        queryClient.invalidateQueries({ queryKey: ['job-results', selectedJobId] })
      }
    }, 2000)

    return () => clearInterval(pollInterval)
  }, [isProcessing, selectedJobId, processingRunId, activeRunId, refetchJobDetails, refetchSheets, queryClient])

  const handleCreateSheet = async (templateId: string) => {
    try {
      const result = await createSheet.mutateAsync({ templateId })
      toast({
        title: 'CPE Sheet Created',
        description: result.message
      })
      router.replace(`/dashboard/cpe-tracker?job_id=${result.job_id}`)
      setActiveRunId(result.run_id)
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create CPE sheet',
        variant: 'destructive'
      })
    }
  }

  const handleDeleteSheet = async () => {
    if (!jobToDelete) return

    try {
      await deleteSheet.mutateAsync(jobToDelete)
      toast({
        title: 'CPE Sheet Deleted',
        description: 'The CPE sheet has been deleted'
      })
      setDeleteDialogOpen(false)
      setJobToDelete(null)

      // If we deleted the selected sheet, clear selection
      if (jobToDelete === selectedJobId) {
        router.replace('/dashboard/cpe-tracker')
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete CPE sheet',
        variant: 'destructive'
      })
    }
  }

  const handleStart = async () => {
    if (!selectedJobId) return

    try {
      setIsProcessing(true)
      const result = await startSheet.mutateAsync(selectedJobId)
      setActiveRunId(result.active_run_id)
      setProcessingRunId(result.active_run_id)
      toast({
        title: 'Processing Started',
        description: result.message
      })
    } catch (error: any) {
      setIsProcessing(false)
      toast({
        title: 'Error',
        description: error.message || 'Failed to start processing',
        variant: 'destructive'
      })
    }
  }

  const handleFilesReady = (files: JobFileInfo[]) => {
    // Files are ready for processing
    queryClient.invalidateQueries({ queryKey: ['job', selectedJobId] })
  }

  const handleExportCSV = async () => {
    if (!selectedJobId) return
    try {
      const { blob, filename } = await apiClient.exportJobCSV(selectedJobId, activeRunId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (error: any) {
      toast({
        title: 'Export Failed',
        description: error.message,
        variant: 'destructive'
      })
    }
  }

  const handleExportExcel = async () => {
    if (!selectedJobId) return
    try {
      const { blob, filename } = await apiClient.exportJobExcel(selectedJobId, activeRunId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (error: any) {
      toast({
        title: 'Export Failed',
        description: error.message,
        variant: 'destructive'
      })
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'in_progress':
        return 'bg-blue-100 text-blue-800'
      case 'failed':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="h-[calc(100vh-4rem)] p-4">
      <ResizablePanelGroup direction="horizontal" className="h-full rounded-lg border">
        {/* Left Panel: Sheet List */}
        <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
          <div className="flex h-full flex-col">
            {/* Header with Create Button */}
            <div className="border-b p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">CPE Sheets</h2>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" disabled={statesLoading || createSheet.isPending}>
                      {createSheet.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Plus className="mr-1 h-4 w-4" />
                          New
                          <ChevronDown className="ml-1 h-3 w-3" />
                        </>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {statesData?.states.map((state) => (
                      <DropdownMenuItem
                        key={state.template_id}
                        onClick={() => handleCreateSheet(state.template_id)}
                      >
                        {state.name}
                      </DropdownMenuItem>
                    ))}
                    {statesData?.states.length === 0 && (
                      <DropdownMenuItem disabled>
                        No states available
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Sheet List */}
            <ScrollArea className="flex-1">
              <div className="space-y-2 p-4">
                {sheetsLoading ? (
                  <>
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </>
                ) : sheetsData?.sheets.length === 0 ? (
                  <p className="text-center text-sm text-gray-500 py-8">
                    No CPE sheets yet. Click "New" to create one.
                  </p>
                ) : (
                  sheetsData?.sheets.map((sheet) => (
                    <div
                      key={sheet.job_id}
                      className={cn(
                        'group flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors',
                        selectedJobId === sheet.job_id
                          ? 'border-blue-500 bg-blue-50'
                          : 'hover:bg-gray-50'
                      )}
                      onClick={() => {
                        router.replace(`/dashboard/cpe-tracker?job_id=${sheet.job_id}`)
                        setActiveRunId(sheet.latest_run_id || undefined)
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{sheet.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {sheet.state_name && (
                            <span className="text-xs text-gray-500">{sheet.state_name}</span>
                          )}
                          <span className={cn('text-xs px-2 py-0.5 rounded-full', getStatusColor(sheet.status))}>
                            {sheet.status}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation()
                          setJobToDelete(sheet.job_id)
                          setDeleteDialogOpen(true)
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right Panel: Sheet Workspace */}
        <ResizablePanel defaultSize={75}>
          {!selectedJobId ? (
            <div className="flex h-full items-center justify-center text-gray-500">
              Select a CPE sheet or create a new one to get started
            </div>
          ) : (
            <ResizablePanelGroup direction="horizontal" className="h-full">
              {/* Upload Panel */}
              <ResizablePanel defaultSize={40} minSize={30}>
                <div className="flex h-full flex-col">
                  <div className="border-b p-4">
                    <h3 className="font-semibold">Upload Certificates</h3>
                    <p className="text-sm text-gray-500">
                      Upload CPE certificates to extract data from
                    </p>
                  </div>
                  <div className="flex-1 overflow-auto p-4">
                    <EnhancedFileUpload
                      jobId={selectedJobId}
                      runId={activeRunId}
                      onFilesReady={handleFilesReady}
                      readOnly={isProcessing || isPreparingNextRun}
                      isLatestSelected={true}
                      hideFooter={true}
                    />
                  </div>
                  <div className="border-t p-4">
                    <Button
                      className="w-full"
                      onClick={handleStart}
                      disabled={isProcessing || isPreparingNextRun || startSheet.isPending}
                    >
                      {isProcessing || isPreparingNextRun || startSheet.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {isPreparingNextRun ? 'Preparing...' : 'Processing...'}
                        </>
                      ) : (
                        'Start Extraction'
                      )}
                    </Button>
                  </div>
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle />

              {/* Results Panel */}
              <ResizablePanel defaultSize={60}>
                <div className="flex h-full flex-col">
                  <div className="border-b p-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">Results</h3>
                      <p className="text-sm text-gray-500">
                        Extracted CPE data from your certificates
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={handleExportCSV}>
                        <Download className="mr-1 h-4 w-4" />
                        CSV
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleExportExcel}>
                        <FileSpreadsheet className="mr-1 h-4 w-4" />
                        Excel
                      </Button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    {isProcessing ? (
                      <div className="flex h-full flex-col items-center justify-center gap-4">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                        <p className="text-gray-500">Extracting data from certificates...</p>
                      </div>
                    ) : (
                      <CpeResultsTable jobId={selectedJobId} runId={activeRunId} />
                    )}
                  </div>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete CPE Sheet?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the CPE sheet and all its data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSheet}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteSheet.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
