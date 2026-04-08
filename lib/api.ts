// Typed API client using generated OpenAPI types
import { auth } from './firebase'
import type { paths } from './api-types'

type ApiPaths = paths
type ApiResponse<T> = T extends { responses: { 200: { content: { 'application/json': infer U } } } } ? U : never
type ApiRequest<T> = T extends { requestBody: { content: { 'application/json': infer U } } } ? U : never

export class ApiError extends Error {
  status: number
  body: any

  constructor(status: number, message: string, body?: any) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

export class ApiClient {
  private baseURL: string

  constructor(baseURL: string = '') {
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
      let body: any = null
      let message = `HTTP ${response.status}`
      try {
        body = await response.json()
        message = body?.detail || body?.message || message
      } catch {
        try {
          const text = await response.text()
          if (text) message = text
        } catch {
          // ignore
        }
      }
      throw new ApiError(response.status, message, body)
    }

    return response.json()
  }

  // User endpoints
  async getCurrentUser(): Promise<ApiResponse<ApiPaths['/api/users/me']['get']>> {
    return this.request('/api/users/me')
  }

  async checkPhoneNumberAvailability(phoneNumber: string): Promise<ApiResponse<ApiPaths['/api/users/phone-availability']['get']>> {
    const searchParams = new URLSearchParams({ phone_number: phoneNumber })
    return this.request(`/api/users/phone-availability?${searchParams.toString()}`)
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

  async deleteUserAccount(): Promise<{ message: string }> {
    return this.request('/api/users/me', {
      method: 'DELETE'
    })
  }

  // Template endpoints
  async getTemplates(): Promise<ApiResponse<ApiPaths['/api/templates']['get']>> {
    return this.request('/api/templates')
  }

  async createTemplate(
    data: ApiRequest<ApiPaths['/api/templates']['post']>
  ): Promise<ApiResponse<ApiPaths['/api/templates']['post']>> {
    return this.request('/api/templates', {
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

  // Job-based workflow endpoints
  async initiateJob(request: ApiRequest<ApiPaths['/api/jobs/initiate']['post']>): Promise<ApiResponse<ApiPaths['/api/jobs/initiate']['post']>> {
    return this.request('/api/jobs/initiate', {
      method: 'POST',
      body: JSON.stringify(request),
    })
  }

  async getJobDetails(jobId: string, runId?: string): Promise<ApiResponse<ApiPaths['/api/jobs/{job_id}']['get']>> {
    const params = new URLSearchParams()
    if (runId) params.set('run_id', runId)
    const query = params.toString()
    return this.request(`/api/jobs/${jobId}${query ? `?${query}` : ''}`)
  }

  async listJobs(params?: { limit?: number; offset?: number; status?: string; include_field_status?: boolean }): Promise<ApiResponse<ApiPaths['/api/jobs']['get']>> {
    const searchParams = new URLSearchParams()
    if (params?.limit) searchParams.set('limit', params.limit.toString())
    if (params?.offset) searchParams.set('offset', params.offset.toString())
    if (params?.status) searchParams.set('status', params.status)
    if (params?.include_field_status) searchParams.set('include_field_status', params.include_field_status.toString())
    
    const query = searchParams.toString()
    return this.request(`/api/jobs${query ? `?${query}` : ''}`)
  }

  async getJobProgress(jobId: string, runId?: string): Promise<ApiResponse<ApiPaths['/api/jobs/{job_id}/progress']['get']>> {
    const params = new URLSearchParams()
    if (runId) params.set('run_id', runId)
    const query = params.toString()
    return this.request(`/api/jobs/${jobId}/progress${query ? `?${query}` : ''}`)
  }

  async getJobFiles(jobId: string, options?: { processable?: boolean; runId?: string }): Promise<ApiResponse<ApiPaths['/api/jobs/{job_id}/files']['get']>> {
    const searchParams = new URLSearchParams()
    if (options?.processable) {
      searchParams.set('processable', 'true')
    }
    if (options?.runId) {
      searchParams.set('run_id', options.runId)
    }

    const query = searchParams.toString()
    return this.request(`/api/jobs/${jobId}/files${query ? `?${query}` : ''}`)
  }

  async getJobFilesAllRuns(jobId: string, options?: { processable?: boolean }): Promise<JobFilesAllRunsResponse> {
    const searchParams = new URLSearchParams()
    if (options?.processable) {
      searchParams.set('processable', 'true')
    }
    const query = searchParams.toString()
    return this.request(`/api/jobs/${jobId}/files:all${query ? `?${query}` : ''}`)
  }

  // Job Runs endpoints
  async getJobRuns(jobId: string): Promise<ApiResponse<ApiPaths['/api/jobs/{job_id}/runs']['get']>> {
    return this.request(`/api/jobs/${jobId}/runs`)
  }

  async createJobRun(jobId: string, request: ApiRequest<ApiPaths['/api/jobs/{job_id}/runs']['post']>): Promise<ApiResponse<ApiPaths['/api/jobs/{job_id}/runs']['post']>> {
    return this.request(`/api/jobs/${jobId}/runs`, {
      method: 'POST',
      body: JSON.stringify(request)
    })
  }

  async getJobRun(jobId: string, runId: string): Promise<ApiResponse<ApiPaths['/api/jobs/{job_id}/runs/{run_id}']['get']>> {
    return this.request(`/api/jobs/${jobId}/runs/${runId}`)
  }

  async addFilesToJob(
    jobId: string,
    files: File[],
    onProgress?: (filePath: string, progress: number) => void,
    onFileComplete?: (fileData: any, filePath: string) => void,
    runId?: string
  ): Promise<{ files: any[] }> {
    const token = await this.getAuthToken()

    const uploadedFiles: any[] = []

    const normalizeRelPath = (p: string) => p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')

    const params = new URLSearchParams()
    if (runId) params.set('run_id', runId)
    const queryString = params.toString()

    // Step 1: Initiate uploads to get signed PUT URLs
    const initiateResult: any = await this.request(`/api/jobs/${jobId}/files:initiate${queryString ? `?${queryString}` : ''}`, {
      method: 'POST',
      body: JSON.stringify({
        files: files.map((file) => {
          const filePath = (file as any).webkitRelativePath || file.name
          return {
            filename: file.name,
            path: filePath,
            size: file.size,
            type: file.type || 'application/octet-stream',
          }
        })
      })
    })

    const initiatedByPath = new Map<string, { id: string; original_path: string; upload_url: string }>()
    for (const f of initiateResult?.files || []) {
      initiatedByPath.set(f.original_path, f)
      initiatedByPath.set(normalizeRelPath(f.original_path), f)
    }

    // Step 2: Upload bytes directly to GCS (signed URL), then complete to finalize + page count
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const filePath = (file as any).webkitRelativePath || file.name
      const normalizedPath = normalizeRelPath(filePath)
      console.log(`Uploading file ${i + 1}/${files.length}: ${filePath}`)

      if (onProgress) onProgress(filePath, 0)

      const initiated = initiatedByPath.get(filePath) || initiatedByPath.get(normalizedPath)
      if (!initiated?.upload_url || !initiated?.id) {
        throw new Error(`Missing upload URL for ${filePath}`)
      }

      // PUT to signed URL with progress
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable && onProgress) {
            const progress = (event.loaded / event.total) * 100
            onProgress(filePath, progress)
          }
        })
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve()
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`))
          }
        })
        xhr.addEventListener('error', () => reject(new Error('Network error during upload')))
        xhr.open('PUT', initiated.upload_url)
        // Must match content_type used when signing the URL
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
        xhr.send(file)
      })

      // Complete upload (server validates size, counts pages, enqueues ZIP unpack)
      const completeResponse = await fetch(`${this.baseURL}/api/jobs/${jobId}/files:complete${queryString ? `?${queryString}` : ''}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ file_ids: [initiated.id] })
      })

      if (!completeResponse.ok) {
        const error = await completeResponse.json().catch(() => ({ message: 'Upload completion failed' }))
        throw new Error(error.detail || error.message || 'Upload completion failed')
      }

      const completeResult: any = await completeResponse.json()
      const completedFile = completeResult?.files?.[0]
      if (completedFile) {
        uploadedFiles.push(completedFile)
        if (onFileComplete) onFileComplete(completedFile, filePath)
      }

      if (onProgress) onProgress(filePath, 100)
    }

    return { files: uploadedFiles }
  }

  async removeFileFromJob(jobId: string, fileId: string, runId?: string): Promise<void> {
    const params = new URLSearchParams()
    if (runId) params.set('run_id', runId)
    const queryString = params.toString()
    await this.request(`/api/jobs/${jobId}/files/${fileId}${queryString ? `?${queryString}` : ''}`, {
      method: 'DELETE',
    })
  }

  async downloadJobFile(jobId: string, fileId: string): Promise<{ blob: Blob; filename: string }> {
    const token = await this.getAuthToken()

    const response = await fetch(`${this.baseURL}/api/jobs/${jobId}/files/${fileId}:download`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'File download failed' }))
      throw new Error(error.detail || error.message || 'File download failed')
    }

    const blob = await response.blob()
    const filename = response.headers.get('Content-Disposition')?.match(/filename=(.+)/)?.[1] || 'download'
    return { blob, filename: filename.replace(/"/g, '') }
  }

  async downloadJobFilesZip(jobId: string, fileIds: string[]): Promise<{ blob: Blob; filename: string }> {
    const token = await this.getAuthToken()

    const response = await fetch(`${this.baseURL}/api/jobs/${jobId}/files:download-zip`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ file_ids: fileIds })
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'ZIP download failed' }))
      throw new Error(error.detail || error.message || 'ZIP download failed')
    }

    const blob = await response.blob()
    const filename = response.headers.get('Content-Disposition')?.match(/filename=(.+)/)?.[1] || 'files.zip'
    return { blob, filename: filename.replace(/"/g, '') }
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

  async updateJobDetails(jobId: string, data: { name: string }): Promise<{ message: string }> {
    return this.request(`/api/jobs/${jobId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async updateJobName(jobId: string, name: string): Promise<{ message: string }> {
    return this.updateJobDetails(jobId, { name })
  }

  async getJobResults(jobId: string, params?: { limit?: number; offset?: number; runId?: string }): Promise<JobResultsResponse> {
    const searchParams = new URLSearchParams()
    if (params?.limit) searchParams.set('limit', params.limit.toString())
    if (params?.offset) searchParams.set('offset', params.offset.toString())
    if (params?.runId) searchParams.set('run_id', params.runId)
    
    const query = searchParams.toString()
    return this.request(`/api/jobs/${jobId}/results${query ? `?${query}` : ''}`)
  }

  async createJobResultRow(jobId: string, payload: { runId?: string; attachToTaskId?: string; values: Record<string, any> }): Promise<{ task_id: string; row_id: string }> {
    return this.request(`/api/jobs/${jobId}/results/rows`, {
      method: 'POST',
      body: JSON.stringify({
        run_id: payload.runId,
        attach_to_task_id: payload.attachToTaskId,
        values: payload.values,
      }),
    })
  }

  async updateJobResultRow(jobId: string, taskId: string, rowId: string, values: Record<string, any>): Promise<{ message: string }> {
    return this.request(`/api/jobs/${jobId}/results/tasks/${taskId}/rows/${rowId}`, {
      method: 'PATCH',
      body: JSON.stringify({ values }),
    })
  }

  async deleteJobResultRow(jobId: string, taskId: string, rowId: string): Promise<{ message: string }> {
    return this.request(`/api/jobs/${jobId}/results/tasks/${taskId}/rows/${rowId}`, {
      method: 'DELETE',
    })
  }

  async submitJob(jobId: string, runId?: string): Promise<{ message: string; job_run_id: string }> {
    const params = new URLSearchParams()
    if (runId) params.set('run_id', runId)
    const query = params.toString()
    return this.request(`/api/jobs/${jobId}/submit${query ? `?${query}` : ''}`, {
      method: 'POST'
    })
  }

  async updateJobConfigStep(jobId: string, configStep: string, runId?: string): Promise<{ message: string }> {
    const params = new URLSearchParams()
    if (runId) params.set('run_id', runId)
    const query = params.toString()
    return this.request(`/api/jobs/${jobId}/config-step${query ? `?${query}` : ''}`, {
      method: 'PUT',
      body: JSON.stringify({ config_step: configStep })
    })
  }

  async updateJobFields(jobId: string, fields: any[], templateId?: string, processingModes?: Record<string, string>, runId?: string, description?: string): Promise<{ message: string }> {
    const params = new URLSearchParams()
    if (runId) params.set('run_id', runId)
    const query = params.toString()
    return this.request(`/api/jobs/${jobId}/fields${query ? `?${query}` : ''}`, {
      method: 'PUT',
      body: JSON.stringify({ 
        fields, 
        template_id: templateId, 
        processing_modes: processingModes,
        description
      })
    })
  }

  async getDataTypes(): Promise<DataType[]> {
    return this.request('/api/data-types')
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

  async importGmailAttachments(jobId: string, attachments: Array<{ messageId: string; attachmentId: string; filename: string }>): Promise<{ success: boolean; import_job_id: string; message: string; attachment_count: number }> {
    return this.request(`/api/jobs/${jobId}/files:gmail`, {
      method: 'POST',
      body: JSON.stringify({ attachments })
    })
  }

  async getImportStatus(jobId: string): Promise<{ total_files: number; by_source: Record<string, number>; by_status: Record<string, number>; files: Array<{ id: string; filename: string; source_type: string; status: string; file_size: number; updated_at: string | null }> }> {
    return this.request(`/api/jobs/${jobId}/import-status`)
  }

  // Job Export endpoints
  async exportJobCSV(jobId: string, runId?: string): Promise<{ blob: Blob; filename: string }> {
    const token = await this.getAuthToken()
    const params = new URLSearchParams()
    if (runId) params.set('run_id', runId)
    const query = params.toString()
    
    const response = await fetch(`${this.baseURL}/api/jobs/${jobId}/export/csv${query ? `?${query}` : ''}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'CSV export failed' }))
      throw new Error(error.detail || error.message || 'CSV export failed')
    }

    const blob = await response.blob()
    const filename = response.headers.get('Content-Disposition')?.match(/filename=(.+)/)?.[1] || 'export.csv'
    return { blob, filename: filename.replace(/"/g, '') }
  }

  async exportJobExcel(jobId: string, runId?: string): Promise<{ blob: Blob; filename: string }> {
    const token = await this.getAuthToken()
    const params = new URLSearchParams()
    if (runId) params.set('run_id', runId)
    const query = params.toString()
    
    const response = await fetch(`${this.baseURL}/api/jobs/${jobId}/export/excel${query ? `?${query}` : ''}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Excel export failed' }))
      throw new Error(error.detail || error.message || 'Excel export failed')
    }

    const blob = await response.blob()
    const filename = response.headers.get('Content-Disposition')?.match(/filename=(.+)/)?.[1] || 'export.xlsx'
    return { blob, filename: filename.replace(/"/g, '') }
  }

  // Contact endpoint
  async submitContact(
    data: ApiRequest<ApiPaths['/api/contact']['post']>
  ): Promise<ApiResponse<ApiPaths['/api/contact']['post']>> {
    return this.request('/api/contact', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  }

  async getJobRunExportRefs(jobId: string, runId: string): Promise<{ gdrive?: { csv?: { external_id?: string; status?: string }; xlsx?: { external_id?: string; status?: string } } }> {
    return this.request(`/api/jobs/${jobId}/runs/${runId}/export-refs`)
  }

  // Google Drive Export endpoints
  async exportJobToGoogleDriveCSV(jobId: string, folderId?: string, runId?: string): Promise<{
    success: boolean;
    message: string;
    drive_file_id: string;
    drive_file_name: string;
    web_view_link: string;
    web_content_link: string;
  }> {
    const token = await this.getAuthToken()
    const params = new URLSearchParams();
    if (folderId) {
      params.append('folder_id', folderId);
    }
    if (runId) {
      params.append('run_id', runId);
    }
    
    const url = `${this.baseURL}/api/jobs/${jobId}/export/gdrive/csv${params.toString() ? `?${params.toString()}` : ''}`;

    const response = await fetch(url, {
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

  async exportJobToGoogleDriveExcel(jobId: string, folderId?: string, runId?: string): Promise<{
    success: boolean;
    message: string;
    drive_file_id: string;
    drive_file_name: string;
    web_view_link: string;
    web_content_link: string;
  }> {
    const token = await this.getAuthToken()
    const params = new URLSearchParams();
    if (folderId) {
      params.append('folder_id', folderId);
    }
    if (runId) {
      params.append('run_id', runId);
    }
    
    const url = `${this.baseURL}/api/jobs/${jobId}/export/gdrive/excel${params.toString() ? `?${params.toString()}` : ''}`;

    const response = await fetch(url, {
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

  // ===================================================================
  // CPE Tracker endpoints
  // ===================================================================

  async getCpeStates(): Promise<CpeStatesListResponse> {
    return this.request('/api/cpe/states')
  }

  async listCpeSheets(): Promise<CpeSheetsListResponse> {
    return this.request('/api/cpe/sheets')
  }

  async createCpeSheet(templateId: string, name?: string): Promise<CreateCpeSheetResponse> {
    return this.request('/api/cpe/sheets', {
      method: 'POST',
      body: JSON.stringify({ template_id: templateId, name })
    })
  }

  async deleteCpeSheet(jobId: string): Promise<{ message: string }> {
    return this.request(`/api/cpe/sheets/${jobId}`, {
      method: 'DELETE'
    })
  }

  async startCpeSheet(jobId: string): Promise<StartCpeSheetResponse> {
    return this.request(`/api/cpe/sheets/${jobId}/start`, {
      method: 'POST'
    })
  }

  // ===================================================================
  // Inkwise endpoints
  // ===================================================================

  async listInkwiseDocuments(params?: { page?: number; limit?: number }): Promise<InkwisePaginatedDocuments> {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.limit) searchParams.set('limit', params.limit.toString())
    const query = searchParams.toString()
    return this.request(`/api/inkwise/documents${query ? `?${query}` : ''}`)
  }

  async createInkwiseDocument(data: InkwiseDocumentCreateRequest): Promise<InkwiseDocument> {
    return this.request('/api/inkwise/documents', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getInkwiseDocument(documentId: string): Promise<InkwiseDocument> {
    return this.request(`/api/inkwise/documents/${documentId}`)
  }

  async updateInkwiseDocument(documentId: string, data: InkwiseDocumentUpdateRequest): Promise<InkwiseDocument> {
    return this.request(`/api/inkwise/documents/${documentId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteInkwiseDocument(documentId: string): Promise<{ message: string }> {
    return this.request(`/api/inkwise/documents/${documentId}`, {
      method: 'DELETE',
    })
  }

  async listInkwiseDocumentRevisions(documentId: string): Promise<InkwiseDocumentRevisionListResponse> {
    return this.request(`/api/inkwise/documents/${documentId}/revisions`)
  }

  async getInkwiseDocumentRevision(documentId: string, revisionId: string): Promise<InkwiseDocumentRevision> {
    return this.request(`/api/inkwise/documents/${documentId}/revisions/${revisionId}`)
  }

  async restoreInkwiseDocumentRevision(documentId: string, revisionId: string): Promise<InkwiseDocument> {
    return this.request(`/api/inkwise/documents/${documentId}/revisions/${revisionId}:restore`, {
      method: 'POST',
    })
  }

  async getInkwiseDocumentSources(documentId: string): Promise<InkwiseDocumentBoundSources> {
    return this.request(`/api/inkwise/documents/${documentId}/sources`)
  }

  async bindInkwiseSources(documentId: string, sourceIds: string[]): Promise<InkwiseBindSourcesResponse> {
    return this.request(`/api/inkwise/documents/${documentId}/sources:bind`, {
      method: 'POST',
      body: JSON.stringify({ source_ids: sourceIds }),
    })
  }

  async unbindInkwiseSources(documentId: string, sourceIds: string[]): Promise<InkwiseBindSourcesResponse> {
    return this.request(`/api/inkwise/documents/${documentId}/sources:unbind`, {
      method: 'POST',
      body: JSON.stringify({ source_ids: sourceIds }),
    })
  }

  async exportInkwiseDocument(documentId: string, type: 'pdf' | 'docx'): Promise<{ blob: Blob; filename: string }> {
    const token = await this.getAuthToken()
    const response = await fetch(`${this.baseURL}/api/inkwise/documents/${documentId}/export?type=${type}`, {
      method: 'GET',
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    })

    if (!response.ok) {
      let body: any = null
      let message = `HTTP ${response.status}`
      try {
        body = await response.json()
        message = body?.detail || body?.message || message
      } catch {
        // ignore
      }
      throw new ApiError(response.status, message, body)
    }

    const blob = await response.blob()
    const filename = response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/)?.[1] || `inkwise.${type}`
    return { blob, filename }
  }

  async listInkwiseSources(params?: { page?: number; limit?: number }): Promise<InkwisePaginatedSources> {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.limit) searchParams.set('limit', params.limit.toString())
    const query = searchParams.toString()
    return this.request(`/api/inkwise/sources${query ? `?${query}` : ''}`)
  }

  async getInkwiseSource(sourceId: string): Promise<InkwiseSource> {
    return this.request(`/api/inkwise/sources/${sourceId}`)
  }

  async initInkwiseSourceUpload(data: InkwiseSourceUploadInitRequest): Promise<InkwiseSourceUploadInitResponse> {
    return this.request('/api/inkwise/sources/upload:init', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async captureInkwiseWebpage(data: InkwiseWebpageCaptureRequest): Promise<InkwiseSource> {
    return this.request('/api/inkwise/sources/webpage:capture', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async completeInkwiseSourceUpload(sourceId: string, checksumSha256?: string): Promise<InkwiseSource> {
    return this.request(`/api/inkwise/sources/${sourceId}/upload:complete`, {
      method: 'POST',
      body: JSON.stringify({ checksum_sha256: checksumSha256 ?? null }),
    })
  }

  async previewInkwiseSource(sourceId: string): Promise<InkwiseSignedUrlResponse> {
    return this.request(`/api/inkwise/sources/${sourceId}/preview`)
  }

  async previewInkwiseSourceAsset(sourceId: string, data: InkwiseAssetPreviewRequest): Promise<InkwiseSignedUrlResponse> {
    return this.request(`/api/inkwise/sources/${sourceId}/asset-preview`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async downloadInkwiseSource(sourceId: string): Promise<InkwiseSignedUrlResponse> {
    return this.request(`/api/inkwise/sources/${sourceId}/download`)
  }

  async deleteInkwiseSource(sourceId: string): Promise<{ message: string }> {
    return this.request(`/api/inkwise/sources/${sourceId}`, {
      method: 'DELETE',
    })
  }

  async ingestInkwiseSource(sourceId: string): Promise<InkwiseSourceIngestion> {
    return this.request(`/api/inkwise/sources/${sourceId}/ingest`, {
      method: 'POST',
    })
  }

  async listInkwiseSourceIngestions(sourceId?: string): Promise<InkwiseSourceIngestionListResponse> {
    const query = sourceId ? `?source_id=${sourceId}` : ''
    return this.request(`/api/inkwise/source-ingestions${query}`)
  }

  async listInkwiseTemplates(params?: { page?: number; limit?: number }): Promise<InkwisePaginatedTemplates> {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.limit) searchParams.set('limit', params.limit.toString())
    const query = searchParams.toString()
    return this.request(`/api/inkwise/templates${query ? `?${query}` : ''}`)
  }

  async createInkwiseTemplate(data: InkwiseTemplateCreateRequest): Promise<InkwiseTemplate> {
    return this.request('/api/inkwise/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getInkwiseTemplate(templateId: string): Promise<InkwiseTemplate> {
    return this.request(`/api/inkwise/templates/${templateId}`)
  }

  async updateInkwiseTemplate(templateId: string, data: InkwiseTemplateUpdateRequest): Promise<InkwiseTemplate> {
    return this.request(`/api/inkwise/templates/${templateId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteInkwiseTemplate(templateId: string): Promise<{ message: string }> {
    return this.request(`/api/inkwise/templates/${templateId}`, {
      method: 'DELETE',
    })
  }

  async listInkwiseSystemTemplateCategories(): Promise<{ items: InkwiseSystemTemplateCategory[] }> {
    return this.request('/api/inkwise/system-template-categories')
  }

  async listInkwiseSystemTemplates(categoryId?: number): Promise<{ items: InkwiseSystemTemplate[] }> {
    const query = categoryId ? `?category_id=${categoryId}` : ''
    return this.request(`/api/inkwise/system-templates${query}`)
  }

  async getInkwiseSystemTemplate(systemTemplateId: string): Promise<InkwiseSystemTemplate> {
    return this.request(`/api/inkwise/system-templates/${systemTemplateId}`)
  }

  async listInkwiseChatThreads(documentId?: string): Promise<InkwiseChatThreadsResponse> {
    const query = documentId ? `?document_id=${documentId}` : ''
    return this.request(`/api/inkwise/chat/threads${query}`)
  }

  async createInkwiseChatThread(data: InkwiseChatThreadCreateRequest): Promise<InkwiseChatThread> {
    return this.request('/api/inkwise/chat/threads', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async listInkwiseChatMessages(threadId: string, params?: { page?: number; limit?: number }): Promise<InkwisePaginatedChatMessages> {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.limit) searchParams.set('limit', params.limit.toString())
    const query = searchParams.toString()
    return this.request(`/api/inkwise/chat/threads/${threadId}/messages${query ? `?${query}` : ''}`)
  }

  async streamInkwiseChatMessage(
    threadId: string,
    data: InkwiseChatSendRequest,
    onEvent: (evt: InkwiseSseEvent) => void,
    opts?: { signal?: AbortSignal }
  ): Promise<void> {
    return this.streamSse(`/api/inkwise/chat/threads/${threadId}/messages:stream`, data, onEvent, opts)
  }

  async streamInkwiseRetryChatMessage(
    threadId: string,
    messageId: string,
    data: InkwiseRetryRequest,
    onEvent: (evt: InkwiseSseEvent) => void,
    opts?: { signal?: AbortSignal }
  ): Promise<void> {
    return this.streamSse(`/api/inkwise/chat/threads/${threadId}/messages/${messageId}:retry`, data, onEvent, opts)
  }

  async createInkwisePrediction(
    documentId: string,
    data: InkwisePredictionRequest,
    opts?: { signal?: AbortSignal }
  ): Promise<InkwisePredictionResponse> {
    return this.request(`/api/inkwise/documents/${documentId}/predictions`, {
      method: 'POST',
      signal: opts?.signal,
      body: JSON.stringify(data),
    })
  }

  async streamInkwiseWritingTool(
    data: InkwiseWritingToolRequest,
    onEvent: (evt: InkwiseSseEvent) => void,
    opts?: { signal?: AbortSignal }
  ): Promise<void> {
    return this.streamSse('/api/inkwise/writing-tools:stream', data, onEvent, opts)
  }

  async streamInkwiseRetryWritingTool(
    attemptId: string,
    data: InkwiseRetryRequest,
    onEvent: (evt: InkwiseSseEvent) => void,
    opts?: { signal?: AbortSignal }
  ): Promise<void> {
    return this.streamSse(`/api/inkwise/writing-tools/${attemptId}:retry`, data, onEvent, opts)
  }

  private async streamSse(
    path: string,
    body: unknown,
    onEvent: (evt: InkwiseSseEvent) => void,
    opts?: { signal?: AbortSignal }
  ): Promise<void> {
    const token = await this.getAuthToken()
    const response = await fetch(`${this.baseURL}${path}`, {
      method: 'POST',
      signal: opts?.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      let bodyJson: any = null
      let message = `HTTP ${response.status}`
      try {
        bodyJson = await response.json()
        message = bodyJson?.detail || bodyJson?.message || message
      } catch {
        // ignore
      }
      throw new ApiError(response.status, message, bodyJson)
    }

    if (!response.body) return
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      while (true) {
        const idx = buffer.indexOf('\n\n')
        if (idx === -1) break
        const raw = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)

        let event = 'message'
        let dataStr = ''
        for (const line of raw.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim()
          if (line.startsWith('data:')) dataStr += line.slice(5).trim()
        }

        let parsed: any = dataStr
        try {
          parsed = JSON.parse(dataStr)
        } catch {
          // keep string
        }
        onEvent({ event, data: parsed })
      }
    }
  }

}

export const apiClient = new ApiClient()

// Export commonly used types
export type UserResponse = ApiResponse<ApiPaths['/api/users/me']['get']>
export type TemplatesResponse = ApiResponse<ApiPaths['/api/templates']['get']>
export type SubscriptionStatus = ApiResponse<ApiPaths['/api/stripe/subscription-status']['get']>

// Job-related types
export type JobInitiateResponse = ApiResponse<ApiPaths['/api/jobs/initiate']['post']>
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
    result_set_index?: number
  }>
}

// Job Runs types
export type JobRunListResponse = ApiResponse<ApiPaths['/api/jobs/{job_id}/runs']['get']>
export type JobRunCreateRequest = ApiRequest<ApiPaths['/api/jobs/{job_id}/runs']['post']>
export type JobRunCreateResponse = ApiResponse<ApiPaths['/api/jobs/{job_id}/runs']['post']>
export type JobRunDetailsResponse = ApiResponse<ApiPaths['/api/jobs/{job_id}/runs/{run_id}']['get']>

// Import types from generated OpenAPI schema
import { components } from './api-types'

export type JobStatus = components['schemas']['JobStatus']
export type ProcessingMode = components['schemas']['ProcessingMode']
export type FileUploadInfo = components['schemas']['FileUploadInfo']
// These models exist in the backend but are not currently referenced by any OpenAPI endpoint.
// Keep local definitions so the frontend can type its internal workflow state.
export type TaskDefinition = {
  path: string
  mode: ProcessingMode
}

export type JobFieldConfig = {
  field_name: string
  data_type_id: string
  ai_prompt: string
  display_order?: number
}
export type JobListItem = components['schemas']['JobListItem']
export type JobFileInfo = components['schemas']['JobFileInfo']
export type FileStatus = components['schemas']['FileStatus']

// All-runs file info (for CPE tracker) - manual type until OpenAPI is regenerated
export interface JobFileAllRunsInfo {
  id: string
  original_path: string
  original_filename: string
  file_size_bytes: number
  status: FileStatus
  job_run_id: string
  run_created_at?: string
  run_status?: string
}

export interface JobFilesAllRunsResponse {
  files: JobFileAllRunsInfo[]
}

// Job Runs component types
export type JobRunListItem = components['schemas']['JobRunListItem']

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

// CPE Tracker types
export interface CpeStateResponse {
  template_id: string
  name: string
}

export interface CpeStatesListResponse {
  states: CpeStateResponse[]
}

export interface CpeSheetListItem {
  job_id: string
  name: string
  state_name?: string
  status: string
  config_step: string
  created_at: string
  latest_run_id?: string
}

export interface CpeSheetsListResponse {
  sheets: CpeSheetListItem[]
  total: number
}

export interface CreateCpeSheetResponse {
  job_id: string
  run_id: string
  message: string
}

export interface StartCpeSheetResponse {
  active_run_id: string
  message: string
}

export type InkwiseSseEvent = {
  event: string
  data: any
}

export interface InkwiseEvidenceLocator {
  kind?: string
  page_start?: number | null
  page_end?: number | null
  [key: string]: any
}

export interface InkwiseCitation {
  evidence_id?: string
  source_id?: string
  source_title?: string
  page_number?: number
  segment_id?: string | null
  segment_title?: string | null
  locator_json?: InkwiseEvidenceLocator | null
  preview_bucket?: string | null
  preview_object?: string | null
  excerpt?: string
}

export interface InkwiseGroundedSegment {
  text: string
  citation_ids?: string[]
}

export interface InkwiseDocument {
  id: string
  user_id: string
  title: string
  content_json: Record<string, any> | null
  content_html: string | null
  init_prompt: string | null
  language?: string | null
  version: number
  created_at: string
  updated_at: string
}

export interface InkwiseDocumentRevision {
  id: string
  document_id: string
  user_id: string
  revision_number: number
  title: string
  content_json: Record<string, any> | null
  content_html: string | null
  init_prompt: string | null
  language?: string | null
  document_version: number
  source_kind: string
  source_meta?: Record<string, any> | null
  created_at: string
}

export interface InkwiseDocumentRevisionListResponse {
  document_id: string
  items: InkwiseDocumentRevision[]
}

export interface InkwisePaginatedDocuments {
  items: InkwiseDocument[]
  page: number
  limit: number
  total: number
}

export interface InkwiseDocumentCreateRequest {
  title?: string | null
  content_json?: Record<string, any> | null
  content_html?: string | null
  init_prompt?: string | null
  language?: string | null
}

export interface InkwiseDocumentUpdateRequest extends InkwiseDocumentCreateRequest {
  version: number
}

export interface InkwiseSource {
  id: string
  type: string
  title: string
  original_filename: string | null
  content_type: string
  size_bytes: number
  checksum_sha256: string | null
  source_url?: string | null
  status: string
  failure_code?: string | null
  failure_detail?: string | null
  created_at: string
  updated_at: string
}

export interface InkwisePaginatedSources {
  items: InkwiseSource[]
  page: number
  limit: number
  total: number
}

export interface InkwiseSourceUploadInitRequest {
  original_filename: string
  content_type: string
  size_bytes: number
  title?: string | null
}

export interface InkwiseWebpageCaptureRequest {
  source_url: string
  title?: string | null
}

export interface InkwiseSourceUploadInitResponse {
  source: InkwiseSource
  upload: {
    method: string
    url: string
    headers: Record<string, string>
    expires_at: string
  }
}

export interface InkwiseSignedUrlResponse {
  url: string
  expires_at: string
}

export interface InkwiseAssetPreviewRequest {
  bucket?: string | null
  object_name: string
  disposition_filename?: string | null
}

export interface InkwiseSourceIngestion {
  id: string
  source_id: string
  pipeline: string
  status: string
  extraction_engine?: string | null
  canonical_pdf_gcs_bucket?: string | null
  canonical_pdf_gcs_object?: string | null
  normalizer_version?: string | null
  embedding_model?: string | null
  embedding_dimension?: number | null
  embedding_location?: string | null
  started_at?: string | null
  finished_at?: string | null
  page_count?: number | null
  segment_count?: number | null
  provider_document_name?: string | null
  preview_manifest_bucket?: string | null
  preview_manifest_object?: string | null
  error_json?: Record<string, any> | null
  created_at: string
}

export interface InkwiseSourceIngestionListResponse {
  source_id?: string | null
  ingestions: InkwiseSourceIngestion[]
}

export interface InkwiseBoundSource {
  binding_id: string
  source: InkwiseSource
  is_active: boolean
  grounded_chat_ready: boolean
  grounded_chat_reason?: string | null
}

export interface InkwiseDocumentBoundSources {
  document_id: string
  sources: InkwiseBoundSource[]
}

export interface InkwiseBindSourcesResponse {
  document_id: string
  bound_source_ids: string[]
}

export interface InkwiseTemplate {
  id: string
  user_id: string
  title: string
  description?: string | null
  content_json: Record<string, any>
  created_at: string
  updated_at: string
}

export interface InkwisePaginatedTemplates {
  items: InkwiseTemplate[]
  page: number
  limit: number
  total: number
}

export interface InkwiseTemplateCreateRequest {
  title: string
  description?: string | null
  content_json: Record<string, any>
}

export interface InkwiseTemplateUpdateRequest {
  title?: string | null
  description?: string | null
  content_json?: Record<string, any> | null
}

export interface InkwiseSystemTemplateCategory {
  id: number
  name: string
}

export interface InkwiseSystemTemplate {
  id: string
  category_id: number
  title: string
  description?: string | null
  content_json: Record<string, any>
}

export interface InkwiseChatThread {
  id: string
  user_id: string
  document_id: string
  mode?: string | null
  title?: string | null
  created_at: string
}

export interface InkwiseChatThreadsResponse {
  document_id?: string | null
  threads: InkwiseChatThread[]
}

export interface InkwiseChatThreadCreateRequest {
  document_id: string
  title?: string | null
}

export interface InkwiseChatMessage {
  id: string
  thread_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  content_with_citations?: string | null
  citations_json?: {
    retrieval_run_id?: string | null
    citations?: InkwiseCitation[]
    segments?: InkwiseGroundedSegment[]
    content_with_citations?: string | null
    [key: string]: any
  } | null
  provider: string
  provider_meta?: Record<string, any> | null
  created_at: string
}

export interface InkwisePaginatedChatMessages {
  items: InkwiseChatMessage[]
  page: number
  limit: number
  total: number
}

export interface InkwiseChatSendRequest {
  content: string
  source_ids?: string[] | null
  draft_selection_text?: string | null
  draft_selection_label?: string | null
}

export interface InkwiseRetryRequest {
  fresh_retrieval?: boolean
}

export interface InkwisePredictionRequest {
  before_text: string
  after_text?: string | null
  current_block_text?: string | null
}

export interface InkwisePredictionResponse {
  suggestion_text: string
  content_with_citations?: string | null
  segments?: InkwiseGroundedSegment[]
  grounded: boolean
  retrieval_run_id?: string | null
  attempt_id?: string | null
  evidence_count?: number
  evidence?: InkwiseCitation[]
  citations?: InkwiseCitation[]
  provider: string
  model: string
}

export type InkwiseWritingAction =
  | 'coherent'
  | 'concise'
  | 'detailed'
  | 'humanize'
  | 'other'

export interface InkwiseWritingToolRequest {
  action: InkwiseWritingAction
  document_id?: string | null
  source_ids?: string[] | null
  selection_text?: string | null
  surrounding_text?: string | null
  instruction: string
}
