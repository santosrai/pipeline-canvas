import React, { useState, useEffect } from 'react';
import { ErrorDisplay } from './ErrorDisplay';
import { AlphaFoldErrorHandler } from '../utils/errorHandler';

interface AlphaFoldParameters {
  algorithm: 'mmseqs2' | 'jackhmmer';
  e_value: number;
  iterations: number;
  databases: string[];
  relax_prediction: boolean;
  skip_template_search: boolean;
}

interface AlphaFoldDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (sequence: string, parameters: AlphaFoldParameters) => void;
  initialData?: {
    sequence: string;
    source: string;
    parameters: AlphaFoldParameters;
    estimated_time: string;
    message: string;
  };
}

export const AlphaFoldDialog: React.FC<AlphaFoldDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  initialData
}) => {
  const [sequence, setSequence] = useState('');
  const [parameters, setParameters] = useState<AlphaFoldParameters>({
    algorithm: 'mmseqs2',
    e_value: 0.0001,
    iterations: 1,
    databases: ['small_bfd'],
    relax_prediction: false,
    skip_template_search: true
  });

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sequenceStats, setSequenceStats] = useState({ length: 0, valid: true, errors: [] as string[] });
  const [validationError, setValidationError] = useState<any>(null);

  // Available database options
  const databaseOptions = [
    { value: 'small_bfd', label: 'Small BFD (Fast, Good Quality)', recommended: true },
    { value: 'uniref90', label: 'UniRef90 (Comprehensive)', recommended: false },
    { value: 'mgnify', label: 'MGnify (Metagenomic)', recommended: false },
    { value: 'bfd', label: 'Full BFD (Slow, Best Quality)', recommended: false },
    { value: 'uniclust30', label: 'UniClust30 (Clustering)', recommended: false }
  ];

  // Update state when initial data changes
  useEffect(() => {
    if (initialData) {
      setSequence(initialData.sequence);
      setParameters(initialData.parameters);
    }
  }, [initialData]);

  // Validate sequence and update stats
  useEffect(() => {
    if (sequence.trim()) {
      const error = AlphaFoldErrorHandler.handleSequenceValidation(sequence);
      setValidationError(error);
      
      const cleanSeq = sequence.replace(/\s/g, '').toUpperCase();
      setSequenceStats({
        length: cleanSeq.length,
        valid: !error,
        errors: error ? [error.userMessage] : []
      });
    } else {
      setValidationError(null);
      setSequenceStats({ length: 0, valid: true, errors: [] });
    }
  }, [sequence]);

  const handleDatabaseChange = (database: string, checked: boolean) => {
    setParameters(prev => ({
      ...prev,
      databases: checked 
        ? [...prev.databases, database]
        : prev.databases.filter(db => db !== database)
    }));
  };

  const handleConfirm = () => {
    if (sequenceStats.valid) {
      onConfirm(sequence.replace(/\s/g, '').toUpperCase(), parameters);
    }
  };

  const estimateTime = () => {
    const seqLen = sequenceStats.length;
    let baseTime = '';
    
    if (seqLen < 100) baseTime = '2-5 minutes';
    else if (seqLen < 300) baseTime = '5-15 minutes';
    else if (seqLen < 600) baseTime = '15-30 minutes';
    else baseTime = '30-60 minutes';

    if (parameters.relax_prediction) baseTime += ' (+relaxation)';
    if (parameters.iterations > 1) baseTime += ` (×${parameters.iterations})`;

    return baseTime;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">AlphaFold2 Structure Prediction</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              ×
            </button>
          </div>

          {initialData && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-start space-x-3">
                <div className="text-blue-600 mt-1">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-blue-800">{initialData.message}</p>
                  <p className="text-xs text-blue-600 mt-1">
                    Source: {initialData.source} • Estimated time: {initialData.estimated_time}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Sequence Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Protein Sequence
            </label>
            <textarea
              value={sequence}
              onChange={(e) => setSequence(e.target.value)}
              className={`w-full h-32 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm ${
                sequenceStats.errors.length > 0 ? 'border-red-300 bg-red-50' : 'border-gray-300'
              }`}
              placeholder="Enter protein sequence (amino acids only: ACDEFGHIKLMNPQRSTVWY)..."
            />
            
            {/* Sequence Stats */}
            <div className="mt-2 flex justify-between items-center text-sm">
              <div className={`flex items-center space-x-4 ${sequenceStats.valid ? 'text-green-600' : 'text-red-600'}`}>
                <span>{sequenceStats.length} residues</span>
                {sequenceStats.valid && (
                  <span className="flex items-center">
                    <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Valid sequence
                  </span>
                )}
              </div>
              <div className="text-gray-500">
                Estimated time: {estimateTime()}
              </div>
            </div>

            {/* Enhanced Error Display */}
            {validationError && (
              <div className="mt-2">
                <ErrorDisplay 
                  error={validationError}
                  onRetry={() => {
                    // Clear validation error to allow retyping
                    setValidationError(null);
                  }}
                />
              </div>
            )}
          </div>

          {/* Basic Parameters */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Basic Parameters</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Algorithm */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  MSA Algorithm
                </label>
                <select
                  value={parameters.algorithm}
                  onChange={(e) => setParameters(prev => ({ ...prev, algorithm: e.target.value as 'mmseqs2' | 'jackhmmer' }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="mmseqs2">MMseqs2 (Fast, Recommended)</option>
                  <option value="jackhmmer">JackHMMer (Slower, More Sensitive)</option>
                </select>
              </div>

              {/* Iterations */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Iterations
                </label>
                <input
                  type="number"
                  min="1"
                  max="3"
                  value={parameters.iterations}
                  onChange={(e) => setParameters(prev => ({ ...prev, iterations: parseInt(e.target.value) || 1 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Databases */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                MSA Databases
              </label>
              <div className="space-y-2">
                {databaseOptions.map((db) => (
                  <label key={db.value} className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={parameters.databases.includes(db.value)}
                      onChange={(e) => handleDatabaseChange(db.value, e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">
                      {db.label}
                      {db.recommended && (
                        <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Recommended
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Advanced Parameters Toggle */}
          <div className="mb-4">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center space-x-2 text-sm text-blue-600 hover:text-blue-800"
            >
              <svg className={`w-4 h-4 transform ${showAdvanced ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span>{showAdvanced ? 'Hide' : 'Show'} Advanced Parameters</span>
            </button>
          </div>

          {/* Advanced Parameters */}
          {showAdvanced && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Advanced Parameters</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* E-value */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    E-value Threshold
                  </label>
                  <input
                    type="number"
                    step="0.00001"
                    value={parameters.e_value}
                    onChange={(e) => setParameters(prev => ({ ...prev, e_value: parseFloat(e.target.value) || 0.0001 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">Lower values = more stringent (default: 0.0001)</p>
                </div>

                {/* Options */}
                <div className="space-y-3">
                  <label className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={parameters.relax_prediction}
                      onChange={(e) => setParameters(prev => ({ ...prev, relax_prediction: e.target.checked }))}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">
                      Relax Prediction (Energy minimization - slower)
                    </span>
                  </label>

                  <label className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={parameters.skip_template_search}
                      onChange={(e) => setParameters(prev => ({ ...prev, skip_template_search: e.target.checked }))}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">
                      Skip Template Search (Ab initio folding)
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!sequenceStats.valid}
              className={`px-6 py-2 rounded-lg font-medium focus:ring-2 focus:ring-offset-2 ${
                sequenceStats.valid
                  ? 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              Start Folding
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};