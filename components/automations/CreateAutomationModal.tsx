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
import { Mail, FileText, Upload, HelpCircle } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

const automationSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
  gmail_query: z.string().min(1, "Gmail query is required"),
  job_id: z.string().min(1, "Please select a job template"),
  is_enabled: z.boolean().default(true),
  dest_type: z.enum(["", "gdrive", "gmail"]),
  folder_id: z.string().optional(),
  to_email: z.string().email("Invalid email address").optional().or(z.literal("")),
  file_type: z.enum(["csv", "xlsx"]).default("csv"),
})

type AutomationFormData = z.infer<typeof automationSchema>

interface CreateAutomationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateAutomationModal({ open, onOpenChange }: CreateAutomationModalProps) {
  const [step, setStep] = useState(1)
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
    },
    mode: "onChange"
  })

  const watchedDestType = watch("dest_type")
  const watchedJobId = watch("job_id")

  const selectedJob = jobs?.jobs.find(job => job.id === watchedJobId)

  const onSubmit = async (data: AutomationFormData) => {
    try {
      const automationData = {
        name: data.name,
        is_enabled: data.is_enabled,
        trigger_type: "gmail_attachment",
        trigger_config: {
          query: data.gmail_query
        },
        job_id: data.job_id,
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
    onOpenChange(false)
  }

  const nextStep = () => {
    setStep(step + 1)
  }
  const prevStep = () => setStep(step - 1)


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
                <span className="font-medium">Basic Configuration</span>
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
                <Textarea
                  id="gmail_query"
                  placeholder="has:attachment from:invoices@supplier.com"
                  rows={3}
                  {...register("gmail_query")}
                />
                {errors.gmail_query && (
                  <p className="text-sm text-red-600">{errors.gmail_query.message}</p>
                )}
                <p className="text-sm text-gray-600">
                  Use Gmail search syntax to specify which emails should trigger this automation
                </p>
              </div>

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

          {/* Step 2: Export Configuration */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Badge variant="default">Step 2</Badge>
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
                      className={`cursor-pointer transition-colors ${watchedDestType === "" && watchedDestType !== undefined ? "ring-2 ring-blue-500" : ""}`}
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
                            <Upload className="w-4 h-4 text-blue-600" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium">Export to Google Drive</h4>
                            <p className="text-sm text-gray-600">Automatically save results as CSV/Excel files</p>
                          </div>
                          {!googleStatus?.connected && (
                            <Badge variant="outline">Google Drive not connected</Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                  </div>
                </div>

                {/* Google Drive Export Configuration */}
                {watchedDestType === "gdrive" && (
                  <div className="space-y-4 mt-4 p-4 bg-blue-50 rounded-lg border">
                    <h4 className="font-medium text-blue-900">Google Drive Export Settings</h4>
                    
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
                {step < 2 ? (
                  <Button 
                    type="button" 
                    onClick={nextStep}
                    disabled={!watch("name") || !watch("gmail_query") || !watch("job_id")}
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