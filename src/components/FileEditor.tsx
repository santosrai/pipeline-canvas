import React, { useState, useEffect } from 'react';
import { Play, Download, X, Loader2 } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { useChatHistoryStore } from '../stores/chatHistoryStore';
import { api } from '../utils/api';
import { CodeExecutor } from '../utils/codeExecutor';

interface FileEditorProps {
  fileId: string;
  filename: string;
  fileType: string;
  onClose: () => void;
}

export const FileEditor: React.FC<FileEditorProps> = ({ fileId, filename, fileType, onClose }) => {
  const { activeSessionId } = useChatHistoryStore();
  const { plugin, setActivePane, setCurrentCode, setIsExecuting, setViewerVisible } = useAppStore();
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadFileContent();
  }, [fileId]);

  const loadFileContent = async () => {
    setLoading(true);
    setError(null);
    try {
      // Use the generic file content endpoint (doesn't require session)
      const response = await api.get(`/files/${fileId}`);
      if (response.data.status === 'success') {
        setContent(response.data.content || '');
      } else {
        setError('Failed to load file content');
      }
    } catch (err: any) {
      console.error('Failed to load file content:', err);
      if (err.response?.status === 404) {
        setError('File not found. It may have been deleted or you don\'t have access to it.');
      } else {
        setError(err.response?.data?.detail || err.response?.data?.error || 'Failed to load file content');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLoadInViewer = async () => {
    if (!plugin || !content) return;

    try {
      setIsExecuting(true);
      const executor = new CodeExecutor(plugin);

      // Create temporary PDB blob URL
      const pdbBlob = new Blob([content], { type: 'text/plain' });
      const blobUrl = URL.createObjectURL(pdbBlob);

      // Load structure in viewer using blob URL
      const code = `
try {
  await builder.clearStructure();
  await builder.loadStructure('${blobUrl}');
  await builder.addCartoonRepresentation({ color: 'secondary-structure' });
  builder.focusView();
  console.log('Structure loaded successfully');
} catch (e) { 
  console.error('Failed to load structure:', e); 
}`;

      // Save code to editor so user can see and modify it
      setCurrentCode(code);

      // Save code to active session for persistence
      if (activeSessionId) {
        const { saveVisualizationCode } = useChatHistoryStore.getState();
        saveVisualizationCode(activeSessionId, code);
        console.log('[FileEditor] Saved visualization code to session:', activeSessionId);
      }

      await executor.executeCode(code);
      setViewerVisible(true);
      setActivePane('viewer');

      // Keep blob URL alive for a bit longer to ensure structure loads
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 5000);
    } catch (err) {
      console.error('Failed to load structure in viewer:', err);
      setError('Failed to load structure in viewer');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-white p-4">
        <div className="text-red-500 mb-2">{error}</div>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium text-gray-700">{filename}</span>
          <span className="text-xs text-gray-500">({fileType})</span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleLoadInViewer}
            disabled={!plugin || !content}
            className="flex items-center space-x-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Load in 3D Viewer"
          >
            <Play className="w-4 h-4" />
            <span>Load in Viewer</span>
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center space-x-1 px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
            title="Download file"
          >
            <Download className="w-4 h-4" />
            <span>Download</span>
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-words bg-white text-gray-800">
          {content}
        </pre>
      </div>
    </div>
  );
};

