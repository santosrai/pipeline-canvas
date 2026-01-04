import React, { useRef, useState, useEffect } from 'react';
import { Plus, X, Paperclip, Workflow } from 'lucide-react';

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

interface AttachmentMenuProps {
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
  onPipelineSelect?: () => void; // Called when "Pipeline" option is clicked
}

export const AttachmentMenu: React.FC<AttachmentMenuProps> = ({
  onFileSelected,
  onFileUploaded,
  onFileCleared,
  onError,
  disabled = false,
  pendingFile = null,
  currentFile: _currentFile = null,
  onPipelineSelect,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isDropdownOpen]);

  const handleFileSelect = async (file: File) => {
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
    setIsDropdownOpen(false);

    // If onFileUploaded is provided, handle upload (for backward compatibility)
    if (onFileUploaded) {
      try {
        // This would need to be implemented based on the actual upload logic
        // For now, we'll just call onFileSelected as before
        // The actual upload should be handled by the parent component
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Upload failed');
      }
    }
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

  const handleButtonClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (pendingFile) {
      // If there's a pending file, clear it
      clearFile(e);
    } else {
      // Toggle dropdown
      setIsDropdownOpen(!isDropdownOpen);
    }
  };

  const handleFileUploadClick = () => {
    setIsDropdownOpen(false);
    fileInputRef.current?.click();
  };

  const handlePipelineClick = () => {
    setIsDropdownOpen(false);
    onPipelineSelect?.();
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
        // Show attachment button with dropdown
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={handleButtonClick}
            disabled={disabled}
            className="flex items-center justify-center w-5 h-5 sm:w-8 sm:h-8 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-colors box-border flex-shrink-0 p-0"
            title="Add attachment"
          >
            <Plus className="w-2.5 h-2.5 sm:w-4 sm:h-4 text-gray-600 flex-shrink-0" />
          </button>

          {/* Dropdown menu */}
          {isDropdownOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
              <div className="py-1">
                <button
                  type="button"
                  onClick={handleFileUploadClick}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-3"
                >
                  <Paperclip className="w-4 h-4 text-gray-500" />
                  <span>File upload</span>
                </button>
                <button
                  type="button"
                  onClick={handlePipelineClick}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-3"
                >
                  <Workflow className="w-4 h-4 text-gray-500" />
                  <span>Pipeline</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hidden file input - triggered by dropdown option */}
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

