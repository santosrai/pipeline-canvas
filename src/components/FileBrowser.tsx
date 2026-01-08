import React, { useState, useEffect, useCallback } from 'react';
import { Folder, File, ChevronRight, ChevronDown, Search, Loader2, Trash2, Eye } from 'lucide-react';
import { useChatHistoryStore } from '../stores/chatHistoryStore';
import { api } from '../utils/api';

interface FileMetadata {
  file_id: string;
  type: 'upload' | 'rfdiffusion' | 'alphafold' | 'proteinmpnn';
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
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['uploads', 'rfdiffusion', 'alphafold', 'proteinmpnn']));
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    console.log('[FileBrowser] Loading all user files');
    setLoading(true);
    try {
      // Use /api/files endpoint to get all user files (not just session-specific)
      // Files are already user-scoped in the database, so no risk of mixing users
      // Note: api.get('/files') will become /api/files since baseURL includes /api
      const response = await api.get(`/files`);
      console.log('[FileBrowser] Response:', response.data);
      if (response.data && response.data.status === 'success') {
        const files = response.data.files || [];
        console.log('[FileBrowser] Loaded files:', files.length, files);
        setFiles(files);
      } else {
        console.warn('[FileBrowser] Unexpected response format:', response.data);
        setFiles([]);
      }
    } catch (error: any) {
      console.error('[FileBrowser] Failed to load user files:', error);
      if (error.response) {
        console.error('[FileBrowser] Error response:', error.response.status, error.response.data);
        if (error.response.status === 401) {
          console.error('[FileBrowser] Authentication failed - user may need to log in again');
        } else if (error.response.status === 404) {
          console.warn('[FileBrowser] User files endpoint not found - server may need restart');
        } else if (error.response.status === 500) {
          console.error('[FileBrowser] Server error:', error.response.data);
        }
      } else if (error.request) {
        console.error('[FileBrowser] No response received - server may be down or endpoint not accessible');
        console.error('[FileBrowser] Request URL:', error.config?.url);
      } else {
        console.error('[FileBrowser] Error setting up request:', error.message);
      }
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Listen for custom events to refresh files
  useEffect(() => {
    const handleFileAdded = () => {
      console.log('[FileBrowser] session-file-added event received');
      // Small delay to ensure backend has saved the file
      setTimeout(() => {
        console.log('[FileBrowser] Refreshing files after session-file-added event');
        loadFiles();
      }, 1000); // Increased delay to match PipelineExecution
    };

    window.addEventListener('session-file-added', handleFileAdded);
    return () => window.removeEventListener('session-file-added', handleFileAdded);
  }, [loadFiles]);

  // Load files on mount and when loadFiles changes
  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

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
  const proteinmpnn = filteredFiles.filter(f => f.type === 'proteinmpnn');

  const handleDeleteFile = async (file: FileMetadata, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent file selection when clicking delete
    
    if (!confirm(`Are you sure you want to delete "${file.filename}"?`)) {
      return;
    }
    
    setDeletingFileId(file.file_id);
    try {
      // Use generic file delete endpoint (files are user-scoped, so no session needed)
      await api.delete(`/files/${file.file_id}`);
      console.log('[FileBrowser] File deleted successfully:', file.file_id);
      // Refresh file list
      await loadFiles();
      // Dispatch event to notify other components
      window.dispatchEvent(new CustomEvent('session-file-deleted', { detail: { file_id: file.file_id } }));
    } catch (error: any) {
      console.error('[FileBrowser] Failed to delete file:', error);
      alert(`Failed to delete file: ${error.response?.data?.error || error.response?.data?.detail || error.message}`);
    } finally {
      setDeletingFileId(null);
    }
  };

  const handleViewFile = async (file: FileMetadata, e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('[FileBrowser] View file clicked:', file);
    // Trigger file selection which will open it in the viewer/editor
    try {
      onFileSelect(file);
    } catch (error) {
      console.error('[FileBrowser] Error in onFileSelect:', error);
    }
  };

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
                <div
                  key={file.file_id}
                  className="w-full flex items-center space-x-2 px-2 py-1.5 hover:bg-blue-50 rounded group"
                >
                  <button
                    onClick={() => onFileSelect(file)}
                    className="flex-1 flex items-center space-x-2 text-left min-w-0"
                  >
                    {getFileIcon()}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-700 truncate">{file.filename}</div>
                      <div className="text-xs text-gray-500">
                        {formatFileSize(file.size)}
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => handleViewFile(file, e)}
                      className="p-1 hover:bg-blue-100 rounded text-blue-600"
                      title="View file"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteFile(file, e)}
                      disabled={deletingFileId === file.file_id}
                      className="p-1 hover:bg-red-100 rounded text-red-600 disabled:opacity-50"
                      title="Delete file"
                    >
                      {deletingFileId === file.file_id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
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
            <p className="text-sm">No files</p>
          </div>
        ) : (
          <div className="space-y-1">
            {renderFolder('Uploads', 'uploads', uploads)}
            {renderFolder('RF-diffusion Results', 'rfdiffusion', rfdiffusion)}
            {renderFolder('AlphaFold Results', 'alphafold', alphafold)}
            {renderFolder('ProteinMPNN Results', 'proteinmpnn', proteinmpnn)}
          </div>
        )}
      </div>
    </div>
  );
};

