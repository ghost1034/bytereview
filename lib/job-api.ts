/**
 * Job-based API client for ByteReview
 * New asynchronous workflow API methods
 */
import {
  JobInitiateRequest,
  JobInitiateResponse,
  JobStartRequest,
  JobStartResponse,
  JobDetailsResponse,
  JobListResponse,
  JobProgressResponse,
  JobResultsResponse,
  UploadedFile
} from './job-types'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

class JobAPIClient {
  private async getAuthHeaders(): Promise<HeadersInit> {
    // Get Firebase auth token
    const { getAuth } = await import('firebase/auth')
    const auth = getAuth()
    const user = auth.currentUser
    
    if (!user) {
      throw new Error('User not authenticated')
    }
    
    const token = await user.getIdToken()
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers = await this.getAuthHeaders()
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        ...headers,
        ...options.headers
      }
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Step 1: Initiate a new job and get pre-signed upload URLs
   */
  async initiateJob(request: JobInitiateRequest): Promise<JobInitiateResponse> {
    return this.request<JobInitiateResponse>('/api/jobs/initiate', {
      method: 'POST',
      body: JSON.stringify(request)
    })
  }

  /**
   * Upload file directly to GCS using pre-signed URL
   */
  async uploadFileToGCS(file: File, uploadUrl: string): Promise<void> {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': 'application/octet-stream'
      }
    })

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status} ${response.statusText}`)
    }
  }

  /**
   * Step 2: Start job processing with configuration
   */
  async startJob(jobId: string, request: JobStartRequest): Promise<JobStartResponse> {
    return this.request<JobStartResponse>(`/api/jobs/${jobId}/start`, {
      method: 'POST',
      body: JSON.stringify(request)
    })
  }

  /**
   * Get detailed job information
   */
  async getJobDetails(jobId: string): Promise<JobDetailsResponse> {
    return this.request<JobDetailsResponse>(`/api/jobs/${jobId}`)
  }

  /**
   * List user jobs with pagination
   */
  async listJobs(limit = 25, offset = 0, status?: string): Promise<JobListResponse> {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString()
    })
    
    if (status) {
      params.append('status', status)
    }

    return this.request<JobListResponse>(`/api/jobs?${params}`)
  }

  /**
   * Get job progress for real-time updates
   */
  async getJobProgress(jobId: string): Promise<JobProgressResponse> {
    return this.request<JobProgressResponse>(`/api/jobs/${jobId}/progress`)
  }

  /**
   * Get job results (when implemented)
   */
  async getJobResults(jobId: string, limit = 50, offset = 0): Promise<JobResultsResponse> {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString()
    })

    return this.request<JobResultsResponse>(`/api/jobs/${jobId}/results?${params}`)
  }

  /**
   * Helper method to upload multiple files with progress tracking
   */
  async uploadFiles(
    files: UploadedFile[],
    onProgress?: (fileIndex: number, progress: number) => void
  ): Promise<void> {
    const uploadPromises = files.map(async (fileInfo, index) => {
      if (!fileInfo.uploadUrl) {
        throw new Error(`No upload URL for file: ${fileInfo.file.name}`)
      }

      try {
        onProgress?.(index, 0)
        await this.uploadFileToGCS(fileInfo.file, fileInfo.uploadUrl)
        onProgress?.(index, 100)
        fileInfo.uploaded = true
      } catch (error) {
        fileInfo.error = error instanceof Error ? error.message : 'Upload failed'
        fileInfo.uploaded = false
        throw error
      }
    })

    await Promise.all(uploadPromises)
  }

  /**
   * Complete workflow helper: initiate job and upload files
   */
  async initiateAndUploadFiles(
    files: File[],
    onProgress?: (fileIndex: number, progress: number) => void
  ): Promise<{ jobId: string; uploadedFiles: UploadedFile[] }> {
    // Prepare file info for initiation
    const fileInfos = files.map(file => ({
      filename: file.name,
      path: file.webkitRelativePath || file.name,
      size: file.size,
      type: file.type
    }))

    // Initiate job
    const initResponse = await this.initiateJob({ files: fileInfos })

    // Prepare uploaded file objects
    const uploadedFiles: UploadedFile[] = files.map((file, index) => ({
      file,
      path: initResponse.files[index].original_path,
      uploadUrl: initResponse.files[index].upload_url,
      uploaded: false
    }))

    // Upload files
    await this.uploadFiles(uploadedFiles, onProgress)

    return {
      jobId: initResponse.job_id,
      uploadedFiles
    }
  }
}

// Export singleton instance
export const jobApiClient = new JobAPIClient()

// Export class for testing
export { JobAPIClient }