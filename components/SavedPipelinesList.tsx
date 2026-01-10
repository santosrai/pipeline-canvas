import React, { useState } from 'react';
import { usePipelineStore } from '../store/pipelineStore';
import { usePipelineContext } from '../context/PipelineContext';
import { Pipeline } from '../types/index';
import { Trash2, Edit2, FolderOpen, Plus, X, Menu } from 'lucide-react';

export const SavedPipelinesList: React.FC = () => {
  const { 
    savedPipelines, 
    loadPipeline, 
    deletePipeline, 
    currentPipeline, 
    setCurrentPipeline,
    isPipelinesSidebarCollapsed,
    togglePipelinesSidebar
  } = usePipelineStore();
  const { apiClient, authState } = usePipelineContext();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Debug: Log when savedPipelines changes
  React.useEffect(() => {
    console.log('[SavedPipelinesList] savedPipelines updated:', {
      count: savedPipelines.length,
      pipelines: savedPipelines.map(p => ({ id: p.id, name: p.name })),
    });
  }, [savedPipelines]);

  const handleLoad = (pipeline: Pipeline) => {
    loadPipeline(pipeline.id, { apiClient, authState });
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
      loadPipeline(pipelineId, { apiClient, authState });
      // Use setTimeout to ensure the pipeline is loaded before saving
      setTimeout(() => {
        usePipelineStore.getState().savePipeline(editName.trim(), undefined, undefined, {
          apiClient,
          authState,
        });
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

  // Collapsed sidebar view
  if (isPipelinesSidebarCollapsed) {
    return (
      <div className="w-12 pc-bg-sidebar border-r border-gray-200 flex flex-col items-center py-2 space-y-2 flex-shrink-0">
        {/* Toggle button */}
        <button
          onClick={togglePipelinesSidebar}
          className="w-8 h-8 flex items-center justify-center text-[hsl(var(--pc-text-secondary))] hover:text-[hsl(var(--pc-text-primary))] hover:bg-[hsl(var(--pc-muted)/0.5)] rounded transition-colors"
          title="Expand sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* New pipeline button */}
        <button
          onClick={handleNewPipeline}
          className="w-8 h-8 flex items-center justify-center text-[hsl(var(--pc-text-secondary))] hover:text-[hsl(var(--pc-text-primary))] hover:bg-[hsl(var(--pc-muted)/0.5)] rounded transition-colors"
          title="New Pipeline"
        >
          <Plus className="w-4 h-4" />
        </button>

        {/* Active pipeline indicator */}
        {currentPipeline && (
          <div className="w-8 h-8 flex items-center justify-center">
            <div className="w-2 h-2 bg-blue-500 rounded-full" title="Active pipeline" />
          </div>
        )}

        {/* Pipeline count indicator */}
        {savedPipelines.length > 0 && (
          <div className="mt-auto mb-2">
            <div className="w-6 h-6 bg-[hsl(var(--pc-muted))] border border-gray-200 rounded text-xs text-[hsl(var(--pc-text-secondary))] flex items-center justify-center">
              {savedPipelines.length > 99 ? '99+' : savedPipelines.length}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Expanded sidebar view
  return (
    <div className="w-64 pc-bg-sidebar border-r border-gray-200 p-4 flex flex-col h-full flex-shrink-0 animate-in slide-in-from-left duration-300">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-[hsl(var(--pc-text-secondary))]" />
          <h3 className="text-sm font-semibold text-[hsl(var(--pc-text-primary))]">Saved Pipelines</h3>
        </div>
        <button
          onClick={togglePipelinesSidebar}
          className="p-1 text-[hsl(var(--pc-text-muted))] hover:text-[hsl(var(--pc-text-secondary))] hover:bg-[hsl(var(--pc-muted)/0.5)] rounded transition-colors"
          title="Collapse sidebar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      
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
            <p className="text-xs text-[hsl(var(--pc-text-muted))] mb-1">No saved pipelines</p>
            <p className="text-xs text-[hsl(var(--pc-text-muted)/0.7)]">
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
                    : 'border-gray-200 hover:border-gray-200 hover:bg-[hsl(var(--pc-muted)/0.5)]'
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
                      className="w-full px-2 py-1 text-xs bg-[hsl(var(--pc-muted))] border border-gray-200 rounded text-[hsl(var(--pc-text-primary))] focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                        className="flex-1 px-2 py-1 text-xs bg-[hsl(var(--pc-secondary))] text-[hsl(var(--pc-text-secondary))] rounded hover:bg-[hsl(var(--pc-muted))]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-medium text-[hsl(var(--pc-text-primary))] flex-1 line-clamp-1 truncate">
                      {pipeline.name}
                    </h4>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={(e) => handleStartEdit(pipeline, e)}
                        className="p-1 text-[hsl(var(--pc-text-muted))] hover:text-[hsl(var(--pc-text-secondary))] rounded transition-colors"
                        title="Rename"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => handleDelete(pipeline.id, e)}
                        className="p-1 text-[hsl(var(--pc-text-muted))] hover:text-red-400 rounded transition-colors"
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

