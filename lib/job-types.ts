/**
 * Job-based API types for ByteReview
 * New asynchronous workflow types
 */

export type JobStatus = 
  | 'pending_configuration'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type ProcessingMode = 'individual' | 'combined'

export interface FileUploadInfo {
  filename: string
  path: string
  size: number
  type: string
}

export interface FileUploadResponse {
  original_path: string
  upload_url: string
}

export interface JobInitiateRequest {
  files: FileUploadInfo[]
}

export interface JobInitiateResponse {
  job_id: string
  files: FileUploadResponse[]
}

export interface TaskDefinition {
  path: string
  mode: ProcessingMode
}

export interface JobFieldConfig {
  field_name: string
  data_type_id: string
  ai_prompt: string
  display_order: number
}

export interface JobStartRequest {
  name?: string
  template_id?: string
  persist_data: boolean
  fields: JobFieldConfig[]
  task_definitions: TaskDefinition[]
}

export interface JobStartResponse {
  message: string
  job_id: string
}

export interface JobFileInfo {
  id: string
  original_path: string
  original_filename: string
  file_size_bytes: number
  status: string
}

export interface JobFieldInfo {
  field_name: string
  data_type_id: string
  ai_prompt: string
  display_order: number
}

export interface JobDetailsResponse {
  id: string
  name?: string
  status: JobStatus
  persist_data: boolean
  created_at: string
  completed_at?: string
  job_fields: JobFieldInfo[]
}

export interface JobListItem {
  id: string
  name?: string
  status: JobStatus
  created_at: string
  file_count: number
}

export interface JobListResponse {
  jobs: JobListItem[]
  total: number
}

export interface JobProgressResponse {
  total_tasks: number
  completed: number
  failed: number
  status: JobStatus
}

export interface ExtractionTaskResult {
  task_id: string
  source_files: string[]
  extracted_data: Record<string, any>
  processing_mode: ProcessingMode
}

export interface JobResultsResponse {
  total: number
  results: ExtractionTaskResult[]
}

// Frontend-specific types for the multi-step workflow
export interface UploadedFile {
  file: File
  path: string
  uploadUrl?: string
  uploaded: boolean
  error?: string
}

export interface WorkflowStep {
  id: string
  title: string
  description: string
  completed: boolean
  current: boolean
}

export interface JobWorkflowState {
  currentStep: number
  jobId?: string
  files: UploadedFile[]
  fields: JobFieldConfig[]
  taskDefinitions: TaskDefinition[]
  jobName?: string
  templateId?: string
  persistData: boolean
}