// Typed API client using generated OpenAPI types
import { auth } from './firebase'
import type { paths } from './api-types'

type ApiPaths = paths
type ApiResponse<T> = T extends { responses: { 200: { content: { 'application/json': infer U } } } } ? U : never
type ApiRequest<T> = T extends { requestBody: { content: { 'application/json': infer U } } } ? U : never

export class ApiClient {
  private baseURL: string

  constructor(baseURL: string = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000') {
    this.baseURL = baseURL
  }

  private async getAuthToken(): Promise<string | null> {
    const user = auth.currentUser
    if (!user) return null
    return await user.getIdToken()
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await this.getAuthToken()
    
    const response = await fetch(`${this.baseURL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }))
      throw new Error(error.detail || error.message || `HTTP ${response.status}`)
    }

    return response.json()
  }

  // User endpoints
  async getCurrentUser(): Promise<ApiResponse<ApiPaths['/api/users/me']['get']>> {
    return this.request('/api/users/me')
  }

  async syncUserProfile(profileData?: { display_name?: string; photo_url?: string }): Promise<ApiResponse<ApiPaths['/api/users/me/sync']['post']>> {
    return this.request('/api/users/me/sync', {
      method: 'POST',
      body: JSON.stringify(profileData || {})
    })
  }

  async updateProfile(
    data: ApiRequest<ApiPaths['/api/users/me']['put']>
  ): Promise<ApiResponse<ApiPaths['/api/users/me']['put']>> {
    return this.request('/api/users/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  // Template endpoints
  async getTemplates(): Promise<ApiResponse<ApiPaths['/api/templates/']['get']>> {
    return this.request('/api/templates/')
  }

  async createTemplate(
    data: ApiRequest<ApiPaths['/api/templates/']['post']>
  ): Promise<ApiResponse<ApiPaths['/api/templates/']['post']>> {
    return this.request('/api/templates/', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getTemplate(templateId: string): Promise<ApiResponse<ApiPaths['/api/templates/{template_id}']['get']>> {
    return this.request(`/api/templates/${templateId}`)
  }


  async updateTemplate(
    templateId: string,
    data: ApiRequest<ApiPaths['/api/templates/{template_id}']['put']>
  ): Promise<ApiResponse<ApiPaths['/api/templates/{template_id}']['put']>> {
    return this.request(`/api/templates/${templateId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteTemplate(templateId: string): Promise<ApiResponse<ApiPaths['/api/templates/{template_id}']['delete']>> {
    return this.request(`/api/templates/${templateId}`, {
      method: 'DELETE',
    })
  }

  async getPublicTemplates(): Promise<ApiResponse<ApiPaths['/api/templates/public/all']['get']>> {
    return this.request('/api/templates/public/all')
  }

  // Stripe endpoints
  async createCheckoutSession(
    data: ApiRequest<ApiPaths['/api/stripe/create-checkout-session']['post']>
  ): Promise<ApiResponse<ApiPaths['/api/stripe/create-checkout-session']['post']>> {
    return this.request('/api/stripe/create-checkout-session', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async createPortalSession(
    data: ApiRequest<ApiPaths['/api/stripe/create-portal-session']['post']>
  ): Promise<ApiResponse<ApiPaths['/api/stripe/create-portal-session']['post']>> {
    return this.request('/api/stripe/create-portal-session', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getSubscriptionStatus(): Promise<ApiResponse<ApiPaths['/api/stripe/subscription-status']['get']>> {
    return this.request('/api/stripe/subscription-status')
  }

  // File upload endpoints (multipart/form-data)
  async uploadFiles(files: File[]): Promise<ApiResponse<ApiPaths['/api/extraction/upload']['post']>> {
    const token = await this.getAuthToken()
    const formData = new FormData()
    
    files.forEach(file => {
      formData.append('files', file)
    })

    const response = await fetch(`${this.baseURL}/api/extraction/upload`, {
      method: 'POST',
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Upload failed' }))
      throw new Error(error.detail || error.message || 'Upload failed')
    }

    return response.json()
  }

  // Extraction endpoints
  async extractFromUploadedFiles(
    fileIds: string[],
    fields: any[],
    extractMultipleRows: boolean = false
  ): Promise<ApiResponse<ApiPaths['/api/extraction/extract-from-uploaded']['post']>> {
    const token = await this.getAuthToken()
    const formData = new FormData()
    
    fileIds.forEach(id => formData.append('file_ids', id))
    formData.append('fields', JSON.stringify(fields))
    formData.append('extract_multiple_rows', extractMultipleRows.toString())

    const response = await fetch(`${this.baseURL}/api/extraction/extract-from-uploaded`, {
      method: 'POST',
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Extraction failed' }))
      throw new Error(error.detail || error.message || 'Extraction failed')
    }

    return response.json()
  }

  async extractFromFiles(
    files: File[],
    fields: any[],
    extractMultipleRows: boolean = false
  ): Promise<ApiResponse<ApiPaths['/api/extraction/extract']['post']>> {
    const token = await this.getAuthToken()
    const formData = new FormData()
    
    files.forEach(file => formData.append('files', file))
    formData.append('fields', JSON.stringify(fields))
    formData.append('extract_multiple_rows', extractMultipleRows.toString())

    const response = await fetch(`${this.baseURL}/api/extraction/extract`, {
      method: 'POST',
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Extraction failed' }))
      throw new Error(error.detail || error.message || 'Extraction failed')
    }

    return response.json()
  }

  // Export endpoints
  async exportToCSV(extractionData: any): Promise<{ blob: Blob; filename: string }> {
    const token = await this.getAuthToken()
    
    const response = await fetch(`${this.baseURL}/api/extraction/export/csv`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(extractionData),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Export failed' }))
      throw new Error(error.detail || error.message || 'Export failed')
    }

    const blob = await response.blob()
    const filename = response.headers.get('Content-Disposition')?.match(/filename=(.+)/)?.[1] || 'export.csv'
    return { blob, filename: filename.replace(/"/g, '') }
  }

  async exportToExcel(extractionData: any): Promise<{ blob: Blob; filename: string }> {
    const token = await this.getAuthToken()
    
    const response = await fetch(`${this.baseURL}/api/extraction/export/excel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(extractionData),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Export failed' }))
      throw new Error(error.detail || error.message || 'Export failed')
    }

    const blob = await response.blob()
    const filename = response.headers.get('Content-Disposition')?.match(/filename=(.+)/)?.[1] || 'export.xlsx'
    return { blob, filename: filename.replace(/"/g, '') }
  }

  // File cleanup methods
  async deleteUploadedFile(fileId: string): Promise<ApiResponse<ApiPaths['/api/extraction/cleanup/{file_id}']['delete']>> {
    const token = await this.getAuthToken()
    
    const response = await fetch(`${this.baseURL}/api/extraction/cleanup/${fileId}`, {
      method: 'DELETE',
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Delete failed' }))
      throw new Error(error.detail || error.message || 'Delete failed')
    }

    return response.json()
  }

  async deleteMultipleFiles(fileIds: string[]): Promise<ApiResponse<ApiPaths['/api/extraction/cleanup-multiple']['delete']>> {
    const token = await this.getAuthToken()
    
    const response = await fetch(`${this.baseURL}/api/extraction/cleanup-multiple`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(fileIds),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Delete failed' }))
      throw new Error(error.detail || error.message || 'Delete failed')
    }

    return response.json()
  }

  // Job-based workflow endpoints
  async initiateJob(request: ApiRequest<ApiPaths['/api/jobs/initiate']['post']>): Promise<ApiResponse<ApiPaths['/api/jobs/initiate']['post']>> {
    return this.request('/api/jobs/initiate', {
      method: 'POST',
      body: JSON.stringify(request),
    })
  }

  async startJob(jobId: string, request: ApiRequest<ApiPaths['/api/jobs/{job_id}/start']['post']>): Promise<ApiResponse<ApiPaths['/api/jobs/{job_id}/start']['post']>> {
    return this.request(`/api/jobs/${jobId}/start`, {
      method: 'POST',
      body: JSON.stringify(request),
    })
  }

  async getJobDetails(jobId: string): Promise<ApiResponse<ApiPaths['/api/jobs/{job_id}']['get']>> {
    return this.request(`/api/jobs/${jobId}`)
  }

  async listJobs(params?: { limit?: number; offset?: number; status?: string }): Promise<ApiResponse<ApiPaths['/api/jobs']['get']>> {
    const searchParams = new URLSearchParams()
    if (params?.limit) searchParams.set('limit', params.limit.toString())
    if (params?.offset) searchParams.set('offset', params.offset.toString())
    if (params?.status) searchParams.set('status', params.status)
    
    const query = searchParams.toString()
    return this.request(`/api/jobs${query ? `?${query}` : ''}`)
  }

  async getJobProgress(jobId: string): Promise<ApiResponse<ApiPaths['/api/jobs/{job_id}/progress']['get']>> {
    return this.request(`/api/jobs/${jobId}/progress`)
  }

  async getJobFiles(jobId: string, options?: { processable?: boolean }): Promise<ApiResponse<ApiPaths['/api/jobs/{job_id}/files']['get']>> {
    const searchParams = new URLSearchParams()
    if (options?.processable) {
      searchParams.set('processable', 'true')
    }
    
    const query = searchParams.toString()
    return this.request(`/api/jobs/${jobId}/files${query ? `?${query}` : ''}`)
  }

  async addFilesToJob(
    jobId: string, 
    files: File[], 
    onProgress?: (filePath: string, progress: number) => void,
    onFileComplete?: (fileData: any, filePath: string) => void
  ): Promise<{ files: any[] }> {
    const token = await this.getAuthToken()
    
    // Upload files one by one to get real progress for each
    const uploadedFiles: any[] = []
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const filePath = (file as any).webkitRelativePath || file.name
      console.log(`Uploading file ${i + 1}/${files.length}: ${filePath}`)
      
      // Initialize progress for this file
      if (onProgress) {
        onProgress(filePath, 0)
      }
      
      const formData = new FormData()
      formData.append('files', file)

      // Create XMLHttpRequest for progress tracking
      const uploadPromise = new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        
        // Track upload progress
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable && onProgress) {
            const progress = (event.loaded / event.total) * 100
            onProgress(filePath, progress)
          }
        })
        
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const result = JSON.parse(xhr.responseText)
              resolve(result)
            } catch (e) {
              reject(new Error('Invalid response format'))
            }
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`))
          }
        })
        
        xhr.addEventListener('error', () => {
          reject(new Error('Network error during upload'))
        })
        
        xhr.open('POST', `${this.baseURL}/api/jobs/${jobId}/files`)
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        xhr.send(formData)
      })
      
      try {
        const result = await uploadPromise
        uploadedFiles.push(...result.files)
        
        // Mark as 100% complete and notify completion
        if (onProgress) {
          onProgress(filePath, 100)
        }
        
        // Notify that this file is complete
        if (onFileComplete && result.files.length > 0) {
          onFileComplete(result.files[0], filePath)
        }
        
      } catch (error) {
        console.error(`Failed to upload ${filePath}:`, error)
        throw error
      }
    }
    
    return { files: uploadedFiles }
  }

  async removeFileFromJob(jobId: string, fileId: string): Promise<void> {
    await this.request(`/api/jobs/${jobId}/files/${fileId}`, {
      method: 'DELETE',
    })
  }

  /**
   * Get auth token for SSE connections (public method)
   */
  async getAuthTokenForSSE(): Promise<string> {
    const user = auth.currentUser
    if (!user) throw new Error('Not authenticated')
    return await user.getIdToken()
  }

  async deleteJob(jobId: string): Promise<void> {
    await this.request(`/api/jobs/${jobId}`, {
      method: 'DELETE',
    })
  }

  async getJobResults(jobId: string, params?: { limit?: number; offset?: number }): Promise<JobResultsResponse> {
    const searchParams = new URLSearchParams()
    if (params?.limit) searchParams.set('limit', params.limit.toString())
    if (params?.offset) searchParams.set('offset', params.offset.toString())
    
    const query = searchParams.toString()
    return this.request(`/api/jobs/${jobId}/results${query ? `?${query}` : ''}`)
  }

  async getDataTypes(): Promise<DataType[]> {
    return this.request('/api/data-types/')
  }

  async verifyJobAccess(jobId: string): Promise<void> {
    // This will throw if user doesn't have access
    await this.getJobDetails(jobId)
  }

  // Google Integration endpoints
  async getGoogleAuthUrl(scopes: string = 'combined'): Promise<{ auth_url: string; state: string }> {
    return this.request(`/api/integrations/google/auth-url?scopes=${encodeURIComponent(scopes)}`)
  }

  async exchangeGoogleCode(code: string, state: string): Promise<{ success: boolean; provider: string; scopes: string[]; user_email: string; expires_at: string | null }> {
    return this.request('/api/integrations/google/exchange', {
      method: 'POST',
      body: JSON.stringify({ code, state })
    })
  }

  async getGoogleIntegrationStatus(): Promise<{ connected: boolean; scopes: string[]; expires_at: string | null; is_expired: boolean }> {
    return this.request('/api/integrations/google/status')
  }

  async disconnectGoogleIntegration(): Promise<{ success: boolean; message: string }> {
    return this.request('/api/integrations/google/disconnect', {
      method: 'DELETE'
    })
  }

  async refreshGoogleToken(): Promise<{ success: boolean; expires_at: string | null }> {
    return this.request('/api/integrations/google/refresh', {
      method: 'POST'
    })
  }

  async getGmailAttachments(query: string, mimeTypes: string, limit: number = 50): Promise<{ attachments: any[] }> {
    const params = new URLSearchParams({
      query,
      mimeTypes,
      limit: limit.toString()
    })
    return this.request(`/api/integrations/gmail/attachments?${params}`)
  }

  // File Import endpoints (Epic 3)
  async importDriveFiles(jobId: string, fileIds: string[]): Promise<{ success: boolean; import_job_id: string; message: string; file_count: number }> {
    return this.request(`/api/jobs/${jobId}/files:gdrive`, {
      method: 'POST',
      body: JSON.stringify({ file_ids: fileIds })
    })
  }

  async importGmailAttachments(jobId: string, attachments: Array<{ message_id: string; attachment_id: string; filename: string }>): Promise<{ success: boolean; import_job_id: string; message: string; attachment_count: number }> {
    return this.request(`/api/jobs/${jobId}/files:gmail`, {
      method: 'POST',
      body: JSON.stringify({ attachments })
    })
  }

  async getImportStatus(jobId: string): Promise<{ total_files: number; by_source: Record<string, number>; by_status: Record<string, number>; files: Array<{ id: string; filename: string; source_type: string; status: string; file_size: number; updated_at: string | null }> }> {
    return this.request(`/api/jobs/${jobId}/import-status`)
  }

  // Google Drive Export endpoints
  async exportJobToGoogleDriveCSV(jobId: string, folderId?: string): Promise<{
    success: boolean;
    message: string;
    drive_file_id: string;
    drive_file_name: string;
    web_view_link: string;
    web_content_link: string;
  }> {
    const token = await this.getAuthToken()
    const url = new URL(`${this.baseURL}/api/jobs/${jobId}/export/gdrive/csv`);
    if (folderId) {
      url.searchParams.append('folder_id', folderId);
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Google Drive CSV export failed' }));
      throw new Error(error.detail || 'Google Drive CSV export failed');
    }

    return await response.json();
  }

  async exportJobToGoogleDriveExcel(jobId: string, folderId?: string): Promise<{
    success: boolean;
    message: string;
    drive_file_id: string;
    drive_file_name: string;
    web_view_link: string;
    web_content_link: string;
  }> {
    const token = await this.getAuthToken()
    const url = new URL(`${this.baseURL}/api/jobs/${jobId}/export/gdrive/excel`);
    if (folderId) {
      url.searchParams.append('folder_id', folderId);
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Google Drive Excel export failed' }));
      throw new Error(error.detail || 'Google Drive Excel export failed');
    }

    return await response.json();
  }

}

export const apiClient = new ApiClient()

// Export commonly used types
export type UserResponse = ApiResponse<ApiPaths['/api/users/me']['get']>
export type TemplatesResponse = ApiResponse<ApiPaths['/api/templates/']['get']>
export type ExtractionResponse = ApiResponse<ApiPaths['/api/extraction/extract']['post']>
export type SubscriptionStatus = ApiResponse<ApiPaths['/api/stripe/subscription-status']['get']>

// Job-related types
export type JobInitiateResponse = ApiResponse<ApiPaths['/api/jobs/initiate']['post']>
export type JobStartResponse = ApiResponse<ApiPaths['/api/jobs/{job_id}/start']['post']>
export type JobDetailsResponse = ApiResponse<ApiPaths['/api/jobs/{job_id}']['get']>
export type JobListResponse = ApiResponse<ApiPaths['/api/jobs']['get']>
export type JobProgressResponse = ApiResponse<ApiPaths['/api/jobs/{job_id}/progress']['get']>
export type JobFilesResponse = ApiResponse<ApiPaths['/api/jobs/{job_id}/files']['get']>
export type JobResultsResponse = {
  total: number
  files_processed_count: number
  results: Array<{
    task_id: string
    source_files: string[]
    processing_mode: string
    extracted_data: Record<string, any>
  }>
}

// Import types from generated OpenAPI schema
import { components } from './api-types'

export type JobStatus = components['schemas']['JobStatus']
export type ProcessingMode = components['schemas']['ProcessingMode']
export type FileUploadInfo = components['schemas']['FileUploadInfo']
export type TaskDefinition = components['schemas']['TaskDefinition']
export type JobFieldConfig = components['schemas']['JobFieldConfig']
export type JobListItem = components['schemas']['JobListItem']
export type JobFileInfo = components['schemas']['JobFileInfo']
export type FileStatus = components['schemas']['FileStatus']

// Frontend-specific types for the multi-step workflow
export interface FrontendUploadFile {
  file: File
  path: string
  uploadUrl?: string
  uploaded: boolean
  error?: string
}

// Backend file structure (what we get from API)
export interface UploadedFile {
  id: string
  filename: string
  original_path: string
  file_type: string
  file_size: number
  status: 'ready' | 'extracting' | 'extracted' | 'failed'
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

// Data types interface matching backend DataTypeResponse
export interface DataType {
  id: string
  display_name: string
  description: string
  base_json_type: string
  json_format?: string
  display_order: number
}

// Export field configuration type from the generated types
export type FieldConfig = {
  name: string
  data_type: string
  prompt: string
}