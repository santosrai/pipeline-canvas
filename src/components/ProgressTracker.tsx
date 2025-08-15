import React, { useState, useEffect } from 'react';

export interface ProgressUpdate {
  message: string;
  progress: number;
  status: 'running' | 'completed' | 'error' | 'cancelled';
  timestamp?: Date;
}

interface ProgressTrackerProps {
  isVisible: boolean;
  initialMessage?: string;
  onCancel?: () => void;
  className?: string;
}

export const ProgressTracker: React.FC<ProgressTrackerProps> = ({
  isVisible,
  initialMessage = 'Initializing...',
  onCancel,
  className = ''
}) => {
  const [progress, setProgress] = useState<ProgressUpdate>({
    message: initialMessage,
    progress: 0,
    status: 'running'
  });

  const [showDetails, setShowDetails] = useState(false);
  const [progressHistory, setProgressHistory] = useState<ProgressUpdate[]>([]);

  // Update progress externally via window events (for integration with chat)
  useEffect(() => {
    const handleProgressUpdate = (event: CustomEvent<ProgressUpdate>) => {
      const newUpdate = { ...event.detail, timestamp: new Date() };
      setProgress(newUpdate);
      setProgressHistory(prev => [...prev, newUpdate]);
    };

    window.addEventListener('alphafold-progress', handleProgressUpdate as EventListener);
    
    return () => {
      window.removeEventListener('alphafold-progress', handleProgressUpdate as EventListener);
    };
  }, []);

  // Auto-hide after completion
  useEffect(() => {
    if (progress.status === 'completed' || progress.status === 'error') {
      const timer = setTimeout(() => {
        setProgressHistory([]);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [progress.status]);

  const getStatusIcon = () => {
    switch (progress.status) {
      case 'running':
        return (
          <svg className="animate-spin w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        );
      case 'completed':
        return (
          <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        );
      case 'error':
        return (
          <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        );
      case 'cancelled':
        return (
          <svg className="w-5 h-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zM9 14a1 1 0 112 0 1 1 0 01-2 0z" clipRule="evenodd" />
          </svg>
        );
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    switch (progress.status) {
      case 'running': return 'bg-blue-50 border-blue-200';
      case 'completed': return 'bg-green-50 border-green-200';
      case 'error': return 'bg-red-50 border-red-200';
      case 'cancelled': return 'bg-yellow-50 border-yellow-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  const getProgressBarColor = () => {
    switch (progress.status) {
      case 'running': return 'bg-blue-600';
      case 'completed': return 'bg-green-600';
      case 'error': return 'bg-red-600';
      case 'cancelled': return 'bg-yellow-600';
      default: return 'bg-gray-600';
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  if (!isVisible) return null;

  return (
    <div className={`rounded-lg border p-4 ${getStatusColor()} ${className}`}>
      {/* Main Progress Display */}
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0 mt-0.5">
          {getStatusIcon()}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-900">
              AlphaFold2 Structure Prediction
            </h4>
            
            <div className="flex items-center space-x-2">
              {progressHistory.length > 0 && (
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="text-xs text-gray-500 hover:text-gray-700 underline"
                >
                  {showDetails ? 'Hide' : 'Show'} Details
                </button>
              )}
              
              {progress.status === 'running' && onCancel && (
                <button
                  onClick={onCancel}
                  className="text-xs text-red-600 hover:text-red-800 underline"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
          
          <p className="text-sm text-gray-700 mb-3">{progress.message}</p>
          
          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${getProgressBarColor()}`}
              style={{ width: `${Math.max(0, Math.min(100, progress.progress))}%` }}
            />
          </div>
          
          <div className="flex justify-between items-center mt-1">
            <span className="text-xs text-gray-500">
              {Math.round(progress.progress)}%
            </span>
            {progress.timestamp && (
              <span className="text-xs text-gray-500">
                {formatTime(progress.timestamp)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Detailed Progress History */}
      {showDetails && progressHistory.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <div className="max-h-48 overflow-y-auto space-y-2">
            {progressHistory.map((update, index) => (
              <div key={index} className="flex items-start space-x-2 text-xs">
                <span className="text-gray-400 flex-shrink-0 w-16">
                  {update.timestamp ? formatTime(update.timestamp) : ''}
                </span>
                <span className="text-gray-600 flex-1">{update.message}</span>
                <span className="text-gray-500 flex-shrink-0 w-12 text-right">
                  {Math.round(update.progress)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Utility function to send progress updates
export const sendProgressUpdate = (update: Partial<ProgressUpdate>) => {
  const event = new CustomEvent('alphafold-progress', {
    detail: {
      message: 'Processing...',
      progress: 0,
      status: 'running' as const,
      ...update
    }
  });
  window.dispatchEvent(event);
};

// Hook for managing AlphaFold progress
export const useAlphaFoldProgress = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  const startProgress = (jobId: string, initialMessage?: string) => {
    setCurrentJobId(jobId);
    setIsVisible(true);
    sendProgressUpdate({
      message: initialMessage || 'Starting protein folding...',
      progress: 0,
      status: 'running'
    });
  };

  const updateProgress = (message: string, progress: number) => {
    sendProgressUpdate({ message, progress, status: 'running' });
  };

  const completeProgress = (message: string = 'Folding completed successfully!') => {
    sendProgressUpdate({ message, progress: 100, status: 'completed' });
    setTimeout(() => setIsVisible(false), 3000);
    setCurrentJobId(null);
  };

  const errorProgress = (message: string = 'Folding failed') => {
    sendProgressUpdate({ message, progress: 0, status: 'error' });
    setTimeout(() => setIsVisible(false), 5000);
    setCurrentJobId(null);
  };

  const cancelProgress = () => {
    if (currentJobId) {
      sendProgressUpdate({ 
        message: 'Folding cancelled', 
        progress: 0, 
        status: 'cancelled' 
      });
      setCurrentJobId(null);
      setTimeout(() => setIsVisible(false), 2000);
    }
  };

  return {
    isVisible,
    currentJobId,
    startProgress,
    updateProgress,
    completeProgress,
    errorProgress,
    cancelProgress
  };
};