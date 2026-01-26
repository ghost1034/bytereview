'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle
} from '@/components/ui/resizable'
import { Button } from '@/components/ui/button'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { Plus, Trash2, ChevronDown, Loader2, Download, FileSpreadsheet, Pencil, Info } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import {
  useCpeStates,
  useCpeSheets,
  useCreateCpeSheet,
  useDeleteCpeSheet,
  useStartCpeSheet,
  useRenameCpeSheet
} from '@/hooks/useCpe'
import { useJobDetails } from '@/hooks/useJobs'
import { EditableResultsTable } from '@/components/results/EditableResultsTable'
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
  const [activeRunId, setActiveRunId] = useState<string | undefined>()

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createTemplate, setCreateTemplate] = useState<{ templateId: string; templateName: string } | null>(null)
  const [createSheetName, setCreateSheetName] = useState('')

  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<{ jobId: string; currentName: string } | null>(null)
  const [renameSheetName, setRenameSheetName] = useState('')

  // Queries
  const { data: statesData, isLoading: statesLoading } = useCpeStates()
  const { data: sheetsData, isLoading: sheetsLoading, refetch: refetchSheets } = useCpeSheets()

  // Get selected sheet details
  const selectedSheet = sheetsData?.sheets.find(s => s.job_id === selectedJobId)
  const { refetch: refetchJobDetails } = useJobDetails(
    selectedJobId || undefined,
    activeRunId || selectedSheet?.latest_run_id
  )

  // Derive processing state from server (not local state)
  // This ensures the UI reflects the correct state even after page refresh
  const isProcessing = selectedSheet?.status === 'in_progress'

  // Mutations
  const createSheet = useCreateCpeSheet()
  const deleteSheet = useDeleteCpeSheet()
  const startSheet = useStartCpeSheet()
  const renameSheet = useRenameCpeSheet()

  // Auto-select first sheet if none selected
  useEffect(() => {
    if (!selectedJobId && sheetsData?.sheets.length) {
      const firstSheet = sheetsData.sheets[0]
      router.replace(`/dashboard/cpe-tracker?job_id=${firstSheet.job_id}`)
    }
  }, [selectedJobId, sheetsData, router])

  // Update activeRunId when sheet changes
  // Always sync to latest_run_id - the backend creates new runs on completion
  useEffect(() => {
    if (selectedSheet?.latest_run_id) {
      setActiveRunId(selectedSheet.latest_run_id)
    }
  }, [selectedSheet?.latest_run_id])

  // Poll for status updates when processing
  // The backend auto-creates the next run on completion, we just need to refetch
  useEffect(() => {
    if (!isProcessing || !selectedJobId) return

    const pollInterval = setInterval(async () => {
      // Refetch sheets to get latest status and latest_run_id
      // Backend creates new run on completion, so latest_run_id will change
      await refetchSheets()
      // Also refetch job details to update results display
      await refetchJobDetails()
      queryClient.invalidateQueries({ queryKey: ['job-results', selectedJobId] })
    }, 2000)

    return () => clearInterval(pollInterval)
  }, [isProcessing, selectedJobId, refetchSheets, refetchJobDetails, queryClient])

  const handleCreateSheet = async (templateId: string, name?: string) => {
    const result = await createSheet.mutateAsync({ templateId, name })
    toast({
      title: 'CPE Sheet Created',
      description: result.message
    })
    router.replace(`/dashboard/cpe-tracker?job_id=${result.job_id}`)
    setActiveRunId(result.run_id)
  }

  const handleOpenCreateDialog = (templateId: string, templateName: string) => {
    setCreateTemplate({ templateId, templateName })
    setCreateSheetName(templateName)
    setCreateDialogOpen(true)
  }

  const handleConfirmCreate = async () => {
    if (!createTemplate) return
    const name = createSheetName.trim()
    try {
      await handleCreateSheet(createTemplate.templateId, name || undefined)
      setCreateDialogOpen(false)
      setCreateTemplate(null)
      setCreateSheetName('')
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create CPE sheet',
        variant: 'destructive'
      })
    }
  }

  const handleConfirmRename = async () => {
    if (!renameTarget) return
    const name = renameSheetName.trim()
    if (!name) {
      toast({
        title: 'Name required',
        description: 'Please enter a name for this CPE sheet.',
        variant: 'destructive'
      })
      return
    }

    try {
      await renameSheet.mutateAsync({ jobId: renameTarget.jobId, name })
      toast({
        title: 'Renamed',
        description: 'CPE sheet name updated.'
      })
      setRenameDialogOpen(false)
      setRenameTarget(null)
      setRenameSheetName('')
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to rename CPE sheet',
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
      const result = await startSheet.mutateAsync(selectedJobId)
      setActiveRunId(result.active_run_id)
      // Refetch sheets to update status to 'in_progress'
      await refetchSheets()
      toast({
        title: 'Processing Started',
        description: result.message
      })
    } catch (error: any) {
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

  return (
    <div className="h-[calc(100vh-4rem)] p-4">
      <ResizablePanelGroup direction="horizontal" className="h-full rounded-lg border">
        {/* Left Panel: Sheet List */}
        <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
          <div className="flex h-full flex-col">
            {/* Header with Create Button */}
            <div className="border-b p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">CPE Sheets</h2>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center text-muted-foreground hover:text-foreground"
                        aria-label="CPE templates info"
                      >
                        <Info className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      You can create your own CPE templates on the{' '}
                      <Link href="/dashboard/templates" className="underline">
                        Templates
                      </Link>{' '}
                      page.
                    </TooltipContent>
                  </Tooltip>
                </div>
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
                        onClick={() => handleOpenCreateDialog(state.template_id, state.name)}
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
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation()
                            setRenameTarget({ jobId: sheet.job_id, currentName: sheet.name })
                            setRenameSheetName(sheet.name)
                            setRenameDialogOpen(true)
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation()
                            setJobToDelete(sheet.job_id)
                            setDeleteDialogOpen(true)
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
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
                      readOnly={isProcessing}
                      isLatestSelected={true}
                      hideFooter={true}
                      fileListScope="allRuns"
                      onUploadConflict={() => {
                        // Refetch sheets to get the latest run (backend auto-creates on completion)
                        refetchSheets()
                      }}
                    />
                  </div>
                  <div className="border-t p-4">
                    <Button
                      className="w-full"
                      onClick={handleStart}
                      disabled={isProcessing || startSheet.isPending}
                    >
                      {isProcessing || startSheet.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Processing...
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
                    <EditableResultsTable jobId={selectedJobId as string} runId={activeRunId} readOnly={isProcessing} />
                    {isProcessing && (
                      <div className="px-4 py-2 text-xs text-muted-foreground">
                        Processing in progress. Editing is disabled.
                      </div>
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

      {/* Create Sheet Dialog */}
      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open)
          if (!open) {
            setCreateTemplate(null)
            setCreateSheetName('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create CPE Sheet</DialogTitle>
            <DialogDescription>
              {createTemplate ? `Based on ${createTemplate.templateName}.` : 'Choose a name for your new sheet.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cpe-sheet-name">Sheet name</Label>
            <Input
              id="cpe-sheet-name"
              value={createSheetName}
              onChange={(e) => setCreateSheetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmCreate()
              }}
              placeholder={createTemplate?.templateName || 'CPE Sheet'}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateDialogOpen(false)
                setCreateTemplate(null)
                setCreateSheetName('')
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmCreate} disabled={createSheet.isPending}>
              {createSheet.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Sheet Dialog */}
      <Dialog
        open={renameDialogOpen}
        onOpenChange={(open) => {
          setRenameDialogOpen(open)
          if (!open) {
            setRenameTarget(null)
            setRenameSheetName('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename CPE Sheet</DialogTitle>
            <DialogDescription>Update the name shown in your CPE sheets list and exports.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cpe-sheet-rename">Sheet name</Label>
            <Input
              id="cpe-sheet-rename"
              value={renameSheetName}
              onChange={(e) => setRenameSheetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmRename()
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRenameDialogOpen(false)
                setRenameTarget(null)
                setRenameSheetName('')
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmRename} disabled={renameSheet.isPending}>
              {renameSheet.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
