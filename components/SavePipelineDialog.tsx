import React, { useState, useEffect } from 'react';
import { usePipelineStore } from '../store/pipelineStore';
import { usePipelineContext } from '../context/PipelineContext';
import { Save, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';

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
  const { apiClient, authState, sessionId } = usePipelineContext();
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
        usePipelineStore.getState().savePipeline(trimmedName, undefined, undefined, {
          apiClient,
          authState,
          sessionId,
        });
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="sm:max-w-md pc-bg-panel border-gray-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[hsl(var(--pc-text-primary))]">
            <Save className="w-5 h-5" />
            {isEditing ? 'Update Pipeline' : 'Save Pipeline'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {showSuccess ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-3">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-400" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-[hsl(var(--pc-text-primary))] mb-1">
                  Pipeline {isEditing ? 'Updated' : 'Saved'}!
                </h3>
                <p className="text-sm text-[hsl(var(--pc-text-secondary))]">
                  {pipelineName} has been {isEditing ? 'updated' : 'saved'} successfully.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="pipeline-name" className="text-[hsl(var(--pc-text-secondary))]">
                  Pipeline Name
                </Label>
                <Input
                  id="pipeline-name"
                  type="text"
                  value={pipelineName}
                  onChange={(e) => {
                    setPipelineName(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter pipeline name..."
                  className="bg-[hsl(var(--pc-muted))] border-gray-200 text-[hsl(var(--pc-text-primary))] placeholder-[hsl(var(--pc-text-muted))]"
                  autoFocus
                  disabled={isSaving}
                />
                {error && (
                  <Alert variant="destructive" className="mt-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </div>

              {currentPipeline && (
                <div className="p-3 bg-[hsl(var(--pc-muted)/0.5)] rounded-lg border border-gray-200">
                  <div className="text-xs text-[hsl(var(--pc-text-secondary))] space-y-1">
                    <div className="flex items-center justify-between">
                      <span>Nodes:</span>
                      <span className="text-[hsl(var(--pc-text-primary))]">{currentPipeline.nodes.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Edges:</span>
                      <span className="text-[hsl(var(--pc-text-primary))]">{currentPipeline.edges.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Status:</span>
                      <span className="text-[hsl(var(--pc-text-primary))] capitalize">{currentPipeline.status}</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {!showSuccess && (
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isSaving}
              className="bg-[hsl(var(--pc-secondary))] text-[hsl(var(--pc-text-secondary))] hover:bg-[hsl(var(--pc-muted))]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!pipelineName.trim() || isSaving}
              className="bg-blue-600 hover:bg-blue-500"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  {isEditing ? 'Updating...' : 'Saving...'}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  {isEditing ? 'Update' : 'Save'}
                </>
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

