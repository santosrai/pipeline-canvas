import React, { useRef } from 'react';
import { Plus, X, Paperclip } from 'lucide-react';

interface FileUploadResult {
  status: string;
  message: string;
  file_info: {
    filename: string;
    file_id: string;
    file_url: string;
    size: number;
    atoms: number;
    chains: string[];
  };
  agent_response?: any;
}

interface PDBFileUploadProps {
  onFileSelected?: (file: File) => void; // Called when file is selected (not uploaded yet)
  onFileUploaded?: (result: FileUploadResult) => void; // Called after upload completes
  onFileCleared?: () => void; // Called when file is cleared
  onError: (error: string) => void;
  disabled?: boolean;
  pendingFile?: File | null; // File waiting to be uploaded
  sessionId?: string | null; // Optional session ID for file association
  currentFile?: {
    filename: string;
    file_id: string;
    file_path: string;
  } | null; // Currently selected file from session
}

export const PDBFileUpload: React.FC<PDBFileUploadProps> = ({
  onFileSelected,
  onFileCleared,
  onError,
  disabled = false,
  pendingFile = null,
  currentFile: _currentFile = null,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (file: File) => {
    if (!file) return;

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.pdb')) {
      onError('Please select a PDB file (.pdb extension required)');
      return;
    }

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      onError('File too large. Maximum size is 10MB.');
      return;
    }

    // Store file locally, don't upload yet
    onFileSelected?.(file);
  };


  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    // Reset input value to allow re-selecting the same file
    event.target.value = '';
  };


  const clearFile = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    onFileCleared?.();
  };

  const handleUploadClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Directly trigger file input click to open file picker
    fileInputRef.current?.click();
  };

  return (
    <>
      {pendingFile ? (
        // Show pending file capsule with clear option
        <div className="flex items-center space-x-1 px-2 py-1 bg-blue-50 border border-blue-200 rounded-md">
          <Paperclip className="w-3 h-3 text-blue-600" />
          <span className="text-xs text-blue-700 max-w-24 truncate" title={pendingFile.name}>
            {pendingFile.name}
          </span>
          <button
            type="button"
            onClick={clearFile}
            disabled={disabled}
            className="p-0.5 hover:bg-blue-100 rounded disabled:opacity-50"
            title="Remove file"
          >
            <X className="w-3 h-3 text-blue-600" />
          </button>
        </div>
      ) : (
        // Show upload button - clicking directly opens file picker
        <button
          type="button"
          onClick={handleUploadClick}
          disabled={disabled}
          className="flex items-center justify-center w-8 h-8 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Upload PDB file"
        >
          <Plus className="w-4 h-4 text-gray-600" />
        </button>
      )}

      {/* Hidden file input - triggered directly by button click */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdb"
        onChange={handleFileInputChange}
        className="hidden"
      />
    </>
  );
};