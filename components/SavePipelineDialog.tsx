import React, { useState, useEffect } from 'react';
import { usePipelineStore } from '../store/pipelineStore';
import { X, Save, AlertCircle, CheckCircle2 } from 'lucide-react';

interface SavePipelineDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (name: string) => void;
}

export const SavePipelineDialog: React.FC<SavePipelineDialogProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const { currentPipeline, savedPipelines } = usePipelineStore();
  const [pipelineName, setPipelineName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const isEditing = currentPipeline && savedPipelines.some(p => p.id === currentPipeline.id);

  useEffect(() => {
    if (isOpen) {
      // Pre-fill with current pipeline name if editing, or suggest a name
      if (currentPipeline?.name && currentPipeline.name !== 'Unnamed Pipeline') {
        setPipelineName(currentPipeline.name);
      } else {
        setPipelineName('');
      }
      setError(null);
    }
  }, [isOpen, currentPipeline]);

  const handleSave = async () => {
    const trimmedName = pipelineName.trim();
    
    if (!trimmedName) {
      setError('Pipeline name cannot be empty');
      return;
    }

    // Check for duplicate names (excluding current pipeline)
    const duplicate = savedPipelines.find(
      p => p.name.toLowerCase() === trimmedName.toLowerCase() && 
      p.id !== currentPipeline?.id
    );
    
    if (duplicate) {
      setError('A pipeline with this name already exists');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      if (onSave) {
        onSave(trimmedName);
      } else {
        usePipelineStore.getState().savePipeline(trimmedName);
      }
      
      // Show success state briefly
      setShowSuccess(true);
      setTimeout(() => {
        setPipelineName('');
        setError(null);
        setIsSaving(false);
        setShowSuccess(false);
        onClose();
      }, 800);
    } catch (err) {
      setError('Failed to save pipeline. Please try again.');
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setPipelineName('');
    setError(null);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
      <div className="bg-[#1e1e32] border border-gray-700/50 rounded-xl shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700/50">
          <div className="flex items-center gap-2">
            <Save className="w-5 h-5 text-gray-300" />
            <h2 className="text-lg font-semibold text-gray-200">
              {isEditing ? 'Update Pipeline' : 'Save Pipeline'}
            </h2>
          </div>
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {showSuccess ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-3">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-400" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-200 mb-1">
                  Pipeline {isEditing ? 'Updated' : 'Saved'}!
                </h3>
                <p className="text-sm text-gray-400">
                  {pipelineName} has been {isEditing ? 'updated' : 'saved'} successfully.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Pipeline Name
                </label>
                <input
                  type="text"
                  value={pipelineName}
                  onChange={(e) => {
                    setPipelineName(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter pipeline name..."
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                  autoFocus
                  disabled={isSaving}
                />
                {error && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-red-400">
                    <AlertCircle className="w-4 h-4" />
                    <span>{error}</span>
                  </div>
                )}
              </div>

              {currentPipeline && (
                <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
                  <div className="text-xs text-gray-400 space-y-1">
                    <div className="flex items-center justify-between">
                      <span>Nodes:</span>
                      <span className="text-gray-300">{currentPipeline.nodes.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Edges:</span>
                      <span className="text-gray-300">{currentPipeline.edges.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Status:</span>
                      <span className="text-gray-300 capitalize">{currentPipeline.status}</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!showSuccess && (
          <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-700/50">
            <button
              onClick={handleCancel}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!pipelineName.trim() || isSaving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {isEditing ? 'Updating...' : 'Saving...'}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {isEditing ? 'Update' : 'Save'}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

