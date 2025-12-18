import React, { useState, useEffect, useCallback } from 'react';
import { Folder, File, ChevronRight, ChevronDown, Search, Loader2 } from 'lucide-react';
import { useChatHistoryStore } from '../stores/chatHistoryStore';
import { api } from '../utils/api';

interface FileMetadata {
  file_id: string;
  type: 'upload' | 'rfdiffusion' | 'alphafold';
  filename: string;
  size: number;
  job_id?: string;
  download_url: string;
  metadata?: Record<string, any>;
}

interface FileBrowserProps {
  onFileSelect: (file: FileMetadata) => void;
}

export const FileBrowser: React.FC<FileBrowserProps> = ({ onFileSelect }) => {
  const { activeSessionId } = useChatHistoryStore();
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['uploads', 'rfdiffusion', 'alphafold']));
  const [searchQuery, setSearchQuery] = useState('');

  const loadFiles = useCallback(async () => {
    if (!activeSessionId) return;
    
    setLoading(true);
    try {
      const response = await api.get(`/sessions/${activeSessionId}/files`);
      if (response.data.status === 'success') {
        setFiles(response.data.files || []);
      } else {
        console.warn('Unexpected response format:', response.data);
        setFiles([]);
      }
    } catch (error: any) {
      console.error('Failed to load session files:', error);
      if (error.response?.status === 404) {
        console.warn('Session files endpoint not found - server may need restart');
      }
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [activeSessionId]);

  // Listen for custom events to refresh files
  useEffect(() => {
    const handleFileAdded = () => {
      if (activeSessionId) {
        // Small delay to ensure backend has saved the file
        setTimeout(() => {
          loadFiles();
        }, 500);
      }
    };

    window.addEventListener('session-file-added', handleFileAdded);
    return () => window.removeEventListener('session-file-added', handleFileAdded);
  }, [activeSessionId, loadFiles]);

  useEffect(() => {
    if (activeSessionId) {
      loadFiles();
    } else {
      setFiles([]);
    }
  }, [activeSessionId, loadFiles]);

  const toggleFolder = (folder: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folder)) {
      newExpanded.delete(folder);
    } else {
      newExpanded.add(folder);
    }
    setExpandedFolders(newExpanded);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = () => {
    return <File className="w-4 h-4 text-blue-500" />;
  };

  const filteredFiles = files.filter(file => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      file.filename.toLowerCase().includes(query) ||
      file.type.toLowerCase().includes(query)
    );
  });

  const uploads = filteredFiles.filter(f => f.type === 'upload');
  const rfdiffusion = filteredFiles.filter(f => f.type === 'rfdiffusion');
  const alphafold = filteredFiles.filter(f => f.type === 'alphafold');

  const renderFolder = (folderName: string, folderKey: string, folderFiles: FileMetadata[]) => {
    const isExpanded = expandedFolders.has(folderKey);
    const icon = isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />;

    return (
      <div key={folderKey} className="mb-2">
        <button
          onClick={() => toggleFolder(folderKey)}
          className="w-full flex items-center space-x-2 px-2 py-1.5 hover:bg-gray-100 rounded text-left"
        >
          {icon}
          <Folder className="w-4 h-4 text-yellow-500" />
          <span className="text-sm font-medium text-gray-700">{folderName}</span>
          <span className="text-xs text-gray-500 ml-auto">({folderFiles.length})</span>
        </button>
        {isExpanded && (
          <div className="ml-6 mt-1 space-y-1">
            {folderFiles.length === 0 ? (
              <div className="text-xs text-gray-400 px-2 py-1">No files</div>
            ) : (
              folderFiles.map((file) => (
                <button
                  key={file.file_id}
                  onClick={() => onFileSelect(file)}
                  className="w-full flex items-center space-x-2 px-2 py-1.5 hover:bg-blue-50 rounded text-left group"
                >
                  {getFileIcon()}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-700 truncate">{file.filename}</div>
                    <div className="text-xs text-gray-500">
                      {formatFileSize(file.size)}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Search bar */}
      <div className="p-3 border-b border-gray-200">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* File tree */}
      <div className="flex-1 overflow-y-auto p-3">
        {files.length === 0 ? (
          <div className="text-center text-gray-400 mt-8">
            <File className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No files in this session</p>
          </div>
        ) : (
          <div className="space-y-1">
            {renderFolder('Uploads', 'uploads', uploads)}
            {renderFolder('RF-diffusion Results', 'rfdiffusion', rfdiffusion)}
            {renderFolder('AlphaFold Results', 'alphafold', alphafold)}
          </div>
        )}
      </div>
    </div>
  );
};

