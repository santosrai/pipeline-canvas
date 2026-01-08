import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Upload, Info } from 'lucide-react';

type EntityType = 'protein' | 'dna' | 'rna' | 'ligand';

interface MSAFile {
  file: File;
  name: string;
  type: 'main' | 'paired';
}

interface Entity {
  id: string;
  type: EntityType;
  chainId: string;
  sequence: string;
  copies: number;
  msaFiles: MSAFile[];
}

interface AlphaFold3DialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (entities: Entity[]) => void;
  initialData?: {
    entities?: Entity[];
  };
}

const ENTITY_TYPES: { value: EntityType; label: string }[] = [
  { value: 'protein', label: 'Protein' },
  { value: 'dna', label: 'DNA' },
  { value: 'rna', label: 'RNA' },
  { value: 'ligand', label: 'Ligand' },
];

const VALID_MSA_EXTENSIONS = ['.a3m', '.csv'];

export const AlphaFold3Dialog: React.FC<AlphaFold3DialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  initialData
}) => {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selectedEntityType, setSelectedEntityType] = useState<EntityType>('protein');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize with default entity if empty
  useEffect(() => {
    if (initialData?.entities && initialData.entities.length > 0) {
      setEntities(initialData.entities);
    } else if (entities.length === 0) {
      addEntity('protein');
    }
  }, [initialData]);

  const generateChainId = (type: EntityType, index: number): string => {
    const typeMap: Record<EntityType, string> = {
      protein: 'A',
      dna: 'B',
      rna: 'C',
      ligand: 'D'
    };
    const base = typeMap[type] || 'A';
    return String.fromCharCode(base.charCodeAt(0) + index);
  };

  const addEntity = (type: EntityType) => {
    const existingOfType = entities.filter(e => e.type === type).length;
    const chainId = generateChainId(type, existingOfType);
    
    const newEntity: Entity = {
      id: `${type}-${Date.now()}-${Math.random()}`,
      type,
      chainId,
      sequence: '',
      copies: 1,
      msaFiles: []
    };
    
    setEntities([...entities, newEntity]);
  };

  const removeEntity = (id: string) => {
    setEntities(entities.filter(e => e.id !== id));
    // Clear errors for removed entity
    const newErrors = { ...errors };
    delete newErrors[id];
    setErrors(newErrors);
  };

  const updateEntity = (id: string, updates: Partial<Entity>) => {
    setEntities(entities.map(e => 
      e.id === id ? { ...e, ...updates } : e
    ));
    // Clear error when user updates
    if (errors[id]) {
      const newErrors = { ...errors };
      delete newErrors[id];
      setErrors(newErrors);
    }
  };

  const handleMSAFileUpload = (entityId: string, file: File, type: 'main' | 'paired') => {
    const extension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!VALID_MSA_EXTENSIONS.includes(extension)) {
      setErrors({
        ...errors,
        [entityId]: `Invalid file type. Supported: ${VALID_MSA_EXTENSIONS.join(', ')}`
      });
      return;
    }

    const msaFile: MSAFile = { file, name: file.name, type };
    updateEntity(entityId, {
      msaFiles: [...entities.find(e => e.id === entityId)!.msaFiles.filter(f => f.type !== type), msaFile]
    });
  };

  const removeMSAFile = (entityId: string, fileName: string) => {
    const entity = entities.find(e => e.id === entityId);
    if (entity) {
      updateEntity(entityId, {
        msaFiles: entity.msaFiles.filter(f => f.name !== fileName)
      });
    }
  };

  const validateEntity = (entity: Entity): string | null => {
    if (!entity.sequence.trim()) {
      return 'Sequence is required';
    }

    const cleanSeq = entity.sequence.replace(/\s/g, '').toUpperCase();
    
    if (entity.type === 'protein') {
      const validAA = /^[ACDEFGHIKLMNPQRSTVWY]+$/;
      if (!validAA.test(cleanSeq)) {
        return 'Invalid amino acids in protein sequence';
      }
      if (cleanSeq.length < 20) {
        return 'Protein sequence too short (minimum 20 residues)';
      }
    } else if (entity.type === 'dna' || entity.type === 'rna') {
      const validBases = entity.type === 'dna' ? /^[ATCG]+$/ : /^[AUCG]+$/;
      if (!validBases.test(cleanSeq)) {
        return `Invalid bases in ${entity.type.toUpperCase()} sequence`;
      }
      if (cleanSeq.length < 10) {
        return `${entity.type.toUpperCase()} sequence too short (minimum 10 bases)`;
      }
    }

    if (entity.copies < 1 || entity.copies > 5) {
      return 'Copies must be between 1 and 5';
    }

    return null;
  };

  const validateAll = (): boolean => {
    const newErrors: Record<string, string> = {};
    let isValid = true;

    if (entities.length === 0) {
      return false;
    }

    entities.forEach(entity => {
      const error = validateEntity(entity);
      if (error) {
        newErrors[entity.id] = error;
        isValid = false;
      }
    });

    setErrors(newErrors);
    return isValid;
  };

  const handleConfirm = () => {
    if (validateAll()) {
      onConfirm(entities);
    }
  };

  const clearAll = () => {
    setEntities([]);
    setErrors({});
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
      <div className="bg-gray-900 text-white rounded-lg shadow-xl max-w-5xl w-full mx-4 my-8 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">AlphaFold3 Structure Prediction</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-2xl"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Add Entity Controls */}
          <div className="mb-6 flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Add entities to fold
              </label>
              <select
                value={selectedEntityType}
                onChange={(e) => setSelectedEntityType(e.target.value as EntityType)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                {ENTITY_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => addEntity(selectedEntityType)}
              className="mt-6 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg border border-green-500 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New
            </button>
            <button
              onClick={clearAll}
              className="mt-6 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg border border-gray-600 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Clear All
            </button>
          </div>

          <div className="border-t border-gray-700 my-4"></div>

          {/* Entity List */}
          <div className="space-y-4">
            {entities.map((entity) => (
              <div
                key={entity.id}
                className="bg-gray-800 border border-gray-700 rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-gray-300">
                    {entity.type.toUpperCase()} CHAIN_ID: {entity.chainId}
                  </span>
                  <button
                    onClick={() => removeEntity(entity.id)}
                    className="text-gray-400 hover:text-white"
                    aria-label="Remove Sequence"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>

                {/* Sequence Input */}
                <div className="flex items-end gap-4 mb-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {entity.type === 'protein' ? 'Protein' : entity.type.toUpperCase()} Sequence
                      <span className="text-red-400 ml-1">*</span>
                    </label>
                    <input
                      type="text"
                      value={entity.sequence}
                      onChange={(e) => updateEntity(entity.id, { sequence: e.target.value })}
                      placeholder="Enter Sequence here"
                      className={`w-full px-3 py-2 bg-gray-900 border rounded-lg text-white font-mono text-sm ${
                        errors[entity.id] ? 'border-red-500' : 'border-gray-700'
                      } focus:ring-2 focus:ring-green-500 focus:border-transparent`}
                    />
                  </div>
                  <div className="w-16">
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Copies<span className="text-red-400 ml-1">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      value={entity.copies}
                      onChange={(e) => updateEntity(entity.id, { copies: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Error Display */}
                {errors[entity.id] && (
                  <div className="mb-4 text-sm text-red-400">{errors[entity.id]}</div>
                )}

                {/* MSA Section (only for protein) */}
                {entity.type === 'protein' && (
                  <div className="space-y-4">
                    {/* Main MSA */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-medium text-gray-300">MSA</span>
                        <Info className="w-4 h-4 text-gray-400" />
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          {entity.msaFiles.filter(f => f.type === 'main').length > 0 ? (
                            <div className="flex items-center gap-2 p-2 bg-gray-900 border border-gray-700 rounded">
                              <span className="text-sm text-gray-300">
                                {entity.msaFiles.find(f => f.type === 'main')?.name}
                              </span>
                              <span className="text-xs text-gray-500">
                                File Types: .a3m, .csv
                              </span>
                              <button
                                onClick={() => removeMSAFile(entity.id, entity.msaFiles.find(f => f.type === 'main')!.name)}
                                className="ml-auto text-gray-400 hover:text-white"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <label className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg cursor-pointer flex items-center gap-2">
                                <Upload className="w-4 h-4" />
                                Upload New File
                                <input
                                  type="file"
                                  accept=".a3m,.csv"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleMSAFileUpload(entity.id, file, 'main');
                                  }}
                                />
                              </label>
                            </div>
                          )}
                        </div>
                        {entity.msaFiles.filter(f => f.type === 'main').length === 0 && (
                          <button className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg">
                            + Add Main MSA
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Paired MSA */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-medium text-gray-300">Paired MSA</span>
                        <Info className="w-4 h-4 text-gray-400" />
                      </div>
                      <button
                        onClick={() => {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = '.a3m,.csv';
                          input.onchange = (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (file) handleMSAFileUpload(entity.id, file, 'paired');
                          };
                          input.click();
                        }}
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
                      >
                        + Add Paired MSA
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-gray-700">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-lg"
            >
              Reset
            </button>
            <button
              onClick={handleConfirm}
              disabled={entities.length === 0 || Object.keys(errors).length > 0}
              className={`px-6 py-2 rounded-lg font-medium ${
                entities.length > 0 && Object.keys(errors).length === 0
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
            >
              Run
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
