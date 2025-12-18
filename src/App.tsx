import { Header } from './components/Header';
import { ChatPanel } from './components/ChatPanel';
import { CodeEditor } from './components/CodeEditor';
import { MolstarViewer } from './components/MolstarViewer';
import { SettingsDialog } from './components/SettingsDialog';
import { ChatHistoryPanel } from './components/ChatHistoryPanel';
import { ChatHistorySidebar } from './components/ChatHistorySidebar';
import { ResizablePanel } from './components/ResizablePanel';
import { ErrorDashboard, useErrorDashboard } from './components/ErrorDashboard';
import { FileBrowser } from './components/FileBrowser';
import { FileEditor } from './components/FileEditor';
import { PipelineCanvas, PipelineManager, PipelineExecution } from './components/pipeline-canvas';
import { api } from './utils/api';
import { Eye, Code2, Settings, FolderOpen, Workflow } from 'lucide-react';
import { useAppStore } from './stores/appStore';
import { useSettingsStore } from './stores/settingsStore';
import { useChatHistoryStore } from './stores/chatHistoryStore';
import { useEffect, useState } from 'react';

function App() {
  const { activePane, setActivePane, chatPanelWidth, setChatPanelWidth, isViewerVisible, selectedFile, setSelectedFile } = useAppStore();
  const { settings, isSettingsDialogOpen, setSettingsDialogOpen } = useSettingsStore();
  const { isHistoryPanelOpen, setHistoryPanelOpen } = useChatHistoryStore();
  const [isPipelineManagerOpen, setIsPipelineManagerOpen] = useState(false);
  const errorDashboard = useErrorDashboard();
  
  // Listen for pipeline manager open event
  useEffect(() => {
    const handleOpenPipelineManager = () => {
      setIsPipelineManagerOpen(true);
    };
    window.addEventListener('open-pipeline-manager', handleOpenPipelineManager);
    return () => window.removeEventListener('open-pipeline-manager', handleOpenPipelineManager);
  }, []);
  
  // Auto-switch to viewer when editor gets disabled
  useEffect(() => {
    if (!settings.codeEditor.enabled && activePane === 'editor') {
      setActivePane('viewer');
    }
  }, [settings.codeEditor.enabled, activePane, setActivePane]);

  const handleFileSelect = async (file: any) => {
    // Load file content and show in editor
    try {
      const { activeSessionId } = useChatHistoryStore.getState();
      if (!activeSessionId) return;

      const response = await fetch(`/api/sessions/${activeSessionId}/files/${file.file_id}`);
      const data = await response.json();
      
      if (data.status === 'success') {
        setSelectedFile({
          id: file.file_id,
          type: file.type,
          content: data.content,
          filename: file.filename || data.filename || `file_${file.file_id}.pdb`,
        } as { id: string; type: string; content: string; filename?: string });
        setActivePane('files');
      }
    } catch (error) {
      console.error('Failed to load file:', error);
    }
  };

  const handleCloseFile = () => {
    setSelectedFile(null);
    setActivePane('viewer');
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <Header />
      
      <div className="flex-1 flex overflow-hidden">
        {/* Chat History Sidebar */}
        <ChatHistorySidebar />
        
        {/* Chat Panel - Resizable when viewer visible, full width when hidden */}
        {isViewerVisible ? (
          <ResizablePanel
            defaultWidth={chatPanelWidth}
            minWidth={280}
            maxWidth={800}
            position="left"
            onWidthChange={setChatPanelWidth}
            className="bg-white"
          >
            <ChatPanel />
          </ResizablePanel>
        ) : (
          <div className="flex-1 bg-white">
            <ChatPanel />
          </div>
        )}
        
        {/* Right Panel - Toolbar + Pane (only shown when viewer is visible) */}
        {isViewerVisible && (
          <div className="flex-1 flex flex-col">
            {/* Toolbar */}
            <div className="h-10 flex items-center justify-between px-3 border-b border-gray-200 bg-white">
              {/* Editor disabled message */}
              {!settings.codeEditor.enabled && (
                <div className="text-xs text-gray-500 flex items-center space-x-2">
                  <Settings className="w-3 h-3" />
                  <span>Code editor hidden - enable in Settings</span>
                </div>
              )}
              
              <div className="inline-flex rounded-full overflow-hidden ml-auto border border-gray-300">
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setActivePane('viewer');
                  }}
                  className={`px-3 h-8 flex items-center gap-1 text-xs ${activePane === 'viewer' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                  title="Show viewer"
                >
                  <Eye className="w-4 h-4" />
                </button>
                {settings.codeEditor.enabled && (
                  <button
                    onClick={() => {
                      setSelectedFile(null);
                      setActivePane('editor');
                    }}
                    className={`px-3 h-8 flex items-center gap-1 text-xs ${activePane === 'editor' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                    title="Show editor"
                  >
                    <Code2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => {
                    if (activePane === 'files' && !selectedFile) {
                      setActivePane('viewer');
                    } else {
                      setSelectedFile(null);
                      setActivePane('files');
                    }
                  }}
                  className={`px-3 h-8 flex items-center gap-1 text-xs ${activePane === 'files' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                  title="Show file browser"
                >
                  <FolderOpen className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setActivePane('pipeline');
                  }}
                  className={`px-3 h-8 flex items-center gap-1 text-xs ${activePane === 'pipeline' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                  title="Show pipeline canvas"
                >
                  <Workflow className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Content Pane with fixed, responsive height */}
            <div className="flex-1 min-h-0">
              {activePane === 'pipeline' ? (
                <PipelineCanvas />
              ) : activePane === 'files' ? (
                <div className="h-full">
                  {selectedFile ? (
                    <FileEditor
                      fileId={selectedFile.id}
                      filename={selectedFile.filename || `file_${selectedFile.id}.pdb`}
                      fileType={selectedFile.type}
                      onClose={handleCloseFile}
                    />
                  ) : (
                    <FileBrowser onFileSelect={handleFileSelect} />
                  )}
                </div>
              ) : activePane === 'editor' && settings.codeEditor.enabled ? (
                <div className="h-full">
                  <CodeEditor />
                </div>
              ) : (
                <div className="h-full bg-gray-900">
                  <MolstarViewer />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Settings Dialog */}
      <SettingsDialog 
        isOpen={isSettingsDialogOpen}
        onClose={() => setSettingsDialogOpen(false)}
      />
      
      {/* Chat History Panel */}
      <ChatHistoryPanel 
        isOpen={isHistoryPanelOpen}
        onClose={() => setHistoryPanelOpen(false)}
      />

      {/* Error Dashboard (Ctrl+Shift+E to open) */}
      <ErrorDashboard 
        isOpen={errorDashboard.isOpen} 
        onClose={errorDashboard.closeDashboard} 
      />

      {/* Pipeline Manager Modal */}
      <PipelineManager
        isOpen={isPipelineManagerOpen}
        onClose={() => setIsPipelineManagerOpen(false)}
      />

      {/* Pipeline Execution Monitor */}
      <PipelineExecution apiClient={api} />
    </div>
  );
}

export default App;