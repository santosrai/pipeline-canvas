import React, { useState, useEffect } from 'react';
import { ErrorDisplay } from './ErrorDisplay';
import { RFdiffusionErrorHandler } from '../utils/errorHandler';
import { PDBFileUpload } from './PDBFileUpload';
import { useAppStore } from '../stores/appStore';
import { useChatHistoryStore } from '../stores/chatHistoryStore';

interface RFdiffusionParameters {
  pdb_id?: string;
  input_pdb?: string;
  uploadId?: string;
  contigs: string;
  hotspot_res: string[];
  diffusion_steps: number;
  design_mode: 'unconditional' | 'motif_scaffolding' | 'partial_diffusion';
}

interface RFdiffusionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (parameters: RFdiffusionParameters) => void;
  initialData?: {
    parameters: RFdiffusionParameters;
    design_info: {
      mode: string;
      template: string;
      contigs: string;
      hotspots: number;
      complexity: string;
    };
    estimated_time: string;
    message: string;
  };
  contextPdb?: {
    type: 'pdb_id' | 'upload';
    value: string;
    filename?: string;
  };
}

export const RFdiffusionDialog: React.FC<RFdiffusionDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  initialData,
  contextPdb
}) => {
  const lastLoadedPdb = useAppStore(state => state.lastLoadedPdb);
  const currentCode = useAppStore(state => state.currentCode);
  const { activeSessionId } = useChatHistoryStore();
  
  const [parameters, setParameters] = useState<RFdiffusionParameters>({
    contigs: 'A50-150',
    hotspot_res: [],
    diffusion_steps: 15,
    design_mode: 'unconditional'
  });

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [hotspotsInput, setHotspotsInput] = useState('');
  const [validationError, setValidationError] = useState<any>(null);
  const [uploadedFile, setUploadedFile] = useState<{
    filename: string;
    file_id: string;
    file_path?: string;
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [detectedPdb, setDetectedPdb] = useState<{
    type: 'pdb_id' | 'upload';
    value: string;
    filename?: string;
  } | null>(null);

  // Design mode options
  const designModeOptions = [
    { 
      value: 'unconditional', 
      label: 'Unconditional Design', 
      description: 'Create completely new proteins from scratch',
      recommended: true 
    },
    { 
      value: 'motif_scaffolding', 
      label: 'Motif Scaffolding', 
      description: 'Design around existing structures or hotspot residues',
      recommended: false 
    },
    { 
      value: 'partial_diffusion', 
      label: 'Partial Diffusion', 
      description: 'Modify existing protein regions',
      recommended: false 
    }
  ];

  // Complexity presets
  const complexityOptions = [
    { value: 'simple', label: 'Simple (10 steps)', steps: 10, description: 'Fast, basic designs' },
    { value: 'medium', label: 'Medium (15 steps)', steps: 15, description: 'Balanced quality and speed' },
    { value: 'complex', label: 'Complex (25 steps)', steps: 25, description: 'High quality, detailed designs' },
    { value: 'custom', label: 'Custom', steps: parameters.diffusion_steps, description: 'Set your own steps' }
  ];

  // Extract PDB ID from currentCode
  const extractPdbFromCode = (code: string): string | null => {
    if (!code) return null;
    const match = code.match(/loadStructure\s*\(\s*['"]([0-9A-Za-z]{4})['"]/);
    return match ? match[1].toUpperCase() : null;
  };

  // Auto-detect PDB context when dialog opens
  useEffect(() => {
    if (!isOpen) return;

    let detected: { type: 'pdb_id' | 'upload'; value: string; filename?: string } | null = null;

    // Priority 1: Use contextPdb prop if provided
    if (contextPdb) {
      detected = contextPdb;
    }
    // Priority 2: Check lastLoadedPdb from store
    else if (lastLoadedPdb) {
      detected = { type: 'pdb_id', value: lastLoadedPdb };
    }
    // Priority 3: Extract from currentCode
    else {
      const codePdb = extractPdbFromCode(currentCode || '');
      if (codePdb) {
        detected = { type: 'pdb_id', value: codePdb };
      }
    }

    if (detected) {
      setDetectedPdb(detected);
      
      // Pre-populate form based on detected PDB
      if (detected.type === 'pdb_id') {
        setParameters(prev => {
          const updated = { ...prev, pdb_id: detected!.value };
          // If PDB ID is detected, suggest motif_scaffolding mode
          if (prev.design_mode === 'unconditional') {
            updated.design_mode = 'motif_scaffolding';
          }
          return updated;
        });
      } else if (detected.type === 'upload') {
        setParameters(prev => {
          const updated = { ...prev, uploadId: detected!.value };
          // If uploaded file is detected, suggest motif_scaffolding mode
          if (prev.design_mode === 'unconditional') {
            updated.design_mode = 'motif_scaffolding';
          }
          return updated;
        });
        setUploadedFile({
          filename: detected.filename || 'uploaded.pdb',
          file_id: detected.value
        });
      }
    }
  }, [isOpen, contextPdb, lastLoadedPdb, currentCode]);

  // Initialize from prop data
  useEffect(() => {
    if (initialData?.parameters) {
      setParameters(initialData.parameters);
      if (initialData.parameters.hotspot_res?.length > 0) {
        setHotspotsInput(initialData.parameters.hotspot_res.join(', '));
      }
      // If initialData has uploadId, set uploadedFile state
      if (initialData.parameters.uploadId) {
        setUploadedFile({
          filename: 'uploaded.pdb',
          file_id: initialData.parameters.uploadId
        });
      }
    }
  }, [initialData]);

  // Validate contigs format
  const validateContigs = (contigs: string): { valid: boolean; error?: string } => {
    if (!contigs.trim()) {
      return { valid: false, error: 'Contigs specification is required' };
    }
    
    // Basic validation for common formats
    const patterns = [
      /^A\d+-\d+$/, // A50-150
      /^A\d+-\d+\/\d+\s+\d+-\d+$/, // A20-60/0 50-100
      /^\d+-\d+$/, // 50-150
    ];
    
    const isValid = patterns.some(pattern => pattern.test(contigs.trim()));
    if (!isValid) {
      return { 
        valid: false, 
        error: 'Invalid contigs format. Examples: "A50-150", "A20-60/0 50-100", "100-200"' 
      };
    }
    
    return { valid: true };
  };

  // Parse hotspots input
  const parseHotspots = (input: string): string[] => {
    if (!input.trim()) return [];
    return input.split(',').map(h => h.trim()).filter(h => h.length > 0);
  };

  // Handle parameter changes
  const handleParameterChange = (key: keyof RFdiffusionParameters, value: any) => {
    setParameters(prev => ({ ...prev, [key]: value }));
    setValidationError(null);
  };

  // Handle complexity preset selection
  const handleComplexityChange = (_complexity: string, steps: number) => {
    setParameters(prev => ({ ...prev, diffusion_steps: steps }));
  };

  // Handle hotspots change
  const handleHotspotsChange = (input: string) => {
    setHotspotsInput(input);
    const hotspots = parseHotspots(input);
    setParameters(prev => ({ ...prev, hotspot_res: hotspots }));
  };

  // Handle file upload
  const handleFileUploaded = (result: any) => {
    if (result.status === 'success' && result.file_info) {
      setUploadedFile({
        filename: result.file_info.filename,
        file_id: result.file_info.file_id,
        file_path: result.file_info.file_path
      });
      setParameters(prev => ({ ...prev, uploadId: result.file_info.file_id, pdb_id: undefined }));
      setUploadError(null);
      // If file uploaded, suggest motif_scaffolding mode
      if (parameters.design_mode === 'unconditional') {
        setParameters(prev => ({ ...prev, design_mode: 'motif_scaffolding' }));
      }
    } else if (result.status === 'cleared') {
      setUploadedFile(null);
      setParameters(prev => ({ ...prev, uploadId: undefined }));
    }
  };

  // Validate and submit
  const handleConfirm = async () => {
    try {
      // Validate contigs
      const contigsValidation = validateContigs(parameters.contigs);
      if (!contigsValidation.valid) {
        setValidationError(RFdiffusionErrorHandler.createValidationError(
          contigsValidation.error || 'Invalid contigs',
          { contigs: parameters.contigs }
        ));
        return;
      }

      // Parse final hotspots
      const finalHotspots = parseHotspots(hotspotsInput);
      const finalParameters = {
        ...parameters,
        hotspot_res: finalHotspots,
        // Include uploadId if file was uploaded
        uploadId: uploadedFile?.file_id || parameters.uploadId
      };

      onConfirm(finalParameters);
    } catch (error) {
      setValidationError(RFdiffusionErrorHandler.handleError(error, {
        feature: 'RFdiffusion',
        parameters: parameters
      }));
    }
  };

  const getEstimatedTime = () => {
    if (initialData?.estimated_time) return initialData.estimated_time;
    
    const { diffusion_steps } = parameters;
    if (diffusion_steps <= 10) return '1-3 minutes';
    if (diffusion_steps <= 20) return '3-8 minutes';
    if (diffusion_steps <= 50) return '8-15 minutes';
    return '15-30 minutes';
  };

  const getCurrentComplexity = () => {
    const { diffusion_steps } = parameters;
    if (diffusion_steps === 10) return 'simple';
    if (diffusion_steps === 15) return 'medium';
    if (diffusion_steps === 25) return 'complex';
    return 'custom';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">
            RFdiffusion Protein Design
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Detected PDB Context Banner */}
        {detectedPdb && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-1">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-medium text-green-900">PDB Detected from Viewer</span>
                </div>
                <div className="text-sm text-green-800">
                  {detectedPdb.type === 'pdb_id' ? (
                    <span>Using PDB ID: <strong>{detectedPdb.value}</strong></span>
                  ) : (
                    <span>Using uploaded file: <strong>{detectedPdb.filename || detectedPdb.value}</strong></span>
                  )}
                </div>
                <p className="text-xs text-green-700 mt-1">You can override this below if needed.</p>
              </div>
              <button
                onClick={() => setDetectedPdb(null)}
                className="text-green-600 hover:text-green-800"
                title="Dismiss"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Initial Data Summary */}
        {initialData && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg">
            <h3 className="font-medium text-blue-900 mb-2">Design Summary</h3>
            <div className="text-sm text-blue-800 space-y-1">
              <div><strong>Mode:</strong> {initialData.design_info.mode}</div>
              <div><strong>Template:</strong> {initialData.design_info.template}</div>
              <div><strong>Contigs:</strong> {initialData.design_info.contigs}</div>
              {initialData.design_info.hotspots > 0 && (
                <div><strong>Hotspots:</strong> {initialData.design_info.hotspots} residues</div>
              )}
              <div><strong>Complexity:</strong> {initialData.design_info.complexity}</div>
            </div>
            <p className="text-sm text-blue-700 mt-2">{initialData.message}</p>
          </div>
        )}

        {/* Error Display */}
        {validationError && (
          <ErrorDisplay 
            error={validationError} 
            className="mb-4"
            onDismiss={() => setValidationError(null)}
          />
        )}

        {/* Design Mode Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Design Mode
          </label>
          <div className="space-y-2">
            {designModeOptions.map((option) => (
              <label key={option.value} className="flex items-start space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="designMode"
                  value={option.value}
                  checked={parameters.design_mode === option.value}
                  onChange={(e) => handleParameterChange('design_mode', e.target.value)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-gray-900">{option.label}</span>
                    {option.recommended && (
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5">{option.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Template PDB Section - Available for all modes */}
        <div className="mb-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Template PDB ID (optional)
            </label>
            <input
              type="text"
              value={parameters.pdb_id || ''}
              onChange={(e) => {
                handleParameterChange('pdb_id', e.target.value);
                // Clear uploadId if PDB ID is entered
                if (e.target.value) {
                  setParameters(prev => ({ ...prev, uploadId: undefined }));
                  setUploadedFile(null);
                }
              }}
              placeholder="e.g., 1R42"
              className="w-full p-2 border border-gray-300 rounded-md text-sm"
            />
            <p className="text-xs text-gray-600 mt-1">
              {parameters.design_mode === 'unconditional' 
                ? 'Optional: Provide a PDB ID as template for design'
                : 'Enter a PDB ID to use as template, or upload a file below'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Or Upload PDB File
            </label>
            <PDBFileUpload
              onFileUploaded={handleFileUploaded}
              onError={setUploadError}
              currentFile={uploadedFile ? {
                filename: uploadedFile.filename,
                file_id: uploadedFile.file_id,
                file_path: uploadedFile.file_path || ''
              } : null}
              sessionId={activeSessionId}
            />
            {uploadError && (
              <div className="text-xs text-red-600 mt-1 flex items-center space-x-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{uploadError}</span>
              </div>
            )}
            {uploadedFile && (
              <div className="mt-2 text-xs text-gray-600">
                <span className="font-medium">Uploaded:</span> {uploadedFile.filename}
              </div>
            )}
            <p className="text-xs text-gray-600 mt-1">
              {parameters.design_mode === 'unconditional'
                ? 'Optional: Upload a PDB file to use as template'
                : 'Upload a PDB file to use as template for design'}
            </p>
          </div>
        </div>

        {/* Contigs Configuration */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Contigs Specification *
          </label>
          <input
            type="text"
            value={parameters.contigs}
            onChange={(e) => handleParameterChange('contigs', e.target.value)}
            placeholder="e.g., A50-150 or A20-60/0 50-100"
            className="w-full p-2 border border-gray-300 rounded-md text-sm"
          />
          <p className="text-xs text-gray-600 mt-1">
            Specify protein length and chain topology. Examples: "A50-150" (50-150 residues), "A20-60/0 50-100" (motif scaffolding)
          </p>
        </div>

        {/* Hotspot Residues */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Hotspot Residues (optional)
          </label>
          <input
            type="text"
            value={hotspotsInput}
            onChange={(e) => handleHotspotsChange(e.target.value)}
            placeholder="e.g., A50, A51, A52, A53"
            className="w-full p-2 border border-gray-300 rounded-md text-sm"
          />
          <p className="text-xs text-gray-600 mt-1">
            Comma-separated list of residues to preserve (e.g., A50, A51, A52)
          </p>
        </div>

        {/* Complexity/Diffusion Steps */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Design Complexity
          </label>
          <div className="grid grid-cols-2 gap-2 mb-2">
            {complexityOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => handleComplexityChange(option.value, option.steps)}
                className={`p-2 text-left rounded border text-sm ${
                  getCurrentComplexity() === option.value
                    ? 'border-blue-500 bg-blue-50 text-blue-900'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <div className="font-medium">{option.label}</div>
                <div className="text-xs text-gray-600">{option.description}</div>
              </button>
            ))}
          </div>
          
          {/* Custom steps input */}
          {getCurrentComplexity() === 'custom' && (
            <div className="mt-2">
              <label className="block text-xs text-gray-600 mb-1">Diffusion Steps</label>
              <input
                type="number"
                min="1"
                max="100"
                value={parameters.diffusion_steps}
                onChange={(e) => handleParameterChange('diffusion_steps', parseInt(e.target.value))}
                className="w-20 p-1 border border-gray-300 rounded text-sm"
              />
              <span className="text-xs text-gray-600 ml-2">
                (1-100, higher = better quality but slower)
              </span>
            </div>
          )}
        </div>

        {/* Advanced Options Toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-blue-600 hover:text-blue-800 mb-4 flex items-center"
        >
          <span>{showAdvanced ? 'Hide' : 'Show'} Advanced Options</span>
          <svg 
            className={`w-4 h-4 ml-1 transform ${showAdvanced ? 'rotate-180' : ''}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Advanced Options */}
        {showAdvanced && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg space-y-3">
            <h4 className="text-sm font-medium text-gray-900">Advanced Configuration</h4>
            
            {/* Raw Input PDB */}
            <div>
              <label className="block text-xs text-gray-700 mb-1">
                Raw Input PDB (optional)
              </label>
              <textarea
                value={parameters.input_pdb || ''}
                onChange={(e) => handleParameterChange('input_pdb', e.target.value)}
                placeholder="Paste PDB ATOM records here..."
                rows={3}
                className="w-full p-2 border border-gray-300 rounded text-xs font-mono"
              />
              <p className="text-xs text-gray-600 mt-1">
                Override PDB ID with raw ATOM records
              </p>
            </div>
          </div>
        )}

        {/* Time Estimate */}
        <div className="mb-6 p-3 bg-yellow-50 rounded-lg">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-yellow-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-medium text-yellow-800">
              Estimated Time: {getEstimatedTime()}
            </span>
          </div>
          <p className="text-xs text-yellow-700 mt-1">
            Design time depends on complexity and diffusion steps
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
          >
            Start Design
          </button>
        </div>
      </div>
    </div>
  );
};