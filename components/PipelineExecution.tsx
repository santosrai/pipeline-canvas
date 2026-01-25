import React, { useEffect } from 'react';
import { usePipelineStore } from '../store/pipelineStore';
import { usePipelineContext } from '../context/PipelineContext';
import { Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { executeNode } from '../utils/executionEngine';

/**
 * Sanitize file_url to ensure it's a server URL, not a blob URL
 * Blob URLs cannot be stored or used reliably across sessions
 */
function sanitizeFileUrl(fileUrl: string | undefined, fileId: string | undefined): string | undefined {
  if (!fileUrl) return undefined;
  
  // If it's a blob URL, replace it with server URL
  if (fileUrl.startsWith('blob:')) {
    if (fileId) {
      return `${window.location.origin}/api/upload/pdb/${fileId}`;
    }
    return undefined;
  }
  
  // Ensure relative paths are absolute
  if (fileUrl.startsWith('/')) {
    return `${window.location.origin}${fileUrl}`;
  }
  
  return fileUrl;
}

/**
 * Sanitize file data object to ensure file_url is not a blob URL
 */
function sanitizeFileData(fileData: any): any {
  if (!fileData || typeof fileData !== 'object') return fileData;
  
  const sanitized = { ...fileData };
  if (sanitized.file_url) {
    sanitized.file_url = sanitizeFileUrl(sanitized.file_url, sanitized.file_id);
  }
  
  return sanitized;
}

interface ApiClient {
  post: (endpoint: string, data: any, config?: { headers?: Record<string, string>; method?: string }) => Promise<any>;
  get: (endpoint: string, config?: { headers?: Record<string, string> }) => Promise<any>;
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
  
  const { sessionId, config } = usePipelineContext();
  const effectiveSessionId = sessionId;
  
  // Debug: Log session ID
  useEffect(() => {
    if (effectiveSessionId) {
      console.log('[PipelineExecution] Active session ID:', effectiveSessionId);
    } else {
      console.warn('[PipelineExecution] No active session ID found');
    }
  }, [effectiveSessionId]);

  useEffect(() => {
    if (!isExecuting || !currentPipeline || executionOrder.length === 0) {
      return;
    }
    
    // Check if any node in execution order needs apiClient
    // Input nodes (file_check) don't need apiClient, so allow execution to proceed
    // The execution engine will handle missing apiClient gracefully
    const hasInputNodes = executionOrder.some(nodeId => {
      const node = currentPipeline.nodes.find(n => n.id === nodeId);
      return node?.type === 'input_node';
    });
    
    // Only warn if apiClient is missing and we have non-input nodes
    if (!apiClient && !hasInputNodes) {
      console.warn('[PipelineExecution] apiClient not provided but may be required for node execution');
      // Still allow execution to proceed - it will fail gracefully if apiClient is needed
    }

    let cancelled = false;

    const executePipeline = async () => {
      console.log('[PipelineExecution] Starting execution:', {
        executionOrder,
        nodeCount: executionOrder.length,
        hasApiClient: !!apiClient,
      });
      
      for (const nodeId of executionOrder) {
        if (cancelled) break;

        const node = currentPipeline.nodes.find((n) => n.id === nodeId);
        if (!node) {
          console.warn(`[PipelineExecution] Node ${nodeId} not found`);
          continue;
        }

        console.log(`[PipelineExecution] Processing node ${nodeId} (${node.type}):`, {
          status: node.status,
          label: node.label,
        });

        // Skip if already successful or completed
        if (node.status === 'success' || node.status === 'completed') {
          console.log(`[PipelineExecution] Skipping ${nodeId} - already completed`);
          continue;
        }

        // Capture input data for logging (outside try block for error handling)
        const inputDataForLog: Record<string, any> = {};
        if (node.config) {
          inputDataForLog.config = node.config;
        }

        try {
          updateNodeStatus(nodeId, 'running');
          const startTime = Date.now();

          // Execute node using dynamic execution engine with logging
          // For input nodes, apiClient is not needed
          let executionResult: any;
          try {
            // Create a minimal apiClient for nodes that don't need it
            const nodeApiClient = apiClient || {
              post: async () => { throw new Error('apiClient not available'); },
              get: async () => { throw new Error('apiClient not available'); },
            };
            
            executionResult = await executeNode(node, {
              pipeline: currentPipeline,
              apiClient: nodeApiClient,
              sessionId: effectiveSessionId,
              config: config ? {
                endpoints: config.endpoints,
                responseTransformers: config.responseTransformers,
              } : undefined,
            });
          } catch (execError: any) {
            console.error(`[PipelineExecution] Error executing node ${nodeId}:`, execError);
            throw execError;
          }
          
          const endTime = Date.now();
          const duration = endTime - startTime;

          // Extract request/response details from execution result
          let result: any;
          try {
            result = executionResult?.data || executionResult;
            
            // Safety check: ensure result is an object or can be safely handled
            if (result && typeof result !== 'object') {
              console.warn(`[PipelineExecution] Unexpected result type for node ${nodeId}:`, typeof result, result);
              // Convert to object if it's a primitive
              result = { value: result };
            }
          } catch (resultError: any) {
            console.error(`[PipelineExecution] Error extracting result for node ${nodeId}:`, resultError);
            result = { error: 'Failed to extract result' };
          }

          // Store result metadata if available
          if (result) {
            try {
              const resultMetadata: Record<string, any> = {};
              
              // For input nodes, store all file metadata
              if (node.type === 'input_node' && result.data) {
                // Sanitize file data to ensure file_url is not a blob URL
                const sanitizedData = sanitizeFileData(result.data);
                
                // Store the full file data including all metadata
                resultMetadata.file_info = sanitizedData;
                resultMetadata.type = sanitizedData.type || 'pdb_file';
                resultMetadata.filename = sanitizedData.filename;
                resultMetadata.file_id = sanitizedData.file_id;
                resultMetadata.file_url = sanitizedData.file_url;
                // Also store in data for consistency
                resultMetadata.data = sanitizedData;
              } else {
                // Special handling for RFdiffusion nodes - extract filepath from response
                if (node.type === 'rfdiffusion_node') {
                  // RFdiffusion API returns: { status, output_pdb, filename, filepath, data: { pdbContent, filename, filepath } }
                  const filepath = result.filepath || result.data?.filepath;
                  const filename = result.filename || result.data?.filename;
                  const pdbContent = result.output_pdb || result.data?.pdbContent;
                  
                  if (filepath) {
                    // Store filepath as output_file for downstream nodes to use
                    resultMetadata.output_file = {
                      type: 'pdb_file',
                      filename: filename || `rfdiffusion_${node.id}.pdb`,
                      filepath: filepath,
                      file_id: node.id, // Use node ID as file identifier
                      // Store relative path from server directory (e.g., "rfdiffusion_results/rfdiffusion_xxx.pdb")
                      file_url: `/api/files/${filepath}`,
                    };
                    resultMetadata.filepath = filepath;
                    resultMetadata.filename = filename;
                  }
                  
                  if (pdbContent) {
                    resultMetadata.pdbContent = pdbContent;
                  }
                  
                  // Store full data for reference
                  if (result.data) {
                    resultMetadata.data = result.data;
                  }
                } else {
                  // Extract common result fields for other node types
                  if (result.output_file || result.file) {
                    resultMetadata.output_file = result.output_file || result.file;
                  }
                  if (result.sequence) {
                    resultMetadata.sequence = result.sequence;
                  }
                  if (result.message) {
                    resultMetadata.message = result.message;
                  }
                  if (result.data) {
                    resultMetadata.data = result.data;
                  }
                  
                  // Store full result if no specific fields found
                  if (Object.keys(resultMetadata).length === 0 && typeof result === 'object') {
                    Object.assign(resultMetadata, result);
                  }
                }
              }

              // Update node with result metadata
              usePipelineStore.getState().updateNode(nodeId, {
                result_metadata: resultMetadata,
              });
              
              // Trigger file refresh event for RFdiffusion nodes (so FileBrowser updates)
              if (node.type === 'rfdiffusion_node' && resultMetadata.filepath) {
                console.log('[PipelineExecution] RFdiffusion completed, triggering file refresh. Active session:', effectiveSessionId);
                // Small delay to ensure backend has saved the file and associated it with session
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('session-file-added'));
                  console.log('[PipelineExecution] Dispatched session-file-added event');
                }, 1000); // Increased delay to ensure backend processing completes
              }
            } catch (metadataError: any) {
              console.error(`[PipelineExecution] Error storing metadata for node ${nodeId}:`, metadataError);
            }
          }

          // Update node status to completed - this should preserve result_metadata
          // The result_metadata was already set above, so updateNodeStatus won't overwrite it
          updateNodeStatus(nodeId, 'completed');
          
          // Emit pipeline node completed event
          if (currentPipeline) {
            window.dispatchEvent(new CustomEvent('pipeline-node-completed', {
              detail: {
                pipelineId: currentPipeline.id,
                nodeId: nodeId,
                status: 'completed',
                result: result,
              }
            }));
          }
          
          // Log the final state to verify
          const finalNode = usePipelineStore.getState().currentPipeline?.nodes.find(n => n.id === nodeId);
          console.log(`[PipelineExecution] Node ${nodeId} final state:`, {
            status: finalNode?.status,
            hasResultMetadata: !!(finalNode?.result_metadata && Object.keys(finalNode.result_metadata).length > 0),
            resultMetadataKeys: finalNode?.result_metadata ? Object.keys(finalNode.result_metadata) : []
          });
          
          // Then add detailed request/response info to the log
          // This ensures the execution panel shows status updates immediately
          const existingLog = usePipelineStore.getState().currentExecution?.logs.find(
            l => l.nodeId === nodeId
          );
          
          // Debug logging for HTTP request nodes
          if (node.type === 'http_request_node') {
            console.log('[PipelineExecution] HTTP Request result:', {
              nodeId,
              hasExecutionResult: !!executionResult,
              executionResultKeys: executionResult ? Object.keys(executionResult) : [],
              hasData: !!executionResult?.data,
              hasRequest: !!executionResult?.request,
              hasResponse: !!executionResult?.response,
              resultType: typeof result,
              resultKeys: result && typeof result === 'object' ? Object.keys(result) : null,
              responseData: executionResult?.response?.data,
            });
          }
          
          // Add detailed execution info (request/response) to the log
          // updateNodeStatus already updated the status, so this just adds details
          if (existingLog) {
            usePipelineStore.getState().updateExecutionLog(nodeId, {
              output: result,
              input: inputDataForLog,
              request: executionResult?.request,
              response: executionResult?.response,
              duration, // Ensure duration is set
            });
          } else {
            // Create new log entry if it doesn't exist (shouldn't happen, but handle it)
            usePipelineStore.getState().addExecutionLog({
              nodeId,
              nodeLabel: node.label,
              nodeType: node.type,
              status: 'completed',
              completedAt: new Date(),
              duration,
              output: result,
              input: inputDataForLog,
              request: executionResult?.request,
              response: executionResult?.response,
            });
          }

          console.log(`[PipelineExecution] Node ${nodeId} completed successfully`);
        } catch (error: any) {
          console.error(`[PipelineExecution] Error in node ${nodeId} (${node.type}):`, error);
          const errorResponse = (error as any).response;
          const errorData = errorResponse?.data;
          const errorMessage = errorData?.error || errorData?.detail || errorData?.data?.detail || errorData?.response?.data?.detail || error.message;
          console.error(`[PipelineExecution] Error details:`, {
            message: error.message,
            stack: error.stack,
            response: errorResponse,
            responseData: errorData,
            responseStatus: errorResponse?.status,
            errorMessage: errorMessage,
            fullErrorData: JSON.stringify(errorData, null, 2)
          });
          // Log the actual error message prominently
          if (errorMessage && errorMessage !== error.message) {
            console.error(`[PipelineExecution] Server Error Message: ${errorMessage}`);
          }
          const endTime = Date.now();
          const startTime = usePipelineStore.getState().currentExecution?.logs.find(
            l => l.nodeId === nodeId
          )?.startedAt;
          const duration = startTime ? endTime - new Date(startTime).getTime() : 0;

          // Update node status first to sync with execution panel
          updateNodeStatus(nodeId, 'error', error.message || 'Execution failed');
          
          // Emit pipeline node error event
          if (currentPipeline) {
            window.dispatchEvent(new CustomEvent('pipeline-node-completed', {
              detail: {
                pipelineId: currentPipeline.id,
                nodeId: nodeId,
                status: 'error',
                error: error.message || 'Execution failed',
              }
            }));
          }
          
          // Then add detailed error info to the log
          const existingErrorLog = usePipelineStore.getState().currentExecution?.logs.find(
            l => l.nodeId === nodeId
          );
          
          const errorResponseData = (error as any).response || (error.response ? {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data,
          } : undefined);

          // Add detailed error info (request/response) to the log
          // updateNodeStatus already updated the status, so this just adds details
          if (existingErrorLog) {
            usePipelineStore.getState().updateExecutionLog(nodeId, {
              input: inputDataForLog,
              request: (error as any).request,
              response: errorResponseData,
              duration, // Ensure duration is set
            });
          } else {
            // Create new log entry if it doesn't exist (shouldn't happen, but handle it)
            usePipelineStore.getState().addExecutionLog({
              nodeId,
              nodeLabel: node.label,
              nodeType: node.type,
              status: 'error',
              completedAt: new Date(),
              duration,
              error: error.message || 'Execution failed',
              input: inputDataForLog,
              request: (error as any).request,
              response: errorResponseData,
            });
          }
        }
      }

      if (!cancelled) {
        // Mark execution as completed - update currentExecution to keep logs visible
        const state = usePipelineStore.getState();
        if (state.currentExecution) {
          const completedExecution = {
            ...state.currentExecution,
            completedAt: new Date(),
            status: 'completed' as const,
          };
          // Update execution history and keep currentExecution for viewing results
          usePipelineStore.setState({
            executionHistory: [completedExecution, ...state.executionHistory].slice(0, 50),
            currentExecution: completedExecution, // Keep currentExecution so users can view results
            isExecuting: false,
          });
        } else {
          usePipelineStore.getState().stopExecution();
        }
        
        // IMPORTANT: Read current pipeline fresh from store to get latest node states
        // The closure's currentPipeline might be stale after node updates
        const freshPipeline = usePipelineStore.getState().currentPipeline;
        if (freshPipeline) {
          // Explicitly preserve all node statuses and result_metadata after execution completes
          // This ensures nodes maintain their success/failure visual states (green/red borders)
          const updatedPipeline = {
            ...freshPipeline,
            status: 'completed' as const,
            // Preserve node states - ensure completed/error nodes keep their status
            nodes: freshPipeline.nodes.map(node => {
              const hasResult = node.result_metadata && Object.keys(node.result_metadata).length > 0;
              const hasError = node.status === 'error' || !!node.error;
              
              // If node has result_metadata but status was reset, restore to 'completed'
              // If node has error, ensure status is 'error'
              let finalStatus = node.status;
              if (hasResult && (node.status === 'idle' || node.status === 'pending' || !node.status)) {
                finalStatus = 'completed';
              } else if (hasError && node.status !== 'error') {
                finalStatus = 'error';
              } else if (node.status === 'running') {
                // If still marked as running but execution completed, mark as completed if has result
                finalStatus = hasResult ? 'completed' : 'error';
              }
              
              return {
                ...node,
                status: finalStatus,
                // Ensure result_metadata is preserved
                result_metadata: node.result_metadata || undefined,
              };
            }),
          };
          
          console.log('[PipelineExecution] Preserving node states after completion:', {
            nodeCount: updatedPipeline.nodes.length,
            nodeStates: updatedPipeline.nodes.map(n => ({
              id: n.id,
              label: n.label,
              status: n.status,
              hasResultMetadata: !!(n.result_metadata && Object.keys(n.result_metadata).length > 0),
            })),
          });
          
          usePipelineStore.getState().setCurrentPipeline(updatedPipeline);
          
          // Emit pipeline completed event
          window.dispatchEvent(new CustomEvent('pipeline-completed', {
            detail: {
              pipelineId: freshPipeline.id,
              status: 'completed',
              nodes: updatedPipeline.nodes,
            }
          }));
        }
      }
    };

    executePipeline();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExecuting, currentPipeline?.id, executionOrder.join(','), apiClient]);

  if (!isExecuting || !currentPipeline) {
    return null;
  }

  const runningNode = currentPipeline.nodes.find((n) => n.status === 'running');
  const completedCount = currentPipeline.nodes.filter((n) => n.status === 'completed' || n.status === 'success').length;
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
              {(node.status === 'success' || node.status === 'completed') && (
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





