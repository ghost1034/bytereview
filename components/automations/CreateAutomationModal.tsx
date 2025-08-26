"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useCreateAutomation } from "@/hooks/useAutomations"
import { useJobs } from "@/hooks/useJobs"
import { useGoogleIntegration } from "@/hooks/useGoogleIntegration"
import { Mail, FileText, Upload, HelpCircle, Cloud, Folder, Database } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { GoogleDriveFolderPicker } from "@/components/integrations/GoogleDriveFolderPicker"

const automationSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
  trigger_type: z.enum(["gmail", "google_drive", "outlook", "onedrive", "sharepoint"]),
  gmail_query: z.string().optional(),
  job_id: z.string().min(1, "Please select a job template"),
  is_enabled: z.boolean().default(true),
  processing_mode: z.enum(["individual", "combined"]).default("individual"),
  keep_source_files: z.boolean().default(true),
  dest_type: z.enum(["", "gdrive", "gmail", "outlook", "onedrive", "sharepoint"]),
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
})

type AutomationFormData = z.infer<typeof automationSchema>

interface CreateAutomationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateAutomationModal({ open, onOpenChange }: CreateAutomationModalProps) {
  const [step, setStep] = useState(1)
  const [selectedGDriveFolder, setSelectedGDriveFolder] = useState<{id: string, name: string} | null>(null)
  const { data: jobs, isLoading: jobsLoading } = useJobs()
  const { status: googleStatus } = useGoogleIntegration()
  const createAutomation = useCreateAutomation()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isValid }
  } = useForm<AutomationFormData>({
    resolver: zodResolver(automationSchema),
    defaultValues: {
      is_enabled: true,
      processing_mode: "individual",
      keep_source_files: true,
    },
    mode: "onChange"
  })

  const watchedDestType = watch("dest_type")
  const watchedJobId = watch("job_id")
  const watchedTriggerType = watch("trigger_type")

  const selectedJob = jobs?.jobs.find(job => job.id === watchedJobId)

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
        dest_type: data.dest_type || undefined,
        export_config: data.dest_type ? {
          ...(data.dest_type === "gdrive" && data.folder_id ? { folder_id: data.folder_id } : {}),
          ...(data.dest_type === "gdrive" ? { file_type: data.file_type } : {}),
          ...(data.dest_type === "gmail" && data.to_email ? { to_email: data.to_email } : {}),
        } : undefined
      }

      await createAutomation.mutateAsync(automationData)
      reset()
      setStep(1)
      onOpenChange(false)
    } catch (error) {
      // Error handling is done in the mutation
    }
  }

  const handleClose = () => {
    reset()
    setStep(1)
    setSelectedGDriveFolder(null)
    onOpenChange(false)
  }

  const nextStep = () => {
    setStep(step + 1)
  }
  const prevStep = () => setStep(step - 1)

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
    setValue("folder_id", folder.id, { shouldValidate: true })
  }


  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Automation</DialogTitle>
          <DialogDescription>
            Set up an automation to process email attachments automatically
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Step 1: Basic Configuration */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Badge variant="default">Step 1</Badge>
                <span className="font-medium">Trigger Configuration</span>
              </div>

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

              <div className="space-y-4">
                <div>
                  <Label>Automation Trigger</Label>
                  <p className="text-sm text-gray-600 mb-3">
                    Choose what will trigger this automation to run
                  </p>
                  
                  <div className="grid gap-3">
                    {/* Gmail Trigger */}
                    <Card 
                      className={`cursor-pointer transition-colors ${watchedTriggerType === "gmail" ? "ring-2 ring-blue-500" : ""}`}
                      onClick={() => setValue("trigger_type", "gmail", { shouldValidate: true })}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                            <Mail className="w-4 h-4 text-red-600" />
                          </div>
                          <div>
                            <h4 className="font-medium">Gmail</h4>
                            <p className="text-sm text-gray-600">Process attachments from emails sent to document@cpaautomation.ai</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Google Drive Trigger */}
                    <Card 
                      className={`cursor-pointer transition-colors ${watchedTriggerType === "google_drive" ? "ring-2 ring-blue-500" : ""}`}
                      onClick={() => setValue("trigger_type", "google_drive", { shouldValidate: true })}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                            <Cloud className="w-4 h-4 text-blue-600" />
                          </div>
                          <div>
                            <h4 className="font-medium">Google Drive</h4>
                            <p className="text-sm text-gray-600">Process files added to Google Drive folders</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Outlook Trigger */}
                    <Card 
                      className={`cursor-pointer transition-colors ${watchedTriggerType === "outlook" ? "ring-2 ring-blue-500" : ""}`}
                      onClick={() => setValue("trigger_type", "outlook", { shouldValidate: true })}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                            <Mail className="w-4 h-4 text-blue-600" />
                          </div>
                          <div>
                            <h4 className="font-medium">Outlook</h4>
                            <p className="text-sm text-gray-600">Process attachments from Outlook emails</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* OneDrive Trigger */}
                    <Card 
                      className={`cursor-pointer transition-colors ${watchedTriggerType === "onedrive" ? "ring-2 ring-blue-500" : ""}`}
                      onClick={() => setValue("trigger_type", "onedrive", { shouldValidate: true })}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                            <Cloud className="w-4 h-4 text-blue-600" />
                          </div>
                          <div>
                            <h4 className="font-medium">OneDrive</h4>
                            <p className="text-sm text-gray-600">Process files added to OneDrive folders</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* SharePoint Trigger */}
                    <Card 
                      className={`cursor-pointer transition-colors ${watchedTriggerType === "sharepoint" ? "ring-2 ring-blue-500" : ""}`}
                      onClick={() => setValue("trigger_type", "sharepoint", { shouldValidate: true })}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                            <Database className="w-4 h-4 text-purple-600" />
                          </div>
                          <div>
                            <h4 className="font-medium">SharePoint</h4>
                            <p className="text-sm text-gray-600">Process files added to SharePoint document libraries</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>

              {/* Gmail Configuration - Only show when Gmail is selected */}
              {watchedTriggerType === "gmail" && (
                <div className="space-y-4 p-4 bg-blue-50 rounded-lg border">
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

                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 mb-4">
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
                      Note: Sender filtering is automatic based on your Google account email
                    </span>
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="job_id">Job Template</Label>
                <Select onValueChange={(value) => setValue("job_id", value)}>
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
                {errors.job_id && (
                  <p className="text-sm text-red-600">{errors.job_id.message}</p>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="is_enabled"
                  checked={watch("is_enabled")}
                  onCheckedChange={(checked) => setValue("is_enabled", checked)}
                />
                <Label htmlFor="is_enabled">Enable automation immediately</Label>
              </div>
            </div>
          )}

          {/* Step 2: Extraction Options */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Badge variant="default">Step 2</Badge>
                <span className="font-medium">Extraction Options</span>
              </div>

              <div className="space-y-6">
                {/* Processing Mode */}
                <div className="space-y-4">
                  <div>
                    <Label>Processing Mode</Label>
                    <p className="text-sm text-gray-600 mb-3">
                      Choose how files should be processed when multiple files are found
                    </p>
                    
                    <div className="grid gap-3">
                      <Card 
                        className={`cursor-pointer transition-colors ${watch("processing_mode") === "individual" ? "ring-2 ring-blue-500" : ""}`}
                        onClick={() => setValue("processing_mode", "individual", { shouldValidate: true })}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                              <FileText className="w-4 h-4 text-green-600" />
                            </div>
                            <div>
                              <h4 className="font-medium">Individual Processing</h4>
                              <p className="text-sm text-gray-600">Process each file separately, creating individual results</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card 
                        className={`cursor-pointer transition-colors ${watch("processing_mode") === "combined" ? "ring-2 ring-blue-500" : ""}`}
                        onClick={() => setValue("processing_mode", "combined", { shouldValidate: true })}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                              <Folder className="w-4 h-4 text-blue-600" />
                            </div>
                            <div>
                              <h4 className="font-medium">Combined Processing</h4>
                              <p className="text-sm text-gray-600">Process all files together, creating combined results</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </div>

                {/* Source File Storage */}
                <div className="space-y-4">
                  <div>
                    <Label>Source File Storage</Label>
                    <p className="text-sm text-gray-600 mb-3">
                      Choose whether to keep the original files for later access
                    </p>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                        <Database className="w-4 h-4 text-purple-600" />
                      </div>
                      <div>
                        <h4 className="font-medium">Keep source files</h4>
                        <p className="text-sm text-gray-600">Store original files for future reference and reprocessing</p>
                      </div>
                    </div>
                    <Switch
                      checked={watch("keep_source_files")}
                      onCheckedChange={(checked) => setValue("keep_source_files", checked, { shouldValidate: true })}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Export Configuration */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Badge variant="default">Step 3</Badge>
                <span className="font-medium">Export Configuration (Optional)</span>
              </div>

              <div className="space-y-4">
                <div>
                  <Label>Export Results</Label>
                  <p className="text-sm text-gray-600 mb-3">
                    Choose where to automatically export the extraction results
                  </p>
                  
                  <div className="grid gap-3">
                    <Card 
                      className={`cursor-pointer transition-colors ${watchedDestType === "" ? "ring-2 ring-blue-500" : ""}`}
                      onClick={() => setValue("dest_type", "", { shouldValidate: true })}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-medium">No automatic export</h4>
                            <p className="text-sm text-gray-600">Results will be available in the dashboard only</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card 
                      className={`cursor-pointer transition-colors ${
                        watchedDestType === "gdrive" ? "ring-2 ring-blue-500" : 
                        !googleStatus?.connected ? "opacity-50" : ""
                      }`}
                      onClick={() => googleStatus?.connected && setValue("dest_type", "gdrive", { shouldValidate: true })}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                            <Cloud className="w-4 h-4 text-blue-600" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium">Google Drive</h4>
                            <p className="text-sm text-gray-600">Save results as CSV/Excel files to Google Drive</p>
                          </div>
                          {!googleStatus?.connected && (
                            <Badge variant="outline">Not connected</Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    <Card 
                      className={`cursor-pointer transition-colors ${watchedDestType === "gmail" ? "ring-2 ring-blue-500" : ""}`}
                      onClick={() => setValue("dest_type", "gmail", { shouldValidate: true })}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                            <Mail className="w-4 h-4 text-red-600" />
                          </div>
                          <div>
                            <h4 className="font-medium">Gmail</h4>
                            <p className="text-sm text-gray-600">Email results as attachments via Gmail</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card 
                      className={`cursor-pointer transition-colors ${watchedDestType === "outlook" ? "ring-2 ring-blue-500" : ""}`}
                      onClick={() => setValue("dest_type", "outlook", { shouldValidate: true })}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                            <Mail className="w-4 h-4 text-blue-600" />
                          </div>
                          <div>
                            <h4 className="font-medium">Outlook</h4>
                            <p className="text-sm text-gray-600">Email results as attachments via Outlook</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card 
                      className={`cursor-pointer transition-colors ${watchedDestType === "onedrive" ? "ring-2 ring-blue-500" : ""}`}
                      onClick={() => setValue("dest_type", "onedrive", { shouldValidate: true })}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                            <Cloud className="w-4 h-4 text-blue-600" />
                          </div>
                          <div>
                            <h4 className="font-medium">OneDrive</h4>
                            <p className="text-sm text-gray-600">Save results as CSV/Excel files to OneDrive</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card 
                      className={`cursor-pointer transition-colors ${watchedDestType === "sharepoint" ? "ring-2 ring-blue-500" : ""}`}
                      onClick={() => setValue("dest_type", "sharepoint", { shouldValidate: true })}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                            <Database className="w-4 h-4 text-purple-600" />
                          </div>
                          <div>
                            <h4 className="font-medium">SharePoint</h4>
                            <p className="text-sm text-gray-600">Save results to SharePoint document libraries</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                  </div>
                </div>

                {/* Google Drive Export Configuration */}
                {watchedDestType === "gdrive" && (
                  <div className="space-y-4 mt-4 p-4 bg-blue-50 rounded-lg border">
                    <h4 className="font-medium text-blue-900">Google Drive Export Settings</h4>
                    
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Destination Folder</Label>
                        <GoogleDriveFolderPicker
                          onFolderSelected={handleGDriveFolderSelected}
                          selectedFolder={selectedGDriveFolder}
                          showCard={false}
                          buttonText={selectedGDriveFolder ? selectedGDriveFolder.name : "Select Destination Folder"}
                        />
                        <p className="text-sm text-gray-600">
                          Choose the Google Drive folder where results will be saved. If no folder is selected, files will be saved to My Drive.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="file_type">File Format</Label>
                        <Select
                          value={watch("file_type") || "csv"}
                          onValueChange={(value: "csv" | "xlsx") => setValue("file_type", value, { shouldValidate: true })}
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
                {watchedDestType === "gmail" && (
                  <div className="space-y-4 mt-4 p-4 bg-red-50 rounded-lg border">
                    <h4 className="font-medium text-red-900">Gmail Export Settings</h4>
                    
                    <div className="space-y-2">
                      <Label htmlFor="to_email">Email Address</Label>
                      <Input
                        id="to_email"
                        type="email"
                        placeholder="recipient@example.com"
                        {...register("to_email")}
                      />
                      <p className="text-sm text-gray-600">
                        Email address where results will be sent
                      </p>
                    </div>
                  </div>
                )}

              </div>
            </div>
          )}

          <Separator />

          <DialogFooter>
            <div className="flex justify-between w-full">
              <div>
                {step > 1 && (
                  <Button type="button" variant="outline" onClick={prevStep}>
                    Previous
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                {step < 3 ? (
                  <Button 
                    type="button" 
                    onClick={nextStep}
                    disabled={
                      step === 1 && (
                        !watch("name") || 
                        !watch("trigger_type") || 
                        !watch("job_id") ||
                        (watch("trigger_type") === "gmail" && !watch("gmail_query"))
                      )
                    }
                  >
                    Next
                  </Button>
                ) : (
                  <Button 
                    type="submit" 
                    disabled={!isValid || createAutomation.isPending}
                  >
                    {createAutomation.isPending ? "Creating..." : "Create Automation"}
                  </Button>
                )}
              </div>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}