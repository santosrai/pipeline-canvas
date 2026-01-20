/**
 * Adapter interfaces for backend abstraction
 * Allows the pipeline-canvas library to work with any backend framework
 */

import { Pipeline } from './index';
import { ApiClient } from './dependencies';

/**
 * Options for saving a pipeline
 */
export interface SaveOptions {
  /**
   * Optional message ID to link the pipeline to a message
   */
  messageId?: string;
  /**
   * Optional conversation ID to link the pipeline to a conversation
   */
  conversationId?: string;
  /**
   * Optional session ID (used as conversation ID if conversationId not provided)
   */
  sessionId?: string;
  /**
   * Pipeline status (default: 'draft')
   */
  status?: 'draft' | 'running' | 'completed' | 'failed';
}

/**
 * Filters for listing pipelines
 */
export interface ListFilters {
  /**
   * Filter by status
   */
  status?: 'draft' | 'running' | 'completed' | 'failed';
  /**
   * Filter by message ID
   */
  messageId?: string;
  /**
   * Filter by conversation ID
   */
  conversationId?: string;
  /**
   * Limit number of results
   */
  limit?: number;
  /**
   * Offset for pagination
   */
  offset?: number;
}

/**
 * Pipeline Persistence Adapter
 * Handles saving, loading, listing, and deleting pipelines
 */
export interface PipelinePersistenceAdapter {
  /**
   * Save a pipeline to the backend
   * @param pipeline The pipeline to save
   * @param options Optional save options
   * @returns Promise resolving to the saved pipeline ID
   */
  save(pipeline: Pipeline, options?: SaveOptions): Promise<{ id: string }>;

  /**
   * Load a pipeline by ID
   * @param id The pipeline ID
   * @returns Promise resolving to the pipeline
   */
  load(id: string): Promise<Pipeline>;

  /**
   * List pipelines with optional filters
   * @param filters Optional filters for listing
   * @returns Promise resolving to an array of pipelines
   */
  list(filters?: ListFilters): Promise<Pipeline[]>;

  /**
   * Delete a pipeline by ID
   * @param id The pipeline ID
   * @returns Promise that resolves when deletion is complete
   */
  delete(id: string): Promise<void>;

  /**
   * Optional: Sync pipelines from backend
   * Used for initial load and periodic synchronization
   * @returns Promise resolving to an array of pipelines
   */
  sync?(): Promise<Pipeline[]>;
}

/**
 * Node execution parameters
 */
export interface NodeExecutionParams {
  /**
   * Node type (e.g., 'rfdiffusion_node', 'alphafold_node')
   */
  nodeType: string;
  /**
   * Node configuration
   */
  config: Record<string, any>;
  /**
   * Input data from connected nodes
   */
  inputData: Record<string, any>;
  /**
   * Optional session ID for execution context
   */
  sessionId?: string;
}

/**
 * Node Execution Adapter
 * Handles execution of individual pipeline nodes
 */
export interface NodeExecutionAdapter {
  /**
   * Execute a node with given parameters
   * @param params Node execution parameters
   * @returns Promise resolving to the execution result
   */
  execute(params: NodeExecutionParams): Promise<any>;

  /**
   * Optional: Check execution status for async operations
   * @param jobId Job ID returned from execute()
   * @returns Promise resolving to execution status and result if complete
   */
  checkStatus?(jobId: string): Promise<{ status: 'running' | 'completed' | 'failed'; result?: any; error?: string }>;

  /**
   * Optional: Cancel a running execution
   * @param jobId Job ID to cancel
   * @returns Promise that resolves when cancellation is complete
   */
  cancel?(jobId: string): Promise<void>;
}

/**
 * Default NovoProtein Adapter Implementation
 * Implements the adapter interfaces using NovoProtein's current API structure
 */
export class NovoProteinAdapter implements PipelinePersistenceAdapter {
  constructor(private apiClient: ApiClient) {
    if (!apiClient) {
      throw new Error('ApiClient is required for NovoProteinAdapter');
    }
  }

  async save(pipeline: Pipeline, options?: SaveOptions): Promise<{ id: string }> {
    const pipelineData: any = { ...pipeline };
    
    if (options?.messageId) {
      pipelineData.message_id = options.messageId;
    }
    if (options?.conversationId) {
      pipelineData.conversation_id = options.conversationId;
    } else if (!options?.conversationId && options?.messageId && options?.sessionId) {
      pipelineData.conversation_id = options.sessionId;
    }
    if (options?.status) {
      pipelineData.status = options.status;
    }

    const response = await this.apiClient.post('/pipelines', pipelineData);
    
    // Handle NovoProtein response format: { status: "success", pipeline: {...} }
    if (response.data?.pipeline?.id) {
      return { id: response.data.pipeline.id };
    }
    if (response.data?.id) {
      return { id: response.data.id };
    }
    
    // Fallback: use pipeline's existing ID
    return { id: pipeline.id };
  }

  async load(id: string): Promise<Pipeline> {
    const response = await this.apiClient.get(`/pipelines/${id}`);
    
    // Handle NovoProtein response format
    const backendPipeline = response.data?.pipeline || response.data;
    
    // Convert date strings to Date objects
    if (backendPipeline.createdAt && typeof backendPipeline.createdAt === 'string') {
      backendPipeline.createdAt = new Date(backendPipeline.createdAt);
    }
    if (backendPipeline.updatedAt && typeof backendPipeline.updatedAt === 'string') {
      backendPipeline.updatedAt = new Date(backendPipeline.updatedAt);
    }
    
    return backendPipeline;
  }

  async list(filters?: ListFilters): Promise<Pipeline[]> {
    const response = await this.apiClient.get('/pipelines');
    
    // Handle NovoProtein response format: { pipelines: [...] }
    let backendPipelines = response.data?.pipelines || response.data || [];
    
    // Apply filters if provided
    if (filters?.status) {
      backendPipelines = backendPipelines.filter((p: any) => p.status === filters.status);
    }
    if (filters?.messageId) {
      backendPipelines = backendPipelines.filter((p: any) => p.message_id === filters.messageId);
    }
    if (filters?.conversationId) {
      backendPipelines = backendPipelines.filter((p: any) => p.conversation_id === filters.conversationId);
    }
    
    // Convert date strings to Date objects
    return backendPipelines.map((p: any) => {
      if (p.createdAt && typeof p.createdAt === 'string') {
        p.createdAt = new Date(p.createdAt);
      }
      if (p.updatedAt && typeof p.updatedAt === 'string') {
        p.updatedAt = new Date(p.updatedAt);
      }
      return p;
    });
  }

  async delete(id: string): Promise<void> {
    if (this.apiClient.delete) {
      await this.apiClient.delete(`/pipelines/${id}`);
    } else {
      // Fallback: use POST with method override
      await this.apiClient.post(`/pipelines/${id}`, {}, { 
        headers: { 'X-HTTP-Method-Override': 'DELETE' } 
      });
    }
  }

  async sync(): Promise<Pipeline[]> {
    // Load full pipeline data for each pipeline in the list
    const pipelines = await this.list();
    
    // Fetch full data for each pipeline (NovoProtein may return summaries)
    const fullPipelines = await Promise.all(
      pipelines.map(async (p) => {
        try {
          return await this.load(p.id);
        } catch (error) {
          console.error(`Failed to load full pipeline ${p.id}:`, error);
          return p; // Return summary if full load fails
        }
      })
    );
    
    return fullPipelines;
  }
}
