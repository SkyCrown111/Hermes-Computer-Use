// API Service Base Configuration

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean>;
}

class ApiService {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private buildUrl(path: string, params?: Record<string, string | number | boolean>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, String(value));
      });
    }
    return url.toString();
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { params, ...fetchOptions } = options;
    const url = this.buildUrl(path, params);

    const response = await fetch(url, {
      ...fetchOptions,
      headers: {
        'Content-Type': 'application/json',
        ...fetchOptions.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  get<T>(path: string, params?: Record<string, string | number | boolean>): Promise<T> {
    return this.request<T>(path, { method: 'GET', params });
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }
}

export const api = new ApiService(API_BASE_URL);

// API Endpoints
export const endpoints = {
  // Sessions
  sessions: {
    list: () => api.get('/api/sessions'),
    get: (id: string) => api.get(`/api/sessions/${id}`),
    create: (data: unknown) => api.post('/api/sessions', data),
    delete: (id: string) => api.delete(`/api/sessions/${id}`),
  },
  
  // Skills
  skills: {
    list: (category?: string) => api.get('/api/skills', category ? { category } : undefined),
    get: (id: string) => api.get(`/api/skills/${id}`),
    execute: (id: string, params: unknown) => api.post(`/api/skills/${id}/execute`, params),
  },
  
  // Tasks
  tasks: {
    list: () => api.get('/api/tasks'),
    create: (data: unknown) => api.post('/api/tasks', data),
    update: (id: string, data: unknown) => api.put(`/api/tasks/${id}`, data),
    delete: (id: string) => api.delete(`/api/tasks/${id}`),
    trigger: (id: string) => api.post(`/api/tasks/${id}/trigger`),
  },
  
  // Config
  config: {
    get: () => api.get('/api/config'),
    update: (data: unknown) => api.put('/api/config', data),
  },
  
  // Status
  status: {
    get: () => api.get('/api/status'),
    health: () => api.get('/api/health'),
  },
};
