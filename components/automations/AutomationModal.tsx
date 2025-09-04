"use client"

import { useState, useEffect } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { useCreateAutomation, useUpdateAutomation, useAutomation } from "@/hooks/useAutomations"
import { useJobs } from "@/hooks/useJobs"
import { useGoogleIntegration } from "@/hooks/useGoogleIntegration"
import { Mail, HelpCircle } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { GoogleDriveFolderPicker } from "@/components/integrations/GoogleDriveFolderPicker"
import { Skeleton } from "@/components/ui/skeleton"

const automationSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
  trigger_type: z.enum(["gmail", "google_drive", "outlook", "onedrive", "sharepoint"]),
  gmail_query: z.string().optional(),
  job_id: z.string().min(1, "Please select a job template"),
  is_enabled: z.boolean().default(true),
  processing_mode: z.enum(["individual", "combined"]).default("individual"),
  keep_source_files: z.boolean().default(true),
  dest_type: z.enum(["none", "gdrive", "gmail", "outlook", "onedrive", "sharepoint"]),
  folder_id: z.string().optional(),
  to_email: z.string().email("Invalid email address").optional().or(z.literal("")),
  file_type: z.enum(["csv", "xlsx"]).default("csv"),
}).refine((data) => {
  // Gmail query is required only when trigger type is gmail
  if (data.trigger_type === "gmail") {
    return data.gmail_query && data.gmail_query.trim().length > 0;
  }
  return true;
}, {
  message: "Gmail query is required for Gmail trigger",
  path: ["gmail_query"]
}).refine((data) => {
  // Email is required when dest_type is gmail
  if (data.dest_type === "gmail") {
    return data.to_email && data.to_email.trim().length > 0;
  }
  return true;
}, {
  message: "Email address is required for Gmail export",
  path: ["to_email"]
})

type AutomationFormData = z.infer<typeof automationSchema>

interface AutomationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  automationId?: string // If provided, this is edit mode
}

