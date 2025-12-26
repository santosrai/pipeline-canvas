import React, { useState } from 'react';
import { usePipelineStore } from '../store/pipelineStore';
import { Pipeline } from '../types/index';
import { Trash2, Play, Edit2, FolderOpen, Clock, Plus } from 'lucide-react';

export const SavedPipelinesList: React.FC = () => {
  const { savedPipelines, loadPipeline, deletePipeline, currentPipeline, setCurrentPipeline } = usePipelineStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleLoad = (pipeline: Pipeline) => {
    loadPipeline(pipeline.id);
  };

  const handleNewPipeline = () => {
    const { savedPipelines } = usePipelineStore.getState();
    const newPipeline: Pipeline = {
      id: `pipeline_${Date.now()}`,
      name: 'Unnamed Pipeline',
      nodes: [],
      edges: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'draft',
    };
    // Add to saved pipelines list and set as current
    setCurrentPipeline(newPipeline);
    usePipelineStore.setState({ savedPipelines: [...savedPipelines, newPipeline] });
  };

  const handleDelete = (pipelineId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this pipeline?')) {
      deletePipeline(pipelineId);
    }
  };

  const handleStartEdit = (pipeline: Pipeline, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(pipeline.id);
    setEditName(pipeline.name);
  };

  const handleSaveEdit = (pipelineId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const pipeline = savedPipelines.find((p) => p.id === pipelineId);
    if (pipeline && editName.trim()) {
      // Load the pipeline first to set it as current, then save with new name
      loadPipeline(pipelineId);
      // Use setTimeout to ensure the pipeline is loaded before saving
      setTimeout(() => {
        usePipelineStore.getState().savePipeline(editName.trim());
      }, 0);
      setEditingId(null);
      setEditName('');
    }
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
    setEditName('');
  };

  const getStatusColor = (status: Pipeline['status']) => {
    switch (status) {
      case 'running':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'completed':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'failed':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  return (
    <div className="w-64 bg-[#1e1e32] border-r border-gray-700/50 p-4 flex flex-col h-full">
      <h3 className="text-sm font-semibold text-gray-200 mb-3 flex-shrink-0 flex items-center gap-2">
        <FolderOpen className="w-4 h-4" />
        Saved Pipelines
      </h3>
      
      {/* New Pipeline Button */}
      <button
        onClick={handleNewPipeline}
        className="w-full mb-3 px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors flex items-center justify-center gap-2 flex-shrink-0 shadow-lg hover:shadow-blue-500/20"
      >
        <Plus className="w-4 h-4" />
        New Pipeline
      </button>
      
      <div className="space-y-2 overflow-y-auto flex-1 min-h-0">
        {savedPipelines.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-xs text-gray-500 mb-1">No saved pipelines</p>
            <p className="text-xs text-gray-600">
              Save a pipeline to see it here
            </p>
          </div>
        ) : (
          savedPipelines.map((pipeline) => {
            const isActive = currentPipeline?.id === pipeline.id;
            return (
              <div
                key={pipeline.id}
                onClick={() => handleLoad(pipeline)}
                className={`
                  border rounded-lg p-2 cursor-pointer transition-all
                  ${isActive 
                    ? 'border-blue-500/50 bg-blue-500/10' 
                    : 'border-gray-700/50 hover:border-gray-600 hover:bg-gray-800/50'
                  }
                `}
              >
                {editingId === pipeline.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => handleSaveEdit(pipeline.id, e)}
                        className="flex-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-500"
                      >
                        Save
                      </button>
                      <button
                        onClick={(e) => handleCancelEdit(e)}
                        className="flex-1 px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-medium text-gray-200 flex-1 line-clamp-1 truncate">
                      {pipeline.name}
                    </h4>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={(e) => handleStartEdit(pipeline, e)}
                        className="p-1 text-gray-500 hover:text-gray-300 rounded transition-colors"
                        title="Rename"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => handleDelete(pipeline.id, e)}
                        className="p-1 text-gray-500 hover:text-red-400 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

