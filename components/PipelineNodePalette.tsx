import React from 'react';
import { usePipelineStore } from '../store/pipelineStore';
import { NodeType, PipelineNode } from '../types/index';
import { getDefaultNodeConfig } from '../utils/nodeLoader';
import { FileInput, Sparkles, Dna, Layers, MessageSquare, Globe } from 'lucide-react';

interface NodeTypeInfo {
  type: NodeType;
  label: string;
  icon: React.ReactNode;
  color: string;
  description: string;
}

const nodeTypes: NodeTypeInfo[] = [
  {
    type: 'input_node',
    label: 'Input',
    icon: <FileInput className="w-5 h-5" />,
    color: 'bg-blue-500',
    description: 'Upload PDB file',
  },
  {
    type: 'rfdiffusion_node',
    label: 'RFdiffusion',
    icon: <Sparkles className="w-5 h-5" />,
    color: 'bg-purple-500',
    description: 'De novo backbone design',
  },
  {
    type: 'proteinmpnn_node',
    label: 'ProteinMPNN',
    icon: <Dna className="w-5 h-5" />,
    color: 'bg-green-500',
    description: 'Sequence design',
  },
  {
    type: 'alphafold_node',
    label: 'AlphaFold',
    icon: <Layers className="w-5 h-5" />,
    color: 'bg-orange-500',
    description: 'Structure prediction',
  },
  {
    type: 'message_input_node',
    label: 'Code Execution',
    icon: <MessageSquare className="w-5 h-5" />,
    color: 'bg-green-500',
    description: 'Execute JavaScript code for testing and processing',
  },
  {
    type: 'http_request_node',
    label: 'HTTP Request',
    icon: <Globe className="w-5 h-5" />,
    color: 'bg-blue-500',
    description: 'Make HTTP requests to any API endpoint',
  },
];

export const PipelineNodePalette: React.FC = () => {
  const { addNode } = usePipelineStore();

  const handleAddNode = async (nodeType: NodeType) => {
    // Load default config for the node type
    const defaultConfig = await getDefaultNodeConfig(nodeType);
    
    const node: PipelineNode = {
      id: `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: nodeType,
      label: nodeTypes.find((nt) => nt.type === nodeType)?.label || nodeType,
      config: { ...defaultConfig },
      inputs: {},
      status: 'idle',
      position: {
        x: Math.random() * 400 + 100,
        y: Math.random() * 300 + 100,
      },
    };
    
    addNode(node);
  };

  return (
    <div className="w-64 bg-[#1e1e32] border-l border-gray-700/50 p-4 flex flex-col h-full">
      <h3 className="text-sm font-semibold text-gray-200 mb-3 flex-shrink-0">Node Palette</h3>
      <div className="space-y-2 overflow-y-auto flex-1 min-h-0">
        {nodeTypes.map((nodeType) => (
          <button
            key={nodeType.type}
            onClick={() => handleAddNode(nodeType.type)}
            className="w-full p-3 text-left border border-gray-700/50 rounded-lg hover:border-gray-600 hover:bg-gray-800/50 transition-colors group"
          >
            <div className="flex items-center gap-2 mb-1">
              <div className={`${nodeType.color} text-white p-1.5 rounded-lg shadow-lg group-hover:scale-110 transition-transform`}>
                {nodeType.icon}
              </div>
              <span className="text-sm font-medium text-gray-200">
                {nodeType.label}
              </span>
            </div>
            <p className="text-xs text-gray-500">{nodeType.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
};