export function AutomationModal({ open, onOpenChange, automationId }: AutomationModalProps) {
  const [selectedGDriveFolder, setSelectedGDriveFolder] = useState<{id: string, name: string} | null>(null)
  const [hydrated, setHydrated] = useState<boolean>(!automationId)
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  
  const isEditMode = !!automationId
  const { data: automation, isLoading: automationLoading } = useAutomation(automationId || "")
  const { data: jobs, isLoading: jobsLoading } = useJobs()
  const { status: googleStatus } = useGoogleIntegration()
  const createAutomation = useCreateAutomation()
  const updateAutomation = useUpdateAutomation()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    control,
    formState: { errors, isValid, isDirty }
  } = useForm<AutomationFormData>({
    resolver: zodResolver(automationSchema),
    defaultValues: {
      is_enabled: true,
      processing_mode: "individual",
      keep_source_files: true,
      dest_type: "none",
      file_type: "csv",
    },
    mode: "onChange"
  })

  const watchedDestType = watch("dest_type")
  const watchedJobId = watch("job_id")
  const watchedTriggerType = watch("trigger_type")

  // For conditional rendering, use the actual automation data as fallback when form isn't hydrated yet
  const effectiveDestType = watchedDestType || (isEditMode ? (automation?.dest_type || "none") : "none")
  const effectiveTriggerType = watchedTriggerType || (isEditMode ? (automation?.trigger_type === "gmail_attachment" ? "gmail" : automation?.trigger_type) : undefined)

  // For async Selects: avoid passing a value until options are loaded and contain the value
  const jobOptionsReady = !!jobs && !jobsLoading
  const safeJobSelectValue = jobOptionsReady && jobs?.jobs.some(j => j.id === watchedJobId) ? watchedJobId : undefined

  // When editing, hydrate form once data is ready and modal is open
  useEffect(() => {
    if (!isEditMode) return
    if (!open) return
    if (automationLoading || jobsLoading) return
    if (!automation) return

    const mappedTrigger = automation.trigger_type === "gmail_attachment" ? "gmail" : automation.trigger_type

    reset({
      name: automation.name,
      trigger_type: mappedTrigger as any,
      gmail_query: automation.trigger_config?.query || "",
      job_id: automation.job_id,
      is_enabled: automation.is_enabled,
      processing_mode: (automation.processing_mode as any) || "individual",
      keep_source_files: (automation.keep_source_files as any) ?? true,
      dest_type: automation.dest_type || "none",
      folder_id: automation.export_config?.folder_id || "",
      to_email: automation.export_config?.to_email || "",
      file_type: (automation.export_config?.file_type as any) || "csv",
    }, {
      keepErrors: false,
      keepDirty: false,
      keepIsSubmitted: false,
      keepTouched: false,
      keepIsValid: false,
      keepSubmitCount: false
    })

    setHydrated(true)

    if (automation.export_config?.folder_id) {
      // If we have a folder_id but no folder_name, we'll show the folder_id as a fallback
      // The GoogleDriveFolderPicker will handle fetching the actual name if needed
      setSelectedGDriveFolder({
        id: automation.export_config.folder_id,
        name: automation.export_config?.folder_name || `Folder (${automation.export_config.folder_id})`
      })
    } else {
      setSelectedGDriveFolder(null)
    }
  }, [isEditMode, open, automation, automationLoading, jobsLoading, reset])

  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      reset()
      setSelectedGDriveFolder(null)
    }
  }, [open, reset])

  const onSubmit = async (data: AutomationFormData) => {
    try {
      const automationData = {
        name: data.name,
        is_enabled: data.is_enabled,
        trigger_type: data.trigger_type === "gmail" ? "gmail_attachment" : data.trigger_type,
        trigger_config: data.trigger_type === "gmail" && data.gmail_query ? {
          query: data.gmail_query
        } : {},
        job_id: data.job_id,
        processing_mode: data.processing_mode,
        keep_source_files: data.keep_source_files,
        dest_type: data.dest_type === "none" ? undefined : data.dest_type,
        export_config: data.dest_type && data.dest_type !== "none" ? {
          ...(data.dest_type === "gdrive" && data.folder_id ? { 
            folder_id: data.folder_id,
            folder_name: selectedGDriveFolder?.name || undefined
          } : {}),
          ...(data.dest_type === "gdrive" ? { file_type: data.file_type } : {}),
          ...(data.dest_type === "gmail" && data.to_email ? { to_email: data.to_email } : {}),
        } : undefined
      }

      if (isEditMode) {
        await updateAutomation.mutateAsync({ id: automationId, data: automationData })
      } else {
        await createAutomation.mutateAsync(automationData)
      }
      
      handleClose()
    } catch (error) {
      // Error handling is done in the mutations
    }
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  // Helper functions for Gmail query quick actions
  const addToGmailQuery = (queryPart: string) => {
    const currentQuery = watch("gmail_query") || ""
    const newQuery = currentQuery ? `${currentQuery} ${queryPart}` : queryPart
    setValue("gmail_query", newQuery, { shouldValidate: true })
  }

  const setGmailQuery = (query: string) => {
    setValue("gmail_query", query, { shouldValidate: true })
  }

  // Handle Google Drive folder selection
  const handleGDriveFolderSelected = (folder: {id: string, name: string}) => {
    setSelectedGDriveFolder(folder)
    setValue("folder_id", folder.id, { shouldValidate: true, shouldDirty: true })
    setIsPickerOpen(false) // Picker closed after selection
  }

  // Show loading state for edit mode until all data needed to hydrate the form is ready
  if (isEditMode && open && (automationLoading || jobsLoading)) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Automation</DialogTitle>
            <DialogDescription>
              Update your automation configuration
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // Don't render if in edit mode but no automation data
  // If editing but data still not present while modal is open, render a lightweight skeleton
  if (isEditMode && open && !automation) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Automation</DialogTitle>
            <DialogDescription>
              Loading automation...
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  if (isEditMode && open && !hydrated) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Automation</DialogTitle>
            <DialogDescription>Loading configuration...</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open && !isPickerOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit Automation" : "Create New Automation"}</DialogTitle>
          <DialogDescription>
            {isEditMode ? "Update your automation configuration" : "Set up an automation to run extraction jobs automatically"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Basic Configuration */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Automation Name</Label>
              <Input
                id="name"
                placeholder="e.g., Process Invoice Attachments"
                {...register("name")}
              />
              {errors.name && (
                <p className="text-sm text-red-600">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="trigger_type">Trigger Type</Label>
              <Controller
                control={control}
                name="trigger_type"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(v) => field.onChange(v)}
                    disabled={isEditMode}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select what triggers this automation" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gmail">Gmail (Email Attachments)</SelectItem>
                      <SelectItem value="google_drive">Google Drive</SelectItem>
                      <SelectItem value="outlook">Outlook</SelectItem>
                      <SelectItem value="onedrive">OneDrive</SelectItem>
                      <SelectItem value="sharepoint">SharePoint</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.trigger_type && (
                <p className="text-sm text-red-600">{errors.trigger_type.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="job_id">Job Template</Label>
              <Controller
                control={control}
                name="job_id"
                render={({ field }) => {
                  const isReady = !!jobs && !jobsLoading
                  const valueInOptions = isReady && jobs?.jobs.some(j => j.id === field.value)
                  const value = valueInOptions ? field.value : undefined
                  return (
                    <Select
                      value={value}
                      onValueChange={(v) => field.onChange(v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a job template to use for processing" />
                      </SelectTrigger>
                      <SelectContent>
                        {jobsLoading ? (
                          <SelectItem value="loading" disabled>Loading jobs...</SelectItem>
                        ) : jobs?.jobs.length === 0 ? (
                          <SelectItem value="no-jobs" disabled>No job templates available</SelectItem>
                        ) : (
                          jobs?.jobs.map((job) => (
                            <SelectItem key={job.id} value={job.id}>
                              {job.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  )
                }}
              />
              {errors.job_id && (
                <p className="text-sm text-red-600">{errors.job_id.message}</p>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="is_enabled"
                checked={watch("is_enabled")}
                onCheckedChange={(checked) => setValue("is_enabled", checked, { shouldDirty: true })}
              />
              <Label htmlFor="is_enabled">Enable automation immediately</Label>
            </div>
          </div>

          <Separator />

          {/* Gmail Configuration - Only show when Gmail is selected */}
          {effectiveTriggerType === "gmail" && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-start gap-3">
                  <Mail className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-blue-900">How Email Automations Work</h4>
                    <p className="text-sm text-blue-700 mt-1">
                      Send or forward emails with attachments to <strong>document@cpaautomation.ai</strong>
                    </p>
                    <p className="text-sm text-blue-600 mt-2">
                      The system will match your sender email to your account and trigger automations based on your filters below.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="gmail_query">Gmail Search Query</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-4 h-4 text-gray-400" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="max-w-xs">
                          <p className="font-medium mb-2">Gmail Query Examples:</p>
                          <ul className="text-sm space-y-1">
                            <li>• <code>has:attachment</code> - Any email with attachments</li>
                            <li>• <code>from:supplier@company.com has:attachment</code> - From specific sender</li>
                            <li>• <code>subject:invoice has:attachment</code> - Subject contains "invoice"</li>
                            <li>• <code>has:attachment filename:pdf</code> - PDF attachments only</li>
                          </ul>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                {/* Quick Action Buttons */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Quick Templates</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setGmailQuery("has:attachment filename:pdf")}
                      className="text-xs"
                    >
                      PDF Files
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setGmailQuery("has:attachment filename:zip")}
                      className="text-xs"
                    >
                      ZIP Files
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setGmailQuery("has:attachment subject:invoice")}
                      className="text-xs"
                    >
                      Invoices
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setGmailQuery("has:attachment subject:receipt")}
                      className="text-xs"
                    >
                      Receipts
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setGmailQuery("has:attachment")}
                      className="text-xs"
                    >
                      Any Attachment
                    </Button>
                  </div>
                </div>

                <Textarea
                  id="gmail_query"
                  placeholder="has:attachment subject:invoice"
                  rows={3}
                  {...register("gmail_query")}
                />
                {errors.gmail_query && (
                  <p className="text-sm text-red-600">{errors.gmail_query.message}</p>
                )}
                <p className="text-sm text-gray-600">
                  Use Gmail search syntax to filter which emails trigger this automation.
                  <br />
                  Examples: "has:attachment", "subject:invoice", "filename:pdf"
                  <br />
                  <span className="text-xs text-gray-500">
                    Note: Sender filtering is automatic based on your account email
                  </span>
                </p>
              </div>
            </div>
          )}

          <Separator />

          {/* Processing Options */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="processing_mode">Processing Mode</Label>
              <Select
                value={watch("processing_mode")}
                onValueChange={(value: "individual" | "combined") => setValue("processing_mode", value, { shouldValidate: true, shouldDirty: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select processing mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individual Processing - Process each file in a folder separately</SelectItem>
                  <SelectItem value="combined">Combined Processing - Process all files in a folder together</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-gray-600">
                Choose how folders should be processed
              </p>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h4 className="font-medium">Keep source files</h4>
                <p className="text-sm text-gray-600">Store original files for future reference and reprocessing</p>
              </div>
              <Switch
                checked={watch("keep_source_files")}
                onCheckedChange={(checked) => setValue("keep_source_files", checked, { shouldValidate: true, shouldDirty: true })}
              />
            </div>
          </div>

          <Separator />

          {/* Export Configuration */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dest_type">Export Results</Label>
              <Controller
                control={control}
                name="dest_type"
                render={({ field }) => {
                  // Use the automation value directly if field value is empty/undefined
                  // Map null/undefined dest_type to "none" to match our form schema
                  const automationDestType = isEditMode ? (automation?.dest_type || "none") : undefined
                  const value = field.value || automationDestType
                  return (
                    <Select
                      value={value}
                      onValueChange={(v) => field.onChange(v)}
                    >
                    <SelectTrigger>
                      <SelectValue placeholder="Select export destination" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No automatic export</SelectItem>
                      <SelectItem value="gdrive" disabled={!googleStatus?.connected}>
                        Google Drive {!googleStatus?.connected && "(Not connected)"}
                      </SelectItem>
                      <SelectItem value="gmail">Gmail (Email results)</SelectItem>
                      <SelectItem value="outlook">Outlook</SelectItem>
                      <SelectItem value="onedrive">OneDrive</SelectItem>
                      <SelectItem value="sharepoint">SharePoint</SelectItem>
                    </SelectContent>
                  </Select>
                  )
                }}
              />
              <p className="text-sm text-gray-600">
                Choose where to automatically export the extraction results
              </p>
            </div>

            {/* Google Drive Export Configuration */}
            {effectiveDestType === "gdrive" && (
              <div className="space-y-4 p-4 bg-blue-50 rounded-lg border">
                <h4 className="font-medium text-blue-900">Google Drive Export Settings</h4>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Destination Folder</Label>
                    <GoogleDriveFolderPicker
                      onFolderSelected={handleGDriveFolderSelected}
                      selectedFolder={selectedGDriveFolder}
                      showCard={false}
                      buttonText={selectedGDriveFolder ? selectedGDriveFolder.name : "Select Destination Folder"}
                      onPickerStateChange={setIsPickerOpen}
                    />
                    <p className="text-sm text-gray-600">
                      Choose the Google Drive folder where results will be saved. If no folder is selected, files will be saved to My Drive.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="file_type">File Format</Label>
                    <Select
                      value={watch("file_type") || "csv"}
                      onValueChange={(value: "csv" | "xlsx") => setValue("file_type", value, { shouldValidate: true, shouldDirty: true })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select file format" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="csv">CSV (.csv)</SelectItem>
                        <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-gray-600">
                      Choose the format for exported files
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Gmail Export Configuration */}
            {effectiveDestType === "gmail" && (
              <div className="space-y-4 p-4 bg-red-50 rounded-lg border">
                <h4 className="font-medium text-red-900">Gmail Export Settings</h4>
                
                <div className="space-y-2">
                  <Label htmlFor="to_email">Email Address</Label>
                  <Input
                    id="to_email"
                    type="email"
                    placeholder="recipient@example.com"
                    {...register("to_email")}
                  />
                  {errors.to_email && (
                    <p className="text-sm text-red-600">{errors.to_email.message}</p>
                  )}
                  <p className="text-sm text-gray-600">
                    Email address where results will be sent
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={
                !isValid || 
                (isEditMode && !isDirty) ||
                createAutomation.isPending || 
                updateAutomation.isPending
              }
            >
              {createAutomation.isPending || updateAutomation.isPending 
                ? (isEditMode ? "Updating..." : "Creating...") 
                : (isEditMode ? "Update Automation" : "Create Automation")
              }
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}