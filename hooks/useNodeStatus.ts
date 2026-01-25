import { useMemo } from 'react';
import { NodeStatus } from '../types/index';

/**
 * Determines if a node is completed based on status or result metadata
 */
export const useNodeCompletionStatus = (data: {
  status?: NodeStatus;
  result_metadata?: Record<string, any>;
}): boolean => {
  return useMemo(() => {
    const status = data.status;
    return !!(
      status === 'completed' ||
      status === 'success' ||
      (data.result_metadata && Object.keys(data.result_metadata).length > 0)
    );
  }, [data.status, data.result_metadata]);
};
