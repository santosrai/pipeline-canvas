import { Header } from './components/Header';
import { ChatPanel } from './components/ChatPanel';
import { CodeEditor } from './components/CodeEditor';
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
import { useEffect, useState, Suspense, lazy } from 'react';

// Lazy load MolstarViewer - only load when viewer is visible
const MolstarViewer = lazy(() => import('./components/MolstarViewer').then(module => ({ default: module.MolstarViewer })));

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
      if (!activeSessionId) {
        console.error('[App] No active session ID for file selection');
        return;
      }

      console.log('[App] Loading file:', file.file_id, 'type:', file.type);
      
      // Use api utility to ensure correct base URL
      const response = await api.get(`/sessions/${activeSessionId}/files/${file.file_id}`);
      
      if (response.data.status === 'success') {
        console.log('[App] File loaded successfully:', response.data.filename);
        setSelectedFile({
          id: file.file_id,
          type: file.type,
          content: response.data.content,
          filename: file.filename || response.data.filename || `file_${file.file_id}.pdb`,
        } as { id: string; type: string; content: string; filename?: string });
        setActivePane('files');
      } else {
        console.error('[App] Failed to load file - unexpected response:', response.data);
      }
    } catch (error: any) {
      console.error('[App] Failed to load file:', error);
      if (error.response) {
        console.error('[App] Error response:', error.response.status, error.response.data);
      }
    }
  };

  const handleCloseFile = () => {
    setSelectedFile(null);
    setActivePane('viewer');
  };

  // Mark App as ready for test detection
  useEffect(() => {
    const timer = setTimeout(() => {
      document.body.setAttribute('data-app-ready', 'true');
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-gray-50" data-testid="app-container" data-app-ready="true">
      <Header />
      
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Chat History Sidebar */}
        <ChatHistorySidebar />
        
        {/* Chat Panel - Resizable when viewer visible, full width when hidden */}
        {isViewerVisible ? (
          <>
            {/* Desktop: Resizable panel */}
            <ResizablePanel
              defaultWidth={chatPanelWidth}
              minWidth={280}
              maxWidth={800}
              position="left"
              onWidthChange={setChatPanelWidth}
              className="bg-white hidden md:block"
            >
              <ChatPanel />
            </ResizablePanel>
            {/* Mobile: Hide chat when viewer is visible (user can toggle viewer off to see chat) */}
          </>
        ) : (
          <div className="flex-1 bg-white flex flex-col min-h-0 overflow-hidden">
            <ChatPanel />
          </div>
        )}
        
        {/* Right Panel - Toolbar + Pane (only shown when viewer is visible) */}
        {isViewerVisible && (
          <div className="flex-1 flex flex-col min-w-0">
            {/* Toolbar */}
            <div className="h-auto sm:h-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between px-2 sm:px-3 py-2 sm:py-0 border-b border-gray-200 bg-white">
              {/* Editor disabled message */}
              {!settings.codeEditor.enabled && (
                <div className="hidden sm:flex text-xs text-gray-500 items-center space-x-2 mb-2 sm:mb-0">
                  <Settings className="w-3 h-3" />
                  <span>Code editor hidden - enable in Settings</span>
                </div>
              )}
              
              <div className="inline-flex rounded-full overflow-hidden ml-auto border border-gray-300 w-full sm:w-auto justify-center sm:justify-end">
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setActivePane('viewer');
                  }}
                  className={`flex-1 sm:flex-none px-2 sm:px-3 h-8 flex items-center justify-center gap-1 text-xs ${activePane === 'viewer' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                  title="Show viewer"
                >
                  <Eye className="w-4 h-4" />
                  <span className="sm:hidden">Viewer</span>
                </button>
                {settings.codeEditor.enabled && (
                  <button
                    onClick={() => {
                      setSelectedFile(null);
                      setActivePane('editor');
                    }}
                    className={`flex-1 sm:flex-none px-2 sm:px-3 h-8 flex items-center justify-center gap-1 text-xs ${activePane === 'editor' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                    title="Show editor"
                  >
                    <Code2 className="w-4 h-4" />
                    <span className="sm:hidden">Editor</span>
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
                  className={`flex-1 sm:flex-none px-2 sm:px-3 h-8 flex items-center justify-center gap-1 text-xs ${activePane === 'files' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                  title="Show file browser"
                >
                  <FolderOpen className="w-4 h-4" />
                  <span className="sm:hidden">Files</span>
                </button>
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setActivePane('pipeline');
                  }}
                  className={`flex-1 sm:flex-none px-2 sm:px-3 h-8 flex items-center justify-center gap-1 text-xs ${activePane === 'pipeline' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                  title="Show pipeline canvas"
                >
                  <Workflow className="w-4 h-4" />
                  <span className="sm:hidden">Pipeline</span>
                </button>
                <a
                  href="/pipeline"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden sm:flex px-2 h-8 items-center gap-1 text-xs bg-white text-gray-700 hover:bg-gray-50 border-l border-gray-300"
                  title="Open pipeline canvas in full screen"
                >
                  <Workflow className="w-3 h-3" />
                  <span className="text-[10px]">Full</span>
                </a>
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
                  <Suspense fallback={
                    <div className="h-full flex items-center justify-center text-gray-400">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-400 mx-auto mb-4"></div>
                        <p>Loading molecular viewer...</p>
                      </div>
                    </div>
                  }>
                    <MolstarViewer />
                  </Suspense>
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