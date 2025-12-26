import { PipelineNode, Pipeline } from '../types/index';
import { loadNodeConfig, NodeDefinition, HandleDefinition } from './nodeLoader';
import { resolveTemplates } from './templateResolver';

interface ApiClient {
  post: (endpoint: string, data: any, config?: { headers?: Record<string, string> }) => Promise<any>;
  get: (endpoint: string, config?: { headers?: Record<string, string> }) => Promise<any>;
}

interface ExecutionContext {
  pipeline: Pipeline;
  apiClient: ApiClient;
}

/**
 * Gets input data from connected source nodes based on handle dataType
 */
async function getInputData(
  nodeId: string,
  _handleId: string,
  handle: HandleDefinition,
  pipeline: Pipeline
): Promise<any> {
  const incomingEdges = pipeline.edges.filter((e) => e.target === nodeId);
  if (incomingEdges.length === 0) {
    return null;
  }

  // Find the source node
  const sourceNode = pipeline.nodes.find((n) => n.id === incomingEdges[0].source);
  if (!sourceNode) {
    return null;
  }

  // Get the output handle from source node that matches the dataType
  const config = await loadNodeConfig(sourceNode.type);
  
  // Find matching output handle by dataType
  const matchingOutput = config.handles.outputs.find(
    (output) => output.dataType === handle.dataType
  );

  if (!matchingOutput && handle.dataType) {
    // If no exact match, try to find any output with matching dataType
    // This allows flexibility in connections
  }

  // Extract data based on node type and dataType
  if (sourceNode.type === 'input_node') {
    if (handle.dataType === 'pdb_file' || !handle.dataType) {
      // Return full file metadata from result_metadata if available, otherwise from config
      if (sourceNode.result_metadata?.file_info) {
        return sourceNode.result_metadata.file_info;
      } else if (sourceNode.result_metadata?.data) {
        return sourceNode.result_metadata.data;
      } else {
        // Fallback to config data
        return {
          type: 'pdb_file',
          filename: sourceNode.config?.filename,
          file_id: sourceNode.config?.file_id,
          file_url: sourceNode.config?.file_url,
          chains: sourceNode.config?.chains,
          total_residues: sourceNode.config?.total_residues,
          suggested_contigs: sourceNode.config?.suggested_contigs,
          chain_residue_counts: sourceNode.config?.chain_residue_counts,
          atoms: sourceNode.config?.atoms,
        };
      }
    }
  }

  if (sourceNode.type === 'message_input_node') {
    // For code execution nodes, return the full result metadata
    if (handle.dataType === 'any' || !handle.dataType) {
      return sourceNode.result_metadata || null;
    }
    if (handle.dataType === 'message') {
      return sourceNode.result_metadata?.message || sourceNode.config?.message || null;
    }
  }

  // For nodes that produce output files
  if (sourceNode.result_metadata?.output_file) {
    if (handle.dataType === 'pdb_file') {
      return sourceNode.result_metadata.output_file;
    }
  }

  // For sequence outputs
  if (sourceNode.result_metadata?.sequence) {
    if (handle.dataType === 'sequence') {
      return sourceNode.result_metadata.sequence;
    }
  }

  // For message outputs
  if (sourceNode.result_metadata?.message) {
    if (handle.dataType === 'message') {
      return sourceNode.result_metadata.message;
    }
  }

  // For code execution results (any data type)
  if (sourceNode.result_metadata && handle.dataType === 'any') {
    // Return the entire result metadata for 'any' type
    return sourceNode.result_metadata;
  }

  // Fallback: try to get from result_metadata (for backwards compatibility)
  if (sourceNode.result_metadata) {
    // Try common keys
    return (
      sourceNode.result_metadata.output_file ||
      sourceNode.result_metadata.sequence ||
      sourceNode.result_metadata.message ||
      sourceNode.result_metadata.data ||
      // For code execution, return the full result
      (Object.keys(sourceNode.result_metadata).length > 0 ? sourceNode.result_metadata : null) ||
      null
    );
  }

  return null;
}

/**
 * Gets all input data for a node based on its input handles
 */
async function getAllInputData(
  node: PipelineNode,
  nodeDefinition: NodeDefinition,
  pipeline: Pipeline
): Promise<Record<string, any>> {
  const inputData: Record<string, any> = {};

  for (const inputHandle of nodeDefinition.handles.inputs) {
    const data = await getInputData(node.id, inputHandle.id, inputHandle, pipeline);
    if (data !== null) {
      inputData[inputHandle.id] = data;
    }
  }

  return inputData;
}

