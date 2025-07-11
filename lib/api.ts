// API utility functions for communicating with FastAPI backend

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export class ApiClient {
  private baseURL: string;

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL;
  }

  private async getAuthToken(): Promise<string | null> {
    try {
      // Get Firebase auth token
      const { auth } = await import('./firebase');
      const user = auth.currentUser;
      if (user) {
        const token = await user.getIdToken();
        console.log('Auth token obtained:', token ? 'Token present' : 'No token');
        return token;
      }
      console.log('No authenticated user found');
      return null;
    } catch (error) {
      console.error('Error getting auth token:', error);
      return null;
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await this.getAuthToken();
    
    const config: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
    };

    const response = await fetch(`${this.baseURL}${endpoint}`, config);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      console.error(`API Error ${response.status}:`, error);
      const errorMessage = error.detail || error.message || `HTTP ${response.status}`;
      throw new Error(errorMessage);
    }

    return response.json();
  }

  // User endpoints
  async getCurrentUser() {
    return this.request('/api/users/me');
  }

  async updateProfile(data: { display_name?: string }) {
    return this.request('/api/users/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getUserUsage() {
    return this.request('/api/users/usage');
  }

  // Auth status is checked automatically by Firebase on frontend
  // No need for a separate verify endpoint - any API call will verify the token

  // Stripe endpoints
  async createCheckoutSession(data: {
    price_id: string;
    success_url: string;
    cancel_url: string;
  }) {
    return this.request('/api/stripe/create-checkout-session', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async createPortalSession(data: { return_url: string }) {
    return this.request('/api/stripe/create-portal-session', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getSubscriptionStatus() {
    return this.request('/api/stripe/subscription-status');
  }

  // Extraction endpoints
  async extractData(files: File[], fields: any[], extractMultipleRows: boolean = false) {
    const formData = new FormData();
    
    // Add files
    files.forEach((file) => {
      formData.append('files', file);
    });
    
    // Add field configuration as JSON string
    formData.append('fields', JSON.stringify(fields));
    formData.append('extract_multiple_rows', extractMultipleRows.toString());

    const token = await this.getAuthToken();
    console.log('Making extraction request with token:', token ? 'Present' : 'Missing');
    
    // For FormData, don't set Content-Type header - let browser set it with boundary
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
      console.log('Authorization header set:', headers.Authorization.substring(0, 20) + '...');
    }
    
    const response = await fetch(`${this.baseURL}/api/extraction/extract`, {
      method: 'POST',
      headers,
      body: formData,
    });

    console.log('Response status:', response.status);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      console.error(`Extraction API Error ${response.status}:`, error);
      const errorMessage = error.detail || error.message || `HTTP ${response.status}`;
      throw new Error(errorMessage);
    }

    return response.json();
  }

  // Template management
  async getTemplates() {
    return this.request('/api/templates/');
  }

  async getPublicTemplates() {
    return this.request('/api/templates/public/all');
  }

  async createTemplate(templateData: {
    name: string;
    description?: string;
    fields: any[];
    is_public?: boolean;
  }) {
    return this.request('/api/templates/', {
      method: 'POST',
      body: JSON.stringify(templateData),
    });
  }

  async getTemplate(templateId: string) {
    return this.request(`/api/templates/${templateId}`);
  }

  async updateTemplate(templateId: string, templateData: any) {
    return this.request(`/api/templates/${templateId}`, {
      method: 'PUT',
      body: JSON.stringify(templateData),
    });
  }

  async deleteTemplate(templateId: string) {
    return this.request(`/api/templates/${templateId}`, {
      method: 'DELETE',
    });
  }
}

export const apiClient = new ApiClient();