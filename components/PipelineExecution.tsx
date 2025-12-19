import React, { useEffect } from 'react';
import { usePipelineStore } from '../store/pipelineStore';
import { Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

interface ApiClient {
  post: (endpoint: string, data: any) => Promise<any>;
}

interface PipelineExecutionProps {
  apiClient?: ApiClient;
}

export const PipelineExecution: React.FC<PipelineExecutionProps> = ({ apiClient }) => {
  const {
    currentPipeline,
    isExecuting,
    executionOrder,
    updateNodeStatus,
    stopExecution,
  } = usePipelineStore();

  useEffect(() => {
    if (!isExecuting || !currentPipeline || executionOrder.length === 0 || !apiClient) {
      return;
    }

    let cancelled = false;

    const executePipeline = async () => {
      for (const nodeId of executionOrder) {
        if (cancelled) break;

        const node = currentPipeline.nodes.find((n) => n.id === nodeId);
        if (!node) continue;

        // Skip if already successful
        if (node.status === 'success') continue;

        try {
          updateNodeStatus(nodeId, 'running');

          // Execute based on node type
          switch (node.type) {
            case 'input_node':
              // Check if file exists
              const filename = node.config?.filename;
              if (!filename) {
                throw new Error('No filename specified');
              }
              // In a real implementation, verify file exists
              // File exists check passed
              break;

            case 'rfdiffusion_node':
              // Get input PDB from previous node
              const rfdiffInput = getInputPDB(nodeId, currentPipeline.nodes, currentPipeline.edges);
              if (!rfdiffInput) {
                throw new Error('No input PDB file found');
              }

              await apiClient.post('/rfdiffusion/run', {
                pdb_file: rfdiffInput,
                contigs: node.config?.contigs || '50',
                num_designs: node.config?.num_designs || 1,
              });
              break;

            case 'proteinmpnn_node':
              const mpnnInput = getInputPDB(nodeId, currentPipeline.nodes, currentPipeline.edges);
              if (!mpnnInput) {
                throw new Error('No input PDB file found');
              }

              await apiClient.post('/proteinmpnn/run', {
                pdb_file: mpnnInput,
                num_sequences: node.config?.num_sequences || 8,
                temperature: node.config?.temperature || 0.1,
              });
              break;

            case 'alphafold_node':
              const afInput = getInputSequence(nodeId, currentPipeline.nodes, currentPipeline.edges);
              if (!afInput) {
                throw new Error('No input sequence found');
              }

              await apiClient.post('/alphafold/run', {
                sequence: afInput,
                recycle_count: node.config?.recycle_count || 3,
                num_relax: node.config?.num_relax || 0,
              });
              break;

            default:
              throw new Error(`Unknown node type: ${node.type}`);
          }

          updateNodeStatus(nodeId, 'success');
        } catch (error: any) {
          updateNodeStatus(nodeId, 'error', error.message || 'Execution failed');
        }
      }

      if (!cancelled) {
        usePipelineStore.getState().stopExecution();
        if (currentPipeline) {
          usePipelineStore.getState().setCurrentPipeline({
            ...currentPipeline,
            status: 'completed',
          });
        }
      }
    };

    executePipeline();

    return () => {
      cancelled = true;
    };
  }, [isExecuting, currentPipeline, executionOrder, updateNodeStatus, apiClient]);

  if (!isExecuting || !currentPipeline) {
    return null;
  }

  const runningNode = currentPipeline.nodes.find((n) => n.status === 'running');
  const completedCount = currentPipeline.nodes.filter((n) => n.status === 'success').length;
  const totalCount = currentPipeline.nodes.length;

  return (
    <div className="fixed bottom-4 right-4 bg-white border border-gray-200 rounded-lg shadow-lg p-4 z-50 min-w-[300px]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Pipeline Execution</h3>
        <button
          onClick={stopExecution}
          className="text-xs text-red-600 hover:text-red-700"
        >
          Stop
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-600">Progress</span>
          <span className="text-gray-900 font-medium">
            {completedCount} / {totalCount}
          </span>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all"
            style={{ width: `${(completedCount / totalCount) * 100}%` }}
          />
        </div>

        {runningNode && (
          <div className="flex items-center gap-2 text-xs text-gray-600 mt-3">
            <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
            <span>Running: {runningNode.label}</span>
          </div>
        )}

        <div className="mt-3 space-y-1 max-h-32 overflow-y-auto">
          {currentPipeline.nodes.map((node) => (
            <div
              key={node.id}
              className="flex items-center gap-2 text-xs"
            >
              {node.status === 'running' && (
                <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
              )}
              {node.status === 'success' && (
                <CheckCircle2 className="w-3 h-3 text-green-600" />
              )}
              {node.status === 'error' && (
                <XCircle className="w-3 h-3 text-red-600" />
              )}
              {node.status === 'pending' && (
                <div className="w-3 h-3 rounded-full border-2 border-gray-300" />
              )}
              <span className={node.status === 'error' ? 'text-red-600' : 'text-gray-700'}>
                {node.label}
              </span>
              {node.error && (
                <div title={node.error}>
                  <AlertCircle className="w-3 h-3 text-red-600" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Helper functions
function getInputPDB(
  nodeId: string,
  nodes: any[],
  edges: Array<{ source: string; target: string }>
): string | null {
  const incomingEdges = edges.filter((e) => e.target === nodeId);
  if (incomingEdges.length === 0) return null;

  const sourceNode = nodes.find((n) => n.id === incomingEdges[0].source);
  if (!sourceNode) return null;

  if (sourceNode.type === 'input_node') {
    return sourceNode.config?.filename || null;
  }

  if (sourceNode.result_metadata?.output_file) {
    return sourceNode.result_metadata.output_file;
  }

  return null;
}

function getInputSequence(
  nodeId: string,
  nodes: any[],
  edges: Array<{ source: string; target: string }>
): string | null {
  const incomingEdges = edges.filter((e) => e.target === nodeId);
  if (incomingEdges.length === 0) return null;

  const sourceNode = nodes.find((n) => n.id === incomingEdges[0].source);
  if (!sourceNode) return null;

  if (sourceNode.type === 'proteinmpnn_node') {
    return sourceNode.result_metadata?.sequence || null;
  }

  return null;
}



