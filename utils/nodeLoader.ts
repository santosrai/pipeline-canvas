import { NodeType } from '../types/index';

export interface NodeMetadata {
  type: NodeType;
  label: string;
  icon: string;
  color: string;
  borderColor: string;
  bgColor: string;
  description: string;
}

export interface FieldSchema {
  type: 'string' | 'number' | 'boolean';
  required?: boolean;
  default?: any;
  placeholder?: string;
  label: string;
  helpText?: string;
  min?: number;
  max?: number;
  step?: number;
  validation?: {
    pattern?: string;
    message?: string;
  };
}

export interface NodeSchema {
  [key: string]: FieldSchema;
}

export interface HandleDefinition {
  id: string;
  type: 'source' | 'target';
  position: 'left' | 'right';
  dataType?: string;
}

export interface ExecutionConfig {
  type: string;
  endpoint: string | null;
  method: string;
  payload?: Record<string, any>;
}

export interface NodeDefinition {
  metadata: NodeMetadata;
  schema: NodeSchema;
  handles: {
    inputs: HandleDefinition[];
    outputs: HandleDefinition[];
  };
  execution: ExecutionConfig;
  defaultConfig: Record<string, any>;
}

// Cache for loaded node configs
const nodeConfigCache: Map<NodeType, NodeDefinition> = new Map();

/**
 * Loads a node configuration from its JSON file
 */
export async function loadNodeConfig(nodeType: NodeType): Promise<NodeDefinition> {
  // Check cache first
  if (nodeConfigCache.has(nodeType)) {
    return nodeConfigCache.get(nodeType)!;
  }

  try {
    // Dynamically import the JSON file
    const config = await import(`../nodes/${nodeType}/node.json`);
    const nodeConfig: NodeDefinition = config.default || config;
    
    // Validate the config
    validateNodeConfig(nodeConfig, nodeType);
    
    // Cache it
    nodeConfigCache.set(nodeType, nodeConfig);
    
    return nodeConfig;
  } catch (error) {
    throw new Error(`Failed to load node config for ${nodeType}: ${error}`);
  }
}

/**
 * Validates a node configuration
 */
function validateNodeConfig(config: any, expectedType: NodeType): void {
  if (!config.metadata) {
    throw new Error(`Node config for ${expectedType} is missing metadata`);
  }
  
  if (config.metadata.type !== expectedType) {
    throw new Error(`Node config type mismatch: expected ${expectedType}, got ${config.metadata.type}`);
  }
  
  if (!config.schema) {
    throw new Error(`Node config for ${expectedType} is missing schema`);
  }
  
  if (!config.handles) {
    throw new Error(`Node config for ${expectedType} is missing handles`);
  }
  
  if (!config.execution) {
    throw new Error(`Node config for ${expectedType} is missing execution config`);
  }
  
  if (!config.defaultConfig) {
    throw new Error(`Node config for ${expectedType} is missing defaultConfig`);
  }
}

/**
 * Loads all node configurations
 */
export async function loadAllNodeConfigs(): Promise<Map<NodeType, NodeDefinition>> {
  const nodeTypes: NodeType[] = ['input_node', 'rfdiffusion_node', 'proteinmpnn_node', 'alphafold_node'];
  
  const configs = await Promise.all(
    nodeTypes.map(async (type) => {
      const config = await loadNodeConfig(type);
      return [type, config] as [NodeType, NodeDefinition];
    })
  );
  
  return new Map(configs);
}

/**
 * Gets node metadata for a node type
 */
export async function getNodeMetadata(nodeType: NodeType): Promise<NodeMetadata> {
  const config = await loadNodeConfig(nodeType);
  return config.metadata;
}

/**
 * Gets the default configuration for a node type
 */
export async function getDefaultNodeConfig(nodeType: NodeType): Promise<Record<string, any>> {
  const config = await loadNodeConfig(nodeType);
  return { ...config.defaultConfig };
}

