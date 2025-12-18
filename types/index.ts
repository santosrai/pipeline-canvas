export type NodeType = 'input_node' | 'rfdiffusion_node' | 'proteinmpnn_node' | 'alphafold_node';

export type NodeStatus = 'idle' | 'running' | 'success' | 'error' | 'pending';

export interface PipelineNodeBlueprint {
  id: string;
  type: NodeType;
  label: string;
  config: Record<string, any>;
  inputs: Record<string, string>; // e.g., {"pdb": "previous_node_id"}
}

export interface PipelineBlueprint {
  rationale: string;
  nodes: PipelineNodeBlueprint[];
  edges: Array<{ source: string; target: string }>;
  missing_resources: string[];
}

export interface PipelineNode extends PipelineNodeBlueprint {
  status: NodeStatus;
  result_metadata?: Record<string, any>;
  error?: string;
  position?: { x: number; y: number };
}

export interface Pipeline {
  id: string;
  name: string;
  nodes: PipelineNode[];
  edges: Array<{ source: string; target: string }>;
  createdAt: Date;
  updatedAt: Date;
  status: 'draft' | 'running' | 'completed' | 'failed';
}

export interface NodeConfig {
  // Input Node
  filename?: string;
  
  // RFdiffusion Node
  contigs?: string;
  num_designs?: number;
  
  // ProteinMPNN Node
  num_sequences?: number;
  temperature?: number;
  
  // AlphaFold Node
  recycle_count?: number;
  num_relax?: number;
}

