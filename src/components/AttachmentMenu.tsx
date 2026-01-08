import React, { useRef, useState, useEffect } from 'react';
import { Plus, Paperclip, Workflow } from 'lucide-react';

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
  onFilesSelected?: (files: File[]) => void; // Called when multiple files are selected
  onFileUploaded?: (result: FileUploadResult) => void; // Called after upload completes
  onFileCleared?: () => void; // Called when file is cleared
  onError: (error: string) => void;
  disabled?: boolean;
  pendingFile?: File | null; // File waiting to be uploaded (deprecated, use pendingFiles)
  pendingFiles?: File[]; // Files waiting to be uploaded
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
  onFilesSelected,
  onFileUploaded,
  onFileCleared: _onFileCleared,
  onError,
  disabled = false,
  pendingFile: _pendingFile = null,
  pendingFiles: _pendingFiles = [],
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

  const handleFileSelect = async (files: File[]) => {
    if (!files || files.length === 0) return;

    const validFiles: File[] = [];
    const maxSize = 10 * 1024 * 1024; // 10MB

    for (const file of files) {
      // Validate file type
      if (!file.name.toLowerCase().endsWith('.pdb')) {
        onError(`Please select PDB files only. ${file.name} is not a PDB file.`);
        continue;
      }

      // Validate file size (10MB limit)
      if (file.size > maxSize) {
        onError(`File too large: ${file.name}. Maximum size is 10MB.`);
        continue;
      }

      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    // If multiple files selected, use onFilesSelected if available, otherwise use onFileSelected for first file
    if (validFiles.length > 1 && onFilesSelected) {
      onFilesSelected(validFiles);
    } else if (onFileSelected) {
      // For backward compatibility, call onFileSelected for each file
      validFiles.forEach(file => onFileSelected(file));
    }

    setIsDropdownOpen(false);

    // If onFileUploaded is provided, handle upload (for backward compatibility)
    if (onFileUploaded && validFiles.length === 1) {
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
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      handleFileSelect(files);
    }
    // Reset input value to allow re-selecting the same file
    event.target.value = '';
  };

  const handleButtonClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Always toggle dropdown - file pills are shown in parent component
    setIsDropdownOpen(!isDropdownOpen);
  };

  const handleFileUploadClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDropdownOpen(false);
    // Use setTimeout to ensure dropdown closes before triggering file input
    // This prevents event propagation issues
    setTimeout(() => {
      fileInputRef.current?.click();
    }, 100);
  };

  const handlePipelineClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDropdownOpen(false);
    onPipelineSelect?.();
  };

  return (
    <>
      {/* Always show attachment button with dropdown - file pills are shown in parent component */}
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
              {/* Only show Pipeline option if onPipelineSelect is provided */}
              {onPipelineSelect && (
                <button
                  type="button"
                  onClick={handlePipelineClick}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-3"
                >
                  <Workflow className="w-4 h-4 text-gray-500" />
                  <span>Pipeline</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Hidden file input - triggered by dropdown option - supports multiple files */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdb"
        multiple
        onChange={handleFileInputChange}
        className="hidden"
      />
    </>
  );
};

