import React, { useMemo } from 'react';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { NodeStatus } from '../types/index';

/**
 * Returns the appropriate status icon based on node status and completion state
 */
export const useStatusIcon = (
  status: NodeStatus,
  isCompleted: boolean,
  resultMetadata?: Record<string, any>
): React.ReactNode => {
  return useMemo(() => {
    // Always show checkmark if node has been executed (has result_metadata)
    if (isCompleted) {
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    }

    switch (status) {
      case 'running':
        return (
          <div className="relative">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            <div className="absolute inset-0 bg-blue-400/30 rounded-full animate-ping" />
          </div>
        );
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        // Show checkmark if node has result_metadata (completed previously, even if status was reset)
        if (resultMetadata && Object.keys(resultMetadata).length > 0) {
          return <CheckCircle2 className="w-4 h-4 text-green-500" />;
        }
        return null;
    }
  }, [status, isCompleted, resultMetadata]);
};
