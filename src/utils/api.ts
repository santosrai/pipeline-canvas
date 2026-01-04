import axios from 'axios';

// Configure API base URL. Set VITE_API_BASE in your env, e.g.:
const VITE_API_BASE = "http://localhost:8787/api"
// const baseURL = import.meta.env?.VITE_API_BASE || '/api';
const baseURL = VITE_API_BASE || '/api';

export const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});


// Add request interceptor to inject JWT token
api.interceptors.request.use((config) => {
  // Get auth token from localStorage
  try {
    const authStorage = localStorage.getItem('novoprotein-auth-storage');
    if (authStorage) {
      const { state } = JSON.parse(authStorage);
      const accessToken = state?.accessToken;
      if (accessToken) {
        config.headers['Authorization'] = `Bearer ${accessToken}`;
      }
    }
  } catch (e) {
    console.warn('Failed to read auth token from storage', e);
  }
  
  // Legacy: Also check for API key (for backward compatibility)
  try {
    const storageItem = localStorage.getItem('novoprotein-settings-storage');
    if (storageItem) {
      const { state } = JSON.parse(storageItem);
      const apiKey = state?.settings?.api?.key;
      if (apiKey && !config.headers['Authorization']) {
        config.headers['x-api-key'] = apiKey;
      }
    }
  } catch (e) {
    // Ignore
  }
  
  return config;
});

// Add response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // Handle 401 Unauthorized - try to refresh token
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        const authStorage = localStorage.getItem('novoprotein-auth-storage');
        if (authStorage) {
          const { state } = JSON.parse(authStorage);
          const refreshToken = state?.refreshToken;
          
          if (refreshToken) {
            // Try to refresh access token
            const response = await axios.post(`${baseURL}/auth/refresh`, {
              refresh_token: refreshToken
            });
            
            const { access_token } = response.data;
            
            // Update stored token
            const updatedState = { ...state, accessToken: access_token };
            localStorage.setItem('novoprotein-auth-storage', JSON.stringify({ state: updatedState }));
            
            // Retry original request with new token
            originalRequest.headers['Authorization'] = `Bearer ${access_token}`;
            return api(originalRequest);
          }
        }
      } catch (refreshError) {
        // Refresh failed, sign out user
        localStorage.removeItem('novoprotein-auth-storage');
        window.location.href = '/signin';
        return Promise.reject(refreshError);
      }
    }
    
    // Handle 402 Payment Required (insufficient credits)
    if (error.response?.status === 402) {
      // This will be handled by the component
      return Promise.reject(error);
    }
    
    return Promise.reject(error);
  }
);

export function setApiBaseUrl(url: string) {
  api.defaults.baseURL = url;
}

/**
 * Get the current authentication token from localStorage.
 * This is useful for fetch() calls that need to include the Authorization header.
 */
export function getAuthToken(): string | null {
  try {
    const authStorage = localStorage.getItem('novoprotein-auth-storage');
    if (authStorage) {
      const { state } = JSON.parse(authStorage);
      return state?.accessToken || null;
    }
  } catch (e) {
    console.warn('Failed to read auth token from storage', e);
  }
  return null;
}

/**
 * Get headers for authenticated fetch requests.
 * Includes Authorization header if token is available.
 */
export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export interface Model {
  id: string;
  name: string;
  provider: string;
  description: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
  architecture?: Record<string, any>;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  kind: string;
  category: string;
}

export async function fetchModels(): Promise<Model[]> {
  try {
    const response = await api.get<{ models: Model[] }>('/models');
    const models = response.data.models || [];
    console.log('[API] Fetched models:', models.length);
    return models;
  } catch (error: any) {
    console.error('[API] Failed to fetch models:', error);
    if (error.response) {
      console.error('[API] Response status:', error.response.status);
      console.error('[API] Response data:', error.response.data);
    }
    return [];
  }
}

export async function fetchAgents(): Promise<Agent[]> {
  try {
    const response = await api.get<{ agents: Agent[] }>('/agents');
    return response.data.agents || [];
  } catch (error) {
    console.error('Failed to fetch agents:', error);
    return [];
  }
}

export interface StreamChunk {
  type: 'thinking_step' | 'content' | 'complete' | 'error';
  data: any;
}

/**
 * Stream agent route responses for thinking models.
 * Yields chunks as they arrive from the server.
 */
export async function* streamAgentRoute(payload: {
  input: string;
  currentCode?: string;
  history?: Array<{ type: string; content: string }>;
  selection?: any;
  selections?: any[];
  agentId?: string;
  model?: string;
  uploadedFileId?: string;
}): AsyncGenerator<StreamChunk, void, unknown> {
  // Get API key from localStorage
  let apiKey: string | undefined;
  try {
    const storageItem = localStorage.getItem('novoprotein-settings-storage');
    if (storageItem) {
      const { state } = JSON.parse(storageItem);
      apiKey = state?.settings?.api?.key;
    }
  } catch (e) {
    console.warn('Failed to read API key from storage', e);
  }

  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  // Make streaming request
  const response = await fetch(`${baseURL}/agents/route-stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    yield {
      type: 'error',
      data: { error: errorData.error || 'Request failed', detail: errorData.detail },
    };
    return;
  }

  // Read stream
  const reader = response.body?.getReader();
  if (!reader) {
    yield {
      type: 'error',
      data: { error: 'No response body' },
    };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }

      // Decode chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete lines (newline-delimited JSON)
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        try {
          const chunk: StreamChunk = JSON.parse(trimmed);
          yield chunk;

          // If we get a complete or error, we're done
          if (chunk.type === 'complete' || chunk.type === 'error') {
            return;
          }
        } catch (e) {
          console.warn('[Stream] Failed to parse chunk:', trimmed, e);
          // Continue processing other chunks
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      try {
        const chunk: StreamChunk = JSON.parse(buffer.trim());
        yield chunk;
      } catch (e) {
        console.warn('[Stream] Failed to parse final chunk:', buffer, e);
      }
    }
  } catch (error: any) {
    console.error('[Stream] Error reading stream:', error);
    yield {
      type: 'error',
      data: { error: 'Stream read error', detail: error.message },
    };
  } finally {
    reader.releaseLock();
  }
}
