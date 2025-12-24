import React, { useState, useRef, useEffect } from 'react';
import { usePipelineStore, ExecutionLogEntry } from '../store/pipelineStore';
import { PipelineNode } from '../types/index';
import { Trash2, Upload, X, File, ArrowLeft, Play, CheckCircle2, Info, Copy, Search, AlertCircle } from 'lucide-react';

interface PipelineNodeConfigProps {
  nodeId: string;
  onUpdate: (updates: Partial<PipelineNode>) => void;
  onDelete: () => void;
  onClose?: () => void;
}

// Helper function to get input data for a node
const getInputDataForNode = (
  nodeId: string,
  nodes: PipelineNode[],
  edges: Array<{ source: string; target: string }>,
  targetNodeType?: string
): { sourceNode: PipelineNode | null; inputData: any } => {
  const incomingEdges = edges.filter((e) => e.target === nodeId);
  if (incomingEdges.length === 0) {
    return { sourceNode: null, inputData: null };
  }

  const sourceNode = nodes.find((n) => n.id === incomingEdges[0].source);
  if (!sourceNode) {
    return { sourceNode: null, inputData: null };
  }

  // For code execution nodes, return the full result_metadata as input data
  if (targetNodeType === 'message_input_node' && sourceNode.result_metadata) {
    return {
      sourceNode,
      inputData: sourceNode.result_metadata,
    };
  }

  // Get input data based on source node type
  if (sourceNode.type === 'input_node') {
    return {
      sourceNode,
      inputData: {
        type: 'pdb_file',
        filename: sourceNode.config?.filename,
        file_id: sourceNode.config?.file_id,
        file_url: sourceNode.config?.file_url,
        chains: sourceNode.config?.chains,
        total_residues: sourceNode.config?.total_residues,
        suggested_contigs: sourceNode.config?.suggested_contigs,
      },
    };
  }

  if (sourceNode.result_metadata?.output_file) {
    return {
      sourceNode,
      inputData: {
        type: 'pdb_file',
        output_file: sourceNode.result_metadata.output_file,
      },
    };
  }

  if (sourceNode.type === 'proteinmpnn_node' && sourceNode.result_metadata?.sequence) {
    return {
      sourceNode,
      inputData: {
        type: 'sequence',
        sequence: sourceNode.result_metadata.sequence,
      },
    };
  }

  // For any other node with result_metadata, return it as generic data
  if (sourceNode.result_metadata) {
    return {
      sourceNode,
      inputData: sourceNode.result_metadata,
    };
  }

  return { sourceNode, inputData: null };
};