/**
 * Executes a node based on its execution configuration
 */
export async function executeNode(
  node: PipelineNode,
  context: ExecutionContext
): Promise<any> {
  // Load node configuration
  const nodeDefinition = await loadNodeConfig(node.type);

  // Get all input data from connected nodes
  const inputData = await getAllInputData(node, nodeDefinition, context.pipeline);

  // Validate required inputs
  // Note: HTTP Request nodes can work without inputs (they're optional)
  // Only validate if the node explicitly requires inputs
  for (const inputHandle of nodeDefinition.handles.inputs) {
    // Skip validation for HTTP Request nodes - inputs are optional
    if (node.type === 'http_request_node') {
      continue;
    }
    if (!inputData[inputHandle.id] && inputHandle.dataType) {
      throw new Error(
        `Required input '${inputHandle.id}' (${inputHandle.dataType}) not found for node ${node.label}`
      );
    }
  }

  const executionConfig = nodeDefinition.execution;

  // Validate execution config exists
  if (!executionConfig || !executionConfig.type) {
    throw new Error(`Node ${node.label} has invalid execution configuration`);
  }

  // Execute based on execution type
  switch (executionConfig.type) {
    case 'api_call':
      // Resolve endpoint URL (can be template variable)
      let endpoint = executionConfig.endpoint;
      if (typeof endpoint === 'string' && endpoint.includes('{{')) {
        endpoint = resolveTemplates(endpoint, node, inputData) as string;
      }
      
      // Fallback to defaultConfig if endpoint is empty (for HTTP Request nodes)
      if (!endpoint && node.type === 'http_request_node') {
        const defaultUrl = nodeDefinition.defaultConfig?.url;
        if (defaultUrl) {
          endpoint = defaultUrl;
        }
      }
      
      if (!endpoint) {
        throw new Error(`Node ${node.label} has api_call type but no endpoint specified. Please configure the URL in the node settings.`);
      }
      
      // Debug logging for HTTP Request nodes
      if (node.type === 'http_request_node') {
        console.log('[HTTP Request] Executing:', {
          nodeId: node.id,
          method: node.config?.method,
          url: node.config?.url,
          resolvedEndpoint: endpoint,
          config: node.config
        });
      }

      // Resolve HTTP method (can be template variable, defaults to POST)
      let method = executionConfig.method || 'POST';
      if (typeof method === 'string' && method.includes('{{')) {
        method = resolveTemplates(method, node, inputData) as string;
      }
      
      // Fallback to defaultConfig if method is empty (for HTTP Request nodes)
      if (!method && node.type === 'http_request_node') {
        method = nodeDefinition.defaultConfig?.method || 'GET';
      }
      
      method = (method || 'POST').toUpperCase();

      // Resolve query parameters (if send_query_params is enabled)
      let queryParams: Record<string, any> | undefined;
      if (executionConfig.queryParams) {
        const queryParamsResolved = resolveTemplates(executionConfig.queryParams, node, inputData);
        if (typeof queryParamsResolved === 'string') {
          try {
            queryParams = JSON.parse(queryParamsResolved);
          } catch {
            // If not valid JSON, treat as empty
            queryParams = {};
          }
        } else if (typeof queryParamsResolved === 'object') {
          queryParams = queryParamsResolved;
        }
      }

      // Build URL with query parameters
      let finalUrl = endpoint;
      if (queryParams && Object.keys(queryParams).length > 0) {
        if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
          // Absolute URL
          const urlObj = new URL(endpoint);
          Object.entries(queryParams).forEach(([key, value]) => {
            urlObj.searchParams.append(key, String(value));
          });
          finalUrl = urlObj.toString();
        } else {
          // Relative URL - build query string manually
          const queryString = Object.entries(queryParams)
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
            .join('&');
          finalUrl = `${endpoint}?${queryString}`;
        }
      }

      // Resolve template variables in headers (if provided)
      let resolvedHeaders: Record<string, string> = {};
      if (executionConfig.headers) {
        const headersResolved = resolveTemplates(executionConfig.headers, node, inputData);
        
        // Handle special __custom_headers__ and __send_headers__ flags
        if (headersResolved && typeof headersResolved === 'object') {
          const sendHeaders = headersResolved['__send_headers__'];
          const customHeaders = headersResolved['__custom_headers__'];
          const authType = headersResolved['__auth_type__'];
          const basicAuthUsername = headersResolved['__basic_auth_username__'];
          const basicAuthPassword = headersResolved['__basic_auth_password__'];
          const bearerToken = headersResolved['__bearer_token__'];
          const customAuthHeaderName = headersResolved['__custom_auth_header_name__'];
          const customAuthHeaderValue = headersResolved['__custom_auth_header_value__'];
          
          // Remove special flags
          delete headersResolved['__send_headers__'];
          delete headersResolved['__custom_headers__'];
          delete headersResolved['__auth_type__'];
          delete headersResolved['__basic_auth_username__'];
          delete headersResolved['__basic_auth_password__'];
          delete headersResolved['__bearer_token__'];
          delete headersResolved['__custom_auth_header_name__'];
          delete headersResolved['__custom_auth_header_value__'];
          
          // Handle authentication
          if (authType === 'basic' && basicAuthUsername && basicAuthPassword) {
            // Create Basic Auth header
            const credentials = `${String(basicAuthUsername)}:${String(basicAuthPassword)}`;
            const encoded = btoa(credentials);
            resolvedHeaders['Authorization'] = `Basic ${encoded}`;
          } else if (authType === 'bearer' && bearerToken) {
            // Create Bearer token header
            resolvedHeaders['Authorization'] = `Bearer ${String(bearerToken)}`;
          } else if (authType === 'custom' && customAuthHeaderName && customAuthHeaderValue) {
            // Set custom auth header
            resolvedHeaders[String(customAuthHeaderName)] = String(customAuthHeaderValue);
          }
          
          // Merge custom headers if provided
          if (customHeaders && typeof customHeaders === 'string') {
            try {
              const parsedCustom = JSON.parse(customHeaders);
              resolvedHeaders = { ...resolvedHeaders, ...parsedCustom };
            } catch {
              // If parsing fails, keep existing headers
            }
          } else if (customHeaders && typeof customHeaders === 'object') {
            resolvedHeaders = { ...resolvedHeaders, ...customHeaders };
          }
          
          // Filter out empty headers (e.g., empty API keys should not be sent)
          resolvedHeaders = Object.fromEntries(
            Object.entries(resolvedHeaders).filter(([_, value]) => {
              return value !== '' && value !== null && value !== undefined;
            })
          ) as Record<string, string>;
          
          // Only include headers if send_headers is true (but always include auth headers)
          if (sendHeaders === false || sendHeaders === 'false') {
            // Keep only auth headers if send_headers is false
            const authHeaders: Record<string, string> = {};
            if (resolvedHeaders['Authorization']) {
              authHeaders['Authorization'] = resolvedHeaders['Authorization'];
            }
            // Also keep any custom auth headers
            Object.keys(resolvedHeaders).forEach(key => {
              if (key.toLowerCase().includes('auth') || key.toLowerCase().includes('token')) {
                authHeaders[key] = resolvedHeaders[key];
              }
            });
            resolvedHeaders = authHeaders;
          }
        }
      }

      // Resolve request body
      let resolvedPayload: any = undefined;
      if (executionConfig.payload) {
        const payloadResolved = resolveTemplates(executionConfig.payload, node, inputData);
        
          // Handle special body flags
          if (payloadResolved && typeof payloadResolved === 'object') {
            const sendBody = payloadResolved['__send_body__'];
            const bodyContentType = payloadResolved['__body_content_type__'];
            const bodySpecify = payloadResolved['__body_specify__'];
            const bodyJson = payloadResolved['__body_json__'];
            const bodyRaw = payloadResolved['__body_raw__'];
            const legacyPayload = payloadResolved['__legacy_payload__'];
            
            // Only process body if send_body is true
            if (sendBody !== false && sendBody !== 'false') {
              if (bodySpecify === 'json' && bodyJson) {
                // Parse JSON body
                try {
                  if (typeof bodyJson === 'string') {
                    resolvedPayload = JSON.parse(bodyJson);
                  } else {
                    resolvedPayload = bodyJson;
                  }
                  // CRITICAL: Resolve template variables in the parsed payload
                  resolvedPayload = resolveTemplates(resolvedPayload, node, inputData);
                } catch (e) {
                  throw new Error(`Invalid JSON body: ${e}`);
                }
              } else if (bodySpecify === 'expression' && bodyJson) {
                // Expression-based body (for now, treat as JSON)
                try {
                  if (typeof bodyJson === 'string') {
                    resolvedPayload = JSON.parse(bodyJson);
                  } else {
                    resolvedPayload = bodyJson;
                  }
                  // CRITICAL: Resolve template variables in the parsed payload
                  resolvedPayload = resolveTemplates(resolvedPayload, node, inputData);
                } catch (e) {
                  resolvedPayload = bodyJson; // Fallback to raw string
                  // Even for raw string, try to resolve templates if it's a string
                  if (typeof resolvedPayload === 'string') {
                    resolvedPayload = resolveTemplates(resolvedPayload, node, inputData);
                  }
                }
              } else if (bodyRaw && (bodyContentType === 'raw' || bodyContentType === 'text' || bodyContentType === 'xml')) {
                // Raw body content (text, XML, or raw)
                resolvedPayload = String(bodyRaw);
              } else if (legacyPayload) {
                // Use legacy payload structure
                resolvedPayload = legacyPayload;
                // CRITICAL: Resolve template variables in legacy payload
                resolvedPayload = resolveTemplates(resolvedPayload, node, inputData);
              }
              
              // Set Content-Type header based on body_content_type
              if (bodyContentType === 'json' && !resolvedHeaders['Content-Type']) {
                resolvedHeaders['Content-Type'] = 'application/json';
              } else if (bodyContentType === 'form-data' && !resolvedHeaders['Content-Type']) {
                resolvedHeaders['Content-Type'] = 'multipart/form-data';
              } else if (bodyContentType === 'x-www-form-urlencoded' && !resolvedHeaders['Content-Type']) {
                resolvedHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
              } else if (bodyContentType === 'text' && !resolvedHeaders['Content-Type']) {
                resolvedHeaders['Content-Type'] = 'text/plain';
              } else if (bodyContentType === 'xml' && !resolvedHeaders['Content-Type']) {
                resolvedHeaders['Content-Type'] = 'application/xml';
              } else if (bodyContentType === 'raw' && !resolvedHeaders['Content-Type']) {
                resolvedHeaders['Content-Type'] = 'text/plain';
              }
            }
          } else {
            // Fallback: use payload as-is if no special flags
            resolvedPayload = payloadResolved;
          }
      }

      // Make API call with optional headers
      const requestConfig = Object.keys(resolvedHeaders).length > 0 
        ? { headers: resolvedHeaders } 
        : undefined;
      
      // Capture request details for logging
      const requestDetails = {
        method,
        url: finalUrl,
        headers: resolvedHeaders,
        queryParams: queryParams,
        body: resolvedPayload,
      };

      // Execute based on HTTP method and capture response
      let responseData: any;
      let responseStatus: number = 200;
      let responseStatusText: string = 'OK';
      let responseHeaders: Record<string, string> = {};
      
      try {
        // Check if this is an external URL (starts with http:// or https://)
        const isExternalUrl = finalUrl.startsWith('http://') || finalUrl.startsWith('https://');
        
        if (isExternalUrl) {
          // For external URLs, use fetch API
          const fetchOptions: RequestInit = {
            method,
            headers: resolvedHeaders,
          };
          
          // Add body for methods that support it
          if (['POST', 'PUT', 'PATCH'].includes(method) && resolvedPayload !== undefined) {
            if (typeof resolvedPayload === 'string') {
              fetchOptions.body = resolvedPayload;
            } else {
              fetchOptions.body = JSON.stringify(resolvedPayload);
              // Set Content-Type if not already set
              if (!resolvedHeaders['Content-Type'] && !resolvedHeaders['content-type']) {
                resolvedHeaders['Content-Type'] = 'application/json';
                fetchOptions.headers = resolvedHeaders;
              }
            }
          }
          
          const response = await fetch(finalUrl, fetchOptions);
          responseStatus = response.status;
          responseStatusText = response.statusText;
          
          // Extract response headers
          response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
          });
          
          // Parse response body
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            responseData = await response.json();
          } else {
            const text = await response.text();
            try {
              // Try to parse as JSON even if content-type doesn't say so
              responseData = JSON.parse(text);
            } catch {
              // If not JSON, return as text
              responseData = text;
            }
          }
          
          // Throw error for non-2xx status codes
          if (!response.ok) {
            throw new Error(`HTTP ${responseStatus}: ${responseStatusText}`);
          }
        } else {
          // For internal API calls, use the apiClient
          switch (method) {
            case 'GET':
              responseData = await context.apiClient.get(finalUrl, requestConfig);
              break;
            case 'POST':
              responseData = await context.apiClient.post(finalUrl, resolvedPayload, requestConfig);
              break;
            case 'PUT':
              responseData = await context.apiClient.post(finalUrl, resolvedPayload, { ...requestConfig, method: 'PUT' } as any);
              break;
            case 'PATCH':
              responseData = await context.apiClient.post(finalUrl, resolvedPayload, { ...requestConfig, method: 'PATCH' } as any);
              break;
            case 'DELETE':
              responseData = await context.apiClient.get(finalUrl, requestConfig);
              break;
            default:
              throw new Error(`Unsupported HTTP method: ${method}`);
          }
        }

        // Create response details
        const responseDetails = {
          status: responseStatus,
          statusText: responseStatusText,
          headers: responseHeaders,
          data: responseData,
        };

        // Return both data and request/response details for logging
        return {
          data: responseData,
          request: requestDetails,
          response: responseDetails,
        };
      } catch (error: any) {
        // Capture error response details
        const errorResponse = {
          status: error.response?.status || responseStatus || 500,
          statusText: error.response?.statusText || responseStatusText || 'Error',
          headers: error.response?.headers || responseHeaders,
          data: error.response?.data || error.message,
        };

        // Attach request/response to error for logging
        (error as any).request = requestDetails;
        (error as any).response = errorResponse;
        throw error;
      }

    case 'file_check':
      // For input nodes, just validate the file exists
      const filename = node.config?.filename;
      if (!filename) {
        throw new Error('No filename specified for input node');
      }
      // In a real implementation, you might want to verify the file exists
      // For now, we'll just return success with consistent structure
      const fileData = {
        type: 'pdb_file',
        filename: filename,
        file_id: node.config?.file_id,
        file_url: node.config?.file_url,
        chains: node.config?.chains,
        total_residues: node.config?.total_residues,
        suggested_contigs: node.config?.suggested_contigs,
        chain_residue_counts: node.config?.chain_residue_counts,
        atoms: node.config?.atoms,
      };
      return {
        data: fileData,
        request: {
          type: 'file_check',
          filename: filename,
        },
        response: {
          status: 200,
          statusText: 'OK',
          data: fileData,
        },
      };

    case 'log':
      // For message input nodes, log the message
      try {
        let message = (executionConfig as any).message;
        
        // If message is a template string, resolve it
        if (typeof message === 'string' && message.includes('{{')) {
          message = resolveTemplates(message, node, inputData) as string;
        }
        
        // Default to empty string if message is undefined or null
        if (message === undefined || message === null) {
          message = node.config?.message || '';
        }
        
        // Log to console for debugging
        console.log(`[Message Input Node: ${node.label}]`, message);
        
        // Return the message as data so it can be passed to connected nodes
        return {
          data: {
            message: message || '',
            loggedAt: new Date().toISOString(),
          },
          request: {
            type: 'log',
            message: message || '',
          },
          response: {
            status: 200,
            statusText: 'Logged',
            data: { message: message || '' },
          },
        };
      } catch (error: any) {
        console.error('[Message Input Node Error]', error);
        throw new Error(`Failed to log message: ${error.message || 'Unknown error'}`);
      }

    case 'code_execution':
      // Execute JavaScript code in a controlled environment
      try {
        // #region agent log
        const logEntry1 = {location:'executionEngine.ts:425',message:'code_execution entry',data:{nodeId:node.id,nodeType:node.type,execConfigCode:(executionConfig as any).code,nodeConfigCode:node.config?.code,hasInputData:Object.keys(inputData).length>0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'};
        console.log('[DEBUG]', logEntry1);
        fetch('http://127.0.0.1:7243/ingest/e128561e-dec0-450c-a8ea-2bf15be2e2f5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logEntry1)}).catch((e)=>console.warn('[DEBUG] Log fetch failed:',e));
        // #endregion
        
        let code = (executionConfig as any).code;
        
        // #region agent log
        const hasTemplate = typeof code === 'string' && code.includes('{{');
        const logEntry2 = {location:'executionEngine.ts:432',message:'code before template resolution',data:{code:code,codeType:typeof code,hasTemplate:hasTemplate,codeLength:code?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'};
        console.log('[DEBUG]', logEntry2);
        fetch('http://127.0.0.1:7243/ingest/e128561e-dec0-450c-a8ea-2bf15be2e2f5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logEntry2)}).catch((e)=>console.warn('[DEBUG] Log fetch failed:',e));
        // #endregion
        
        // If code is a template string, resolve it
        if (typeof code === 'string' && code.includes('{{')) {
          code = resolveTemplates(code, node, inputData) as string;
          
          // #region agent log
          const logEntry3 = {location:'executionEngine.ts:436',message:'code after template resolution',data:{code:code?.substring(0,100),codeLength:code?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'};
          console.log('[DEBUG]', logEntry3);
          fetch('http://127.0.0.1:7243/ingest/e128561e-dec0-450c-a8ea-2bf15be2e2f5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logEntry3)}).catch((e)=>console.warn('[DEBUG] Log fetch failed:',e));
          // #endregion
        }
        
        // Default to empty string if code is undefined or null
        if (!code || code.trim() === '') {
          code = node.config?.code || '';
          
          // #region agent log
          const logEntry4 = {location:'executionEngine.ts:440',message:'code fallback to node.config',data:{code:code?.substring(0,100),codeLength:code?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'};
          console.log('[DEBUG]', logEntry4);
          fetch('http://127.0.0.1:7243/ingest/e128561e-dec0-450c-a8ea-2bf15be2e2f5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logEntry4)}).catch((e)=>console.warn('[DEBUG] Log fetch failed:',e));
          // #endregion
        }
        
        if (!code || code.trim() === '') {
          // #region agent log
          const logEntry5 = {location:'executionEngine.ts:444',message:'code execution failed - no code',data:{execConfigCode:(executionConfig as any).code,nodeConfigCode:node.config?.code},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'};
          console.error('[DEBUG]', logEntry5);
          fetch('http://127.0.0.1:7243/ingest/e128561e-dec0-450c-a8ea-2bf15be2e2f5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logEntry5)}).catch((e)=>console.warn('[DEBUG] Log fetch failed:',e));
          // #endregion
          throw new Error('No code provided for code execution node');
        }
        
        // Create a controlled execution environment
        // Provide access to input data, config, and node metadata
        const executionContext = {
          input: inputData,
          config: node.config || {},
          node: {
            id: node.id,
            type: node.type,
            label: node.label,
            status: node.status,
          },
          // Provide console for logging
          console: {
            log: (...args: any[]) => {
              console.log(`[Code Execution: ${node.label}]`, ...args);
            },
            error: (...args: any[]) => {
              console.error(`[Code Execution: ${node.label}]`, ...args);
            },
            warn: (...args: any[]) => {
              console.warn(`[Code Execution: ${node.label}]`, ...args);
            },
          },
          // Provide Date for timestamps
          Date: Date,
          // Provide JSON for serialization
          JSON: JSON,
        };
        
        // #region agent log
        const logEntry6 = {location:'executionEngine.ts:470',message:'execution context created',data:{inputKeys:Object.keys(inputData),configKeys:Object.keys(executionContext.config),nodeId:executionContext.node.id,codeLength:code.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H6'};
        console.log('[DEBUG]', logEntry6);
        fetch('http://127.0.0.1:7243/ingest/e128561e-dec0-450c-a8ea-2bf15be2e2f5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logEntry6)}).catch((e)=>console.warn('[DEBUG] Log fetch failed:',e));
        // #endregion
        
        // Execute code in a controlled function
        // Using Function constructor for better isolation than eval
        let result: any;
        try {
          // #region agent log
          const logEntry7 = {location:'executionEngine.ts:477',message:'about to execute code',data:{codePreview:code.substring(0,50)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'};
          console.log('[DEBUG]', logEntry7);
          fetch('http://127.0.0.1:7243/ingest/e128561e-dec0-450c-a8ea-2bf15be2e2f5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logEntry7)}).catch((e)=>console.warn('[DEBUG] Log fetch failed:',e));
          // #endregion
          
          const func = new Function(
            'input',
            'config',
            'node',
            'console',
            'Date',
            'JSON',
            `
            ${code}
            `
          );
          
          result = func(
            executionContext.input,
            executionContext.config,
            executionContext.node,
            executionContext.console,
            executionContext.Date,
            executionContext.JSON
          );
          
          // #region agent log
          const resultKeys = (result && typeof result === 'object') ? Object.keys(result) : null;
          const logEntry8 = {location:'executionEngine.ts:500',message:'code executed successfully',data:{resultType:typeof result,resultIsObject:typeof result==='object',resultKeys:resultKeys,resultPreview:JSON.stringify(result).substring(0,100)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'};
          console.log('[DEBUG]', logEntry8);
          fetch('http://127.0.0.1:7243/ingest/e128561e-dec0-450c-a8ea-2bf15be2e2f5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logEntry8)}).catch((e)=>console.warn('[DEBUG] Log fetch failed:',e));
          // #endregion
          
          // If no return value, use undefined
          if (result === undefined) {
            result = { executed: true, timestamp: new Date().toISOString() };
            
            // #region agent log
            const logEntry9 = {location:'executionEngine.ts:505',message:'result was undefined, using default',data:{result},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'};
            console.log('[DEBUG]', logEntry9);
            fetch('http://127.0.0.1:7243/ingest/e128561e-dec0-450c-a8ea-2bf15be2e2f5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logEntry9)}).catch((e)=>console.warn('[DEBUG] Log fetch failed:',e));
            // #endregion
          }
        } catch (execError: any) {
          // #region agent log
          const logEntry10 = {location:'executionEngine.ts:510',message:'code execution error',data:{error:execError.message,errorStack:execError.stack?.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'};
          console.error('[DEBUG]', logEntry10);
          fetch('http://127.0.0.1:7243/ingest/e128561e-dec0-450c-a8ea-2bf15be2e2f5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logEntry10)}).catch((e)=>console.warn('[DEBUG] Log fetch failed:',e));
          // #endregion
          console.error(`[Code Execution Error in ${node.label}]`, execError);
          throw new Error(`Code execution failed: ${execError.message || 'Unknown error'}`);
        }
        
        // Log execution result
        console.log(`[Code Execution: ${node.label}] Result:`, result);
        
        // #region agent log
        const resultKeys2 = (result && typeof result === 'object') ? Object.keys(result) : null;
        const logEntry11 = {location:'executionEngine.ts:520',message:'returning execution result',data:{resultType:typeof result,resultIsObject:typeof result==='object',resultKeys:resultKeys2},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'};
        console.log('[DEBUG]', logEntry11);
        fetch('http://127.0.0.1:7243/ingest/e128561e-dec0-450c-a8ea-2bf15be2e2f5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logEntry11)}).catch((e)=>console.warn('[DEBUG] Log fetch failed:',e));
        // #endregion
        
        // Return the execution result
        return {
          data: result,
          request: {
            type: 'code_execution',
            code: code.substring(0, 200) + (code.length > 200 ? '...' : ''), // Truncate for logging
          },
          response: {
            status: 200,
            statusText: 'Executed',
            data: result,
          },
        };
      } catch (error: any) {
        console.error('[Code Execution Node Error]', error);
        throw new Error(`Failed to execute code: ${error.message || 'Unknown error'}`);
      }

    default:
      throw new Error(`Unknown execution type: ${executionConfig.type}`);
  }
}

/**
 * Validates that a node can be executed (has required inputs)
 */
export async function validateNodeExecution(
  node: PipelineNode,
  pipeline: Pipeline
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  try {
    const nodeDefinition = await loadNodeConfig(node.type);
    const inputData = await getAllInputData(node, nodeDefinition, pipeline);

    // Check required inputs
    for (const inputHandle of nodeDefinition.handles.inputs) {
      if (!inputData[inputHandle.id] && inputHandle.dataType) {
        errors.push(
          `Missing required input '${inputHandle.id}' (${inputHandle.dataType})`
        );
      }
    }

    // Validate config fields marked as required
    for (const [fieldName, fieldSchema] of Object.entries(nodeDefinition.schema)) {
      if (fieldSchema.required && !node.config?.[fieldName]) {
        errors.push(`Missing required config field: ${fieldName}`);
      }
    }
  } catch (error: any) {
    errors.push(error.message || 'Validation failed');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

