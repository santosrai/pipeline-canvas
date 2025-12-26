import React, { useEffect } from 'react';
import { usePipelineStore } from '../store/pipelineStore';
import { Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { executeNode } from '../utils/executionEngine';

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

        // Skip if already successful
        if (node.status === 'success') {
          console.log(`[PipelineExecution] Skipping ${nodeId} - already successful`);
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
            // #region agent log
            const logEntry12 = {location:'PipelineExecution.tsx:69',message:'extracting result from executionResult',data:{hasExecutionResult:!!executionResult,hasData:!!executionResult?.data,executionResultType:typeof executionResult},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'};
            console.log('[DEBUG]', logEntry12);
            fetch('http://127.0.0.1:7243/ingest/e128561e-dec0-450c-a8ea-2bf15be2e2f5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logEntry12)}).catch((e)=>console.warn('[DEBUG] Log fetch failed:',e));
            // #endregion
            
            result = executionResult?.data || executionResult;
            
            // #region agent log
            const logEntry13 = {location:'PipelineExecution.tsx:72',message:'result extracted',data:{resultType:typeof result,resultIsObject:typeof result==='object',resultKeys:result&&typeof result==='object'?Object.keys(result):null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'};
            console.log('[DEBUG]', logEntry13);
            fetch('http://127.0.0.1:7243/ingest/e128561e-dec0-450c-a8ea-2bf15be2e2f5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logEntry13)}).catch((e)=>console.warn('[DEBUG] Log fetch failed:',e));
            // #endregion
            
            // Safety check: ensure result is an object or can be safely handled
            if (result && typeof result !== 'object') {
              console.warn(`[PipelineExecution] Unexpected result type for node ${nodeId}:`, typeof result, result);
              // Convert to object if it's a primitive
              result = { value: result };
              
              // #region agent log
              const logEntry14 = {location:'PipelineExecution.tsx:77',message:'converted primitive to object',data:{result},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'};
              console.log('[DEBUG]', logEntry14);
              fetch('http://127.0.0.1:7243/ingest/e128561e-dec0-450c-a8ea-2bf15be2e2f5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logEntry14)}).catch((e)=>console.warn('[DEBUG] Log fetch failed:',e));
              // #endregion
            }
          } catch (resultError: any) {
            // #region agent log
            const logEntry15 = {location:'PipelineExecution.tsx:80',message:'error extracting result',data:{error:resultError.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'};
            console.error('[DEBUG]', logEntry15);
            fetch('http://127.0.0.1:7243/ingest/e128561e-dec0-450c-a8ea-2bf15be2e2f5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logEntry15)}).catch((e)=>console.warn('[DEBUG] Log fetch failed:',e));
            // #endregion
            console.error(`[PipelineExecution] Error extracting result for node ${nodeId}:`, resultError);
            result = { error: 'Failed to extract result' };
          }

          // Store result metadata if available
          if (result) {
            try {
              // #region agent log
              const logEntry16 = {location:'PipelineExecution.tsx:87',message:'storing result metadata',data:{resultKeys:Object.keys(result),hasOutputFile:!!result.output_file,hasSequence:!!result.sequence,hasMessage:!!result.message,hasData:!!result.data},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H5'};
              console.log('[DEBUG]', logEntry16);
              fetch('http://127.0.0.1:7243/ingest/e128561e-dec0-450c-a8ea-2bf15be2e2f5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logEntry16)}).catch((e)=>console.warn('[DEBUG] Log fetch failed:',e));
              // #endregion
              
              const resultMetadata: Record<string, any> = {};
              
              // For input nodes, store all file metadata
              if (node.type === 'input_node' && result.data) {
                // Store the full file data including all metadata
                resultMetadata.file_info = result.data;
                resultMetadata.type = result.data.type || 'pdb_file';
                resultMetadata.filename = result.data.filename;
                resultMetadata.file_id = result.data.file_id;
                resultMetadata.file_url = result.data.file_url;
                // Also store in data for consistency
                resultMetadata.data = result.data;
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

              // #region agent log
              const logEntry17 = {location:'PipelineExecution.tsx:109',message:'result metadata prepared',data:{metadataKeys:Object.keys(resultMetadata),metadataPreview:JSON.stringify(resultMetadata).substring(0,100)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H5'};
              console.log('[DEBUG]', logEntry17);
              fetch('http://127.0.0.1:7243/ingest/e128561e-dec0-450c-a8ea-2bf15be2e2f5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logEntry17)}).catch((e)=>console.warn('[DEBUG] Log fetch failed:',e));
              // #endregion

              // Update node with result metadata
              usePipelineStore.getState().updateNode(nodeId, {
                result_metadata: resultMetadata,
              });
              
              // #region agent log
              const logEntry18 = {location:'PipelineExecution.tsx:115',message:'result metadata stored in node',data:{nodeId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H5'};
              console.log('[DEBUG]', logEntry18);
              fetch('http://127.0.0.1:7243/ingest/e128561e-dec0-450c-a8ea-2bf15be2e2f5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logEntry18)}).catch((e)=>console.warn('[DEBUG] Log fetch failed:',e));
              // #endregion
            } catch (metadataError: any) {
            // #region agent log
            const logEntry19 = {location:'PipelineExecution.tsx:118',message:'error storing metadata',data:{error:metadataError.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H5'};
            console.error('[DEBUG]', logEntry19);
            fetch('http://127.0.0.1:7243/ingest/e128561e-dec0-450c-a8ea-2bf15be2e2f5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logEntry19)}).catch((e)=>console.warn('[DEBUG] Log fetch failed:',e));
            // #endregion
              console.error(`[PipelineExecution] Error storing metadata for node ${nodeId}:`, metadataError);
            }
          }

          // Update execution log with detailed request/response
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
          
          if (existingLog) {
            usePipelineStore.getState().updateExecutionLog(nodeId, {
              status: 'success',
              completedAt: new Date(),
              duration,
              output: result,
              input: inputDataForLog,
              request: executionResult?.request,
              response: executionResult?.response,
            });
          } else {
            // Create new log entry if it doesn't exist
            usePipelineStore.getState().addExecutionLog({
              nodeId,
              nodeLabel: node.label,
              nodeType: node.type,
              status: 'success',
              completedAt: new Date(),
              duration,
              output: result,
              input: inputDataForLog,
              request: executionResult?.request,
              response: executionResult?.response,
            });
          }

          console.log(`[PipelineExecution] Node ${nodeId} completed successfully`);
          updateNodeStatus(nodeId, 'success');
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

          // Update execution log with error details
          const existingErrorLog = usePipelineStore.getState().currentExecution?.logs.find(
            l => l.nodeId === nodeId
          );
          
          const errorResponseData = (error as any).response || (error.response ? {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data,
          } : undefined);

          if (existingErrorLog) {
            usePipelineStore.getState().updateExecutionLog(nodeId, {
              status: 'error',
              completedAt: new Date(),
              duration,
              error: error.message || 'Execution failed',
              input: inputDataForLog,
              request: (error as any).request,
              response: errorResponseData,
            });
          } else {
            // Create new log entry if it doesn't exist
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

          updateNodeStatus(nodeId, 'error', error.message || 'Execution failed');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExecuting, currentPipeline?.id, executionOrder.join(','), apiClient]);

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





