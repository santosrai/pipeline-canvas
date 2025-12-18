import React, { useState } from 'react';
import { usePipelineStore } from '../store/pipelineStore';
import { Pipeline } from '../types/index';
import { Trash2, Play, Edit2, X } from 'lucide-react';

interface PipelineManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PipelineManager: React.FC<PipelineManagerProps> = ({ isOpen, onClose }) => {
  const { savedPipelines, loadPipeline, deletePipeline } = usePipelineStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  if (!isOpen) return null;

  const handleLoad = (pipeline: Pipeline) => {
    loadPipeline(pipeline.id);
    onClose();
  };

  const handleDelete = (pipelineId: string) => {
    if (confirm('Are you sure you want to delete this pipeline?')) {
      deletePipeline(pipelineId);
    }
  };

  const handleStartEdit = (pipeline: Pipeline) => {
    setEditingId(pipeline.id);
    setEditName(pipeline.name);
  };

  const handleSaveEdit = (pipelineId: string) => {
    const pipeline = savedPipelines.find((p) => p.id === pipelineId);
    if (pipeline && editName.trim()) {
      usePipelineStore.getState().savePipeline(editName.trim());
      setEditingId(null);
      setEditName('');
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  const getStatusColor = (status: Pipeline['status']) => {
    switch (status) {
      case 'running':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Pipeline Manager</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto">
          {savedPipelines.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-2">No saved pipelines</p>
              <p className="text-sm text-gray-400">
                Create a pipeline and save it to see it here
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {savedPipelines.map((pipeline) => (
                <div
                  key={pipeline.id}
                  className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      {editingId === pipeline.id ? (
                        <div className="flex items-center gap-2 mb-2">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveEdit(pipeline.id)}
                            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            Save
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <h3 className="text-sm font-semibold text-gray-900 mb-1">
                          {pipeline.name}
                        </h3>
                      )}
                      
                      <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
                        <span>{pipeline.nodes.length} nodes</span>
                        <span>•</span>
                        <span>{pipeline.edges.length} edges</span>
                        <span>•</span>
                        <span className={`px-2 py-0.5 rounded ${getStatusColor(pipeline.status)}`}>
                          {pipeline.status}
                        </span>
                      </div>
                      
                      <p className="text-xs text-gray-400">
                        Created: {new Date(pipeline.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => handleLoad(pipeline)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                        title="Load pipeline"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleStartEdit(pipeline)}
                        className="p-2 text-gray-600 hover:bg-gray-50 rounded"
                        title="Rename pipeline"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(pipeline.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded"
                        title="Delete pipeline"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

