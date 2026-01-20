/**
 * Configuration types for pipeline canvas
 * Allows customization of endpoints and response transformers
 */

import { Pipeline } from './index';

/**
 * Pipeline endpoint configuration
 */
export interface PipelineEndpoints {
  /**
   * Save pipeline endpoint
   * Default: '/api/pipelines'
   */
  save?: string;
  
  /**
   * Load pipeline endpoint (with :id placeholder)
   * Default: '/api/pipelines/:id'
   */
  load?: string;
  
  /**
   * List pipelines endpoint
   * Default: '/api/pipelines'
   */
  list?: string;
  
  /**
   * Delete pipeline endpoint (with :id placeholder)
   * Default: '/api/pipelines/:id'
   */
  delete?: string;
}

/**
 * Node execution endpoint configuration
 */
export interface NodeEndpoints {
  /**
   * RFdiffusion node endpoint
   * Default: '/api/rfdiffusion/design'
   */
  rfdiffusion?: string;
  
  /**
   * AlphaFold node endpoint
   * Default: '/api/alphafold/fold'
   */
  alphafold?: string;
  
  /**
   * ProteinMPNN node endpoint
   * Default: '/api/proteinmpnn/design'
   */
  proteinmpnn?: string;
  
  /**
   * Generic node execution endpoint (for custom nodes)
   * Can use :nodeType placeholder
   * Example: '/api/nodes/:nodeType/execute'
   */
  generic?: string;
}

/**
 * Response transformer functions
 * Used to transform backend responses to match expected format
 */
export interface ResponseTransformers {
  /**
   * Transform pipeline response
   * @param response Raw response from backend
   * @returns Transformed pipeline object
   */
  pipeline?: (response: any) => Pipeline;
  
  /**
   * Transform pipeline list response
   * @param response Raw response from backend
   * @returns Array of transformed pipelines
   */
  list?: (response: any) => Pipeline[];
  
  /**
   * Transform node execution response
   * @param response Raw response from backend
   * @param nodeType Node type that was executed
   * @returns Transformed execution result
   */
  nodeExecution?: (response: any, nodeType: string) => any;
}

/**
 * Complete pipeline canvas configuration
 */
export interface PipelineConfig {
  /**
   * API endpoint configuration
   */
  endpoints?: {
    /**
     * Pipeline persistence endpoints
     */
    pipelines?: PipelineEndpoints;
    
    /**
     * Node execution endpoints
     */
    nodes?: NodeEndpoints;
  };
  
  /**
   * Response transformers for customizing backend response format
   */
  responseTransformers?: ResponseTransformers;
  
  /**
   * Enable/disable features
   */
  features?: {
    /**
   * Enable auto-save (default: true)
   */
    autoSave?: boolean;
    
    /**
   * Auto-save debounce delay in milliseconds (default: 1000)
   */
    autoSaveDelay?: number;
    
    /**
   * Enable backend sync on mount (default: true)
   */
    syncOnMount?: boolean;
  };
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Required<PipelineConfig> = {
  endpoints: {
    pipelines: {
      save: '/api/pipelines',
      load: '/api/pipelines/:id',
      list: '/api/pipelines',
      delete: '/api/pipelines/:id',
    },
    nodes: {
      rfdiffusion: '/api/rfdiffusion/design',
      alphafold: '/api/alphafold/fold',
      proteinmpnn: '/api/proteinmpnn/design',
    },
  },
  responseTransformers: {
    pipeline: (response: any) => {
      // Handle NovoProtein format: { status: "success", pipeline: {...} }
      return response.pipeline || response;
    },
    list: (response: any) => {
      // Handle NovoProtein format: { pipelines: [...] }
      return response.pipelines || response || [];
    },
    nodeExecution: (response: any) => {
      // Default: return response as-is
      return response.data || response;
    },
  },
  features: {
    autoSave: true,
    autoSaveDelay: 1000,
    syncOnMount: true,
  },
};

/**
 * Merge user config with defaults
 */
export function mergeConfig(userConfig?: PipelineConfig): Required<PipelineConfig> {
  if (!userConfig) {
    return DEFAULT_CONFIG;
  }

  return {
    endpoints: {
      pipelines: {
        ...DEFAULT_CONFIG.endpoints.pipelines,
        ...userConfig.endpoints?.pipelines,
      },
      nodes: {
        ...DEFAULT_CONFIG.endpoints.nodes,
        ...userConfig.endpoints?.nodes,
      },
    },
    responseTransformers: {
      ...DEFAULT_CONFIG.responseTransformers,
      ...userConfig.responseTransformers,
    },
    features: {
      ...DEFAULT_CONFIG.features,
      ...userConfig.features,
    },
  };
}

/**
 * Replace placeholders in endpoint URLs
 */
export function resolveEndpoint(endpoint: string, params: Record<string, string>): string {
  let resolved = endpoint;
  for (const [key, value] of Object.entries(params)) {
    resolved = resolved.replace(`:${key}`, value);
  }
  return resolved;
}