export const PipelineNodeConfig: React.FC<PipelineNodeConfigProps> = ({
  nodeId,
  onUpdate,
  onDelete,
  onClose,
}) => {
  const { currentPipeline, currentExecution, startExecution } = usePipelineStore();
  const node = currentPipeline?.nodes.find((n) => n.id === nodeId);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'parameters' | 'settings' | 'output'>('parameters');
  const [outputViewTab, setOutputViewTab] = useState<'table' | 'json' | 'schema'>('json');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get execution log for this node
  const nodeLog: ExecutionLogEntry | undefined = currentExecution?.logs.find(
    (log) => log.nodeId === nodeId
  );

  // Debug: Log when nodeLog changes (especially for HTTP request nodes)
  useEffect(() => {
    if (node?.type === 'http_request_node') {
      console.log('[PipelineNodeConfig] nodeLog changed:', {
        nodeId,
        hasCurrentExecution: !!currentExecution,
        currentExecutionId: currentExecution?.id,
        logsCount: currentExecution?.logs?.length || 0,
        allLogNodeIds: currentExecution?.logs?.map(l => l.nodeId) || [],
        hasNodeLog: !!nodeLog,
        nodeLogStatus: nodeLog?.status,
        nodeLogKeys: nodeLog ? Object.keys(nodeLog) : null,
        nodeLogResponse: nodeLog?.response,
        nodeLogOutput: nodeLog?.output,
        activeTab,
        fullNodeLog: nodeLog, // Log entire nodeLog for debugging
      });
    }
  }, [nodeId, node?.type, currentExecution, nodeLog, activeTab]);

  // Get input data for nodes that have inputs
  const { sourceNode, inputData } = currentPipeline
    ? getInputDataForNode(nodeId, currentPipeline.nodes, currentPipeline.edges, node?.type)
    : { sourceNode: null, inputData: null };

  // Check if node has inputs (needs INPUT panel)
  const hasInputs = node?.type !== 'input_node' && currentPipeline?.edges.some((e) => e.target === nodeId);

  if (!node) {
    return <div className="text-sm text-gray-400">Node not found</div>;
  }

  const handleConfigChange = (key: string, value: any) => {
    onUpdate({
      config: {
        ...node.config,
        [key]: value,
      },
    });
  };

  const handleFileSelected = async (file: File) => {
    setPendingFile(file);
    setUploadError(null);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload/pdb', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Upload failed');
      }

      const result = await response.json();
      
      // Update node config with uploaded file info
      handleConfigChange('filename', result.file_info.filename);
      handleConfigChange('file_id', result.file_info.file_id);
      handleConfigChange('file_url', result.file_info.file_url);
      
      // Store PDB analysis results for RFdiffusion suggestions
      if (result.file_info.chain_residue_counts) {
        handleConfigChange('chain_residue_counts', result.file_info.chain_residue_counts);
      }
      if (result.file_info.total_residues) {
        handleConfigChange('total_residues', result.file_info.total_residues);
      }
      if (result.file_info.suggested_contigs) {
        handleConfigChange('suggested_contigs', result.file_info.suggested_contigs);
      }
      if (result.file_info.chains) {
        handleConfigChange('chains', result.file_info.chains);
      }
      if (result.file_info.atoms) {
        handleConfigChange('atoms', result.file_info.atoms);
      }
      
      setPendingFile(null);
      setIsUploading(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload file';
      setUploadError(errorMessage);
      setIsUploading(false);
      setPendingFile(null);
    }
  };

  const handleFileCleared = () => {
    setPendingFile(null);
    setUploadError(null);
    handleConfigChange('filename', '');
    handleConfigChange('file_id', '');
    handleConfigChange('file_url', '');
    handleConfigChange('chain_residue_counts', {});
    handleConfigChange('total_residues', 0);
    handleConfigChange('suggested_contigs', '');
    handleConfigChange('chains', []);
    handleConfigChange('atoms', 0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.name.toLowerCase().endsWith('.pdb')) {
        setUploadError('Please select a PDB file (.pdb extension required)');
        return;
      }

      // Validate file size (10MB limit)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        setUploadError('File too large. Maximum size is 10MB.');
        return;
      }

      handleFileSelected(file);
    }
    // Reset input value to allow re-selecting the same file
    event.target.value = '';
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const inputClassName = "w-full px-3 py-2 text-sm bg-gray-800/50 border border-gray-600/50 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-colors";

  const handleExecuteStep = () => {
    // Execute just this node
    startExecution();
  };

  const renderConfigFields = () => {
    switch (node.type) {
      case 'input_node':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">
                PDB File
              </label>
              <div className="space-y-2">
                {pendingFile ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 border border-gray-600/50 rounded-lg">
                    <File className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <span className="text-xs text-gray-200 flex-1 truncate" title={pendingFile.name}>
                      {pendingFile.name}
                    </span>
                    {isUploading ? (
                      <span className="text-xs text-gray-400">Uploading...</span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleFileCleared}
                        disabled={isUploading}
                        className="p-1 hover:bg-gray-700/50 rounded disabled:opacity-50 transition-colors"
                        title="Remove file"
                      >
                        <X className="w-3 h-3 text-gray-400" />
                      </button>
                    )}
                  </div>
                ) : node.config?.filename ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-800/30 border border-gray-700/50 rounded-lg">
                    <File className="w-4 h-4 text-green-400 flex-shrink-0" />
                    <span className="text-xs text-gray-300 flex-1 truncate" title={node.config.filename}>
                      {node.config.filename}
                    </span>
                    <button
                      type="button"
                      onClick={handleFileCleared}
                      className="p-1 hover:bg-gray-700/50 rounded transition-colors"
                      title="Remove file"
                    >
                      <X className="w-3 h-3 text-gray-400" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleUploadClick}
                    disabled={isUploading}
                    className="w-full px-3 py-2 text-sm bg-gray-800/50 border border-gray-600/50 rounded-lg text-gray-200 hover:bg-gray-800/70 hover:border-gray-500/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Upload PDB File</span>
                  </button>
                )}
                {uploadError && (
                  <div className="text-xs text-red-400 bg-red-900/20 px-3 py-2 rounded-lg border border-red-700/50">
                    {uploadError}
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdb"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
              </div>
            </div>

            {/* PDB Analysis Results - Display when file is uploaded */}
            {node.config?.filename && node.config?.total_residues && (
              <div className="space-y-3 pt-2 border-t border-gray-700/50">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">
                    Structure Information
                  </label>
                  <div className="bg-gray-800/30 rounded-lg p-3 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Total Residues:</span>
                      <span className="text-gray-200 font-medium">{node.config.total_residues}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Atoms:</span>
                      <span className="text-gray-200 font-medium">{node.config.atoms || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Chains:</span>
                      <span className="text-gray-200 font-medium">
                        {Array.isArray(node.config.chains) ? node.config.chains.join(', ') : 'N/A'}
                      </span>
                    </div>
                    {node.config.chain_residue_counts && typeof node.config.chain_residue_counts === 'object' && (
                      <div className="pt-2 border-t border-gray-700/30">
                        <span className="text-gray-500 block mb-1">Residues per Chain:</span>
                        <div className="space-y-1">
                          {Object.entries(node.config.chain_residue_counts).map(([chain, count]) => (
                            <div key={chain} className="flex justify-between pl-2">
                              <span className="text-gray-400">Chain {chain}:</span>
                              <span className="text-gray-200">{count as number} residues</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Suggested RFdiffusion Parameters */}
                {node.config?.suggested_contigs && (
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-2">
                      Suggested RFdiffusion Parameters
                    </label>
                    <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-3 space-y-2 text-xs">
                      <div className="flex items-start gap-2">
                        <span className="text-blue-400 font-medium">Contigs:</span>
                        <code className="flex-1 text-blue-300 bg-gray-900/50 px-2 py-1 rounded font-mono">
                          {node.config.suggested_contigs}
                        </code>
                      </div>
                      <p className="text-gray-400 text-xs mt-2">
                        This suggestion is based on your PDB structure. You can use this value in RFdiffusion nodes connected to this input.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );

      case 'rfdiffusion_node':
        return (
          <div className="space-y-4">
            {/* HTTP Method */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">
                Method
              </label>
              <select
                value={node.config?.method || 'POST'}
                onChange={(e) => handleConfigChange('method', e.target.value)}
                className={inputClassName}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
              </select>
            </div>

            {/* URL */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">
                URL
              </label>
              <input
                type="text"
                value={node.config?.url || '/rfdiffusion/run'}
                onChange={(e) => handleConfigChange('url', e.target.value)}
                className={inputClassName}
                placeholder="/rfdiffusion/run"
              />
              <p className="text-xs text-gray-500 mt-1.5">
                API endpoint URL (relative or absolute)
              </p>
            </div>

            {/* API Key */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">
                API Key
              </label>
              <input
                type="password"
                value={node.config?.api_key || ''}
                onChange={(e) => handleConfigChange('api_key', e.target.value)}
                className={inputClassName}
                placeholder="Enter NVIDIA API key (optional)"
              />
              <p className="text-xs text-gray-500 mt-1.5">
                Leave empty to use global API key from settings
              </p>
            </div>

            {/* Send Query Parameters Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">
                  Send Query Parameters
                </label>
                <p className="text-xs text-gray-500">
                  Include query parameters in the URL
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={node.config?.send_query_params || false}
                  onChange={(e) => handleConfigChange('send_query_params', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>

            {/* Query Parameters (shown if toggle is on) */}
            {node.config?.send_query_params && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">
                  Query Parameters
                </label>
                <textarea
                  value={node.config?.query_params || '{}'}
                  onChange={(e) => handleConfigChange('query_params', e.target.value)}
                  className={`${inputClassName} font-mono text-xs`}
                  rows={3}
                  placeholder='{"key": "value"}'
                />
                <p className="text-xs text-gray-500 mt-1.5">
                  JSON object with query parameters
                </p>
              </div>
            )}

            {/* Send Headers Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">
                  Send Headers
                </label>
                <p className="text-xs text-gray-500">
                  Include custom headers in the request
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={node.config?.send_headers !== false}
                  onChange={(e) => handleConfigChange('send_headers', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>

            {/* Custom Headers (shown if toggle is on) */}
            {node.config?.send_headers !== false && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">
                  Custom Headers
                </label>
                <textarea
                  value={node.config?.custom_headers || '{}'}
                  onChange={(e) => handleConfigChange('custom_headers', e.target.value)}
                  className={`${inputClassName} font-mono text-xs`}
                  rows={3}
                  placeholder='{"Content-Type": "application/json"}'
                />
                <p className="text-xs text-gray-500 mt-1.5">
                  JSON object with custom headers
                </p>
              </div>
            )}

            {/* Send Body Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">
                  Send Body
                </label>
                <p className="text-xs text-gray-500">
                  Include request body
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={node.config?.send_body !== false}
                  onChange={(e) => handleConfigChange('send_body', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>

            {/* Body Configuration (shown if toggle is on) */}
            {node.config?.send_body !== false && (
              <>
                {/* Body Content Type */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">
                    Body Content Type
                  </label>
                  <select
                    value={node.config?.body_content_type || 'json'}
                    onChange={(e) => handleConfigChange('body_content_type', e.target.value)}
                    className={inputClassName}
                  >
                    <option value="json">JSON</option>
                    <option value="form-data">Form Data</option>
                    <option value="x-www-form-urlencoded">Form URL Encoded</option>
                    <option value="raw">Raw</option>
                  </select>
                </div>

                {/* Specify Body */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">
                    Specify Body
                  </label>
                  <select
                    value={node.config?.body_specify || 'json'}
                    onChange={(e) => handleConfigChange('body_specify', e.target.value)}
                    className={inputClassName}
                  >
                    <option value="json">Using JSON</option>
                    <option value="expression">Using Expression</option>
                    <option value="fixed">Fixed</option>
                  </select>
                </div>

                {/* JSON Body */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">
                    JSON
                  </label>
                  <textarea
                    value={node.config?.body_json || '{\n  "pdb_file": "{{input.target}}",\n  "contigs": "{{config.contigs}}",\n  "num_designs": "{{config.num_designs}}"\n}'}
                    onChange={(e) => handleConfigChange('body_json', e.target.value)}
                    className={`${inputClassName} font-mono text-xs`}
                    rows={6}
                    placeholder='{"pdb_file": "{{input.target}}", "contigs": "{{config.contigs}}"}'
                  />
                  <p className="text-xs text-gray-500 mt-1.5">
                    JSON body content (supports template variables like {"{{input.target}}"})
                  </p>
                </div>
              </>
            )}

            {/* Legacy Fields (for backwards compatibility) */}
            <div className="border-t border-gray-700 pt-4 mt-4">
              <p className="text-xs font-medium text-gray-400 mb-3">Legacy Parameters</p>
              
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">
                  Contigs
                </label>
                <input
                  type="text"
                  value={node.config?.contigs || '50'}
                  onChange={(e) => handleConfigChange('contigs', e.target.value)}
                  className={inputClassName}
                  placeholder="50"
                />
                <p className="text-xs text-gray-500 mt-1.5">
                  Contig specification (e.g., "50" or "A1-50")
                </p>
              </div>

              <div className="mt-4">
                <label className="block text-xs font-medium text-gray-400 mb-2">
                  Number of Designs
                </label>
                <input
                  type="number"
                  value={node.config?.num_designs || 1}
                  onChange={(e) => handleConfigChange('num_designs', parseInt(e.target.value) || 1)}
                  className={inputClassName}
                  min="1"
                  max="10"
                />
              </div>
            </div>
          </div>
        );

      case 'proteinmpnn_node':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">
                Number of Sequences
              </label>
              <input
                type="number"
                value={node.config?.num_sequences || 8}
                onChange={(e) => handleConfigChange('num_sequences', parseInt(e.target.value) || 8)}
                className={inputClassName}
                min="1"
                max="100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">
                Temperature
              </label>
              <input
                type="number"
                step="0.1"
                value={node.config?.temperature || 0.1}
                onChange={(e) => handleConfigChange('temperature', parseFloat(e.target.value) || 0.1)}
                className={inputClassName}
                min="0.1"
                max="1.0"
              />
            </div>
          </div>
        );

      case 'alphafold_node':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">
                Recycle Count
              </label>
              <input
                type="number"
                value={node.config?.recycle_count || 3}
                onChange={(e) => handleConfigChange('recycle_count', parseInt(e.target.value) || 3)}
                className={inputClassName}
                min="1"
                max="20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">
                Number of Relax Steps
              </label>
              <input
                type="number"
                value={node.config?.num_relax || 0}
                onChange={(e) => handleConfigChange('num_relax', parseInt(e.target.value) || 0)}
                className={inputClassName}
                min="0"
                max="10"
              />
            </div>
          </div>
        );

      case 'message_input_node':
        return (
          <div className="space-y-4">
            {/* Code Editor */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">
                Code
              </label>
              <textarea
                value={node.config?.code || ''}
                onChange={(e) => handleConfigChange('code', e.target.value)}
                className={`${inputClassName} font-mono text-xs`}
                rows={16}
                placeholder={`// Access input data via 'input' object
// Access node config via 'config' object
// Access node metadata via 'node' object
// IMPORTANT: Return a value to see it in the OUTPUT panel
// console.log() outputs to browser console (F12), not the OUTPUT panel

const message = config.message || 'Hello from code execution!';
console.log('[Code Execution]', message); // This goes to browser console

// Return value to see it in OUTPUT panel
return {
  message: message,
  executedAt: new Date().toISOString(),
  inputKeys: Object.keys(input),
  configKeys: Object.keys(config)
};`}
              />
              <p className="text-xs text-gray-500 mt-1.5">
                JavaScript code to execute. Use 'input' for input data, 'config' for node config, and 'node' for node metadata. Return the result.
              </p>
              <div className="mt-2 px-3 py-2 bg-yellow-900/20 border border-yellow-700/30 rounded-lg">
                <p className="text-xs text-yellow-300">
                  💡 Type $ for a list of special vars/methods. Debug by using console.log() statements and viewing their output in the browser console.
                </p>
              </div>
            </div>

            {/* Message Field (Optional) */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">
                Message <span className="text-gray-600">(Optional)</span>
              </label>
              <input
                type="text"
                value={node.config?.message || ''}
                onChange={(e) => handleConfigChange('message', e.target.value)}
                className={inputClassName}
                placeholder="Enter a message..."
              />
              <p className="text-xs text-gray-500 mt-1.5">
                Optional message that can be accessed in code via config.message
              </p>
            </div>
          </div>
        );

      case 'http_request_node':
        return (
          <div className="space-y-4">
            {/* HTTP Method */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">
                Method
              </label>
              <select
                value={node.config?.method || 'GET'}
                onChange={(e) => handleConfigChange('method', e.target.value)}
                className={inputClassName}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
                <option value="HEAD">HEAD</option>
                <option value="OPTIONS">OPTIONS</option>
              </select>
            </div>

            {/* URL */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">
                URL
              </label>
              <input
                type="text"
                value={node.config?.url || 'https://jsonplaceholder.typicode.com/todos/1'}
                onChange={(e) => handleConfigChange('url', e.target.value)}
                className={inputClassName}
                placeholder="https://api.example.com/endpoint"
              />
              <p className="text-xs text-gray-500 mt-1.5">
                Full URL for the HTTP request (supports template variables like {"{{input.field}}"})
              </p>
            </div>

            {/* Authentication */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">
                Authentication
              </label>
              <select
                value={node.config?.authentication || 'none'}
                onChange={(e) => handleConfigChange('authentication', e.target.value)}
                className={inputClassName}
              >
                <option value="none">None</option>
                <option value="basic">Basic Auth</option>
                <option value="bearer">Bearer Token</option>
                <option value="custom">Custom Header</option>
              </select>
            </div>

            {/* Basic Auth Fields */}
            {node.config?.authentication === 'basic' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">
                    Username
                  </label>
                  <input
                    type="text"
                    value={node.config?.basic_auth_username || ''}
                    onChange={(e) => handleConfigChange('basic_auth_username', e.target.value)}
                    className={inputClassName}
                    placeholder="Username"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    value={node.config?.basic_auth_password || ''}
                    onChange={(e) => handleConfigChange('basic_auth_password', e.target.value)}
                    className={inputClassName}
                    placeholder="Password"
                  />
                </div>
              </>
            )}

            {/* Bearer Token Field */}
            {node.config?.authentication === 'bearer' && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">
                  Bearer Token
                </label>
                <input
                  type="password"
                  value={node.config?.bearer_token || ''}
                  onChange={(e) => handleConfigChange('bearer_token', e.target.value)}
                  className={inputClassName}
                  placeholder="Bearer token"
                />
              </div>
            )}

            {/* Custom Auth Header Fields */}
            {node.config?.authentication === 'custom' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">
                    Header Name
                  </label>
                  <input
                    type="text"
                    value={node.config?.custom_auth_header_name || 'Authorization'}
                    onChange={(e) => handleConfigChange('custom_auth_header_name', e.target.value)}
                    className={inputClassName}
                    placeholder="Header name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">
                    Header Value
                  </label>
                  <input
                    type="password"
                    value={node.config?.custom_auth_header_value || ''}
                    onChange={(e) => handleConfigChange('custom_auth_header_value', e.target.value)}
                    className={inputClassName}
                    placeholder="Header value"
                  />
                </div>
              </>
            )}

            {/* Send Query Parameters Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">
                  Send Query Parameters
                </label>
                <p className="text-xs text-gray-500">
                  Include query parameters in the URL
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={node.config?.send_query_params || false}
                  onChange={(e) => handleConfigChange('send_query_params', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* Query Parameters (shown if toggle is on) */}
            {node.config?.send_query_params && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">
                  Query Parameters
                </label>
                <textarea
                  value={node.config?.query_params || '{}'}
                  onChange={(e) => handleConfigChange('query_params', e.target.value)}
                  className={`${inputClassName} font-mono text-xs`}
                  rows={3}
                  placeholder='{"key": "value", "page": 1}'
                />
                <p className="text-xs text-gray-500 mt-1.5">
                  JSON object with query parameters
                </p>
              </div>
            )}

            {/* Send Headers Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">
                  Send Headers
                </label>
                <p className="text-xs text-gray-500">
                  Include custom headers in the request
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={node.config?.send_headers || false}
                  onChange={(e) => handleConfigChange('send_headers', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* Custom Headers (shown if toggle is on) */}
            {node.config?.send_headers && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">
                  Custom Headers
                </label>
                <textarea
                  value={node.config?.custom_headers || '{}'}
                  onChange={(e) => handleConfigChange('custom_headers', e.target.value)}
                  className={`${inputClassName} font-mono text-xs`}
                  rows={3}
                  placeholder='{"Content-Type": "application/json", "X-Custom-Header": "value"}'
                />
                <p className="text-xs text-gray-500 mt-1.5">
                  JSON object with custom headers
                </p>
              </div>
            )}

            {/* Send Body Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">
                  Send Body
                </label>
                <p className="text-xs text-gray-500">
                  Include request body (only for POST, PUT, PATCH methods)
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={node.config?.send_body || false}
                  onChange={(e) => handleConfigChange('send_body', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* Body Configuration (shown if toggle is on) */}
            {node.config?.send_body && (
              <>
                {/* Body Content Type */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">
                    Body Content Type
                  </label>
                  <select
                    value={node.config?.body_content_type || 'json'}
                    onChange={(e) => handleConfigChange('body_content_type', e.target.value)}
                    className={inputClassName}
                  >
                    <option value="json">JSON</option>
                    <option value="form-data">Form Data</option>
                    <option value="x-www-form-urlencoded">Form URL Encoded</option>
                    <option value="raw">Raw</option>
                    <option value="text">Text</option>
                    <option value="xml">XML</option>
                  </select>
                </div>

                {/* Specify Body */}
                {(node.config?.body_content_type === 'json' || !node.config?.body_content_type) && (
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-2">
                      Specify Body
                    </label>
                    <select
                      value={node.config?.body_specify || 'json'}
                      onChange={(e) => handleConfigChange('body_specify', e.target.value)}
                      className={inputClassName}
                    >
                      <option value="json">Using JSON</option>
                      <option value="expression">Using Expression</option>
                      <option value="fixed">Fixed</option>
                    </select>
                  </div>
                )}

                {/* JSON Body */}
                {(node.config?.body_content_type === 'json' || !node.config?.body_content_type) && (
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-2">
                      JSON
                    </label>
                    <textarea
                      value={node.config?.body_json || ''}
                      onChange={(e) => handleConfigChange('body_json', e.target.value)}
                      className={`${inputClassName} font-mono text-xs`}
                      rows={6}
                      placeholder='{"key": "value"} or use template variables like {{input.field}}'
                    />
                    <p className="text-xs text-gray-500 mt-1.5">
                      JSON body content (supports template variables like {"{{input.field}}"})
                    </p>
                  </div>
                )}

                {/* Raw Body (for raw, text, xml) */}
                {(node.config?.body_content_type === 'raw' || 
                  node.config?.body_content_type === 'text' || 
                  node.config?.body_content_type === 'xml') && (
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-2">
                      Raw Body
                    </label>
                    <textarea
                      value={node.config?.body_raw || ''}
                      onChange={(e) => handleConfigChange('body_raw', e.target.value)}
                      className={`${inputClassName} font-mono text-xs`}
                      rows={6}
                      placeholder="Raw body content"
                    />
                    <p className="text-xs text-gray-500 mt-1.5">
                      Raw body content (for raw, text, or XML content types)
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Options Section */}
            <div className="border-t border-gray-700 pt-4 mt-4">
              <p className="text-xs font-medium text-gray-400 mb-3">Options</p>
              
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">
                  Timeout (ms)
                </label>
                <input
                  type="number"
                  value={node.config?.options_timeout || 30000}
                  onChange={(e) => handleConfigChange('options_timeout', parseInt(e.target.value) || 30000)}
                  className={inputClassName}
                  min="1000"
                  max="300000"
                />
                <p className="text-xs text-gray-500 mt-1.5">
                  Request timeout in milliseconds (default: 30000)
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">
                    Follow Redirects
                  </label>
                  <p className="text-xs text-gray-500">
                    Automatically follow HTTP redirects
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={node.config?.options_follow_redirects !== false}
                    onChange={(e) => handleConfigChange('options_follow_redirects', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">
                    Ignore SSL Errors
                  </label>
                  <p className="text-xs text-gray-500">
                    Ignore SSL certificate errors (not recommended for production)
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={node.config?.options_ignore_ssl_errors || false}
                    onChange={(e) => handleConfigChange('options_ignore_ssl_errors', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>

            {/* Info Message */}
            <div className="mt-4 px-3 py-2 bg-amber-900/20 border border-amber-700/30 rounded-lg">
              <p className="text-xs text-amber-300">
                You can view the raw requests this node makes in your browser's developer console.
              </p>
            </div>
          </div>
        );

      default:
        return <div className="text-sm text-gray-400">No configuration available</div>;
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#1e1e32]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700/50 bg-gray-800/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-200 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <h3 className="text-sm font-semibold text-gray-200">{node.label}</h3>
            <p className="text-xs text-gray-500">{node.type}</p>
          </div>
        </div>
        <button
          onClick={handleExecuteStep}
          className="px-3 py-1.5 text-xs bg-orange-600 text-white rounded-lg hover:bg-orange-500 flex items-center gap-1.5 transition-colors"
        >
          <Play className="w-3.5 h-3.5" />
          Execute step
        </button>
      </div>

      {/* Tabs */}
      <div className="px-4 border-b border-gray-700/50 flex items-center gap-1">
        <button
          onClick={() => setActiveTab('parameters')}
          className={`px-3 py-2 text-xs font-medium transition-colors relative ${
            activeTab === 'parameters'
              ? 'text-gray-200'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Parameters
          {activeTab === 'parameters' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-3 py-2 text-xs font-medium transition-colors relative ${
            activeTab === 'settings'
              ? 'text-gray-200'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Settings
          {activeTab === 'settings' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('output')}
          className={`px-3 py-2 text-xs font-medium transition-colors relative ${
            activeTab === 'output'
              ? 'text-gray-200'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Output
          {activeTab === 'output' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500" />
          )}
        </button>
        <a
          href="#"
          className="ml-auto text-xs text-gray-500 hover:text-gray-400 transition-colors"
        >
          Docs
        </a>
      </div>

      {/* Main content - Three panel layout (INPUT | Configuration | OUTPUT) */}
      <div className="flex-1 flex min-h-0">
        {/* Left: INPUT Panel */}
        <div className="w-64 border-r border-gray-700/50 bg-[#1a1a2e] flex flex-col">
          <div className="px-4 py-3 border-b border-gray-700/50 bg-[#1e1e32]">
            <h3 className="text-sm font-semibold text-gray-200">INPUT</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {hasInputs && inputData ? (
              <div className="space-y-3">
                {inputData.type === 'pdb_file' && (
                  <>
                    {inputData.filename && (
                      <div>
                        <div className="text-xs font-medium text-gray-400 mb-1">File</div>
                        <div className="text-xs text-gray-300 bg-gray-800/50 px-2 py-1 rounded">
                          {inputData.filename}
                        </div>
                      </div>
                    )}
                    {inputData.chains && Array.isArray(inputData.chains) && (
                      <div>
                        <div className="text-xs font-medium text-gray-400 mb-1">Chains</div>
                        <div className="text-xs text-gray-300 bg-gray-800/50 px-2 py-1 rounded">
                          {inputData.chains.join(', ')}
                        </div>
                      </div>
                    )}
                    {inputData.total_residues && (
                      <div>
                        <div className="text-xs font-medium text-gray-400 mb-1">Total Residues</div>
                        <div className="text-xs text-gray-300 bg-gray-800/50 px-2 py-1 rounded">
                          {inputData.total_residues}
                        </div>
                      </div>
                    )}
                    {inputData.suggested_contigs && (
                      <div>
                        <div className="text-xs font-medium text-gray-400 mb-1">Suggested Contigs</div>
                        <div className="text-xs text-blue-300 bg-blue-900/20 border border-blue-700/30 px-2 py-1 rounded font-mono">
                          {inputData.suggested_contigs}
                        </div>
                      </div>
                    )}
                    {sourceNode && (
                      <div className="pt-2 border-t border-gray-700/30">
                        <div className="text-xs font-medium text-gray-400 mb-1">From Node</div>
                        <div className="text-xs text-gray-300">{sourceNode.label}</div>
                      </div>
                    )}
                  </>
                )}
                {inputData.type === 'sequence' && (
                  <div>
                    <div className="text-xs font-medium text-gray-400 mb-1">Sequence</div>
                    <div className="text-xs text-gray-300 bg-gray-800/50 px-2 py-1 rounded font-mono break-all">
                      {inputData.sequence?.substring(0, 100)}
                      {inputData.sequence?.length > 100 ? '...' : ''}
                    </div>
                  </div>
                )}
                {/* Generic JSON/object data display for code execution nodes */}
                {(!inputData.type || inputData.type === 'any' || node?.type === 'message_input_node') && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-gray-400 mb-2">Input Data</div>
                    <pre className="text-xs text-gray-300 bg-gray-800/50 px-3 py-2 rounded font-mono overflow-x-auto max-h-96 overflow-y-auto">
                      {JSON.stringify(inputData, null, 2)}
                    </pre>
                    {sourceNode && (
                      <div className="pt-2 border-t border-gray-700/30">
                        <div className="text-xs font-medium text-gray-400 mb-1">From Node</div>
                        <div className="text-xs text-gray-300">{sourceNode.label}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-2">No input data yet</p>
                  {hasInputs && (
                    <>
                      <button
                        onClick={handleExecuteStep}
                        className="text-xs text-gray-400 hover:text-gray-300 transition-colors"
                        title="Execute previous nodes"
                      >
                        Execute previous nodes
                      </button>
                      <p className="text-xs text-gray-600 mt-1">(From the earliest node that needs it ?)</p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Middle: Configuration */}
        <div className="flex-1 border-r border-gray-700/50 overflow-y-auto bg-[#1e1e32]">
          <div className="p-4 space-y-4">
            {activeTab === 'parameters' ? (
              <>
                {renderConfigFields()}
              </>
            ) : activeTab === 'output' ? (
              <div className="space-y-4">
                {nodeLog ? (
                  <>
                    {/* Execution Status */}
                    <div className="border border-gray-700/50 rounded-lg p-3 bg-gray-800/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-gray-400">Status</span>
                        <span className={`text-xs font-semibold ${
                          nodeLog.status === 'success' ? 'text-green-400' :
                          nodeLog.status === 'error' ? 'text-red-400' :
                          nodeLog.status === 'running' ? 'text-blue-400' :
                          'text-gray-400'
                        }`}>
                          {nodeLog.status.toUpperCase()}
                        </span>
                      </div>
                      {nodeLog.duration !== undefined && (
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-gray-500">Duration</span>
                          <span className="text-xs text-gray-300 font-mono">
                            {nodeLog.duration}ms
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Request Details */}
                    {nodeLog.request && (
                      <div className="border border-gray-700/50 rounded-lg overflow-hidden">
                        <div className="px-3 py-2 bg-gray-800/30 border-b border-gray-700/50">
                          <span className="text-xs font-medium text-gray-300">Request</span>
                        </div>
                        <div className="p-3 space-y-2">
                          {nodeLog.request.method && nodeLog.request.url && (
                            <div>
                              <span className="text-xs text-gray-500">Method & URL</span>
                              <div className="mt-1 text-xs font-mono text-gray-300 bg-gray-900/50 px-2 py-1 rounded">
                                {nodeLog.request.method} {nodeLog.request.url}
                              </div>
                            </div>
                          )}
                          {nodeLog.request.headers && Object.keys(nodeLog.request.headers).length > 0 && (
                            <div>
                              <span className="text-xs text-gray-500">Headers</span>
                              <pre className="mt-1 text-xs font-mono text-gray-300 bg-gray-900/50 px-2 py-1 rounded overflow-x-auto">
                                {JSON.stringify(nodeLog.request.headers, null, 2)}
                              </pre>
                            </div>
                          )}
                          {nodeLog.request.queryParams && Object.keys(nodeLog.request.queryParams).length > 0 && (
                            <div>
                              <span className="text-xs text-gray-500">Query Parameters</span>
                              <pre className="mt-1 text-xs font-mono text-gray-300 bg-gray-900/50 px-2 py-1 rounded overflow-x-auto">
                                {JSON.stringify(nodeLog.request.queryParams, null, 2)}
                              </pre>
                            </div>
                          )}
                          {nodeLog.request.body && (
                            <div>
                              <span className="text-xs text-gray-500">Body</span>
                              <pre className="mt-1 text-xs font-mono text-gray-300 bg-gray-900/50 px-2 py-1 rounded overflow-x-auto max-h-48 overflow-y-auto">
                                {JSON.stringify(nodeLog.request.body, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Response Details */}
                    {nodeLog.response && (
                      <div className="border border-gray-700/50 rounded-lg overflow-hidden">
                        <div className="px-3 py-2 bg-gray-800/30 border-b border-gray-700/50">
                          <span className="text-xs font-medium text-gray-300">Response</span>
                        </div>
                        <div className="p-3 space-y-2">
                          {nodeLog.response.status && (
                            <div>
                              <span className="text-xs text-gray-500">Status</span>
                              <div className={`mt-1 text-xs font-mono px-2 py-1 rounded ${
                                nodeLog.response.status >= 200 && nodeLog.response.status < 300
                                  ? 'text-green-400 bg-green-900/20'
                                  : 'text-red-400 bg-red-900/20'
                              }`}>
                                {nodeLog.response.status} {nodeLog.response.statusText || ''}
                              </div>
                            </div>
                          )}
                          {nodeLog.response.headers && Object.keys(nodeLog.response.headers).length > 0 && (
                            <div>
                              <span className="text-xs text-gray-500">Headers</span>
                              <pre className="mt-1 text-xs font-mono text-gray-300 bg-gray-900/50 px-2 py-1 rounded overflow-x-auto">
                                {JSON.stringify(nodeLog.response.headers, null, 2)}
                              </pre>
                            </div>
                          )}
                          {nodeLog.response.data && (
                            <div>
                              <span className="text-xs text-gray-500">Data</span>
                              <pre className="mt-1 text-xs font-mono text-gray-300 bg-gray-900/50 px-2 py-1 rounded overflow-x-auto max-h-64 overflow-y-auto">
                                {JSON.stringify(nodeLog.response.data, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Output Data */}
                    {nodeLog.output && (
                      <div className="border border-gray-700/50 rounded-lg overflow-hidden">
                        <div className="px-3 py-2 bg-gray-800/30 border-b border-gray-700/50">
                          <span className="text-xs font-medium text-gray-300">Output</span>
                        </div>
                        <div className="p-3">
                          <pre className="text-xs font-mono text-gray-300 bg-gray-900/50 px-2 py-1 rounded overflow-x-auto max-h-64 overflow-y-auto">
                            {JSON.stringify(nodeLog.output, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* Error */}
                    {nodeLog.error && (
                      <div className="border border-red-700/50 rounded-lg overflow-hidden bg-red-900/10">
                        <div className="px-3 py-2 bg-red-800/30 border-b border-red-700/50">
                          <span className="text-xs font-medium text-red-300">Error</span>
                        </div>
                        <div className="p-3">
                          <pre className="text-xs font-mono text-red-300 whitespace-pre-wrap">
                            {nodeLog.error}
                          </pre>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="h-full flex items-center justify-center py-12">
                    <div className="text-center">
                      <p className="text-xs text-gray-500 mb-2">No execution logs yet</p>
                      <p className="text-xs text-gray-600">Execute the node to see request/response details</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">
                    Node ID
                  </label>
                  <input
                    type="text"
                    value={node.id}
                    disabled
                    className={inputClassName + ' opacity-50 cursor-not-allowed'}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">
                    Node Type
                  </label>
                  <input
                    type="text"
                    value={node.type}
                    disabled
                    className={inputClassName + ' opacity-50 cursor-not-allowed'}
                  />
                </div>
                <div className="border-t border-gray-700/50 pt-4">
                  <button
                    onClick={onDelete}
                    className="w-full px-3 py-2 text-sm bg-red-600/20 text-red-400 border border-red-600/30 rounded-lg hover:bg-red-600/30 flex items-center justify-center gap-2 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Node
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Execution Logs/Output */}
        <div className="w-80 bg-[#1a1a2e] flex flex-col">
          <div className="px-4 py-3 border-b border-gray-700/50 bg-[#1e1e32] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-200">OUTPUT</h3>
              {nodeLog && nodeLog.status === 'success' && (
                <>
                  <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                    <CheckCircle2 className="w-3 h-3 text-white" />
                  </div>
                  <Info className="w-4 h-4 text-gray-400" />
                </>
              )}
              {nodeLog && nodeLog.status === 'error' && (
                <AlertCircle className="w-4 h-4 text-yellow-400" />
              )}
            </div>
          </div>
          
          {/* Output Tabs */}
          {nodeLog && (
            <div className="flex border-b border-gray-700/50 bg-[#1e1e32]">
              <button
                onClick={() => setOutputViewTab('table')}
                className={`px-4 py-2 text-xs font-medium transition-colors ${
                  outputViewTab === 'table'
                    ? 'text-gray-200 border-b-2 border-gray-200'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Table
              </button>
              <button
                onClick={() => setOutputViewTab('json')}
                className={`px-4 py-2 text-xs font-medium transition-colors ${
                  outputViewTab === 'json'
                    ? 'text-gray-200 border-b-2 border-gray-200'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                JSON
              </button>
              <button
                onClick={() => setOutputViewTab('schema')}
                className={`px-4 py-2 text-xs font-medium transition-colors ${
                  outputViewTab === 'schema'
                    ? 'text-gray-200 border-b-2 border-gray-200'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Schema
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4">
            {/* Info box for RFdiffusion */}
            {node.type === 'rfdiffusion_node' && !nodeLog && (
              <div className="mb-4 bg-gray-800/50 border border-gray-700/50 rounded-lg p-3 flex items-start gap-2">
                <div className="w-4 h-4 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-blue-400 text-xs font-bold">i</span>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Use the suggested contigs from the input node for optimal results. The contigs parameter specifies which regions of the structure to design.
                </p>
              </div>
            )}
            {nodeLog ? (
              <div className="space-y-4">
                {/* Extract output data - for HTTP requests, get response data */}
                {(() => {
                  let outputData: any = null;
                  let itemCount = 0;
                  
                  // Debug logging for HTTP request nodes
                  if (node?.type === 'http_request_node') {
                    console.log('[PipelineNodeConfig] Extracting output for HTTP request:', {
                      nodeId,
                      hasNodeLog: !!nodeLog,
                      hasError: !!nodeLog?.error,
                      hasOutput: !!nodeLog?.output,
                      hasResponse: !!nodeLog?.response,
                      responseData: nodeLog?.response?.data,
                      outputType: typeof nodeLog?.output,
                      outputKeys: nodeLog?.output && typeof nodeLog?.output === 'object' ? Object.keys(nodeLog.output) : null,
                    });
                  }
                  
                  if (nodeLog?.error) {
                    outputData = { error: nodeLog.error };
                    itemCount = 1;
                  } else {
                    // For HTTP requests, prioritize response.data, then output.data, then output
                    // Also handle case where output might be the response data directly
                    if (nodeLog?.response?.data !== undefined && nodeLog?.response?.data !== null) {
                      outputData = nodeLog.response.data;
                    } else if (nodeLog?.output !== undefined && nodeLog?.output !== null) {
                      // Check if output has a data property (nested structure)
                      if (typeof nodeLog.output === 'object' && 'data' in nodeLog.output && nodeLog.output.data !== undefined) {
                        outputData = nodeLog.output.data;
                      } else {
                        // Output is the data directly
                        outputData = nodeLog.output;
                      }
                    }
                    
                    // Count items
                    if (outputData !== null && outputData !== undefined) {
                      if (Array.isArray(outputData)) {
                        itemCount = outputData.length;
                      } else if (typeof outputData === 'object') {
                        itemCount = Object.keys(outputData).length > 0 ? 1 : 0;
                      } else {
                        itemCount = 1;
                      }
                    }
                  }
                  
                  // Debug logging for extracted output
                  if (node?.type === 'http_request_node') {
                    console.log('[PipelineNodeConfig] Extracted output data:', {
                      nodeId,
                      hasNodeLog: !!nodeLog,
                      nodeLogKeys: nodeLog ? Object.keys(nodeLog) : null,
                      hasResponse: !!nodeLog?.response,
                      responseKeys: nodeLog?.response ? Object.keys(nodeLog.response) : null,
                      responseData: nodeLog?.response?.data,
                      hasOutput: !!nodeLog?.output,
                      outputValue: nodeLog?.output,
                      hasOutputData: outputData !== null && outputData !== undefined,
                      outputDataType: typeof outputData,
                      outputDataKeys: outputData && typeof outputData === 'object' ? Object.keys(outputData) : null,
                      outputDataValue: outputData,
                      itemCount,
                    });
                  }

                  return (
                    <>
                      {/* Item count */}
                      {itemCount > 0 && (
                        <div className="text-xs text-gray-500">
                          {itemCount} {itemCount === 1 ? 'item' : 'items'}
                        </div>
                      )}

                      {/* Output content based on selected tab */}
                      <div className="relative">
                        {/* Action buttons */}
                        {outputData && (
                          <div className="absolute top-2 right-2 flex items-center gap-2 z-10">
                            <button
                              onClick={() => {
                                const text = JSON.stringify(outputData, null, 2);
                                navigator.clipboard.writeText(text);
                              }}
                              className="p-1.5 hover:bg-gray-700/50 rounded transition-colors"
                              title="Copy output"
                            >
                              <Copy className="w-4 h-4 text-gray-400" />
                            </button>
                            <button
                              className="p-1.5 hover:bg-gray-700/50 rounded transition-colors"
                              title="Search"
                            >
                              <Search className="w-4 h-4 text-gray-400" />
                            </button>
                          </div>
                        )}

                        {/* JSON View */}
                        {outputViewTab === 'json' && (
                          <div className="bg-gray-900/50 rounded-lg p-4 text-xs font-mono text-gray-300 overflow-x-auto border border-gray-700/30 min-h-[200px]">
                            <pre className="whitespace-pre-wrap">
                              {outputData !== null && outputData !== undefined ? (
                                JSON.stringify(outputData, null, 2)
                              ) : (
                                <span className="text-gray-500 italic">
                                  No output data available
                                  {node?.type === 'http_request_node' && (
                                    <div className="mt-2 text-xs">
                                      Debug: nodeLog exists: {nodeLog ? 'yes' : 'no'}, 
                                      hasResponse: {nodeLog?.response ? 'yes' : 'no'}, 
                                      hasOutput: {nodeLog?.output ? 'yes' : 'no'}
                                    </div>
                                  )}
                                </span>
                              )}
                            </pre>
                          </div>
                        )}

                        {/* Table View */}
                        {outputViewTab === 'table' && (
                          <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/30 min-h-[200px]">
                            {outputData && typeof outputData === 'object' && !Array.isArray(outputData) ? (
                              <div className="space-y-2">
                                {Object.entries(outputData).map(([key, value]) => (
                                  <div key={key} className="flex items-start gap-2 text-xs">
                                    <span className="text-gray-500 font-medium min-w-[120px]">{key}:</span>
                                    <span className="text-gray-300 flex-1">
                                      {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : Array.isArray(outputData) ? (
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-gray-700">
                                      {outputData.length > 0 && Object.keys(outputData[0]).map((key) => (
                                        <th key={key} className="text-left py-2 px-2 text-gray-400 font-medium">
                                          {key}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {outputData.map((row: any, idx: number) => (
                                      <tr key={idx} className="border-b border-gray-800">
                                        {Object.values(row).map((cell: any, cellIdx: number) => (
                                          <td key={cellIdx} className="py-2 px-2 text-gray-300">
                                            {typeof cell === 'object' ? JSON.stringify(cell) : String(cell)}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <div className="text-xs text-gray-500 italic">
                                Table view not available for this data type
                              </div>
                            )}
                          </div>
                        )}

                        {/* Schema View */}
                        {outputViewTab === 'schema' && (
                          <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/30 min-h-[200px]">
                            {outputData && typeof outputData === 'object' ? (
                              <div className="text-xs font-mono text-gray-300">
                                <pre className="whitespace-pre-wrap">
                                  {JSON.stringify(
                                    (() => {
                                      const getSchema = (obj: any): any => {
                                        if (Array.isArray(obj) && obj.length > 0) {
                                          return [getSchema(obj[0])];
                                        } else if (typeof obj === 'object' && obj !== null) {
                                          const schema: any = {};
                                          for (const [key, value] of Object.entries(obj)) {
                                            if (typeof value === 'object' && value !== null) {
                                              schema[key] = getSchema(value);
                                            } else {
                                              schema[key] = typeof value;
                                            }
                                          }
                                          return schema;
                                        }
                                        return typeof obj;
                                      };
                                      return getSchema(outputData);
                                    })(),
                                    null,
                                    2
                                  )}
                                </pre>
                              </div>
                            ) : (
                              <div className="text-xs text-gray-500 italic">
                                Schema view not available for this data type
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center space-y-3">
                  <p className="text-sm text-gray-500 mb-1">
                    Execute this node to view data
                  </p>
                  {node?.type === 'http_request_node' && (
                    <div className="text-xs text-gray-600 mt-2 p-2 bg-gray-800/50 rounded">
                      Debug: hasCurrentExecution={currentExecution ? 'yes' : 'no'}, 
                      logsCount={currentExecution?.logs?.length || 0}, 
                      hasNodeLog={nodeLog ? 'yes' : 'no'},
                      nodeId={nodeId}
                    </div>
                  )}
                  <button
                    onClick={handleExecuteStep}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    or set mock data
                  </button>
                  {node?.type === 'message_input_node' && (
                    <div className="mt-4 px-3 py-2 bg-blue-900/20 border border-blue-700/30 rounded-lg text-left max-w-xs">
                      <p className="text-xs text-blue-300 font-medium mb-1">💡 Tip:</p>
                      <p className="text-xs text-gray-400 leading-relaxed">
                        <code className="text-blue-300">console.log()</code> outputs to the browser console (F12). 
                        To see output here, <code className="text-blue-300">return</code> a value from your code.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

