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

  async updateProfile(
    data: ApiRequest<ApiPaths['/api/users/me']['put']>
  ): Promise<ApiResponse<ApiPaths['/api/users/me']['put']>> {
    return this.request('/api/users/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async getUserUsage(): Promise<ApiResponse<ApiPaths['/api/users/usage']['get']>> {
    return this.request('/api/users/usage')
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

}

export const apiClient = new ApiClient()

// Export commonly used types
export type UserResponse = ApiResponse<ApiPaths['/api/users/me']['get']>
export type UsageStats = ApiResponse<ApiPaths['/api/users/usage']['get']>
export type TemplatesResponse = ApiResponse<ApiPaths['/api/templates/']['get']>
export type ExtractionResponse = ApiResponse<ApiPaths['/api/extraction/extract']['post']>
export type SubscriptionStatus = ApiResponse<ApiPaths['/api/stripe/subscription-status']['get']>

// Export field configuration type from the generated types
export type FieldConfig = {
  name: string
  data_type: string
  prompt: string
}