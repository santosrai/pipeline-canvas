import { PipelineNode, Pipeline } from '../types/index';
import { loadNodeConfig, NodeDefinition, HandleDefinition } from './nodeLoader';
import { resolveTemplates } from './templateResolver';

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
  post: (endpoint: string, data: any, config?: { headers?: Record<string, string> }) => Promise<any>;
  get: (endpoint: string, config?: { headers?: Record<string, string> }) => Promise<any>;
}

interface ExecutionContext {
  pipeline: Pipeline;
  apiClient: ApiClient;
  sessionId?: string | null;
  config?: {
    endpoints?: {
      nodes?: {
        rfdiffusion?: string;
        alphafold?: string;
        proteinmpnn?: string;
        generic?: string;
      };
    };
    responseTransformers?: {
      nodeExecution?: (response: any, nodeType: string) => any;
    };
  };
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
        const fileData = {
          type: 'pdb_file',
          filename: sourceNode.config?.filename,
          file_id: sourceNode.config?.file_id,
          file_url: sanitizeFileUrl(sourceNode.config?.file_url, sourceNode.config?.file_id),
          chains: sourceNode.config?.chains,
          total_residues: sourceNode.config?.total_residues,
          suggested_contigs: sourceNode.config?.suggested_contigs,
          chain_residue_counts: sourceNode.config?.chain_residue_counts,
          atoms: sourceNode.config?.atoms,
        };
        return fileData;
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
      
