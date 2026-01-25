import { NodeStatus } from '../types/index';

/**
 * Get status class for node border glow
 */
export const getStatusClasses = (
  status: NodeStatus,
  isExecuting: boolean,
  hasResultMetadata?: boolean
): string => {
  // If node has result_metadata, treat it as completed even if status is not explicitly set
  if (hasResultMetadata) {
    return 'border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]';
  }

  switch (status) {
    case 'running':
      return 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)] animate-pulse-glow';
    case 'success':
    case 'completed':
      return 'border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]';
    case 'error':
      return 'border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]';
    case 'pending':
      return isExecuting ? 'border-gray-300 opacity-60' : 'border-gray-300';
    default:
      return 'border-gray-300';
  }
};
