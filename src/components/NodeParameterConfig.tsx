import React, { useState, useEffect, useRef } from 'react';
import { Check, X, Upload, File, Eye } from 'lucide-react';
import { PipelineNodeBlueprint } from '../components/pipeline-canvas';
import { useChatHistoryStore } from '../stores/chatHistoryStore';
import { useAppStore } from '../stores/appStore';
import { CodeExecutor } from '../utils/codeExecutor';

interface NodeParameterConfigProps {
  node: PipelineNodeBlueprint;
  nodeIndex: number;
  totalNodes: number;
  onConfirm: (config: Record<string, any>) => void;
  onSkip?: () => void;
}

export const NodeParameterConfig: React.FC<NodeParameterConfigProps> = ({
  node,
  nodeIndex,
  totalNodes,
  onConfirm,
  onSkip,
}) => {
  const { activeSessionId } = useChatHistoryStore();
  const { plugin, setCurrentCode, setViewerVisible, setActivePane, setCurrentStructureOrigin } = useAppStore();
  const [config, setConfig] = useState<Record<string, any>>(node.config || {});
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pdbId, setPdbId] = useState<string>('');
  const [isLoadingViewer, setIsLoadingViewer] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get default config based on node type
  useEffect(() => {
    const defaults = getDefaultConfig(node.type);
    setConfig(prev => ({ ...defaults, ...prev }));
    // Initialize PDB ID if it exists in config
    if (node.config?.pdb_id) {
      setPdbId(node.config.pdb_id);
    }
  }, [node.type, node.config]);

  const getDefaultConfig = (nodeType: string): Record<string, any> => {
    switch (nodeType) {
      case 'input_node':
        return { filename: '' };
      case 'rfdiffusion_node':
        return {
          contigs: 'A50-150',
          num_designs: 1,
          diffusion_steps: 15,
          design_mode: 'unconditional',
          hotspot_res: '',
          pdb_id: '',
        };
      case 'proteinmpnn_node':
        return {
          num_sequences: 8,
          temperature: 0.1,
        };
      case 'alphafold_node':
        return {
          recycle_count: 3,
          num_relax: 0,
        };
      default:
        return {};
    }
  };

  const getConfigFields = (nodeType: string) => {
    switch (nodeType) {
      case 'input_node':
        return [
          {
            key: 'filename',
            label: 'PDB Filename',
            type: 'string',
            placeholder: 'e.g., target.pdb',
            required: true,
          },
        ];
      case 'rfdiffusion_node':
        return [
          {
            key: 'contigs',
            label: 'Contigs',
            type: 'string',
            placeholder: 'A50-150',
            helpText: 'Contig specification (e.g., "A50-150" or "A20-60/0 50-100")',
          },
          {
            key: 'num_designs',
            label: 'Number of Designs',
            type: 'number',
            min: 1,
            max: 10,
            default: 1,
          },
          {
            key: 'diffusion_steps',
            label: 'Diffusion Steps',
            type: 'number',
            min: 1,
            max: 100,
            default: 15,
            helpText: 'Number of diffusion steps (1-100, higher = better quality but slower)',
          },
          {
            key: 'design_mode',
            label: 'Design Mode',
            type: 'select',
            options: [
              { value: 'unconditional', label: 'Unconditional Design' },
              { value: 'motif_scaffolding', label: 'Motif Scaffolding' },
              { value: 'partial_diffusion', label: 'Partial Diffusion' },
            ],
            default: 'unconditional',
          },
          {
            key: 'hotspot_res',
            label: 'Hotspot Residues',
            type: 'string',
            placeholder: 'A50, A51, A52',
            helpText: 'Comma-separated list of residues to preserve',
          },
          {
            key: 'pdb_id',
            label: 'PDB ID (Template)',
            type: 'string',
            placeholder: 'e.g., 1R42',
            helpText: 'Optional PDB ID to use as template',
          },
        ];
      case 'proteinmpnn_node':
        return [
          {
            key: 'num_sequences',
            label: 'Number of Sequences',
            type: 'number',
            min: 1,
            max: 100,
            default: 8,
          },
          {
            key: 'temperature',
            label: 'Temperature',
            type: 'number',
            min: 0.1,
            max: 1.0,
            step: 0.1,
            default: 0.1,
          },
        ];
      case 'alphafold_node':
        return [
          {
            key: 'recycle_count',
            label: 'Recycle Count',
            type: 'number',
            min: 1,
            max: 20,
            default: 3,
          },
          {
            key: 'num_relax',
            label: 'Number of Relax Steps',
            type: 'number',
            min: 0,
            max: 10,
            default: 0,
          },
        ];
      default:
        return [];
    }
  };

  const handleFieldChange = (key: string, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleFileSelect = (file: File) => {
    if (!file) return;

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

    setPendingFile(file);
    setUploadError(null);
    handleFileUpload(file);
  };

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (activeSessionId) {
        formData.append('session_id', activeSessionId);
      }

      // Get auth headers for the request
      const headers = getAuthHeaders();

      const response = await fetch('/api/upload/pdb', {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Upload failed');
      }

      const result = await response.json();
      
      // Construct full file URL for server access (accessible by RFdiffusion and other nodes)
      // The server returns file_url as relative path, convert to full URL
      let fileUrl = result.file_info.file_url || `/api/upload/pdb/${result.file_info.file_id}`;
      // If it's a relative path, make it absolute
      if (fileUrl.startsWith('/')) {
        fileUrl = `${window.location.origin}${fileUrl}`;
      }
      
      // Update config with file information
      const updatedConfig = {
        ...config,
        filename: result.file_info.filename,
        file_id: result.file_info.file_id,
        file_url: fileUrl,
        ...(result.file_info.chain_residue_counts && { chain_residue_counts: result.file_info.chain_residue_counts }),
        ...(result.file_info.total_residues && { total_residues: result.file_info.total_residues }),
        ...(result.file_info.suggested_contigs && { suggested_contigs: result.file_info.suggested_contigs }),
        ...(result.file_info.chains && { chains: result.file_info.chains }),
        ...(result.file_info.atoms && { atoms: result.file_info.atoms }),
      };
      
      setConfig(updatedConfig);
      setPendingFile(null);
      
      // Load in viewer
      await loadFileInViewer(fileUrl, result.file_info.filename);
    } catch (error: any) {
      console.error('[NodeParameterConfig] File upload failed:', error);
      setUploadError(error.message || 'Upload failed');
      setPendingFile(null);
    } finally {
      setIsUploading(false);
    }
  };

  const loadFileInViewer = async (urlOrPdbId: string, filename?: string) => {
    if (!plugin) return;
    
    try {
      setIsLoadingViewer(true);
      const executor = new CodeExecutor(plugin);
      
      // Determine if it's a URL or PDB ID
      const isUrl = urlOrPdbId.startsWith('http://') || urlOrPdbId.startsWith('https://') || urlOrPdbId.startsWith('/api/');
      
      let loadUrl = urlOrPdbId;
      if (!isUrl) {
        // It's a PDB ID, convert to URL
        loadUrl = `https://files.rcsb.org/view/${urlOrPdbId.toUpperCase()}.pdb`;
      }
      
      // Load structure in viewer
      const code = `
try {
  await builder.clearStructure();
  await builder.loadStructure('${loadUrl}');
  await builder.addCartoonRepresentation({ color: 'secondary-structure' });
  builder.focusView();
  console.log('Structure loaded successfully');
} catch (e) { 
  console.error('Failed to load structure:', e); 
}`;
      
      setCurrentCode(code);
      await executor.executeCode(code);
      setViewerVisible(true);
      setActivePane('viewer');
      
      // Set structure origin
      setCurrentStructureOrigin({
        type: isUrl ? 'upload' : 'pdb',
        filename: filename || urlOrPdbId,
        pdbId: isUrl ? undefined : urlOrPdbId,
        metadata: { source: isUrl ? 'upload' : 'pdb_id' }
      });
    } catch (error) {
      console.error('[NodeParameterConfig] Failed to load structure in viewer:', error);
      setUploadError('Failed to load structure in viewer');
    } finally {
      setIsLoadingViewer(false);
    }
  };

  const handlePdbIdChange = (value: string) => {
    setPdbId(value);
    // Update config with PDB ID
    const updatedConfig = {
      ...config,
      pdb_id: value,
      // Clear file-related fields if PDB ID is set
      ...(value ? { file_id: undefined, file_url: undefined, filename: undefined } : {}),
    };
    setConfig(updatedConfig);
  };

  const handleLoadPdbId = async () => {
    if (!pdbId.trim()) return;
    
    // Validate PDB ID format (4 characters, alphanumeric)
    const pdbIdRegex = /^[0-9A-Za-z]{4}$/;
    if (!pdbIdRegex.test(pdbId.trim())) {
      setUploadError('Invalid PDB ID format. Must be 4 alphanumeric characters (e.g., 1ABC)');
      return;
    }
    
    setUploadError(null);
    await loadFileInViewer(pdbId.trim().toUpperCase());
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    // Reset input value to allow re-selecting the same file
    event.target.value = '';
  };

  const handleConfirm = () => {
    // For input nodes, ensure either file is uploaded or PDB ID is provided
    if (node.type === 'input_node' && !config.file_id && !config.pdb_id && !pendingFile) {
      setUploadError('Please upload a PDB file or enter a PDB ID');
      return;
    }
    onConfirm(config);
  };

  const fields = getConfigFields(node.type);

  return (
    <div className="mt-3 p-4 bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-lg">
      <div className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-medium text-gray-900">
            Configure Node {nodeIndex + 1} of {totalNodes}: {node.label}
          </h4>
          <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded border border-gray-200">
            {node.type}
          </span>
        </div>
        <p className="text-xs text-gray-600">
          Please configure the parameters for this node. You can use default values or customize them.
        </p>
      </div>

      <div className="space-y-3 mb-4">
        {/* Special handling for input_node file upload */}
        {node.type === 'input_node' && (
          <>
            <div className="bg-white p-3 rounded border border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                PDB File <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Upload a PDB file or enter a PDB ID to use as input for this pipeline
              </p>
              
              {config.file_id ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-md">
                    <div className="flex items-center space-x-2 flex-1">
                      <File className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-green-800 truncate">{config.filename}</p>
                        {config.chains && (
                          <p className="text-xs text-green-600">
                            Chains: {config.chains.join(', ')} • {config.atoms || 0} atoms
                          </p>
                        )}
                        {config.file_url && (
                          <p className="text-xs text-green-600 mt-1 break-all">
                            URL: {config.file_url}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 ml-2">
                      <button
                        type="button"
                        onClick={() => loadFileInViewer(config.file_url, config.filename)}
                        disabled={isLoadingViewer}
                        className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors disabled:opacity-50 flex items-center space-x-1"
                        title="View in 3D canvas"
                      >
                        <Eye className="w-3 h-3" />
                        <span>View</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfig(prev => {
                            const newConfig = { ...prev };
                            delete newConfig.file_id;
                            delete newConfig.filename;
                            delete newConfig.file_url;
                            return newConfig;
                          });
                        }}
                        className="text-xs text-green-700 hover:text-green-900 underline"
                      >
                        Change
                      </button>
                    </div>
                  </div>
                </div>
              ) : config.pdb_id ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <div className="flex items-center space-x-2 flex-1">
                      <File className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-blue-800">PDB ID: {config.pdb_id}</p>
                        <p className="text-xs text-blue-600">Retrieved from RCSB PDB database</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 ml-2">
                      <button
                        type="button"
                        onClick={() => loadFileInViewer(config.pdb_id)}
                        disabled={isLoadingViewer}
                        className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors disabled:opacity-50 flex items-center space-x-1"
                        title="View in 3D canvas"
                      >
                        <Eye className="w-3 h-3" />
                        <span>View</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPdbId('');
                          setConfig(prev => {
                            const newConfig = { ...prev };
                            delete newConfig.pdb_id;
                            return newConfig;
                          });
                        }}
                        className="text-xs text-blue-700 hover:text-blue-900 underline"
                      >
                        Change
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* File Upload Option */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Option 1: Upload File</label>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="w-full flex items-center justify-center space-x-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-md hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isUploading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                          <span className="text-sm text-gray-600">Uploading...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 text-gray-600" />
                          <span className="text-sm text-gray-700">Click to upload PDB file</span>
                        </>
                      )}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdb"
                      onChange={handleFileInputChange}
                      className="hidden"
                    />
                    {pendingFile && (
                      <p className="mt-2 text-xs text-gray-600">
                        Selected: {pendingFile.name}
                      </p>
                    )}
                  </div>
                  
                  {/* PDB ID Option */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Option 2: PDB ID (Optional)</label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={pdbId}
                        onChange={(e) => handlePdbIdChange(e.target.value)}
                        placeholder="e.g., 1ABC"
                        maxLength={4}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                      />
                      <button
                        type="button"
                        onClick={handleLoadPdbId}
                        disabled={!pdbId.trim() || isLoadingViewer}
                        className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1"
                      >
                        {isLoadingViewer ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        ) : (
                          <>
                            <Eye className="w-4 h-4" />
                            <span>Load</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Enter a 4-character PDB ID to retrieve from RCSB database
                    </p>
                  </div>
                </div>
              )}
              
              {uploadError && (
                <p className="mt-2 text-xs text-red-600">{uploadError}</p>
              )}
            </div>
          </>
        )}
        
        {/* Regular fields for other node types */}
        {fields.map((field) => {
          const isStringField = field.type === 'string';
          const isNumberField = field.type === 'number';
          const isSelectField = field.type === 'select';
          
          return (
            <div key={field.key} className="bg-white p-3 rounded border border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {field.label}
                {'required' in field && field.required && <span className="text-red-500 ml-1">*</span>}
              </label>
              {'helpText' in field && field.helpText && (
                <p className="text-xs text-gray-500 mb-2">{field.helpText}</p>
              )}
              {isStringField && 'placeholder' in field && (
                <input
                  type="text"
                  value={config[field.key] || ''}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
              {isNumberField && (
                <input
                  type="number"
                  value={config[field.key] ?? ('default' in field ? field.default : undefined) ?? ''}
                  onChange={(e) => handleFieldChange(field.key, parseFloat(e.target.value) || 0)}
                  min={'min' in field ? field.min : undefined}
                  max={'max' in field ? field.max : undefined}
                  step={'step' in field ? field.step : 1}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
              {isSelectField && 'options' in field && (
                <select
                  value={config[field.key] || ('default' in field ? field.default : '') || ''}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {field.options?.map((opt: { value: string; label: string }) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center space-x-2">
        <button
          onClick={handleConfirm}
          className="flex-1 inline-flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Check className="w-4 h-4" />
          <span>Confirm & Continue</span>
        </button>
        {onSkip && (
          <button
            onClick={onSkip}
            className="inline-flex items-center justify-center space-x-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            <X className="w-4 h-4" />
            <span>Use Defaults</span>
          </button>
        )}
      </div>
    </div>
  );
};