      // Check for config-based endpoint override
      if (context.config?.endpoints?.nodes) {
        const nodeEndpoints = context.config.endpoints.nodes;
        // Map node types to endpoint config keys
        const endpointMap: Record<string, keyof typeof nodeEndpoints> = {
          'rfdiffusion_node': 'rfdiffusion',
          'alphafold_node': 'alphafold',
          'proteinmpnn_node': 'proteinmpnn',
        };
        
        const endpointKey = endpointMap[node.type];
        if (endpointKey && nodeEndpoints[endpointKey]) {
          // Use config endpoint, but allow node config to override if it's a full URL
          const configEndpoint = nodeEndpoints[endpointKey]!;
          // Only use config endpoint if node endpoint is relative or empty
          if (!endpoint || (!endpoint.startsWith('http://') && !endpoint.startsWith('https://'))) {
            endpoint = configEndpoint;
          }
        }
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
        // Extract body_json template BEFORE full resolution to prevent recursive template resolution
        // that could corrupt the JSON string
        const bodyJsonTemplate = executionConfig.payload['__body_json__'];
        let bodyJsonRaw: string | undefined = undefined;
        
        // If body_json is a template variable, extract the config value directly
        if (typeof bodyJsonTemplate === 'string' && bodyJsonTemplate.trim().startsWith('{{') && bodyJsonTemplate.trim().endsWith('}}')) {
          const match = bodyJsonTemplate.trim().match(/^\{\{config\.(.+)\}\}$/);
          if (match) {
            // Get the raw JSON string from config without template resolution
            bodyJsonRaw = node.config?.[match[1]] as string | undefined;
          }
        }
        
        // Resolve the rest of the payload (but skip __body_json__ to avoid double processing)
        const payloadToResolve = { ...executionConfig.payload };
        if (bodyJsonRaw !== undefined) {
          // Temporarily remove __body_json__ to prevent recursive resolution
          delete payloadToResolve['__body_json__'];
        }
        const payloadResolved = resolveTemplates(payloadToResolve, node, inputData);
        
        // Restore __body_json__ with the raw value
        if (bodyJsonRaw !== undefined) {
          payloadResolved['__body_json__'] = bodyJsonRaw;
        }
        
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
                    // Validate JSON string before parsing
                    if (!bodyJson.trim()) {
                      throw new Error('body_json is empty');
                    }
                    
                    // Fix unquoted template variables in JSON string before parsing
                    // Replace patterns like {{config.field}} (unquoted) with "{{config.field}}" (quoted)
                    // This handles cases where users have old configs with unquoted template variables
                    let fixedJson = bodyJson;
                    // Match unquoted template variables: "key": {{variable}} -> "key": "{{variable}}"
                    // Pattern matches colon, optional whitespace, then {{...}} that's NOT already quoted
                    // We detect "not quoted" by checking that there's no quote immediately after the colon
                    fixedJson = fixedJson.replace(/("([^"]+)":\s*)(\{\{([^}]+)\}\})(\s*[,}])/g, (match, prefix, _key, _templateVar, content, suffix) => {
                      // If prefix ends with a quote, it's already quoted, don't modify
                      if (prefix.endsWith('"')) {
                        return match;
                      }
                      // Otherwise, quote the template variable
                      return `${prefix}"{{${content}}}"${suffix}`;
                    });
                    
                    // Try to parse the fixed JSON
                    resolvedPayload = JSON.parse(fixedJson);
                  } else {
                    resolvedPayload = bodyJson;
                  }
                  // CRITICAL: Resolve template variables in the parsed payload
                  resolvedPayload = resolveTemplates(resolvedPayload, node, inputData);
                  
                  // Convert string numbers to actual numbers for numeric fields (RFdiffusion compatibility)
                  if (node.type === 'rfdiffusion_node' && resolvedPayload && typeof resolvedPayload === 'object') {
                    // Handle diffusion_steps: convert string to number, use default 15 if empty
                    if (typeof resolvedPayload.diffusion_steps === 'string') {
                      if (resolvedPayload.diffusion_steps === '') {
                        resolvedPayload.diffusion_steps = node.config?.diffusion_steps ?? 15;
                      } else {
                        const steps = Number(resolvedPayload.diffusion_steps);
                        if (!isNaN(steps)) resolvedPayload.diffusion_steps = steps;
                      }
                    }
                    // Handle num_designs: convert string to number, use default 1 if empty
                    if (typeof resolvedPayload.num_designs === 'string') {
                      if (resolvedPayload.num_designs === '') {
                        resolvedPayload.num_designs = node.config?.num_designs ?? 1;
                      } else {
                        const designs = Number(resolvedPayload.num_designs);
                        if (!isNaN(designs)) resolvedPayload.num_designs = designs;
                      }
                    }
                    // Handle hotspot_res: convert empty string to empty array, or omit if empty
                    if (typeof resolvedPayload.hotspot_res === 'string') {
                      if (resolvedPayload.hotspot_res.trim() === '') {
                        // Remove empty hotspot_res to avoid API validation errors
                        delete resolvedPayload.hotspot_res;
                      } else {
                        // Parse comma-separated string to array
                        const hotspots = resolvedPayload.hotspot_res.split(',').map((h: string) => h.trim()).filter((h: string) => h);
                        if (hotspots.length > 0) {
                          resolvedPayload.hotspot_res = hotspots;
                        } else {
                          delete resolvedPayload.hotspot_res;
                        }
                      }
                    } else if (Array.isArray(resolvedPayload.hotspot_res)) {
                      // Filter out empty values from array
                      const filtered = resolvedPayload.hotspot_res.filter((h: any) => h && String(h).trim());
                      if (filtered.length > 0) {
                        resolvedPayload.hotspot_res = filtered;
                      } else {
                        delete resolvedPayload.hotspot_res;
                      }
                    }
                    
                    // Transform RFdiffusion payload to match backend API format
                    // Backend expects: { parameters: {...}, jobId: "...", sessionId: "..." }
                    if (node.type === 'rfdiffusion_node' && resolvedPayload && typeof resolvedPayload === 'object') {
                      // Generate a unique jobId if not already present
                      const jobId = `rf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                      
                      // Extract parameters (everything except jobId and sessionId)
                      const parameters = { ...resolvedPayload };
                      delete parameters.jobId;
                      delete parameters.sessionId;
                      
                      // Transform file references: pdb_file can be a file object with file_id
                      // Backend expects uploadId (file_id) or pdb_id
                      if (parameters.pdb_file) {
                        // If pdb_file is an object with file_id, convert to uploadId
                        if (typeof parameters.pdb_file === 'object' && parameters.pdb_file.file_id) {
                          parameters.uploadId = parameters.pdb_file.file_id;
                          delete parameters.pdb_file;
                        } else if (typeof parameters.pdb_file === 'string' && parameters.pdb_file.trim()) {
                          // If it's a string, it might be a file_id or file path
                          // Check if it looks like a file_id (UUID or similar)
                          if (parameters.pdb_file.length > 20 || parameters.pdb_file.includes('/')) {
                            // Looks like a file path, keep as pdb_file
                          } else {
                            // Likely a file_id, convert to uploadId
                            parameters.uploadId = parameters.pdb_file;
                            delete parameters.pdb_file;
                          }
                        }
                      }
                      
                      // Also check inputData for file references
                      if (inputData && inputData.target) {
                        const fileData = inputData.target;
                        if (fileData && typeof fileData === 'object' && fileData.file_id) {
                          // Use file_id as uploadId
                          parameters.uploadId = fileData.file_id;
                          // Remove pdb_file if it was set incorrectly
                          delete parameters.pdb_file;
                        }
                      }
                      
                      // If we have an uploadId, remove empty pdb_id to avoid confusion
                      // Backend prioritizes uploadId over pdb_id, so empty pdb_id is not needed
                      if (parameters.uploadId && (!parameters.pdb_id || parameters.pdb_id.trim() === '')) {
                        delete parameters.pdb_id;
                        console.log('[ExecutionEngine] Removed empty pdb_id since uploadId is present:', parameters.uploadId);
                      }
                      
                      // Transform to backend format
                      resolvedPayload = {
                        parameters: parameters,
                        jobId: jobId
                      };
                      
                      // Add sessionId if available
                      if (context.sessionId) {
                        resolvedPayload.sessionId = context.sessionId;
                        console.log('[ExecutionEngine] Transformed RFdiffusion payload with jobId:', jobId, 'sessionId:', context.sessionId, 'parameters:', Object.keys(parameters));
                      } else {
                        console.log('[ExecutionEngine] Transformed RFdiffusion payload with jobId:', jobId, '(no sessionId)', 'parameters:', Object.keys(parameters));
                      }
                    } else if (node.type === 'rfdiffusion_node') {
                      // Fallback: if payload is not an object, create a basic structure
                      const jobId = `rf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                      resolvedPayload = {
                        parameters: resolvedPayload || {},
                        jobId: jobId
                      };
                      if (context.sessionId) {
                        resolvedPayload.sessionId = context.sessionId;
                      }
                    }
                  }
                } catch (e) {
                  // Provide more context about the JSON parsing error
                  const errorMessage = e instanceof Error ? e.message : String(e);
                  const jsonPreview = typeof bodyJson === 'string' 
                    ? (bodyJson.length > 200 ? bodyJson.substring(0, 200) + '...' : bodyJson)
                    : 'Not a string';
                  throw new Error(`Invalid JSON body: ${errorMessage}. JSON preview: ${jsonPreview}`);
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
                  
                // Transform RFdiffusion payload to match backend API format (expression mode)
                if (node.type === 'rfdiffusion_node' && resolvedPayload && typeof resolvedPayload === 'object') {
                  const jobId = `rf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                  const parameters = { ...resolvedPayload };
                  delete parameters.jobId;
                  delete parameters.sessionId;
                  
                  // Transform file references
                  if (parameters.pdb_file && typeof parameters.pdb_file === 'object' && parameters.pdb_file.file_id) {
                    parameters.uploadId = parameters.pdb_file.file_id;
                    delete parameters.pdb_file;
                  }
                  if (inputData && inputData.target && typeof inputData.target === 'object' && inputData.target.file_id) {
                    parameters.uploadId = inputData.target.file_id;
                    delete parameters.pdb_file;
                  }
                  
                  // If we have an uploadId, remove empty pdb_id
                  if (parameters.uploadId && (!parameters.pdb_id || parameters.pdb_id.trim() === '')) {
                    delete parameters.pdb_id;
                  }
                  
                  resolvedPayload = {
                    parameters: parameters,
                    jobId: jobId
                  };
                  
                  if (context.sessionId) {
                    resolvedPayload.sessionId = context.sessionId;
                    console.log('[ExecutionEngine] Transformed RFdiffusion payload (expression) with jobId:', jobId);
                  }
                }
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
                
                // Transform RFdiffusion payload to match backend API format (legacy mode)
                if (node.type === 'rfdiffusion_node' && resolvedPayload && typeof resolvedPayload === 'object') {
                  const jobId = `rf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                  const parameters = { ...resolvedPayload };
                  delete parameters.jobId;
                  delete parameters.sessionId;
                  
                  // Transform file references
                  if (parameters.pdb_file && typeof parameters.pdb_file === 'object' && parameters.pdb_file.file_id) {
                    parameters.uploadId = parameters.pdb_file.file_id;
                    delete parameters.pdb_file;
                  }
                  if (inputData && inputData.target && typeof inputData.target === 'object' && inputData.target.file_id) {
                    parameters.uploadId = inputData.target.file_id;
                    delete parameters.pdb_file;
                  }
                  
                  // If we have an uploadId, remove empty pdb_id
                  if (parameters.uploadId && (!parameters.pdb_id || parameters.pdb_id.trim() === '')) {
                    delete parameters.pdb_id;
                  }
                  
                  resolvedPayload = {
                    parameters: parameters,
                    jobId: jobId
                  };
                  
                  if (context.sessionId) {
                    resolvedPayload.sessionId = context.sessionId;
                    console.log('[ExecutionEngine] Transformed RFdiffusion payload (legacy) with jobId:', jobId);
                  }
                }
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
          try {
            console.log('[ExecutionEngine] Making API call:', { method, url: finalUrl, hasPayload: !!resolvedPayload });
            let axiosResponse: any;
            switch (method) {
              case 'GET':
                axiosResponse = await context.apiClient.get(finalUrl, requestConfig);
                break;
              case 'POST':
                axiosResponse = await context.apiClient.post(finalUrl, resolvedPayload, requestConfig);
                break;
              case 'PUT':
                axiosResponse = await context.apiClient.post(finalUrl, resolvedPayload, { ...requestConfig, method: 'PUT' } as any);
                break;
              case 'PATCH':
                axiosResponse = await context.apiClient.post(finalUrl, resolvedPayload, { ...requestConfig, method: 'PATCH' } as any);
                break;
              case 'DELETE':
                axiosResponse = await context.apiClient.get(finalUrl, requestConfig);
                break;
              default:
                throw new Error(`Unsupported HTTP method: ${method}`);
            }
            
            console.log('[ExecutionEngine] API response received:', { 
              hasResponse: !!axiosResponse, 
              responseType: typeof axiosResponse,
              hasData: axiosResponse && typeof axiosResponse === 'object' && 'data' in axiosResponse,
              keys: axiosResponse && typeof axiosResponse === 'object' ? Object.keys(axiosResponse) : []
            });
            
            // Axios returns response object with data property
            // Extract data and response metadata
            if (axiosResponse && typeof axiosResponse === 'object') {
              if ('data' in axiosResponse) {
                responseData = axiosResponse.data;
                // Also extract status and headers from axios response
                if ('status' in axiosResponse) {
                  responseStatus = axiosResponse.status;
                }
                if ('statusText' in axiosResponse) {
                  responseStatusText = axiosResponse.statusText;
                }
                if ('headers' in axiosResponse && axiosResponse.headers) {
                  responseHeaders = axiosResponse.headers;
                }
              } else {
                // If no data property, use the whole response
                responseData = axiosResponse;
              }
            } else {
              responseData = axiosResponse;
            }
          } catch (axiosError: any) {
            console.error('[ExecutionEngine] Axios error:', {
              message: axiosError.message,
              code: axiosError.code,
              hasResponse: !!axiosError.response,
              hasRequest: !!axiosError.request,
              responseStatus: axiosError.response?.status,
              responseData: axiosError.response?.data,
              url: finalUrl,
              method
            });
            
            // Handle axios-specific errors
            if (axiosError.response) {
              // Server responded with error status
              responseStatus = axiosError.response.status;
              responseStatusText = axiosError.response.statusText || 'Error';
              responseHeaders = axiosError.response.headers || {};
              responseData = axiosError.response.data;
              // Re-throw with proper error structure
              const httpError = new Error(`HTTP ${responseStatus}: ${responseStatusText}`);
              (httpError as any).response = axiosError.response;
              throw httpError;
            } else if (axiosError.request) {
              // Request was made but no response received (network error)
              const networkError = new Error(`Network Error: ${axiosError.message || 'No response from server. Please check your connection and try again.'}`);
              (networkError as any).code = axiosError.code || 'NETWORK_ERROR';
              (networkError as any).request = axiosError.request;
              throw networkError;
            } else {
              // Error setting up the request
              throw new Error(`Request Error: ${axiosError.message || 'Failed to make request'}`);
            }
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
        // Check if it's an axios error with response
        const isNetworkError = error.message?.includes('Network Error') || error.code === 'NETWORK_ERROR' || error.code === 'ERR_NETWORK';
        const hasResponse = error.response && typeof error.response === 'object';
        
        const errorResponse = {
          status: hasResponse ? error.response.status : (isNetworkError ? 0 : responseStatus || 500),
          statusText: hasResponse ? error.response.statusText : (isNetworkError ? 'Network Error' : responseStatusText || 'Error'),
          headers: hasResponse ? error.response.headers : responseHeaders,
          data: hasResponse ? error.response.data : (isNetworkError ? { error: error.message, status: 'error' } : error.message),
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
      const fileData = sanitizeFileData({
        type: 'pdb_file',
        filename: filename,
        file_id: node.config?.file_id,
        file_url: node.config?.file_url,
        chains: node.config?.chains,
        total_residues: node.config?.total_residues,
        suggested_contigs: node.config?.suggested_contigs,
        chain_residue_counts: node.config?.chain_residue_counts,
        atoms: node.config?.atoms,
      });
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
        let code = (executionConfig as any).code;
        
        // If code is a template string, resolve it
        if (typeof code === 'string' && code.includes('{{')) {
          code = resolveTemplates(code, node, inputData) as string;
        }
        
        // Default to empty string if code is undefined or null
        if (!code || code.trim() === '') {
          code = node.config?.code || '';
        }
        
        if (!code || code.trim() === '') {
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
        
        // Execute code in a controlled function
        // Using Function constructor for better isolation than eval
        let result: any;
        try {
          
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
          
          // If no return value, use undefined
          if (result === undefined) {
            result = { executed: true, timestamp: new Date().toISOString() };
          }
        } catch (execError: any) {
          console.error(`[Code Execution Error in ${node.label}]`, execError);
          throw new Error(`Code execution failed: ${execError.message || 'Unknown error'}`);
        }
        
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

