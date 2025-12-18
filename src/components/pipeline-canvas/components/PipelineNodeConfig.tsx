import React from 'react';
import { usePipelineStore } from '../store/pipelineStore';
import { PipelineNode } from '../types/index';
import { Trash2 } from 'lucide-react';

interface PipelineNodeConfigProps {
  nodeId: string;
  onUpdate: (updates: Partial<PipelineNode>) => void;
  onDelete: () => void;
}

export const PipelineNodeConfig: React.FC<PipelineNodeConfigProps> = ({
  nodeId,
  onUpdate,
  onDelete,
}) => {
  const { currentPipeline } = usePipelineStore();
  const node = currentPipeline?.nodes.find((n) => n.id === nodeId);

  if (!node) {
    return <div className="text-sm text-gray-400">Node not found</div>;
  }

  const handleConfigChange = (key: string, value: any) => {
    onUpdate({
      config: {
        ...node.config,
        [key]: value,
      },
    });
  };

  const inputClassName = "w-full px-3 py-2 text-sm bg-gray-800/50 border border-gray-600/50 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-colors";

  const renderConfigFields = () => {
    switch (node.type) {
      case 'input_node':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">
                Filename
              </label>
              <input
                type="text"
                value={node.config?.filename || ''}
                onChange={(e) => handleConfigChange('filename', e.target.value)}
                className={inputClassName}
                placeholder="target.pdb"
              />
            </div>
          </div>
        );

      case 'rfdiffusion_node':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">
                Contigs
              </label>
              <input
                type="text"
                value={node.config?.contigs || ''}
                onChange={(e) => handleConfigChange('contigs', e.target.value)}
                className={inputClassName}
                placeholder="50"
              />
              <p className="text-xs text-gray-500 mt-1.5">
                Contig specification (e.g., "50" or "A1-50")
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">
                Number of Designs
              </label>
              <input
                type="number"
                value={node.config?.num_designs || 1}
                onChange={(e) => handleConfigChange('num_designs', parseInt(e.target.value) || 1)}
                className={inputClassName}
                min="1"
                max="10"
              />
            </div>
          </div>
        );

      case 'proteinmpnn_node':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">
                Number of Sequences
              </label>
              <input
                type="number"
                value={node.config?.num_sequences || 8}
                onChange={(e) => handleConfigChange('num_sequences', parseInt(e.target.value) || 8)}
                className={inputClassName}
                min="1"
                max="100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">
                Temperature
              </label>
              <input
                type="number"
                step="0.1"
                value={node.config?.temperature || 0.1}
                onChange={(e) => handleConfigChange('temperature', parseFloat(e.target.value) || 0.1)}
                className={inputClassName}
                min="0.1"
                max="1.0"
              />
            </div>
          </div>
        );

      case 'alphafold_node':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">
                Recycle Count
              </label>
              <input
                type="number"
                value={node.config?.recycle_count || 3}
                onChange={(e) => handleConfigChange('recycle_count', parseInt(e.target.value) || 3)}
                className={inputClassName}
                min="1"
                max="20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">
                Number of Relax Steps
              </label>
              <input
                type="number"
                value={node.config?.num_relax || 0}
                onChange={(e) => handleConfigChange('num_relax', parseInt(e.target.value) || 0)}
                className={inputClassName}
                min="0"
                max="10"
              />
            </div>
          </div>
        );

      default:
        return <div className="text-sm text-gray-400">No configuration available</div>;
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-gray-200 mb-1">{node.label}</h4>
        <p className="text-xs text-gray-500">{node.type}</p>
      </div>

      <div className="border-t border-gray-700/50 pt-4">
        {renderConfigFields()}
      </div>

      <div className="border-t border-gray-700/50 pt-4">
        <button
          onClick={onDelete}
          className="w-full px-3 py-2 text-sm bg-red-600/20 text-red-400 border border-red-600/30 rounded-lg hover:bg-red-600/30 flex items-center justify-center gap-2 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Delete Node
        </button>
      </div>
    </div>
  );
};

